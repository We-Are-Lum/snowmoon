// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @title Minpentai match log (snowmoon.party, onchain v1 spike)
/// @notice A permanent, per-wallet history of finished Minpentai matches. Play happens offchain;
/// the player records a finished match here in one transaction, paying their own gas.
/// No owner, no admin, no proxy, nothing to upgrade, pause or delete.
///
/// A match is bytes in encoding format 2 (src/lib/minpentai/onchain/encoding.ts):
///   [0] u8 version (2) | [1:33] ruleset ID | [33:37] u32 n | [37:69] bytes32 seed | [69:] the match
/// record() checks only the version, the length, and that the seed is the recorder's own nth seed:
///   keccak256(abi.encode(block.chainid, address(this), msg.sender, n)), n = their record count.
/// So nobody can put another wallet's match (or one from another chain or log) in their history.
/// It does not check the ruleset or the match: anyone can record any ruleset ID; readers keep to
/// registered rulesets and replay each match under its ruleset to verify it.
contract MatchLog {
    uint8 public constant FORMAT_VERSION = 2;
    /// @notice The 74-byte header, the turn count and the piece count.
    uint256 public constant MIN_LENGTH = 76;

    /// @notice How many matches each wallet has recorded; the next one is number `count`.
    mapping(address player => uint256) public count;
    /// @notice keccak256 of each recorded match's bytes, by wallet and number.
    mapping(address player => mapping(uint256 n => bytes32)) public matchHash;

    event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data);

    error TooShort(uint256 length);
    error BadVersion(uint8 version);
    error StaleN(uint256 expected, uint256 got);
    error WrongSeed(bytes32 expected, bytes32 got);

    /// @notice The seed for `player`'s match number `n` on this chain and this log.
    function seedFor(address player, uint256 n) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), player, n));
    }

    /// @notice What a player plays next: their number and its seed.
    function nextSeed(address player) external view returns (uint256 n, bytes32 seed) {
        n = count[player];
        seed = seedFor(player, n);
    }

    /// @notice Record a finished match as msg.sender's next match. Returns its number.
    function record(bytes calldata data) external returns (uint256 n) {
        if (data.length < MIN_LENGTH) revert TooShort(data.length);
        if (uint8(data[0]) != FORMAT_VERSION) revert BadVersion(uint8(data[0]));
        n = count[msg.sender];
        uint256 got = uint32(bytes4(data[33:37]));
        if (got != n) revert StaleN(n, got);
        bytes32 seed = bytes32(data[37:69]);
        bytes32 want = seedFor(msg.sender, n);
        if (seed != want) revert WrongSeed(want, seed);
        count[msg.sender] = n + 1;
        matchHash[msg.sender][n] = keccak256(data);
        emit MatchRecorded(msg.sender, bytes32(data[1:33]), n, data);
    }
}
