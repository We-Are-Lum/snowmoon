// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RulesetRegistry} from "../src/RulesetRegistry.sol";

contract RulesetRegistryTest is Test {
    RulesetRegistry reg;
    address owner = address(0xA11CE);
    bytes32 constant SOLO_V1 = 0xc5ffb7374eea13c248ce7de07d2d1233937bacb848b95be9975edb41c922234d;

    event RulesetAdded(bytes32 indexed id, bytes32 indexed remixedFrom, address indexed author, string manifestURI);

    function setUp() public {
        vm.warp(1_760_000_000);
        reg = new RulesetRegistry(owner);
    }

    function test_ownerAddsAndEmits() public {
        vm.expectEmit(true, true, true, true, address(reg));
        emit RulesetAdded(SOLO_V1, bytes32(0), owner, "ipfs://solo-v1");
        vm.prank(owner);
        reg.add(SOLO_V1, "ipfs://solo-v1", owner, bytes32(0));
        RulesetRegistry.Ruleset memory r = reg.get(SOLO_V1);
        assertEq(r.manifestURI, "ipfs://solo-v1");
        assertEq(r.author, owner);
        assertEq(r.remixedFrom, bytes32(0));
        assertEq(r.addedAt, 1_760_000_000);
        assertEq(reg.count(), 1);
        assertEq(reg.idAt(0), SOLO_V1);
        assertTrue(reg.isAdded(SOLO_V1));
    }

    function testFuzz_onlyOwnerAdds(address who, bytes32 id) public {
        vm.assume(who != owner && id != bytes32(0));
        vm.prank(who);
        vm.expectRevert(RulesetRegistry.NotOwner.selector);
        reg.add(id, "u", who, bytes32(0));
    }

    /// Once added, a ruleset can never change: adding the same ID again reverts, whatever the arguments.
    function testFuzz_cannotOverwrite(bytes32 id, string calldata uri2, address author2, bool remix) public {
        vm.assume(id != bytes32(0) && bytes(uri2).length > 0);
        vm.startPrank(owner);
        reg.add(id, "first", owner, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(RulesetRegistry.AlreadyAdded.selector, id));
        reg.add(id, uri2, author2, remix ? id : bytes32(0));
        vm.stopPrank();
        RulesetRegistry.Ruleset memory r = reg.get(id);
        assertEq(r.manifestURI, "first");
        assertEq(r.author, owner);
        assertEq(reg.count(), 1);
    }

    function test_remixMustExist() public {
        bytes32 child = keccak256("child");
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(RulesetRegistry.UnknownRuleset.selector, SOLO_V1));
        reg.add(child, "u", owner, SOLO_V1);
        reg.add(SOLO_V1, "u", owner, bytes32(0));
        reg.add(child, "u2", address(0xB0B), SOLO_V1);
        vm.stopPrank();
        assertEq(reg.get(child).remixedFrom, SOLO_V1);
    }

    function test_refusesZeroIdAndEmptyURI() public {
        vm.startPrank(owner);
        vm.expectRevert(RulesetRegistry.ZeroId.selector);
        reg.add(bytes32(0), "u", owner, bytes32(0));
        vm.expectRevert(RulesetRegistry.EmptyURI.selector);
        reg.add(SOLO_V1, "", owner, bytes32(0));
        vm.stopPrank();
    }

    function test_unknownRulesetReverts() public {
        vm.expectRevert(abi.encodeWithSelector(RulesetRegistry.UnknownRuleset.selector, SOLO_V1));
        reg.get(SOLO_V1);
    }
}
