// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LadderSeller} from "../src/LadderSeller.sol";

/// @notice Sepolia dry run only: buys pieces of one edition in mints of up to 10, each with a 2% margin (refunded).
/// @dev Signed by the buyer's own wallet (--ledger or --account); reads no key.
///   SELLER=0x.. ID=1 PIECES=256 forge script script/Buy.s.sol --rpc-url sepolia --account <name> --broadcast
///   PIECES defaults to all that remain. Each mint is its own transaction.
contract Buy is Script {
    function run() external {
        LadderSeller seller = LadderSeller(vm.envAddress("SELLER"));
        uint256 id = vm.envUint("ID");
        uint256 left = vm.envOr("PIECES", seller.remaining(id));
        uint256 spent;
        vm.startBroadcast();
        while (left > 0) {
            uint256 q = left > 10 ? 10 : left;
            uint256 cost = seller.quote(id, q);
            seller.mint{value: cost + cost / 50}(id, q, msg.sender);
            spent += cost;
            left -= q;
        }
        vm.stopBroadcast();
        console2.log("pieces left in edition", seller.remaining(id));
        console2.log("spent (wei, excl. gas)", spent);
    }
}
