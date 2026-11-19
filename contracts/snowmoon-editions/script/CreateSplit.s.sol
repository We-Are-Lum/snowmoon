// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

/// Splits v2 types, from 0xSplits/splits-contracts-monorepo (packages/splits-v2/src/libraries/SplitV2.sol).
struct Split {
    address[] recipients;
    uint256[] allocations;
    uint256 totalAllocation;
    uint16 distributionIncentive;
}

interface ISplitFactoryV2 {
    function createSplit(Split calldata splitParams, address owner, address creator) external returns (address split);
    function predictDeterministicAddress(Split calldata splitParams, address owner, bytes32 salt) external view returns (address);
    function createSplitDeterministic(Split calldata splitParams, address owner, address creator, bytes32 salt)
        external
        returns (address split);
}

/// @notice Creates an immutable (owner = address(0)) Splits v2.2 PullSplit for one edition's payout.
/// @dev Same factory address on mainnet and Sepolia (packages/splits-v2/deployments/{1,11155111}.json).
///      Recipients and allocations come from a JSON file, allocations in parts of TOTAL (1e6 = 100%):
///        {"recipients": ["0x..", ...], "allocations": [600000, ...]}
///      Recipients must be sorted ascending (the Splits app does this too) and distinct.
///
///   SPLIT_JSON=splits/edition-1.json forge script script/CreateSplit.s.sol --rpc-url sepolia \
///     --ledger --sender 0x<you> --broadcast
contract CreateSplit is Script {
    address constant PULL_SPLIT_FACTORY_V2_2 = 0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1;
    uint256 constant TOTAL = 1e6;

    function run() external returns (address split) {
        string memory json = vm.readFile(vm.envString("SPLIT_JSON"));
        Split memory s;
        s.recipients = vm.parseJsonAddressArray(json, ".recipients");
        s.allocations = vm.parseJsonUintArray(json, ".allocations");
        s.totalAllocation = TOTAL;
        s.distributionIncentive = 0;
        check(s);
        vm.startBroadcast();
        split = ISplitFactoryV2(PULL_SPLIT_FACTORY_V2_2).createSplit(s, address(0), msg.sender);
        vm.stopBroadcast();
        console2.log("PullSplit (immutable)", split);
    }

    function check(Split memory s) public pure {
        require(s.recipients.length == s.allocations.length && s.recipients.length > 0, "recipients/allocations");
        uint256 sum;
        for (uint256 i; i < s.recipients.length; ++i) {
            require(s.recipients[i] != address(0), "zero recipient");
            if (i > 0) require(s.recipients[i] > s.recipients[i - 1], "recipients must be sorted ascending and distinct");
            sum += s.allocations[i];
        }
        require(sum == TOTAL, "allocations must add up to 1e6");
    }
}
