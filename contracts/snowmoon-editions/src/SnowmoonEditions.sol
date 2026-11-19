// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IEditionSeller} from "./IEditionSeller.sol";
import {ISnowmoonEditionsMint} from "./ISnowmoonEditionsMint.sol";

/// @title SnowmoonEditions ("Snowmoon WIP")
/// @notice The permanent collection of Snowmoon WIP editions: work-in-progress pieces from snowmoon.party, an
///         independent, open adaptation of *Snowmoon* by Vitalik Buterin (GPL-3.0), not affiliated with him.
///         Each edition is one ERC-1155 id with at most 256 pieces. Selling is done by a separate seller contract
///         chosen per edition, so selling rules can change for future editions while this collection never does.
/// @dev Hard limits enforced here, whatever the seller does:
///      - an edition never has more than its `maxSupply` pieces, and `maxSupply` is at most 256;
///      - at most 2 editions are created in any 30 days;
///      - an edition's seller, payout, link and size are fixed at creation (there are no setters).
///      No upgrades, proxies, pause, royalties, burn, funds or payable functions.
contract SnowmoonEditions is ERC1155, ISnowmoonEditionsMint {
    // ---------------------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------------------

    uint256 public constant MAX_EDITION_SIZE = 256;
    uint256 public constant MAX_EDITIONS_PER_WINDOW = 2;
    uint256 public constant WINDOW = 30 days;

    // ---------------------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------------------

    struct Edition {
        address seller; // the only address that may mint this edition
        uint64 createdAt; // block timestamp of creation
        uint16 maxSupply; // 1..256
        uint16 minted; // pieces minted so far, never above maxSupply
        address payout; // where this edition's seller sends its proceeds
        string uri; // pinned metadata link
    }

    /// @notice Collection name and symbol for marketplaces.
    string public constant name = "Snowmoon WIP";
    string public constant symbol = "SMWIP";

    /// @notice The one address that may create editions, hand over the role, and update `contractURI`.
    address public creator;
    /// @notice The address named to become creator; it becomes creator only when it calls `acceptCreator`.
    address public pendingCreator;

    /// @notice Number of editions created. Ids run 1..editionCount.
    uint256 public editionCount;

    string private _contractURI;
    mapping(uint256 id => Edition) private _editions;

    // ---------------------------------------------------------------------------------------------------------
    // Events and errors
    // ---------------------------------------------------------------------------------------------------------

    event EditionCreated(
        uint256 indexed id,
        address indexed seller,
        address indexed payout,
        uint256 maxSupply,
        string uri,
        bytes sellerData,
        uint256 createdAt
    );
    event CreatorTransferStarted(address indexed creator, address indexed pendingCreator);
    event CreatorTransferred(address indexed previousCreator, address indexed newCreator);
    /// @dev ERC-7572.
    event ContractURIUpdated();

    error NotCreator();
    error NotPendingCreator();
    error ZeroAddress();
    error EmptyURI();
    error BadMaxSupply(uint256 maxSupply);
    error SellerNotContract(address seller);
    error TooSoon(uint256 nextAllowedAt);
    error UnknownEdition(uint256 id);
    error NotSeller(uint256 id, address caller);
    error ZeroQuantity();
    error ExceedsMaxSupply(uint256 id, uint256 minted, uint256 quantity, uint256 maxSupply);

    // ---------------------------------------------------------------------------------------------------------
    // Construction and the creator role
    // ---------------------------------------------------------------------------------------------------------

    /// @param initialCreator The first creator (at launch, the 2-of-3 Safe). It doesn't have to be the deployer.
    /// @param contractURI_   The collection description link (ERC-7572).
    constructor(address initialCreator, string memory contractURI_) ERC1155("") {
        if (initialCreator == address(0)) revert ZeroAddress();
        creator = initialCreator;
        _contractURI = contractURI_;
        emit CreatorTransferred(address(0), initialCreator);
    }

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    /// @notice Step 1 of 2: name the next creator. Nothing changes until they accept. Naming address(0) cancels a
    ///         pending handover; naming someone else replaces it.
    // slither-disable-next-line missing-zero-check -- address(0) deliberately cancels a pending handover
    function transferCreator(address newCreator) external onlyCreator {
        pendingCreator = newCreator;
        emit CreatorTransferStarted(msg.sender, newCreator);
    }

    /// @notice Step 2 of 2: the named address takes the creator role.
    function acceptCreator() external {
        if (msg.sender != pendingCreator || msg.sender == address(0)) revert NotPendingCreator();
        address previous = creator;
        creator = msg.sender;
        delete pendingCreator;
        emit CreatorTransferred(previous, msg.sender);
    }

    /// @notice Update the collection description (ERC-7572). It describes the collection only; it can't change
    ///         any edition.
    function setContractURI(string calldata contractURI_) external onlyCreator {
        _contractURI = contractURI_;
        emit ContractURIUpdated();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Creating editions
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Create an edition. Everything given here is fixed for good. The seller's `configure` is called in
    ///         the same transaction with `sellerData`, so the seller's settings are set once and atomically.
    /// @return id The new edition's id (sequential from 1).
    function createEdition(
        string calldata uri_,
        uint256 maxSupply,
        address seller,
        address payout,
        bytes calldata sellerData
    ) external onlyCreator returns (uint256 id) {
        if (bytes(uri_).length == 0) revert EmptyURI();
        if (maxSupply == 0 || maxSupply > MAX_EDITION_SIZE) revert BadMaxSupply(maxSupply);
        if (seller.code.length == 0 || seller == address(this)) revert SellerNotContract(seller);
        if (payout == address(0)) revert ZeroAddress();

        uint256 next = nextEditionAllowedAt();
        // A 30-day window; a validator's few seconds of timestamp drift don't matter.
        // slither-disable-next-line timestamp
        if (block.timestamp < next) revert TooSoon(next);

        id = ++editionCount;
        Edition storage e = _editions[id];
        e.seller = seller;
        // forge-lint: disable-next-line(unsafe-typecast) -- timestamps fit in 64 bits
        e.createdAt = uint64(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast) -- maxSupply <= 256, checked above
        e.maxSupply = uint16(maxSupply);
        e.payout = payout;
        e.uri = uri_;

        emit EditionCreated(id, seller, payout, maxSupply, uri_, sellerData, block.timestamp);
        emit URI(uri_, id);

        // The seller is chosen by the creator; whatever it does here, it can only mint this edition, and never
        // past maxSupply. A revert here undoes the whole creation.
        IEditionSeller(seller).configure(id, maxSupply, payout, sellerData);
    }

    /// @notice The earliest time the next `createEdition` passes the rate limit: 30 days after the second most
    ///         recent edition, or 0 while fewer than two editions exist.
    function nextEditionAllowedAt() public view returns (uint256) {
        uint256 count = editionCount;
        if (count < MAX_EDITIONS_PER_WINDOW) return 0;
        return uint256(_editions[count + 1 - MAX_EDITIONS_PER_WINDOW].createdAt) + WINDOW;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Mint `quantity` pieces of edition `id` to `to`. Only the edition's seller may call this, and it
    ///         never takes the edition past its size.
    function mint(address to, uint256 id, uint256 quantity) external override {
        Edition storage e = _editions[id];
        if (msg.sender != e.seller || e.seller == address(0)) revert NotSeller(id, msg.sender);
        if (quantity == 0) revert ZeroQuantity();
        uint256 minted = e.minted;
        if (quantity > uint256(e.maxSupply) - minted) revert ExceedsMaxSupply(id, minted, quantity, e.maxSupply);
        // forge-lint: disable-next-line(unsafe-typecast) -- minted + quantity <= maxSupply <= 256
        e.minted = uint16(minted + quantity);
        // Calls onERC1155Received when `to` is a contract; a contract that doesn't accept tokens makes it revert.
        _mint(to, id, quantity, "");
    }

    // ---------------------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------------------

    /// @notice The edition's pinned metadata link. Fixed for good.
    function uri(uint256 id) public view override returns (string memory) {
        Edition storage e = _editions[id];
        if (e.seller == address(0)) revert UnknownEdition(id);
        return e.uri;
    }

    /// @notice Collection description (ERC-7572).
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    /// @notice Everything stored for an edition.
    // slither-disable-next-line timestamp -- compares the seller, which shares a storage slot with createdAt
    function edition(uint256 id) external view returns (Edition memory) {
        Edition memory e = _editions[id];
        if (e.seller == address(0)) revert UnknownEdition(id);
        return e;
    }

    function sellerOf(uint256 id) external view returns (address) {
        return _editions[id].seller;
    }

    function payoutOf(uint256 id) external view returns (address) {
        return _editions[id].payout;
    }

    function maxSupplyOf(uint256 id) external view returns (uint256) {
        return _editions[id].maxSupply;
    }

    function totalMinted(uint256 id) external view returns (uint256) {
        return _editions[id].minted;
    }

    function createdAt(uint256 id) external view returns (uint256) {
        return _editions[id].createdAt;
    }

    /// @notice True for ids 1..editionCount.
    // slither-disable-next-line timestamp -- compares the seller, which shares a storage slot with createdAt
    function exists(uint256 id) external view returns (bool) {
        return _editions[id].seller != address(0);
    }
}
