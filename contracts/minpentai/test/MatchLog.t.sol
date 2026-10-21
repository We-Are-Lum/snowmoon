// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MatchLog} from "../src/MatchLog.sol";

/// MatchLog against the shared fixtures (fixtures/onchain.json, computed by the TypeScript).
contract MatchLogTest is Test {
    event MatchRecorded(address indexed player, bytes32 indexed rulesetId, uint256 n, bytes data);

    string json;
    MatchLog ml;
    address LOG;
    bytes32 RULESET;

    function setUp() public {
        json = vm.readFile("fixtures/onchain.json");
        LOG = vm.parseJsonAddress(json, ".matchLog");
        RULESET = vm.parseJsonBytes32(json, ".rulesetId");
        vm.chainId(vm.parseUint(vm.parseJsonString(json, ".chainId")));
        deployCodeTo("MatchLog.sol:MatchLog", LOG);
        ml = MatchLog(LOG);
    }

    function _p(string memory a, uint256 i, string memory b) internal pure returns (string memory) {
        return string.concat(a, "[", vm.toString(i), "]", b);
    }

    function _match(uint256 i) internal view returns (address player, uint256 n, bytes memory data, bytes32 h) {
        player = vm.parseJsonAddress(json, _p(".matches", i, ".player"));
        n = vm.parseJsonUint(json, _p(".matches", i, ".n"));
        data = vm.parseJsonBytes(json, _p(".matches", i, ".data"));
        h = vm.parseJsonBytes32(json, _p(".matches", i, ".hash"));
    }

    // ---- Shared fixtures: seed derivation and the engine seed agree with the TypeScript.

    function test_fixtureSeeds() public {
        uint256 i;
        for (; vm.keyExistsJson(json, _p(".seeds", i, "")); i++) {
            uint256 chain = vm.parseUint(vm.parseJsonString(json, _p(".seeds", i, ".chainId")));
            address at = vm.parseJsonAddress(json, _p(".seeds", i, ".matchLog"));
            address player = vm.parseJsonAddress(json, _p(".seeds", i, ".player"));
            uint256 n = vm.parseUint(vm.parseJsonString(json, _p(".seeds", i, ".n")));
            bytes32 seed = vm.parseJsonBytes32(json, _p(".seeds", i, ".seed"));
            uint256 engine = vm.parseJsonUint(json, _p(".seeds", i, ".engineSeed"));
            vm.chainId(chain);
            if (at.code.length == 0) deployCodeTo("MatchLog.sol:MatchLog", at);
            assertEq(MatchLog(at).seedFor(player, n), seed, "seed");
            assertEq(uint256(uint32(uint256(seed))), engine, "engine seed");
        }
        assertEq(i, 36);
    }

    function test_fixtureEngineSeeds() public view {
        uint256 i;
        for (; vm.keyExistsJson(json, _p(".engine", i, "")); i++) {
            bytes32 seed = vm.parseJsonBytes32(json, _p(".engine", i, ".seed"));
            assertEq(uint256(uint32(uint256(seed))), vm.parseJsonUint(json, _p(".engine", i, ".engineSeed")));
            // Which 4 bytes, in which order: bytes 28..31, big-endian.
            assertEq(uint32(bytes4(abi.encodePacked(seed[28], seed[29], seed[30], seed[31]))), uint32(uint256(seed)));
        }
        assertEq(i, 7);
    }

    // ---- Recording.

    function test_recordFixtureMatches() public {
        for (uint256 i; i < 6; i++) {
            (address player, uint256 n, bytes memory data, bytes32 h) = _match(i);
            (uint256 nextN, bytes32 nextS) = ml.nextSeed(player);
            assertEq(nextN, n);
            assertEq(nextS, bytes32(_slice(data, 37, 32)));
            vm.expectEmit(true, true, false, true, LOG);
            emit MatchRecorded(player, RULESET, n, data);
            vm.prank(player);
            assertEq(ml.record(data), n);
            assertEq(ml.matchHash(player, n), h);
            assertEq(ml.matchHash(player, n), keccak256(data));
            assertEq(ml.count(player), n + 1);
        }
    }

    function test_anotherWalletsMatchIsRefused() public {
        (address a,, bytes memory data,) = _match(0);
        address b = address(0xB0B);
        bytes memory want = abi.encodeWithSelector(MatchLog.WrongSeed.selector, ml.seedFor(b, 0), ml.seedFor(a, 0));
        vm.expectRevert(want);
        vm.prank(b);
        ml.record(data);
        assertEq(ml.count(b), 0);
    }

    function test_staleAndFutureNAreRefused() public {
        (address p,, bytes memory d0,) = _match(0);
        (,, bytes memory d1,) = _match(1);
        vm.startPrank(p);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.StaleN.selector, 0, 1));
        ml.record(d1);
        ml.record(d0);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.StaleN.selector, 1, 0));
        ml.record(d0);
        ml.record(d1);
        vm.stopPrank();
        assertEq(ml.count(p), 2);
    }

    function test_otherChainIsRefused() public {
        (address p,, bytes memory data,) = _match(0);
        vm.chainId(8453);
        bytes memory want = abi.encodeWithSelector(MatchLog.WrongSeed.selector, ml.seedFor(p, 0), bytes32(_slice(data, 37, 32)));
        vm.expectRevert(want);
        vm.prank(p);
        ml.record(data);
    }

    function test_wrongVersionAndTruncatedAreRefused() public {
        (address p,, bytes memory data,) = _match(0);
        vm.startPrank(p);
        for (uint8 v = 0; v < 8; v++) {
            if (v == 2) continue;
            bytes memory bad = bytes.concat(data);
            bad[0] = bytes1(v);
            vm.expectRevert(abi.encodeWithSelector(MatchLog.BadVersion.selector, v));
            ml.record(bad);
        }
        vm.expectRevert(abi.encodeWithSelector(MatchLog.TooShort.selector, 0));
        ml.record("");
        vm.expectRevert(abi.encodeWithSelector(MatchLog.TooShort.selector, 75));
        ml.record(_slice(data, 0, 75));
        vm.stopPrank();
        assertEq(ml.count(p), 0);
    }

    /// Nothing can change or remove a record: the only writer is record(), which only ever writes
    /// slot n = count (then moves count on), so a recorded n can never be written again.
    function test_recordsCannotBeAlteredOrDeleted() public {
        (address p,, bytes memory d0, bytes32 h0) = _match(0);
        vm.prank(p);
        ml.record(d0);
        bytes memory other = bytes.concat(d0);
        other[other.length - 1] = bytes1(uint8(other[other.length - 1]) ^ 0x80);
        vm.prank(p);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.StaleN.selector, 1, 0));
        ml.record(other);
        assertEq(ml.matchHash(p, 0), h0);
        assertEq(ml.count(p), 1);
        // No ether to take, no fallback or receive to call into.
        (bool ok,) = LOG.call{value: 0}(hex"deadbeef");
        assertFalse(ok);
        (ok,) = LOG.call{value: 1}("");
        assertFalse(ok);
    }

    // ---- Fuzzing.

    function testFuzz_ownSeedRecords(address player, bytes calldata tail, uint8 times) public {
        vm.assume(player != address(0) && tail.length >= 7 && tail.length < 400);
        uint256 k = bound(times, 1, 5);
        for (uint256 i; i < k; i++) {
            bytes memory data = abi.encodePacked(uint8(2), RULESET, uint32(i), ml.seedFor(player, i), tail);
            vm.prank(player); // data is built before the prank, so the prank applies to record()
            assertEq(ml.record(data), i);
            assertEq(ml.matchHash(player, i), keccak256(data));
        }
        assertEq(ml.count(player), k);
    }

    function testFuzz_wrongSeedReverts(address player, bytes32 seed, bytes calldata tail) public {
        bytes32 own = ml.seedFor(player, 0);
        vm.assume(tail.length >= 7 && tail.length < 400 && seed != own);
        bytes memory data = abi.encodePacked(uint8(2), RULESET, uint32(0), seed, tail);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongSeed.selector, own, seed));
        vm.prank(player);
        ml.record(data);
    }

    function testFuzz_anyBytesNeverRecordUnlessOwnSeed(address player, bytes calldata data) public {
        vm.assume(data.length < 600);
        bool valid = data.length >= 76 && uint8(data[0]) == 2 && uint32(bytes4(data[33:37])) == 0 && bytes32(data[37:69]) == ml.seedFor(player, 0);
        bytes memory call_ = abi.encodeCall(MatchLog.record, (data));
        vm.prank(player);
        (bool ok,) = LOG.call(call_);
        assertEq(ok, valid);
        assertEq(ml.count(player), valid ? 1 : 0);
    }

    function testFuzz_anyRulesetIdIsAccepted(address player, bytes32 rid) public {
        bytes memory data = abi.encodePacked(uint8(2), rid, uint32(0), ml.seedFor(player, 0), hex"00000000000000");
        vm.expectEmit(true, true, false, true, LOG);
        emit MatchRecorded(player, rid, 0, data);
        vm.prank(player);
        ml.record(data);
    }

    function _slice(bytes memory b, uint256 from, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i; i < len; i++) out[i] = b[from + i];
    }
}
