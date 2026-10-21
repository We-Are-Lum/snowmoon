// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MatchLog} from "../src/MatchLog.sol";
import {MockHistory} from "./MockHistory.sol";

/// MatchLog (commit before play) against the shared fixtures (fixtures/onchain.json, computed by the TypeScript).
contract MatchLogTest is Test {
    event MatchStarted(address indexed player, bytes32 indexed rulesetId, uint256 n, uint8 level, uint64 seedBlock, uint64 deadline);
    event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data);
    event MatchForfeited(address indexed player, bytes32 indexed rulesetId, uint256 n);

    address constant HISTORY = 0x0000F90827F1C53a10cb7A02335B175320002935;
    string json;
    MatchLog ml;
    MockHistory hist;
    address LOG;
    bytes32 RULESET;

    struct Fx {
        address player;
        uint256 n;
        uint8 level;
        uint256 startBlock;
        uint64 seedBlock;
        bytes32 seedBlockHash;
        bytes data;
        bytes32 hash;
    }

    function setUp() public {
        json = vm.readFile("fixtures/onchain.json");
        LOG = vm.parseJsonAddress(json, ".matchLog");
        RULESET = vm.parseJsonBytes32(json, ".rulesetId");
        vm.chainId(vm.parseUint(vm.parseJsonString(json, ".chainId")));
        deployCodeTo("MatchLog.sol:MatchLog", LOG);
        deployCodeTo("MockHistory.sol:MockHistory", HISTORY);
        ml = MatchLog(LOG);
        hist = MockHistory(HISTORY);
    }

    function _p(string memory a, uint256 i, string memory b) internal pure returns (string memory) {
        return string.concat(a, "[", vm.toString(i), "]", b);
    }

    function _fx(uint256 i) internal view returns (Fx memory f) {
        f.player = vm.parseJsonAddress(json, _p(".matches", i, ".player"));
        f.n = vm.parseJsonUint(json, _p(".matches", i, ".n"));
        f.level = uint8(vm.parseJsonUint(json, _p(".matches", i, ".level")));
        f.startBlock = vm.parseJsonUint(json, _p(".matches", i, ".startBlock"));
        f.seedBlock = uint64(vm.parseJsonUint(json, _p(".matches", i, ".seedBlock")));
        f.seedBlockHash = vm.parseJsonBytes32(json, _p(".matches", i, ".seedBlockHash"));
        f.data = vm.parseJsonBytes(json, _p(".matches", i, ".data"));
        f.hash = vm.parseJsonBytes32(json, _p(".matches", i, ".hash"));
    }

    /// start() for a fixture match at its start block, and set its seed block's hash.
    function _start(Fx memory f) internal {
        vm.roll(f.startBlock);
        vm.prank(f.player);
        ml.start(RULESET, f.level);
        hist.set(f.seedBlock, f.seedBlockHash);
    }

    /// A match's header and a tail, built here (for tests that need matches the fixtures don't have).
    function _data(bytes32 rid, uint256 n, bytes32 seed, uint64 seedBlock, uint8 level, bytes memory tail) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(3), rid, uint32(n), seed, seedBlock, uint8(0), level, tail);
    }

    function _open(address p) internal view returns (bytes32 rid, uint64 seedBlock, uint8 level, bool open) {
        (rid, seedBlock, level, open) = ml.openMatch(p);
    }

    // ---- Shared fixtures: the seed and the engine seed agree with the TypeScript.

    function test_fixtureSeeds() public {
        uint256 i;
        for (; vm.keyExistsJson(json, _p(".seeds", i, "")); i++) {
            vm.chainId(vm.parseUint(vm.parseJsonString(json, _p(".seeds", i, ".chainId"))));
            address at = vm.parseJsonAddress(json, _p(".seeds", i, ".matchLog"));
            if (at.code.length == 0) deployCodeTo("MatchLog.sol:MatchLog", at);
            bytes32 seed = MatchLog(at).seedOf(
                vm.parseJsonAddress(json, _p(".seeds", i, ".player")),
                vm.parseUint(vm.parseJsonString(json, _p(".seeds", i, ".n"))),
                vm.parseJsonBytes32(json, _p(".seeds", i, ".rulesetId")),
                uint8(vm.parseJsonUint(json, _p(".seeds", i, ".level"))),
                vm.parseJsonBytes32(json, _p(".seeds", i, ".seedBlockHash"))
            );
            assertEq(seed, vm.parseJsonBytes32(json, _p(".seeds", i, ".seed")), "seed");
            assertEq(uint256(uint32(uint256(seed))), vm.parseJsonUint(json, _p(".seeds", i, ".engineSeed")), "engine seed");
        }
        assertEq(i, 36);
    }

    function test_fixtureEngineSeeds() public view {
        uint256 i;
        for (; vm.keyExistsJson(json, _p(".engine", i, "")); i++) {
            bytes32 seed = vm.parseJsonBytes32(json, _p(".engine", i, ".seed"));
            assertEq(uint256(uint32(uint256(seed))), vm.parseJsonUint(json, _p(".engine", i, ".engineSeed")));
            assertEq(uint32(bytes4(abi.encodePacked(seed[28], seed[29], seed[30], seed[31]))), uint32(uint256(seed)));
        }
        assertEq(i, 7);
    }

    // ---- The happy path, with events.

    function test_startAndRecordFixtureMatches() public {
        for (uint256 i; i < 6; i++) {
            Fx memory f = _fx(i);
            vm.roll(f.startBlock);
            vm.expectEmit(true, true, false, true, LOG);
            emit MatchStarted(f.player, RULESET, f.n, f.level, f.seedBlock, f.seedBlock + 8000);
            vm.prank(f.player);
            (uint256 n, uint64 sb) = ml.start(RULESET, f.level);
            assertEq(n, f.n);
            assertEq(sb, f.seedBlock);
            hist.set(f.seedBlock, f.seedBlockHash);
            vm.roll(f.seedBlock + 1);
            vm.expectEmit(true, true, false, true, LOG);
            emit MatchRecorded(f.player, RULESET, f.n, f.data);
            vm.prank(f.player);
            assertEq(ml.record(f.data), f.n);
            assertEq(ml.matchHash(f.player, f.n), f.hash);
            assertEq(ml.count(f.player), f.n + 1);
            (,,, bool open) = _open(f.player);
            assertFalse(open);
        }
    }

    // ---- Timing edges.

    function test_recordInTheStartBlockAndTheNextTwoReverts() public {
        Fx memory f = _fx(0);
        _start(f);
        for (uint256 b = f.startBlock; b <= f.startBlock + 2; b++) {
            vm.roll(b);
            vm.prank(f.player);
            vm.expectRevert(abi.encodeWithSelector(MatchLog.SeedNotYetAvailable.selector, f.seedBlock));
            ml.record(f.data);
        }
        vm.roll(f.startBlock + 3);
        vm.prank(f.player);
        ml.record(f.data);
    }

    function test_recordAtTheDeadlinePassesAndOneLaterReverts() public {
        Fx memory f = _fx(2);
        _start(f);
        uint64 deadline = f.seedBlock + 8000;
        assertEq(ml.deadlineOf(f.seedBlock), deadline);
        vm.roll(deadline + 1);
        vm.prank(f.player);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.DeadlinePassed.selector, deadline));
        ml.record(f.data);
        vm.roll(deadline);
        vm.prank(f.player);
        ml.record(f.data);
        assertEq(ml.matchHash(f.player, 0), f.hash);
    }

    /// After the deadline record() always reverts, whatever the claim (no late losses or resigns).
    function testFuzz_afterTheDeadlineRecordAlwaysReverts(uint32 late, uint8 claim, uint8 endKind) public {
        Fx memory f = _fx(4);
        _start(f);
        uint64 deadline = f.seedBlock + 8000;
        bytes memory d = bytes.concat(f.data);
        d[79] = bytes1(claim % 3);
        d[80] = bytes1(endKind % 2);
        vm.roll(uint256(deadline) + 1 + bound(late, 0, 1_000_000));
        vm.prank(f.player);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.DeadlinePassed.selector, deadline));
        ml.record(d);
    }

    // ---- Forfeits.

    function test_closeBeforeTheDeadlineReverts() public {
        Fx memory f = _fx(0);
        _start(f);
        uint64 deadline = f.seedBlock + 8000;
        for (uint256 b = f.startBlock; b <= deadline; b += 997) {
            vm.roll(b);
            vm.expectRevert(abi.encodeWithSelector(MatchLog.NotExpired.selector, deadline));
            ml.close(f.player);
        }
        vm.roll(deadline);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.NotExpired.selector, deadline));
        ml.close(f.player);
    }

    function test_closeWithNoOpenMatchReverts() public {
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.close(address(0xBEEF));
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 1);
        vm.prank(f.player);
        ml.record(f.data);
        vm.roll(f.seedBlock + 9000);
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.close(f.player);
    }

    function test_closeAfterTheDeadlineForfeitsByAnyone() public {
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 8001);
        vm.expectEmit(true, true, false, true, LOG);
        emit MatchForfeited(f.player, RULESET, 0);
        vm.prank(address(0x5157));
        ml.close(f.player);
        assertEq(ml.matchHash(f.player, 0), ml.FORFEIT());
        assertEq(ml.count(f.player), 1);
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.close(f.player);
    }

    /// start() while a match is open forfeits it, before or after its deadline, and emits the forfeit.
    function testFuzz_startWhileOpenForfeits(uint32 later, bool pastDeadline) public {
        Fx memory f = _fx(0);
        _start(f);
        uint256 at = pastDeadline ? uint256(f.seedBlock) + 8001 + bound(later, 0, 100_000) : f.startBlock + bound(later, 0, 8002);
        vm.roll(at);
        vm.expectEmit(true, true, false, true, LOG);
        emit MatchForfeited(f.player, RULESET, 0);
        vm.expectEmit(true, true, false, true, LOG);
        emit MatchStarted(f.player, keccak256("next"), 1, 2, uint64(at + 2), uint64(at + 2 + 8000));
        vm.prank(f.player);
        (uint256 n,) = ml.start(keccak256("next"), 2);
        assertEq(n, 1);
        assertEq(ml.matchHash(f.player, 0), ml.FORFEIT());
        assertEq(ml.count(f.player), 1);
    }

    // ---- A match ends once: recorded or forfeited, never again.

    function test_aRecordedMatchCannotBeRecordedAgain() public {
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 1);
        vm.startPrank(f.player);
        ml.record(f.data);
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.record(f.data);
        // Even with a new match open, the old bytes are for n = 0: refused.
        ml.start(RULESET, f.level);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongN.selector, 1, 0));
        ml.record(f.data);
        vm.stopPrank();
        assertEq(ml.matchHash(f.player, 0), f.hash);
    }

    function test_aForfeitedMatchCannotBeRecorded() public {
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 8001);
        ml.close(f.player);
        vm.prank(f.player);
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.record(f.data);
        // Forfeited by a new start(): the old bytes are refused under the new match.
        Fx memory g = _fx(2);
        _start(g);
        vm.roll(g.startBlock + 10);
        vm.prank(g.player);
        ml.start(RULESET, g.level);
        vm.roll(g.startBlock + 20);
        vm.prank(g.player);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongN.selector, 1, 0));
        ml.record(g.data);
        assertEq(ml.matchHash(g.player, 0), ml.FORFEIT());
    }

    // ---- Nothing leaks from one match into the next (the open slot is reused, only its flag cleared).

    struct Next {
        bytes32 rid;
        uint8 level;
        uint64 sb;
        bytes32 seed;
        bytes32 oldSeed;
    }

    function testFuzz_startRewritesEveryFieldAndRecordChecksThemAll(bytes32 ridB, uint8 levelB, uint16 gap, bool recordFirst) public {
        Fx memory f = _fx(0);
        vm.assume(ridB != RULESET && levelB != f.level);
        _start(f);
        if (recordFirst) {
            vm.roll(f.seedBlock + 1);
            vm.prank(f.player);
            ml.record(f.data);
        }
        uint256 at = f.startBlock + 3 + bound(gap, 0, 20_000);
        vm.roll(at);
        vm.prank(f.player);
        ml.start(ridB, levelB);
        Next memory x = _checkFields(f.player, ridB, levelB, uint64(at + 2));
        x.oldSeed = ml.seedOf(f.player, 0, RULESET, f.level, f.seedBlockHash);
        _recordChecksThemAll(f, x);
        assertEq(ml.count(f.player), 2);
    }

    function _checkFields(address p, bytes32 ridB, uint8 levelB, uint64 sbB) internal returns (Next memory x) {
        (bytes32 rid, uint64 sb, uint8 lvl, bool open) = _open(p);
        assertEq(rid, ridB);
        assertEq(sb, sbB);
        assertEq(lvl, levelB);
        assertTrue(open);
        bytes32 h = keccak256(abi.encode("b", sbB));
        hist.set(sbB, h);
        vm.roll(sbB + 1);
        x = Next(ridB, levelB, sbB, ml.seedOf(p, 1, ridB, levelB, h), bytes32(0));
    }

    function _recordChecksThemAll(Fx memory f, Next memory x) internal {
        bytes memory tail = hex"0100000000";
        vm.startPrank(f.player);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongRuleset.selector, x.rid, RULESET));
        ml.record(_data(RULESET, 1, x.seed, x.sb, x.level, tail));
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongN.selector, 1, 0));
        ml.record(_data(x.rid, 0, x.seed, x.sb, x.level, tail));
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongSeedBlock.selector, x.sb, f.seedBlock));
        ml.record(_data(x.rid, 1, x.seed, f.seedBlock, x.level, tail));
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongLevel.selector, x.level, f.level));
        ml.record(_data(x.rid, 1, x.seed, x.sb, f.level, tail));
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongSeed.selector, x.seed, x.oldSeed));
        ml.record(_data(x.rid, 1, x.oldSeed, x.sb, x.level, tail));
        ml.record(_data(x.rid, 1, x.seed, x.sb, x.level, tail));
        vm.stopPrank();
    }

    // ---- EIP-2935.

    function test_historyAddressIsTheEip2935Constant() public view {
        assertEq(ml.HISTORY(), 0x0000F90827F1C53a10cb7A02335B175320002935);
    }

    function test_recordRevertsWithoutHistoryCode() public {
        Fx memory f = _fx(0);
        _start(f);
        vm.etch(HISTORY, "");
        vm.roll(f.seedBlock + 1);
        vm.prank(f.player);
        vm.expectRevert(MatchLog.NoHistory.selector);
        ml.record(f.data);
    }

    function test_recordRevertsWhenHistoryHasNoHash() public {
        Fx memory f = _fx(0);
        vm.roll(f.startBlock);
        vm.prank(f.player);
        ml.start(RULESET, f.level); // no hash set: the mock answers zero
        vm.roll(f.seedBlock + 1);
        vm.prank(f.player);
        vm.expectRevert(MatchLog.NoHistory.selector);
        ml.record(f.data);
    }

    // ---- Someone else's match, malformed bytes, no open match.

    function test_anotherWalletsMatchIsRefused() public {
        Fx memory f = _fx(0);
        _start(f);
        address b = address(0xB0B);
        vm.prank(b);
        ml.start(RULESET, f.level); // same block, same ruleset and level, same n
        vm.roll(f.seedBlock + 1);
        bytes32 bSeed = ml.seedOf(b, 0, RULESET, f.level, f.seedBlockHash);
        bytes32 aSeed = ml.seedOf(f.player, 0, RULESET, f.level, f.seedBlockHash);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongSeed.selector, bSeed, aSeed));
        vm.prank(b);
        ml.record(f.data);
    }

    function test_noOpenMatchWrongVersionAndTruncatedAreRefused() public {
        Fx memory f = _fx(0);
        vm.prank(f.player);
        vm.expectRevert(MatchLog.NoOpenMatch.selector);
        ml.record(f.data);
        _start(f);
        vm.roll(f.seedBlock + 1);
        vm.startPrank(f.player);
        for (uint8 v = 0; v < 8; v++) {
            if (v == 3) continue;
            bytes memory bad = bytes.concat(f.data);
            bad[0] = bytes1(v);
            vm.expectRevert(abi.encodeWithSelector(MatchLog.BadVersion.selector, v));
            ml.record(bad);
        }
        vm.expectRevert(abi.encodeWithSelector(MatchLog.TooShort.selector, 0));
        ml.record("");
        vm.expectRevert(abi.encodeWithSelector(MatchLog.TooShort.selector, 83));
        ml.record(_slice(f.data, 0, 83));
        vm.stopPrank();
        assertEq(ml.count(f.player), 0);
    }

    function testFuzz_anyBytesNeverRecordUnlessTheOpenMatchs(bytes calldata data) public {
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 1);
        bytes32 seed = ml.seedOf(f.player, 0, RULESET, f.level, f.seedBlockHash);
        bool valid = data.length >= 84 && uint8(data[0]) == 3 && bytes32(data[1:33]) == RULESET && uint32(bytes4(data[33:37])) == 0
            && bytes32(data[37:69]) == seed && uint64(bytes8(data[69:77])) == f.seedBlock && uint8(data[78]) == f.level;
        bytes memory c = abi.encodeCall(MatchLog.record, (data));
        vm.prank(f.player);
        (bool ok,) = LOG.call(c);
        assertEq(ok, valid);
    }

    function testFuzz_anyRulesetAndLevelCanBeStarted(address p, bytes32 rid, uint8 level) public {
        vm.assume(p != address(0));
        vm.roll(500);
        vm.prank(p);
        ml.start(rid, level);
        (bytes32 r, uint64 sb, uint8 l, bool open) = _open(p);
        assertEq(r, rid);
        assertEq(sb, 502);
        assertEq(l, level);
        assertTrue(open);
    }

    function test_recordsCannotBeAlteredAndNoEtherIsTaken() public {
        Fx memory f = _fx(0);
        _start(f);
        vm.roll(f.seedBlock + 1);
        vm.prank(f.player);
        ml.record(f.data);
        (bool ok,) = LOG.call{value: 0}(hex"deadbeef");
        assertFalse(ok);
        (ok,) = LOG.call{value: 1}("");
        assertFalse(ok);
        assertEq(ml.matchHash(f.player, 0), f.hash);
    }

    function _slice(bytes memory b, uint256 from, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i; i < len; i++) out[i] = b[from + i];
    }
}
