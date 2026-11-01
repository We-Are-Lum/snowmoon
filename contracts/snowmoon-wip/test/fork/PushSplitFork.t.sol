// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SnowmoonWIP} from "../../src/SnowmoonWIP.sol";
import {EthRejecter} from "../utils/Helpers.sol";

/// @dev Minimal Splits v2 interfaces, copied from 0xSplits/splits-contracts-monorepo (tag splits-v2.2,
///      packages/splits-v2/src/libraries/SplitV2.sol, splitters/SplitFactoryV2.sol, splitters/push/PushSplit.sol).
struct Split {
    address[] recipients;
    uint256[] allocations;
    uint256 totalAllocation;
    uint16 distributionIncentive;
}

interface ISplitFactoryV2 {
    function createSplit(Split calldata splitParams, address owner, address creator) external returns (address split);
}

interface IPushSplit {
    function distribute(Split calldata split, address token, address distributor) external;
    function owner() external view returns (address);
    function splitHash() external view returns (bytes32);
}

interface ISplitsWarehouse {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

/// @notice Mainnet-fork test: SnowmoonWIP pays a Splits v2 PushSplit that has a recipient rejecting ETH.
/// @dev Read-only fork; nothing is sent to any network. Run with:
///      MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test --match-path test/fork/PushSplitFork.t.sol -vv
///      Skipped when MAINNET_RPC_URL is unset. The same addresses exist on Sepolia (11155111).
contract PushSplitForkTest is Test {
    // packages/splits-v2/deployments/1.json on the monorepo's main branch.
    address constant PUSH_SPLIT_FACTORY_V2_2 = 0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4;
    address constant PUSH_SPLIT_FACTORY_V2_1 = 0xDc6259E13ec0621e6F19026b2e49D846525548Ed;
    address constant SPLITS_WAREHOUSE = 0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant NATIVE_TOKEN_ID = uint256(uint160(NATIVE_TOKEN));
    uint256 constant PRICE = 0.002 ether;

    SnowmoonWIP wip;
    address owner = makeAddr("owner");
    address buyer = makeAddr("buyer");
    // Fresh labels: common ones like makeAddr("alice") can hold real mainnet ETH on a fork.
    address keeper = makeAddr("snowmoon-wip-fork-keeper");
    address alice = makeAddr("snowmoon-wip-fork-alice");
    address bob = makeAddr("snowmoon-wip-fork-bob");
    address lake = makeAddr("snowmoon-wip-fork-lake");
    EthRejecter rejecter;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        wip = new SnowmoonWIP(owner, "Snowmoon WIP", "SMWIP", "ipfs://collection");
        rejecter = new EthRejecter();
        vm.deal(buyer, 10 ether);
        // Start every recipient from zero so the assertions read as amounts received.
        vm.deal(keeper, 0);
        vm.deal(alice, 0);
        vm.deal(bob, 0);
        vm.deal(lake, 0);
    }

    function _split() internal view returns (Split memory s) {
        s.recipients = new address[](4);
        s.allocations = new uint256[](4);
        // Shares out of 1e6 (Splits' PERCENTAGE_SCALE): 40%, 30%, 20%, 10%.
        s.recipients[0] = alice;
        s.allocations[0] = 400_000;
        s.recipients[1] = bob;
        s.allocations[1] = 300_000;
        s.recipients[2] = address(rejecter);
        s.allocations[2] = 200_000;
        s.recipients[3] = lake;
        s.allocations[3] = 100_000;
        s.totalAllocation = 1_000_000;
        s.distributionIncentive = 0;
    }

    function test_PushSplit_v2_2() public {
        _run(PUSH_SPLIT_FACTORY_V2_2);
    }

    function test_PushSplit_v2_1() public {
        _run(PUSH_SPLIT_FACTORY_V2_1);
    }

    function _run(address factory) internal {
        Split memory s = _split();
        // Immutable split: owner address(0), so nobody can update or pause it.
        address split = ISplitFactoryV2(factory).createSplit(s, address(0), owner);
        assertEq(IPushSplit(split).owner(), address(0), "split has no owner");
        assertGt(split.code.length, 0);

        vm.prank(owner);
        uint256 id = wip.createToken(
            "ipfs://token", PRICE, uint64(block.timestamp), uint64(block.timestamp + 11 days), payable(split)
        );

        // The test deployer's CREATE addresses already hold ETH on mainnet, so the fresh contract can start
        // with a balance it never received through mint: a live example of forced ETH, never paid out.
        uint256 preexisting = address(wip).balance;
        vm.prank(buyer);
        wip.mint{value: PRICE * 50}(id, 50, buyer);
        uint256 total = PRICE * 50;

        // Anyone releases to the split; the split accepts ETH.
        vm.prank(keeper);
        wip.release(id);
        assertEq(split.balance, total);
        assertEq(address(wip).balance, preexisting, "only recorded proceeds leave");

        uint256 rejecterEthBefore = address(rejecter).balance;
        uint256 warehouseBefore = ISplitsWarehouse(SPLITS_WAREHOUSE).balanceOf(address(rejecter), NATIVE_TOKEN_ID);

        // Anyone distributes; incentive 0 so the keeper gets nothing.
        vm.prank(keeper);
        IPushSplit(split).distribute(s, NATIVE_TOKEN, keeper);

        // PushSplit keeps 1 wei in the split (gas-saving dust), so it distributes total - 1, each share
        // rounded down; the rounding remainder (a few wei) also stays in the split for the next distribution.
        uint256 distributed = total - 1;
        assertEq(alice.balance, distributed * 400_000 / 1_000_000, "alice paid");
        assertEq(bob.balance, distributed * 300_000 / 1_000_000, "bob paid");
        assertEq(lake.balance, distributed * 100_000 / 1_000_000, "lake paid");
        assertEq(keeper.balance, 0, "no distributor fee");

        // The rejecting recipient's share is held for it in SplitsWarehouse as an ERC-6909 balance.
        assertEq(address(rejecter).balance, rejecterEthBefore, "rejecter received no ETH");
        uint256 held =
            ISplitsWarehouse(SPLITS_WAREHOUSE).balanceOf(address(rejecter), NATIVE_TOKEN_ID) - warehouseBefore;
        assertEq(held, distributed * 200_000 / 1_000_000, "rejecter's share held in warehouse");
        assertEq(alice.balance + bob.balance + lake.balance + held + split.balance, total, "nothing lost");
        assertLe(split.balance, 1 + s.recipients.length, "only dust stays in the split");

        emit log_named_address("split", split);
        emit log_named_uint("released (wei)", total);
        emit log_named_uint("pre-existing ETH left in contract", preexisting);
        emit log_named_uint("alice", alice.balance);
        emit log_named_uint("bob", bob.balance);
        emit log_named_uint("lake", lake.balance);
        emit log_named_uint("rejecter held in warehouse", held);
        emit log_named_uint("dust left in split (wei)", split.balance);
    }
}
