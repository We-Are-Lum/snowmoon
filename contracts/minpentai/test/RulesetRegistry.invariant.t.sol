// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RulesetRegistry} from "../src/RulesetRegistry.sol";

/// Drives the registry with random calls from random senders: adds (owner or not, empty or not,
/// repeated IDs, remixes of known or unknown IDs) and remembers the first successful add of each ID.
contract RegistryHandler is Test {
    RulesetRegistry public reg;
    address public owner;
    bytes32[] public ids;
    mapping(bytes32 => string) public firstURI;
    mapping(bytes32 => address) public firstAuthor;
    mapping(bytes32 => bool) public seen;
    uint256 public successes;

    constructor(RulesetRegistry r, address o) {
        reg = r;
        owner = o;
    }

    function add(uint8 idPick, uint8 uriPick, address author, uint8 remixPick, bool asOwner, address other) external {
        bytes32 id = idPick % 16 == 0 ? bytes32(0) : keccak256(abi.encode("id", idPick % 16));
        string memory uri = uriPick % 4 == 0 ? "" : string.concat("ipfs://", vm.toString(uriPick));
        bytes32 remix = remixPick % 3 == 0 ? bytes32(0) : keccak256(abi.encode("id", remixPick % 16));
        vm.prank(asOwner ? owner : other);
        try reg.add(id, uri, author, remix) {
            assertTrue(asOwner || other == owner, "a non-owner added");
            assertFalse(seen[id], "an ID was added twice");
            assertTrue(id != bytes32(0) && bytes(uri).length > 0, "a zero ID or empty URI was added");
            seen[id] = true;
            firstURI[id] = uri;
            firstAuthor[id] = author;
            ids.push(id);
            successes++;
        } catch {}
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }
}

contract RulesetRegistryInvariantTest is Test {
    RulesetRegistry reg;
    RegistryHandler h;
    address owner = address(0xA11CE);

    function setUp() public {
        vm.warp(1_760_000_000);
        reg = new RulesetRegistry(owner);
        h = new RegistryHandler(reg, owner);
        targetContract(address(h));
    }

    /// The list only ever holds each ID once, in the order first added, with its first URI and author.
    function invariant_eachIdOnceAndNeverChanged() public view {
        assertEq(reg.count(), h.successes());
        for (uint256 i; i < h.idsLength(); i++) {
            bytes32 id = h.ids(i);
            assertEq(reg.idAt(i), id);
            RulesetRegistry.Ruleset memory r = reg.get(id);
            assertEq(r.manifestURI, h.firstURI(id));
            assertEq(r.author, h.firstAuthor(id));
            assertGt(bytes(r.manifestURI).length, 0);
        }
    }

    function invariant_zeroIdNeverAdded() public view {
        assertFalse(reg.isAdded(bytes32(0)));
    }
}
