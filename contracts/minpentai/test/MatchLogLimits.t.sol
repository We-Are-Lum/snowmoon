// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MatchLog} from "../src/MatchLog.sol";

/// A plain call-forwarder (like Multicall3.aggregate or many relayers/batchers): msg.sender at the log is this contract.
contract Forwarder {
    function fwd(address target, bytes calldata cd) external returns (bytes memory) {
        (bool ok, bytes memory r) = target.call(cd);
        require(ok, "call failed");
        return r;
    }
}

/// From the independent review (2026-10-21). These pass on purpose: they pin down behaviour that is
/// by design and documented in docs/proposals/minpentai-onchain-v1.md (record from your own wallet,
/// never a shared forwarder; MatchLog checks only the header; n is a u32).
contract MatchLogLimitsTest is Test {
    MatchLog ml;

    function setUp() public {
        ml = new MatchLog();
    }

    function _data(bytes32 rid, uint32 n, bytes32 seed, bytes memory tail) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(2), rid, n, seed, tail);
    }

    /// Anyone can record any bytes that pass the header check: no ruleset, no structure.
    function test_garbageAccepted() public {
        address p = address(0xA11CE);
        bytes memory d = _data(bytes32(0), 0, ml.seedFor(p, 0), hex"ffffffffffffff");
        vm.prank(p);
        ml.record(d);
        assertEq(ml.count(p), 1);
    }

    /// Everyone who records through one shared forwarder shares one history; any of them can use up its numbers.
    function test_sharedForwarderHistory() public {
        Forwarder f = new Forwarder();
        address alice = address(0xA11CE);
        address mallory = address(0xBAD);
        // Alice prepares her match for n = 0 under the forwarder's identity...
        bytes memory aliceMatch = _data(keccak256("r"), 0, ml.seedFor(address(f), 0), hex"0000000000000000");
        // ...Mallory, seeing it in the mempool or just racing, records first through the same forwarder.
        bytes memory mal = _data(keccak256("r"), 0, ml.seedFor(address(f), 0), hex"0100000000000000");
        vm.prank(mallory);
        f.fwd(address(ml), abi.encodeCall(MatchLog.record, (mal)));
        vm.prank(alice);
        vm.expectRevert(); // StaleN(1, 0)
        f.fwd(address(ml), abi.encodeCall(MatchLog.record, (aliceMatch)));
        assertEq(ml.count(address(f)), 1);
    }

    /// n is a u32 in the bytes but count is a uint256: at 2^32 records the wallet can never record again.
    function test_countPast2pow32Bricks() public {
        address p = address(0xA11CE);
        // count is slot 0: mapping(address => uint256)
        vm.store(address(ml), keccak256(abi.encode(p, uint256(0))), bytes32(uint256(1) << 32));
        assertEq(ml.count(p), 1 << 32);
        bytes memory d = _data(bytes32(0), type(uint32).max, ml.seedFor(p, 1 << 32), hex"00000000000000");
        vm.prank(p);
        vm.expectRevert(abi.encodeWithSelector(MatchLog.StaleN.selector, uint256(1) << 32, uint256(type(uint32).max)));
        ml.record(d);
    }

    /// Fuzz: whatever the bytes and caller, a record lands only at (msg.sender, count) and never twice.
    function testFuzz_onlyOwnNext(address caller, address other, uint32 n, bytes32 seed, bytes calldata tail) public {
        vm.assume(caller != other);
        bytes memory d = _data(bytes32(uint256(1)), n, seed, tail);
        vm.prank(caller);
        try ml.record(d) returns (uint256 got) {
            assertEq(got, 0);
            assertEq(n, 0);
            assertEq(seed, ml.seedFor(caller, 0));
            assertEq(ml.count(other), 0);
            vm.prank(caller);
            vm.expectRevert();
            ml.record(d);
        } catch {}
    }

    /// Gas for a big payload: the recorder pays, but readers/indexers get the full bytes in the event.
    function test_bigPayloadGas() public {
        address p = address(0xA11CE);
        bytes memory d = _data(bytes32(0), 0, ml.seedFor(p, 0), new bytes(100_000));
        vm.prank(p);
        uint256 g = gasleft();
        ml.record(d);
        emit log_named_uint("gas for a 100 kB record", g - gasleft());
    }
}
