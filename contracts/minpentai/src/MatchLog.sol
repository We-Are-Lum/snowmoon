// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @title Minpentai match log, commit before play (snowmoon.party, onchain v1 spike)
/// @notice A permanent, per-wallet history of Minpentai matches. A player opens a match with start(),
/// which fixes the ruleset, the computer player's level and the match number n. The seed comes from
/// the hash of a block that doesn't exist yet when start() is sent (start's block + 2), read back
/// through the EIP-2935 block-hash history contract. The player plays offchain, then record()s the
/// match before the deadline. A match not recorded by then can only end as a forfeit: by close(),
/// which anyone may call after the deadline, or by the wallet's next start(). start() while a match
/// is open forfeits it. Every started match ends exactly once: recorded or forfeited.
/// No owner, no admin, no proxy, nothing to upgrade, pause or delete.
///
/// A match is bytes in encoding format 3 (src/lib/minpentai/onchain/encoding.ts):
///   [0] version (3) | [1:33] ruleset ID | [33:37] u32 n | [37:69] seed | [69:77] u64 seed block
///   | [77] opponent kind | [78] level | [79:] the rest (result, end, moves, final position)
/// record() checks the version, the length, and that the ruleset, n, seed block, level and seed are
/// the open match's. It does not read the registry or replay the match: readers do that.
contract MatchLog {
    uint8 public constant FORMAT_VERSION = 3;
    /// @notice The 82-byte header, the turn count and the piece count.
    uint256 public constant MIN_LENGTH = 84;
    /// @notice The seed block is this many blocks after start()'s block.
    uint256 public constant SEED_DELAY = 2;
    /// @notice record() is allowed up to and including seed block + this (inside EIP-2935's 8,191-block window).
    uint256 public constant DEADLINE_BLOCKS = 8000;
    /// @notice The EIP-2935 block-hash history contract (the same address on every chain that has it).
    address public constant HISTORY = 0x0000F90827F1C53a10cb7A02335B175320002935;
    /// @notice matchHash for a forfeited match. No match's keccak256 is this value.
    bytes32 public constant FORFEIT = bytes32(uint256(1));

    struct Open {
        bytes32 rulesetId;
        uint64 seedBlock;
        uint8 level;
        bool open;
    }

    /// @notice How many matches each wallet has ended (recorded or forfeited); its next one is number `count`.
    mapping(address player => uint256) public count;
    /// @notice Each wallet's current match. Kept between matches (only `open` is cleared); start() rewrites every field.
    mapping(address player => Open) public openMatch;
    /// @notice keccak256 of each recorded match's bytes, or FORFEIT, by wallet and number.
    mapping(address player => mapping(uint256 n => bytes32)) public matchHash;

    event MatchStarted(address indexed player, bytes32 indexed rulesetId, uint256 n, uint8 level, uint64 seedBlock, uint64 deadline);
    event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data);
    event MatchForfeited(address indexed player, bytes32 indexed rulesetId, uint256 n);

    error NoOpenMatch();
    error TooShort(uint256 length);
    error BadVersion(uint8 version);
    error WrongRuleset(bytes32 expected, bytes32 got);
    error WrongN(uint256 expected, uint256 got);
    error WrongSeedBlock(uint64 expected, uint64 got);
    error WrongLevel(uint8 expected, uint8 got);
    error SeedNotYetAvailable(uint64 seedBlock);
    error DeadlinePassed(uint64 deadline);
    error NotExpired(uint64 deadline);
    error NoHistory();
    error WrongSeed(bytes32 expected, bytes32 got);

    /// @notice The seed of a match, given its seed block's hash.
    function seedOf(address player, uint256 n, bytes32 rulesetId, uint8 level, bytes32 seedBlockHash) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), player, n, rulesetId, level, seedBlockHash));
    }

    /// @notice The last block at which an open match can still be recorded.
    function deadlineOf(uint64 seedBlock) public pure returns (uint64) {
        return seedBlock + uint64(DEADLINE_BLOCKS);
    }

    /// @notice Open a match. A match already open is forfeited first, whether or not its deadline has passed.
    /// Reverts on a chain without the EIP-2935 history contract, where no match could ever be recorded.
    function start(bytes32 rulesetId, uint8 level) external returns (uint256 n, uint64 seedBlock) {
        if (HISTORY.code.length == 0) revert NoHistory();
        Open storage o = openMatch[msg.sender];
        if (o.open) _forfeit(msg.sender, o);
        n = count[msg.sender];
        seedBlock = uint64(block.number + SEED_DELAY);
        // Every field is rewritten: nothing from the previous match carries over.
        o.rulesetId = rulesetId;
        o.seedBlock = seedBlock;
        o.level = level;
        o.open = true;
        emit MatchStarted(msg.sender, rulesetId, n, level, seedBlock, deadlineOf(seedBlock));
    }

    /// @notice Record the open match, from its seed block + 1 up to and including its deadline.
    function record(bytes calldata data) external returns (uint256 n) {
        Open storage o = openMatch[msg.sender];
        if (!o.open) revert NoOpenMatch();
        if (data.length < MIN_LENGTH) revert TooShort(data.length);
        if (uint8(data[0]) != FORMAT_VERSION) revert BadVersion(uint8(data[0]));
        bytes32 rulesetId = o.rulesetId;
        uint64 seedBlock = o.seedBlock;
        uint8 level = o.level;
        n = count[msg.sender];
        if (bytes32(data[1:33]) != rulesetId) revert WrongRuleset(rulesetId, bytes32(data[1:33]));
        if (uint32(bytes4(data[33:37])) != n) revert WrongN(n, uint32(bytes4(data[33:37])));
        if (uint64(bytes8(data[69:77])) != seedBlock) revert WrongSeedBlock(seedBlock, uint64(bytes8(data[69:77])));
        if (uint8(data[78]) != level) revert WrongLevel(level, uint8(data[78]));
        if (block.number <= seedBlock) revert SeedNotYetAvailable(seedBlock);
        if (block.number > deadlineOf(seedBlock)) revert DeadlinePassed(deadlineOf(seedBlock));
        bytes32 want = seedOf(msg.sender, n, rulesetId, level, _blockHash(seedBlock));
        if (bytes32(data[37:69]) != want) revert WrongSeed(want, bytes32(data[37:69]));
        o.open = false;
        matchHash[msg.sender][n] = keccak256(data);
        count[msg.sender] = n + 1;
        emit MatchRecorded(msg.sender, rulesetId, n, data);
    }

    /// @notice End `player`'s open match as a forfeit once its deadline has passed. Anyone may call it.
    function close(address player) external {
        Open storage o = openMatch[player];
        if (!o.open) revert NoOpenMatch();
        if (block.number <= deadlineOf(o.seedBlock)) revert NotExpired(deadlineOf(o.seedBlock));
        _forfeit(player, o);
    }

    function _forfeit(address player, Open storage o) private {
        uint256 n = count[player];
        o.open = false;
        matchHash[player][n] = FORFEIT;
        count[player] = n + 1;
        emit MatchForfeited(player, o.rulesetId, n);
    }

    /// @dev The hash of `blockNumber` from the EIP-2935 history contract; reverts if it has no code or no answer.
    function _blockHash(uint64 blockNumber) private view returns (bytes32 h) {
        if (HISTORY.code.length == 0) revert NoHistory();
        (bool ok, bytes memory ret) = HISTORY.staticcall(abi.encode(uint256(blockNumber)));
        if (!ok || ret.length != 32) revert NoHistory();
        h = abi.decode(ret, (bytes32));
        if (h == bytes32(0)) revert NoHistory();
    }
}
