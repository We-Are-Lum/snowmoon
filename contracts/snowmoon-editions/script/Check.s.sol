// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";

/// @notice Read-only: checks a deployment and prints every edition's state. Sends nothing.
///   EDITIONS=0x.. SELLER=0x.. EXPECTED_CREATOR=0x<safe> forge script script/Check.s.sol --rpc-url sepolia
contract Check is Script {
    function run() external view {
        SnowmoonEditions editions = SnowmoonEditions(vm.envAddress("EDITIONS"));
        LadderSeller seller = LadderSeller(vm.envAddress("SELLER"));
        address expected = vm.envAddress("EXPECTED_CREATOR");

        require(seller.collection() == address(editions), "seller bound to another collection");
        require(editions.creator() == expected, "creator is not the expected Safe");
        require(editions.pendingCreator() == address(0), "a creator handover is pending");
        require(address(editions).balance == 0, "the collection holds ETH");
        console2.log("creator ok      ", editions.creator());
        console2.log("editions        ", editions.editionCount());
        console2.log("next allowed at ", editions.nextEditionAllowedAt(), "now", block.timestamp);

        uint256 heldTotal;
        for (uint256 id = 1; id <= editions.editionCount(); ++id) {
            SnowmoonEditions.Edition memory e = editions.edition(id);
            console2.log("--- edition", id, e.uri);
            console2.log("  seller / payout", e.seller, e.payout);
            console2.log("  size / minted  ", e.maxSupply, e.minted);
            if (e.seller != address(seller)) continue;
            LadderSeller.Ladder memory l = seller.ladder(id);
            require(l.payout == e.payout && l.maxSupply == e.maxSupply, "seller and collection disagree");
            require(l.sold == e.minted, "sold != minted");
            require(seller.priceOf(id, 1) == l.startPrice && seller.priceOf(id, l.maxSupply) == (l.maxSupply == 1 ? l.startPrice : l.topPrice), "endpoints");
            console2.log("  start / top wei", l.startPrice, l.topPrice);
            console2.log("  paid / released", l.paid, l.released);
            heldTotal += seller.held(id);
        }
        require(address(seller).balance >= heldTotal, "seller holds less than it owes");
        console2.log("seller ETH / owed", address(seller).balance, heldTotal);
        console2.log("all checks passed");
    }
}
