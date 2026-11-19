// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";

/// @notice Deploys the collection (creator = the Safe) and the ladder seller bound to it.
/// @dev Nate runs this; it never reads a private key. Sign with a hardware wallet or an encrypted keystore:
///
///   CREATOR=0x<safe> CONTRACT_URI=ipfs://<cid> \
///   forge script script/Deploy.s.sol --rpc-url sepolia --ledger --sender 0x<deployer> --broadcast --verify
///   (or --account <keystore-name> instead of --ledger)
///
/// Without --broadcast it only simulates. The deployer has no role afterwards: the creator is CREATOR from the
/// first block, and the seller has no owner at all.
contract Deploy is Script {
    function run() external returns (SnowmoonEditions editions, LadderSeller seller) {
        address creator = vm.envAddress("CREATOR");
        string memory contractURI = vm.envString("CONTRACT_URI");
        require(creator.code.length > 0, "CREATOR must be a deployed contract (the Safe)");
        require(bytes(contractURI).length > 0, "CONTRACT_URI is empty");

        vm.startBroadcast();
        editions = new SnowmoonEditions(creator, contractURI);
        seller = new LadderSeller(address(editions));
        vm.stopBroadcast();

        console2.log("chain id         ", block.chainid);
        console2.log("SnowmoonEditions ", address(editions));
        console2.log("LadderSeller     ", address(seller));
        console2.log("creator (Safe)   ", editions.creator());
    }
}
