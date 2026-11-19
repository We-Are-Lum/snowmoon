// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Base} from "./utils/Helpers.sol";

/// @dev Gas for the calls people make, each as its own transaction would see it (cold storage).
///      forge test --match-contract GasTest --gas-report --isolate
contract GasTest is Base {
    function _g(string memory) internal pure {}

    function test_gas() public {
        bytes memory data = _data(START, TOP, 0);
        string memory cid = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
        vm.prank(creator);
        editions.createEdition(cid, 256, address(seller), payoutA, data);
        _g("createEdition (256, first ladder, 59-char CID)");

        vm.prank(creator);
        editions.createEdition(cid, 5, address(seller), payoutB, data);
        _g("createEdition (second edition)");

        uint256 c = seller.quote(1, 1);
        vm.prank(buyer);
        seller.mint{value: c}(1, 1, buyer);
        _g("mint 1 piece, exact payment, first buyer (cold balance slot)");

        c = seller.quote(1, 1);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        seller.mint{value: c + 0.001 ether}(1, 1, stranger);
        _g("mint 1 piece, with refund, new holder");

        c = seller.quote(1, 1);
        vm.prank(buyer);
        seller.mint{value: c}(1, 1, buyer);
        _g("mint 1 piece, holder already has one");

        c = seller.quote(1, 10);
        vm.prank(buyer);
        seller.mint{value: c + 0.01 ether}(1, 10, buyer);
        _g("mint 10 pieces, with refund");

        seller.release(1);
        _g("release (to an EOA; a PullSplit receive costs ~similar)");

        seller.quote(1, 10);
        _g("quote 10 (view, eth_call)");
        seller.nextPrice(1);
        _g("nextPrice (view, eth_call)");
    }
}
