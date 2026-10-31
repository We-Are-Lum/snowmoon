// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title Snowmoon WIP
/// @notice Open-edition ERC-1155 for work-in-progress versions from snowmoon.party, an independent
///         adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.
/// @dev The owner's only power is `createToken`. A token's metadata URI, price, sale window and payout
///      address are fixed at creation; no function changes them. Mint payments are recorded per token
///      and only ever leave the contract through `release(id)`, to that token's payout address.
///      No upgrades, pause, royalties, owner withdrawal, allowlist or URI setter.
/// @custom:security-contact the snowmoon.party owner (see the repository README)
contract SnowmoonWIP is ERC1155, Ownable2Step, ReentrancyGuardTransient {
    /// @notice Everything about a token, fixed at creation.
    /// @param uri Metadata URI (for example `ipfs://<cid>`), never empty.
    /// @param price Price of one edition, in wei. Never zero.
    /// @param start First second the mint is open (inclusive), unix time.
    /// @param end First second the mint is closed (exclusive), unix time.
    /// @param payout The only address `release` ever pays for this token (a 0xSplits PushSplit).
    struct Token {
        string uri;
        uint256 price;
        uint64 start;
        uint64 end;
        address payable payout;
    }

    /// @notice Collection name shown by wallets and explorers.
    string public name;
    /// @notice Collection symbol shown by wallets and explorers.
    string public symbol;
    /// @dev Collection-level metadata (ERC-7572), set once at deploy.
    string private _contractURI;

    /// @notice Number of tokens created. Token ids run from 1 to `tokenCount`.
    uint256 public tokenCount;
    /// @notice Mint payments recorded for each token and not yet released, in wei.
    mapping(uint256 id => uint256 amount) public proceeds;
    /// @notice Sum of `proceeds` over all tokens. ETH held above this was forced in and is never paid out.
    uint256 public totalProceeds;

    mapping(uint256 id => Token) private _tokens;

    /// @notice A token was created with these fixed terms.
    event TokenCreated(uint256 indexed id, string uri, uint256 price, uint64 start, uint64 end, address indexed payout);
    /// @notice `buyer` paid `paid` wei for `quantity` editions of token `id`, minted to `to`.
    event Minted(uint256 indexed id, address indexed buyer, address indexed to, uint256 quantity, uint256 paid);
    /// @notice `caller` released `amount` wei of token `id`'s proceeds to its `payout`.
    event Released(uint256 indexed id, address indexed payout, address indexed caller, uint256 amount);

    error EmptyURI();
    error ZeroPrice();
    error InvalidWindow(uint64 start, uint64 end);
    error InvalidPayout(address payout);
    error TokenDoesNotExist(uint256 id);
    error MintNotOpen(uint256 id, uint64 start, uint64 end);
    error ZeroQuantity();
    error WrongPayment(uint256 expected, uint256 sent);
    error NothingToRelease(uint256 id);
    error ReleaseFailed(uint256 id, address payout);

    /// @param initialOwner The address allowed to create tokens (the owner's own wallet).
    /// @param name_ Collection name.
    /// @param symbol_ Collection symbol.
    /// @param contractURI_ Collection metadata URI (ERC-7572), never empty.
    constructor(address initialOwner, string memory name_, string memory symbol_, string memory contractURI_)
        ERC1155("")
        Ownable(initialOwner)
    {
        if (bytes(contractURI_).length == 0) revert EmptyURI();
        name = name_;
        symbol = symbol_;
        _contractURI = contractURI_;
    }

    // ------------------------------------------------------------------ owner

    /// @notice Creates a token with fixed terms. Owner only. The terms can never change.
    /// @param tokenURI Metadata URI, non-empty.
    /// @param price Price per edition in wei, non-zero.
    /// @param start Mint opens at this unix second (inclusive). May be in the past.
    /// @param end Mint closes at this unix second (exclusive). Must be after `start` and in the future.
    /// @param payout Where `release` sends this token's proceeds. Not zero, not this contract.
    /// @return id The new token's id.
    function createToken(string calldata tokenURI, uint256 price, uint64 start, uint64 end, address payable payout)
        external
        onlyOwner
        returns (uint256 id)
    {
        if (bytes(tokenURI).length == 0) revert EmptyURI();
        if (price == 0) revert ZeroPrice();
        if (start >= end || end <= block.timestamp) revert InvalidWindow(start, end);
        if (payout == address(0) || payout == address(this)) revert InvalidPayout(payout);

        id = ++tokenCount;
        _tokens[id] = Token({uri: tokenURI, price: price, start: start, end: end, payout: payout});

        emit TokenCreated(id, tokenURI, price, start, end, payout);
        emit URI(tokenURI, id);
    }

    // ------------------------------------------------------------------ anyone

    /// @notice Mints `quantity` editions of token `id` to `to`, for exactly `price * quantity` wei.
    /// @dev Open while `start <= block.timestamp < end`. The payment is recorded before `_mint`, which
    ///      calls `onERC1155Received` when `to` is a contract.
    function mint(uint256 id, uint256 quantity, address to) external payable nonReentrant {
        Token storage t = _existing(id);
        if (block.timestamp < t.start || block.timestamp >= t.end) revert MintNotOpen(id, t.start, t.end);
        if (quantity == 0) revert ZeroQuantity();
        uint256 cost = t.price * quantity; // checked: reverts on overflow
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        proceeds[id] += cost;
        totalProceeds += cost;
        emit Minted(id, msg.sender, to, quantity, cost);

        _mint(to, id, quantity, "");
    }

    /// @notice Sends all of token `id`'s recorded proceeds to its payout address. Anyone can call it.
    /// @dev Zeroes the balance before sending. If the payout rejects the ETH, the whole call reverts and
    ///      the proceeds stay recorded for a later release.
    function release(uint256 id) external nonReentrant {
        address payable payout = _existing(id).payout;
        uint256 amount = proceeds[id];
        if (amount == 0) revert NothingToRelease(id);

        proceeds[id] = 0;
        totalProceeds -= amount;
        emit Released(id, payout, msg.sender, amount);

        (bool ok,) = payout.call{value: amount}("");
        if (!ok) revert ReleaseFailed(id, payout);
    }

    // ------------------------------------------------------------------ views

    /// @notice Token `id`'s metadata URI.
    function uri(uint256 id) public view override returns (string memory) {
        return _existing(id).uri;
    }

    /// @notice Collection metadata URI (ERC-7572).
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    /// @notice Token `id`'s fixed terms.
    function token(uint256 id) external view returns (Token memory) {
        return _existing(id);
    }

    /// @notice Whether a sale for token `id` is open right now.
    function isOpen(uint256 id) external view returns (bool) {
        if (id == 0 || id > tokenCount) return false;
        Token storage t = _tokens[id];
        return block.timestamp >= t.start && block.timestamp < t.end;
    }

    function _existing(uint256 id) private view returns (Token storage t) {
        if (id == 0 || id > tokenCount) revert TokenDoesNotExist(id);
        return _tokens[id];
    }
}
