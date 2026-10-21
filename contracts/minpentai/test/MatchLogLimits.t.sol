// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MatchLog} from "../src/MatchLog.sol";
import {MockHistory} from "./MockHistory.sol";

/// A plain call-forwarder (like Multicall3.aggregate or many relayers/batchers): msg.sender at the log is this contract.
contract Forwarder {
    function fwd(address target, bytes calldata cd) external returns (bytes memory) {
        (bool ok, bytes memory r) = target.call(cd);
        require(ok, "call failed");
        return r;
    }
}

/// From the independent review (2026-10-21), kept for commit before play. These pass on purpose: they
/// pin down behaviour that is by design and documented in docs/proposals/minpentai-onchain-v1.md
/// (record from your own wallet, never a shared forwarder; MatchLog checks only the header and seed;
/// n is a u32).
contract MatchLogLimitsTest is Test {
    address constant HISTORY = 0x0000F90827F1C53a10cb7A02335B175320002935;
    MatchLog ml;
    MockHistory hist;

    function setUp() public {
        ml = new MatchLog();
        deployCodeTo("MockHistory.sol:MockHistory", HISTORY);
        hist = MockHistory(HISTORY);
        vm.roll(100);
    }

    function _data(bytes32 rid, uint32 n, bytes32 seed, uint64 seedBlock, uint8 level, bytes memory tail) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(3), rid, n, seed, seedBlock, uint8(0), level, tail);
    }

    /// start(), set the seed block's hash, move past it; returns the seed.
    function _open(address who, bytes32 rid, uint8 level) internal returns (uint64 sb, bytes32 seed) {
        vm.prank(who);
        uint256 n;
        (n, sb) = ml.start(rid, level);
        hist.set(sb, keccak256(abi.encode(who, sb)));
        vm.roll(sb + 1);
        seed = ml.seedOf(who, n, rid, level, keccak256(abi.encode(who, sb)));
    }

    /// Anyone can record any bytes that pass the header and seed checks: no ruleset check, no structure.
    function test_garbageAccepted() public {
        address p = address(0xA11CE);
        (uint64 sb, bytes32 seed) = _open(p, bytes32(0), 9);
        vm.prank(p);
        ml.record(_data(bytes32(0), 0, seed, sb, 9, hex"ffffffffffffffff"));
        assertEq(ml.count(p), 1);
    }

    /// Everyone who records through one shared forwarder shares one history; any of them can end its match.
    function test_sharedForwarderHistory() public {
        Forwarder f = new Forwarder();
        address alice = address(0xA11CE);
        address mallory = address(0xBAD);
        vm.prank(alice);
        f.fwd(address(ml), abi.encodeCall(MatchLog.start, (keccak256("r"), 1)));
        // Mallory starts through the same forwarder: Alice's open match is forfeited.
        vm.prank(mallory);
        f.fwd(address(ml), abi.encodeCall(MatchLog.start, (keccak256("r"), 1)));
        assertEq(ml.count(address(f)), 1);
        assertEq(ml.matchHash(address(f), 0), ml.FORFEIT());
    }

    /// n is a u32 in the bytes but count is a uint256: at 2^32 matches the wallet can never record again.
    function test_countPast2pow32Bricks() public {
        address p = address(0xA11CE);
        vm.store(address(ml), keccak256(abi.encode(p, uint256(0))), bytes32(uint256(1) << 32));
        (uint64 sb, bytes32 seed) = _open(p, bytes32(0), 0);
        vm.prank(p);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.WrongN.selector, uint256(1) << 32, uint256(0)));
        ml.record(_data(bytes32(0), 0, seed, sb, 0, hex"0000000000"));
    }

    /// Fuzz: whatever the bytes and caller, a record lands only at (msg.sender, count) and never twice.
    function testFuzz_onlyOwnOpenMatch(address caller, address other, uint32 n, bytes32 seed, bytes calldata tail) public {
        vm.assume(caller != other && caller != address(0));
        (uint64 sb, bytes32 real) = _open(caller, keccak256("r"), 1);
        bytes memory d = _data(keccak256("r"), n, seed, sb, 1, tail);
        vm.prank(caller);
        try ml.record(d) returns (uint256 got) {
            assertEq(got, 0);
            assertEq(n, 0);
            assertEq(seed, real);
            assertEq(ml.count(other), 0);
            vm.prank(caller);
            vm.expectRevert(MatchLog.NoOpenMatch.selector);
            ml.record(d);
        } catch {}
    }

    /// Gas for a big payload: the recorder pays, but readers and indexers get the full bytes in the event.
    function test_bigPayloadGas() public {
        address p = address(0xA11CE);
        (uint64 sb, bytes32 seed) = _open(p, bytes32(0), 0);
        bytes memory d = _data(bytes32(0), 0, seed, sb, 0, new bytes(100_000));
        vm.prank(p);
        uint256 g = gasleft();
        ml.record(d);
        emit log_named_uint("gas for a 100 kB record", g - gasleft());
    }
}
