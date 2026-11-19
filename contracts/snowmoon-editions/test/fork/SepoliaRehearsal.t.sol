// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {SnowmoonEditions} from "../../src/SnowmoonEditions.sol";
import {LadderSeller} from "../../src/LadderSeller.sol";
import {EditionTx} from "../../script/EditionTx.s.sol";
import {Split, ISplitFactoryV2, CreateSplit} from "../../script/CreateSplit.s.sol";
import {EthRejecter} from "../utils/Helpers.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function nonce() external view returns (uint256);
    function getThreshold() external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
    function approveHash(bytes32 hashToApprove) external;
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);
}

interface IPullSplit {
    function distribute(Split calldata split, address token, address distributor) external;
}

interface ISplitsWarehouse {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function withdraw(address owner, address token) external;
}

/// @notice The Sepolia dry run, rehearsed on a local fork of Sepolia against the real Safe v1.4.1 and Splits v2.2
///         contracts. Nothing is sent to any network and no key is used: the Safe's owners are impersonated and
///         approve with `approveHash`, which is what signing on the Safe app amounts to.
/// @dev SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
///        forge test --match-path test/fork/SepoliaRehearsal.t.sol -vv
///      Skipped when SEPOLIA_RPC_URL is unset. MAINNET_RPC_URL works too (same addresses).
contract SepoliaRehearsalTest is Test {
    // Safe v1.4.1 (safe-global/safe-deployments, same address on mainnet and Sepolia)
    address constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address constant SAFE_FALLBACK = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;
    // Splits v2.2
    address constant PULL_SPLIT_FACTORY = 0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1;
    address constant WAREHOUSE = 0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8;
    address constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address nate = makeAddr("rehearsal-nate");
    address garance = makeAddr("rehearsal-garance");
    address luis = makeAddr("rehearsal-luis");
    address deployer = makeAddr("rehearsal-deployer");
    address buyer = makeAddr("rehearsal-buyer");

    ISafe safe;
    SnowmoonEditions editions;
    LadderSeller seller;
    EditionTx editionTx;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        editionTx = new EditionTx();
        vm.deal(buyer, 100 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _safe() internal returns (ISafe) {
        address[] memory owners = new address[](3);
        owners[0] = nate;
        owners[1] = garance;
        owners[2] = luis;
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, 2, address(0), "", SAFE_FALLBACK, address(0), 0, payable(address(0)))
        );
        return ISafe(ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(SAFE_SINGLETON, init, uint256(keccak256("snowmoon rehearsal"))));
    }

    /// Two of the three owners approve; anyone executes. Pre-approved signatures (v = 1), sorted by owner.
    function _execBySafe(address to, bytes memory data, address a, address b) internal returns (bool) {
        bytes32 h = safe.getTransactionHash(to, 0, data, 0, 0, 0, 0, address(0), address(0), safe.nonce());
        vm.prank(a);
        safe.approveHash(h);
        vm.prank(b);
        safe.approveHash(h);
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        bytes memory sigs = abi.encodePacked(bytes32(uint256(uint160(lo))), bytes32(0), uint8(1), bytes32(uint256(uint160(hi))), bytes32(0), uint8(1));
        return safe.execTransaction(to, 0, data, 0, 0, 0, 0, address(0), payable(address(0)), sigs);
    }

    function _splitParams(address[] memory r, uint256[] memory a) internal pure returns (Split memory s) {
        // sort ascending by address, as Splits expects
        for (uint256 i; i < r.length; ++i) {
            for (uint256 j = i + 1; j < r.length; ++j) {
                if (r[j] < r[i]) {
                    (r[i], r[j]) = (r[j], r[i]);
                    (a[i], a[j]) = (a[j], a[i]);
                }
            }
        }
        s.recipients = r;
        s.allocations = a;
        s.totalAllocation = 1e6;
        s.distributionIncentive = 0;
    }

    function _createEditionTx(string memory uri, uint256 size, address payout, uint256 start, uint256 top)
        internal
        view
        returns (bytes memory)
    {
        return editionTx.calldataFor(EditionTx.Params(editions, seller, uri, size, payout, start, top, 0));
    }

    // ------------------------------------------------------------------ the dry run

    function test_rehearsal() public {
        // 1. A test Safe, 2 of 3.
        safe = _safe();
        assertEq(safe.getThreshold(), 2);

        // 2. A test split: three contributors, a collab pot (10%), the Lum treasury (5%), and one recipient that
        //    rejects ETH (its share waits in the Warehouse instead of blocking the others).
        address[] memory r = new address[](6);
        uint256[] memory a = new uint256[](6);
        r[0] = makeAddr("rehearsal-contributor-1"); a[0] = 400_000;
        r[1] = makeAddr("rehearsal-contributor-2"); a[1] = 250_000;
        r[2] = makeAddr("rehearsal-contributor-3"); a[2] = 100_000;
        r[3] = makeAddr("rehearsal-collab-pot"); a[3] = 100_000;
        r[4] = makeAddr("rehearsal-lum-treasury"); a[4] = 50_000;
        r[5] = address(new EthRejecter()); a[5] = 100_000;
        Split memory split = _splitParams(r, a);
        new CreateSplit().check(split);
        vm.prank(deployer);
        address payout = ISplitFactoryV2(PULL_SPLIT_FACTORY).createSplit(split, address(0), deployer);
        assertGt(payout.code.length, 0);

        // 3. Deploy both contracts (as script/Deploy.s.sol does).
        vm.startPrank(deployer);
        editions = new SnowmoonEditions(address(safe), "ipfs://rehearsal-collection");
        seller = new LadderSeller(address(editions));
        vm.stopPrank();
        assertEq(editions.creator(), address(safe));

        // 4. Two editions through the Safe: one of 256 on the first ladder, one of 5.
        uint256 t0 = block.timestamp;
        assertTrue(_execBySafe(address(editions), _createEditionTx("ipfs://rehearsal-1", 256, payout, 0.0005 ether, 0.5 ether), nate, garance));
        assertTrue(_execBySafe(address(editions), _createEditionTx("ipfs://rehearsal-2", 5, payout, 0.001 ether, 0.004 ether), garance, luis));
        assertEq(editions.editionCount(), 2);
        // one signer alone can't
        bytes memory third = _createEditionTx("ipfs://rehearsal-3", 10, payout, 0.001 ether, 0.01 ether);
        vm.prank(nate);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.createEdition("ipfs://rehearsal-3", 10, address(seller), payout, abi.encode(0.001 ether, 0.01 ether, uint256(0)));

        // 5. Mint across the whole ladder of edition 1, with a margin each time, and all of edition 2.
        uint256 spent;
        uint256 expected;
        for (uint256 n = 1; n <= 256; ++n) expected += seller.priceOf(1, n);
        while (seller.remaining(1) > 0) {
            uint256 q = seller.remaining(1) >= 7 ? 7 : seller.remaining(1);
            uint256 cost = seller.quote(1, q);
            uint256 before = buyer.balance;
            vm.prank(buyer);
            seller.mint{value: cost + 0.01 ether}(1, q, buyer);
            spent += before - buyer.balance;
        }
        assertEq(spent, expected, "the buyer paid exactly the ladder");
        assertEq(editions.balanceOf(buyer, 1), 256);
        uint256 cost2 = seller.quote(2, 5);
        vm.prank(buyer);
        seller.mint{value: cost2}(2, 5, buyer);
        console2.log("edition 1 (256 pieces) raised, wei:", expected);
        console2.log("edition 2 (5 pieces) raised, wei:  ", cost2);

        // 6. Release both to the split, distribute, and withdraw from the Warehouse.
        seller.release(1);
        seller.release(2);
        uint256 raised = expected + cost2;
        assertEq(payout.balance, raised);
        assertEq(address(seller).balance, 0);
        IPullSplit(payout).distribute(split, NATIVE, address(this));
        for (uint256 i; i < split.recipients.length; ++i) {
            address who = split.recipients[i];
            uint256 share = raised * split.allocations[i] / 1e6;
            uint256 inWarehouse = ISplitsWarehouse(WAREHOUSE).balanceOf(who, uint256(uint160(NATIVE)));
            assertApproxEqAbs(inWarehouse, share, 2, "share credited in the Warehouse");
            if (who.code.length == 0) {
                ISplitsWarehouse(WAREHOUSE).withdraw(who, NATIVE);
                // Warehouse leaves 1 wei behind on withdraw (gas saving)
                assertApproxEqAbs(who.balance, share, 2, "withdrawn to the recipient");
            }
        }

        // 7. A third edition within 30 days reverts (the Safe transaction fails), and works at 30 days.
        vm.warp(t0 + 30 days - 1);
        vm.expectRevert(bytes("GS013"));
        this.execExternal(address(editions), third, nate, luis);
        vm.warp(t0 + 30 days);
        assertTrue(_execBySafe(address(editions), third, nate, luis));
        assertEq(editions.editionCount(), 3);
    }

    function execExternal(address to, bytes memory data, address a, address b) external returns (bool) {
        return _execBySafe(to, data, a, b);
    }
}
