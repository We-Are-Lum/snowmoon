// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {IEditionSeller} from "./IEditionSeller.sol";
import {ISnowmoonEditionsMint} from "./ISnowmoonEditionsMint.sol";

interface ISnowmoonEditionsUri {
    function uri(uint256 id) external view returns (string memory);
}

/// @title LadderSeller (v1)
/// @notice Sells Snowmoon Editions pieces one at a time along a rising ETH price ladder fixed when the edition is
///         created: piece 1 costs `startPrice`, the last piece costs `topPrice`, and the pieces in between rise
///         by the same ratio each step, each rounded down to 0.000001 ETH.
/// @dev    price(n) = startPrice * (topPrice / startPrice) ^ ((n - 1) / (N - 1)), n = 1..N
///         computed as startPrice * exp(ln(topPrice / startPrice) * (n - 1) / (N - 1)) with Solady's lnWad and
///         expWad, rounded down to PRICE_STEP (after a 1e-15 allowance for the 18-digit maths), kept within
///         [startPrice, topPrice]; the endpoints are exact.
///         Payments build up per edition and leave only through `release`, to the edition's payout address.
///         No owner, no admin, no withdrawal.
contract LadderSeller is IEditionSeller, ReentrancyGuardTransient {
    /// @notice Prices are rounded down to this step (0.000001 ETH), except the two endpoints.
    uint256 public constant PRICE_STEP = 1e12;
    /// @notice Most pieces one `mint` may buy.
    uint256 public constant MAX_PER_TX = 10;
    /// @notice Highest top price: 1,000,000 ETH. Keeps the rounding allowance (1e-15 of a price) below one step.
    uint256 public constant MAX_PRICE = 1e24;
    /// @notice Latest opening time, counted from the edition's creation: 365 days. Catches a time given in
    ///         milliseconds, which would leave the edition closed for good.
    uint256 public constant MAX_START_DELAY = 365 days;

    /// @notice The collection this seller sells for. Fixed at deployment.
    address public immutable collection;

    struct Ladder {
        // slot 1
        uint96 startPrice; // wei, > 0
        uint96 topPrice; // wei, >= startPrice
        uint64 startTime; // minting opens at this time (0: at once)
        // slot 2
        address payout; // the edition's payout address, from the collection
        uint16 maxSupply; // the edition's size, from the collection
        uint16 sold; // pieces sold so far
        bool configured;
        uint48 lastMintAt; // time of the latest mint (0: none yet); in the slot mint already writes
        // slot 3
        uint128 paid; // all payments kept for this edition (excess refunded is never counted)
        uint128 released; // all of it sent to payout so far
        // slot 4
        uint256 lnRatio; // ln(topPrice / startPrice) as a wad, fixed at configure
    }

    mapping(uint256 id => Ladder) private _ladders;

    event EditionConfigured(
        uint256 indexed id,
        address indexed payout,
        uint256 maxSupply,
        uint256 startPrice,
        uint256 topPrice,
        uint256 startTime
    );
    event Minted(
        uint256 indexed id,
        address indexed buyer,
        address indexed to,
        uint256 firstPiece,
        uint256 quantity,
        uint256 cost
    );
    event Released(uint256 indexed id, address indexed payout, uint256 amount);

    error ZeroAddress();
    error NotCollection();
    error AlreadyConfigured(uint256 id);
    error BadSellerData();
    error BadPayout(address payout);
    error BadStartTime(uint256 startTime);
    error BadMaxSupply(uint256 maxSupply);
    error BadPrices(uint256 startPrice, uint256 topPrice);
    error UnknownEdition(uint256 id);
    error NotStarted(uint256 startTime);
    error BadQuantity(uint256 quantity);
    error NotEnoughLeft(uint256 remaining, uint256 quantity);
    error BadPiece(uint256 n);
    error Underpaid(uint256 cost, uint256 sent);
    error RefundFailed();
    error NothingToRelease(uint256 id);
    error ReleaseFailed(uint256 id);

    constructor(address collection_) {
        if (collection_ == address(0)) revert ZeroAddress();
        collection = collection_;
    }

    /// @notice Encodes this seller's settings for `createEdition`'s `sellerData`.
    function encodeSettings(uint256 startPrice, uint256 topPrice, uint64 startTime)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(startPrice, topPrice, startTime);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Configure (once per edition, only from the collection)
    // ---------------------------------------------------------------------------------------------------------

    /// @inheritdoc IEditionSeller
    /// @dev `data` is abi.encode(uint256 startPrice, uint256 topPrice, uint64 startTime).
    function configure(uint256 id, uint256 maxSupply, address payout, bytes calldata data)
        external
        returns (bytes4)
    {
        if (msg.sender != collection) revert NotCollection();
        Ladder storage l = _ladders[id];
        if (l.configured) revert AlreadyConfigured(id);
        if (maxSupply == 0 || maxSupply > 256) revert BadMaxSupply(maxSupply);
        if (payout == address(0)) revert ZeroAddress();
        if (payout == address(this) || payout == collection) revert BadPayout(payout);
        if (data.length != 96) revert BadSellerData();
        (uint256 startPrice, uint256 topPrice, uint256 startTime) = abi.decode(data, (uint256, uint256, uint256));
        // slither-disable-next-line timestamp -- a bound of a year; seconds of drift don't matter
        if (startTime > block.timestamp + MAX_START_DELAY) revert BadStartTime(startTime);
        if (startPrice == 0 || topPrice < startPrice || topPrice > MAX_PRICE) {
            revert BadPrices(startPrice, topPrice);
        }

        l.startPrice = uint96(startPrice);
        l.topPrice = uint96(topPrice);
        l.startTime = uint64(startTime);
        l.payout = payout;
        l.maxSupply = uint16(maxSupply);
        l.configured = true;
        // topPrice / startPrice <= 1e24, so the wad ratio fits and its ln is below 56e18.
        l.lnRatio = uint256(FixedPointMathLib.lnWad(int256(Math.mulDiv(topPrice, 1e18, startPrice))));

        emit EditionConfigured(id, payout, maxSupply, startPrice, topPrice, startTime);
        return IEditionSeller.configure.selector;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Buying
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Buy the next `quantity` pieces (1 to 10) of edition `id` for `to`. Send at least `quote(id,
    ///         quantity)`: the actual cost is charged and any excess is refunded to the sender in the same
    ///         transaction, so a mint that lands after someone else's still goes through at the new price.
    /// @return firstPiece The ladder position of the first piece bought.
    function mint(uint256 id, uint256 quantity, address to) external payable nonReentrant returns (uint256 firstPiece) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        // A validator's few seconds of timestamp drift don't matter for an opening time.
        // slither-disable-next-line timestamp
        if (block.timestamp < l.startTime) revert NotStarted(l.startTime);
        if (quantity == 0 || quantity > MAX_PER_TX) revert BadQuantity(quantity);
        uint256 soldBefore = l.sold;
        uint256 left = uint256(l.maxSupply) - soldBefore;
        if (quantity > left) revert NotEnoughLeft(left, quantity);

        uint256 cost = _cost(l, soldBefore, quantity);
        if (msg.value < cost) revert Underpaid(cost, msg.value);

        // Effects.
        firstPiece = soldBefore + 1;
        // forge-lint: disable-next-line(unsafe-typecast) -- soldBefore + quantity <= maxSupply <= 256
        l.sold = uint16(soldBefore + quantity);
        // For the site's quiet/busy rule only; nothing here reads it. 48 bits of seconds last for millions of years.
        // forge-lint: disable-next-line(unsafe-typecast)
        l.lastMintAt = uint48(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast) -- cost <= 10 * 2^96
        l.paid += uint128(cost);
        emit Minted(id, msg.sender, to, firstPiece, quantity, cost);

        // Interactions: the collection mint (which checks the edition's size itself), then the refund.
        ISnowmoonEditionsMint(collection).mint(to, id, quantity);
        uint256 excess = msg.value - cost;
        if (excess != 0) {
            // A plain ETH send that reports failure; guarded by nonReentrant, after all state changes.
            // slither-disable-next-line low-level-calls
            (bool ok,) = msg.sender.call{value: excess}("");
            if (!ok) revert RefundFailed();
        }
    }

    // ---------------------------------------------------------------------------------------------------------
    // Payout
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Send edition `id`'s whole balance to its payout address. Anyone may call it. If the payout
    ///         address rejects ETH this reverts and the balance stays for a later release; other editions are
    ///         unaffected.
    function release(uint256 id) external nonReentrant returns (uint256 amount) {
        Ladder storage l = _ladders[id];
        amount = uint256(l.paid) - l.released;
        if (amount == 0) revert NothingToRelease(id);
        // forge-lint: disable-next-line(unsafe-typecast) -- amount <= paid, a uint128
        l.released += uint128(amount);
        address payout = l.payout;
        emit Released(id, payout, amount);
        // A plain ETH send that reports failure; guarded by nonReentrant, after all state changes.
        // slither-disable-next-line low-level-calls
        (bool ok,) = payout.call{value: amount}("");
        if (!ok) revert ReleaseFailed(id);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Views for the site (and Etherscan)
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Price of piece `n` (1..maxSupply) of edition `id`, in wei.
    function priceOf(uint256 id, uint256 n) public view returns (uint256) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        // slither-disable-next-line incorrect-equality,timestamp -- slither taints the Ladder slot that also holds lastMintAt; no price reads the time
        if (n == 0 || n > l.maxSupply) revert BadPiece(n);
        return _price(l.startPrice, l.topPrice, l.lnRatio, n, l.maxSupply);
    }

    /// @notice Price of the next piece to be sold. Reverts when the edition is sold out.
    function nextPrice(uint256 id) external view returns (uint256) {
        return priceOf(id, uint256(_ladders[id].sold) + 1);
    }

    /// @notice Cost of the next `quantity` pieces (1 to 10), in wei: what `mint(id, quantity, to)` charges right
    ///         now. It doesn't check the opening time: see `ladder(id).startTime` or `isOpen(id)`.
    function quote(uint256 id, uint256 quantity) external view returns (uint256) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        if (quantity == 0 || quantity > MAX_PER_TX) revert BadQuantity(quantity);
        uint256 left = uint256(l.maxSupply) - l.sold;
        if (quantity > left) revert NotEnoughLeft(left, quantity);
        return _cost(l, l.sold, quantity);
    }

    /// @notice True when edition `id` exists, has opened, and has pieces left.
    function isOpen(uint256 id) external view returns (bool) {
        Ladder storage l = _ladders[id];
        // slither-disable-next-line timestamp -- an opening time; seconds of drift don't matter
        return l.configured && block.timestamp >= l.startTime && l.sold < l.maxSupply;
    }

    /// @notice Pieces of edition `id` not yet sold.
    function remaining(uint256 id) external view returns (uint256) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        return uint256(l.maxSupply) - l.sold;
    }

    /// @notice Pieces of edition `id` sold so far.
    function sold(uint256 id) external view returns (uint256) {
        return _ladders[id].sold;
    }

    /// @notice Payments held for edition `id`, not yet released.
    function held(uint256 id) external view returns (uint256) {
        Ladder storage l = _ladders[id];
        return uint256(l.paid) - l.released;
    }

    /// @notice Everything stored for edition `id`.
    function ladder(uint256 id) external view returns (Ladder memory) {
        return _ladders[id];
    }

    /// @notice When edition `id` was last minted (block time), or 0 if never.
    function lastMintAt(uint256 id) external view returns (uint256) {
        return _ladders[id].lastMintAt;
    }

    /// @notice Prices of pieces `first` to `first + count - 1` of edition `id`, in one call (the whole ladder is
    ///         `pricesOf(id, 1, maxSupply)`).
    function pricesOf(uint256 id, uint256 first, uint256 count) external view returns (uint256[] memory prices) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        if (first == 0 || count == 0 || first + count - 1 > l.maxSupply) revert BadPiece(first + count - 1);
        prices = new uint256[](count);
        (uint256 s, uint256 t, uint256 r, uint256 size) = (l.startPrice, l.topPrice, l.lnRatio, l.maxSupply);
        for (uint256 i; i < count; ++i) {
            prices[i] = _price(s, t, r, first + i, size);
        }
    }

    /// @notice What an edition page needs, in one call. `nextPrice` is 0 when sold out; `uri` is the collection's.
    struct Summary {
        uint256 id;
        uint256 maxSupply;
        uint256 sold;
        uint256 remaining;
        uint256 startPrice;
        uint256 topPrice;
        uint256 nextPrice;
        uint256 startTime;
        uint256 lastMintAt;
        bool open;
        address payout;
        uint256 held;
        string uri;
    }

    function summary(uint256 id) external view returns (Summary memory s) {
        Ladder storage l = _ladders[id];
        if (!l.configured) revert UnknownEdition(id);
        s.id = id;
        s.maxSupply = l.maxSupply;
        s.sold = l.sold;
        s.remaining = uint256(l.maxSupply) - l.sold;
        s.startPrice = l.startPrice;
        s.topPrice = l.topPrice;
        s.nextPrice = l.sold < l.maxSupply ? _price(l.startPrice, l.topPrice, l.lnRatio, uint256(l.sold) + 1, l.maxSupply) : 0;
        s.startTime = l.startTime;
        s.lastMintAt = l.lastMintAt;
        // slither-disable-next-line timestamp -- an opening time; seconds of drift don't matter
        s.open = block.timestamp >= l.startTime && l.sold < l.maxSupply;
        s.payout = l.payout;
        s.held = uint256(l.paid) - l.released;
        s.uri = ISnowmoonEditionsUri(collection).uri(id);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------------------

    function _cost(Ladder storage l, uint256 sold_, uint256 quantity) private view returns (uint256 cost) {
        (uint256 s, uint256 t, uint256 r, uint256 size) = (l.startPrice, l.topPrice, l.lnRatio, l.maxSupply);
        for (uint256 n = sold_ + 1; n <= sold_ + quantity; ++n) {
            cost += _price(s, t, r, n, size);
        }
    }

    function _price(uint256 startPrice, uint256 topPrice, uint256 lnRatio, uint256 n, uint256 size)
        private
        pure
        returns (uint256 p)
    {
        // slither-disable-next-line incorrect-equality,timestamp -- slither taints the Ladder slot that also holds lastMintAt; no price reads the time
        if (n == 1 || startPrice == topPrice) return startPrice;
        // slither-disable-next-line incorrect-equality,timestamp -- slither taints the Ladder slot that also holds lastMintAt; no price reads the time
        if (n == size) return topPrice;
        // 1 < n < size, so size >= 3. x = ln(ratio) * (n-1)/(size-1) < ln(ratio) < 67e18, far below expWad's limit.
        uint256 x = lnRatio * (n - 1) / (size - 1);
        // The price times 1e18: at most topPrice * 1e18 <= 1e42 (plus the maths' error), far below 2^256.
        uint256 scaled = startPrice * uint256(FixedPointMathLib.expWad(int256(x)));
        // lnWad and expWad are accurate to about 1e-17; allow 1e-15 before rounding down, so a price that is
        // exactly on a step (0.005 ETH at piece 86 of the first ladder) isn't shown as 0.004999 ETH.
        p = (scaled + scaled / 1e15) / 1e18;
        // slither-disable-next-line weak-prng -- rounding to the price step, not randomness (slither taints the Ladder slot that also holds lastMintAt; no price reads the time)
        p -= p % PRICE_STEP;
        // slither-disable-next-line timestamp -- slither taints the Ladder slot that also holds lastMintAt; no price reads the time
        if (p < startPrice) p = startPrice;
        // slither-disable-next-line timestamp -- slither taints the Ladder slot that also holds lastMintAt; no price reads the time
        if (p > topPrice) p = topPrice;
    }
}
