// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test, stdError} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SnowmoonWIP} from "../src/SnowmoonWIP.sol";
import {EthRejecter, ForceSender, ReentrantReceiver, ReentrantPayout} from "./utils/Helpers.sol";

contract SnowmoonWIPTest is Test {
    SnowmoonWIP wip;

    address owner = makeAddr("owner");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");
    address payable payoutA = payable(makeAddr("payoutA"));
    address payable payoutB = payable(makeAddr("payoutB"));

    // Fixture dates only (2026-12-07 and 2026-12-18, 17:00 UTC). Real dates are creation-time parameters.
    uint64 constant START = 1_796_662_800;
    uint64 constant END = 1_797_613_200;
    uint256 constant PRICE = 0.002 ether;
    string constant URI_A = "ipfs://bafyA";
    string constant URI_B = "ipfs://bafyB";

    function setUp() public {
        vm.warp(START - 1 days);
        wip = new SnowmoonWIP(owner, "Snowmoon WIP", "SNOWMOONWIP", "ipfs://bafyCollection");
        vm.deal(buyer, 1_000 ether);
        vm.deal(stranger, 1 ether);
    }

    function _create(string memory u, uint256 price, address payable payout) internal returns (uint256) {
        vm.prank(owner);
        return wip.createToken(u, price, START, END, payout);
    }

    function _mint(uint256 id, uint256 q) internal {
        vm.prank(buyer);
        wip.mint{value: PRICE * q}(id, q, buyer);
    }

    // ---------------------------------------------------------------- deploy

    function test_Deploy() public view {
        assertEq(wip.owner(), owner);
        assertEq(wip.name(), "Snowmoon WIP");
        assertEq(wip.symbol(), "SNOWMOONWIP");
        assertEq(wip.contractURI(), "ipfs://bafyCollection");
        assertEq(wip.tokenCount(), 0);
    }

    function test_Deploy_RevertsOnEmptyContractURI() public {
        vm.expectRevert(SnowmoonWIP.EmptyURI.selector);
        new SnowmoonWIP(owner, "n", "s", "");
    }

    function test_Deploy_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new SnowmoonWIP(address(0), "n", "s", "ipfs://c");
    }

    // ---------------------------------------------------------------- creation

    function test_Create_StoresTermsAndEmits() public {
        vm.expectEmit(address(wip));
        emit SnowmoonWIP.TokenCreated(1, URI_A, PRICE, START, END, payoutA);
        uint256 id = _create(URI_A, PRICE, payoutA);
        assertEq(id, 1);
        SnowmoonWIP.Token memory t = wip.token(id);
        assertEq(t.uri, URI_A);
        assertEq(t.price, PRICE);
        assertEq(t.start, START);
        assertEq(t.end, END);
        assertEq(t.payout, payoutA);
        assertEq(wip.uri(id), URI_A);
        assertEq(_create(URI_B, PRICE, payoutB), 2);
    }

    function test_Create_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        wip.createToken(URI_A, PRICE, START, END, payoutA);
    }

    function test_Create_Validation() public {
        vm.startPrank(owner);
        vm.expectRevert(SnowmoonWIP.EmptyURI.selector);
        wip.createToken("", PRICE, START, END, payoutA);
        vm.expectRevert(SnowmoonWIP.ZeroPrice.selector);
        wip.createToken(URI_A, 0, START, END, payoutA);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.InvalidWindow.selector, END, START));
        wip.createToken(URI_A, PRICE, END, START, payoutA);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.InvalidWindow.selector, START, START));
        wip.createToken(URI_A, PRICE, START, START, payoutA);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.InvalidPayout.selector, address(0)));
        wip.createToken(URI_A, PRICE, START, END, payable(address(0)));
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.InvalidPayout.selector, address(wip)));
        wip.createToken(URI_A, PRICE, START, END, payable(address(wip)));
        // A window that has already ended.
        vm.warp(END);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.InvalidWindow.selector, START, END));
        wip.createToken(URI_A, PRICE, START, END, payoutA);
        vm.stopPrank();
        assertEq(wip.tokenCount(), 0);
    }

    function test_Create_StartInPastIsAllowed() public {
        vm.warp(START + 1);
        uint256 id = _create(URI_A, PRICE, payoutA);
        assertTrue(wip.isOpen(id));
    }

    function test_NonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.TokenDoesNotExist.selector, 0));
        wip.uri(0);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.TokenDoesNotExist.selector, 1));
        wip.token(1);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.TokenDoesNotExist.selector, 1));
        wip.release(1);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.TokenDoesNotExist.selector, 1));
        wip.mint{value: PRICE}(1, 1, buyer);
        assertFalse(wip.isOpen(0));
        assertFalse(wip.isOpen(1));
    }

    // ---------------------------------------------------------------- window

    function test_Window_BeforeStart() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START - 1);
        assertFalse(wip.isOpen(id));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.MintNotOpen.selector, id, START, END));
        wip.mint{value: PRICE}(id, 1, buyer);
    }

    function test_Window_AtStartIsOpen() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        assertTrue(wip.isOpen(id));
        _mint(id, 1);
        assertEq(wip.balanceOf(buyer, id), 1);
    }

    function test_Window_LastSecondIsOpen() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(END - 1);
        _mint(id, 1);
        assertEq(wip.balanceOf(buyer, id), 1);
    }

    function test_Window_AtEndIsClosed() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(END);
        assertFalse(wip.isOpen(id));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.MintNotOpen.selector, id, START, END));
        wip.mint{value: PRICE}(id, 1, buyer);
    }

    function test_Window_AfterEnd() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(END + 30 days);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.MintNotOpen.selector, id, START, END));
        wip.mint{value: PRICE}(id, 1, buyer);
    }

    // ---------------------------------------------------------------- price and quantity

    function test_Price_Exact() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.expectEmit(address(wip));
        emit SnowmoonWIP.Minted(id, buyer, buyer, 3, PRICE * 3);
        _mint(id, 3);
        assertEq(wip.balanceOf(buyer, id), 3);
        assertEq(wip.proceeds(id), PRICE * 3);
        assertEq(wip.totalProceeds(), PRICE * 3);
        assertEq(address(wip).balance, PRICE * 3);
    }

    function test_Price_Under() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.WrongPayment.selector, PRICE * 2, PRICE * 2 - 1));
        wip.mint{value: PRICE * 2 - 1}(id, 2, buyer);
    }

    function test_Price_Over() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.WrongPayment.selector, PRICE, PRICE + 1));
        wip.mint{value: PRICE + 1}(id, 1, buyer);
    }

    function test_Price_NoValue() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.WrongPayment.selector, PRICE, 0));
        wip.mint(id, 1, buyer);
    }

    function test_Quantity_Zero() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(SnowmoonWIP.ZeroQuantity.selector);
        wip.mint{value: 0}(id, 0, buyer);
    }

    function test_Quantity_Overflow() public {
        uint256 id = _create(URI_A, type(uint256).max / 2 + 1, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(stdError.arithmeticError);
        wip.mint{value: 1 ether}(id, 2, buyer);
        // Max quantity at a price of 1 wei overflows nothing and needs the full value.
        uint256 id2 = _create(URI_B, 1, payoutB);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.WrongPayment.selector, type(uint256).max, 1 ether));
        wip.mint{value: 1 ether}(id2, type(uint256).max, buyer);
    }

    function test_Quantity_Large() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        _mint(id, 10_000);
        assertEq(wip.balanceOf(buyer, id), 10_000);
        assertEq(wip.proceeds(id), PRICE * 10_000);
    }

    function test_Mint_ToAnotherAddress() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        wip.mint{value: PRICE}(id, 1, stranger);
        assertEq(wip.balanceOf(stranger, id), 1);
        assertEq(wip.balanceOf(buyer, id), 0);
    }

    function test_Mint_ToZeroReverts() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(0)));
        wip.mint{value: PRICE}(id, 1, address(0));
    }

    function test_Mint_ToContractWithoutReceiverReverts() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        EthRejecter noReceiver = new EthRejecter();
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(noReceiver)));
        wip.mint{value: PRICE}(id, 1, address(noReceiver));
        assertEq(wip.proceeds(id), 0);
    }

    // ---------------------------------------------------------------- release

    function test_Release_ToPayoutOnly_Permissionless() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        _mint(id, 5);
        uint256 strangerBefore = stranger.balance;

        vm.expectEmit(address(wip));
        emit SnowmoonWIP.Released(id, payoutA, stranger, PRICE * 5);
        vm.prank(stranger);
        wip.release(id);

        assertEq(payoutA.balance, PRICE * 5);
        assertEq(stranger.balance, strangerBefore);
        assertEq(owner.balance, 0);
        assertEq(wip.proceeds(id), 0);
        assertEq(wip.totalProceeds(), 0);
        assertEq(address(wip).balance, 0);
    }

    function test_Release_DuringAndAfterWindow() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        _mint(id, 1);
        wip.release(id);
        _mint(id, 2);
        vm.warp(END + 1);
        wip.release(id);
        assertEq(payoutA.balance, PRICE * 3);
    }

    function test_Release_Twice() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        _mint(id, 2);
        wip.release(id);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.NothingToRelease.selector, id));
        wip.release(id);
        assertEq(payoutA.balance, PRICE * 2);
    }

    function test_Release_ZeroBalance() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.NothingToRelease.selector, id));
        wip.release(id);
    }

    function test_Release_PayoutRejectsEth_FundsStay() public {
        EthRejecter rejecter = new EthRejecter();
        uint256 id = _create(URI_A, PRICE, payable(address(rejecter)));
        vm.warp(START);
        _mint(id, 4);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.ReleaseFailed.selector, id, address(rejecter)));
        wip.release(id);
        assertEq(wip.proceeds(id), PRICE * 4);
        assertEq(wip.totalProceeds(), PRICE * 4);
        assertEq(address(wip).balance, PRICE * 4);
        // Mints still work; the proceeds keep building up for a later release.
        _mint(id, 1);
        assertEq(wip.proceeds(id), PRICE * 5);
    }

    function test_Release_PayoutRejectsEth_OtherTokensUnaffected() public {
        EthRejecter rejecter = new EthRejecter();
        uint256 bad = _create(URI_A, PRICE, payable(address(rejecter)));
        uint256 good = _create(URI_B, PRICE, payoutB);
        vm.warp(START);
        _mint(bad, 1);
        _mint(good, 2);
        vm.expectRevert();
        wip.release(bad);
        wip.release(good);
        assertEq(payoutB.balance, PRICE * 2);
        assertEq(wip.proceeds(bad), PRICE);
    }

    function test_MultipleTokens_BalancesSeparate() public {
        uint256 a = _create(URI_A, PRICE, payoutA);
        vm.prank(owner);
        uint256 b = wip.createToken(URI_B, 3 * PRICE, START, END, payoutB);
        vm.warp(START);
        _mint(a, 2);
        vm.prank(buyer);
        wip.mint{value: 3 * PRICE * 7}(b, 7, buyer);
        assertEq(wip.proceeds(a), PRICE * 2);
        assertEq(wip.proceeds(b), PRICE * 21);
        wip.release(a);
        assertEq(payoutA.balance, PRICE * 2);
        assertEq(payoutB.balance, 0);
        assertEq(wip.proceeds(b), PRICE * 21);
        wip.release(b);
        assertEq(payoutB.balance, PRICE * 21);
        assertEq(address(wip).balance, 0);
    }

    // ---------------------------------------------------------------- reentrancy

    function test_Reentrancy_ReceiverReentersMintAndRelease_Caught() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        ReentrantReceiver r = new ReentrantReceiver(wip, true);
        vm.deal(address(r), 1 ether);
        vm.warp(START);

        vm.prank(buyer);
        r.buy{value: PRICE * 2}(id, 2);

        // Both re-entries were refused by the guard; the outer mint finished.
        assertEq(r.reentryAttempts(), 1);
        assertEq(r.reentrySuccesses(), 0);
        bytes memory guardErr = abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        assertEq(r.lastMintError(), guardErr);
        assertEq(r.lastReleaseError(), guardErr);

        // Accounting: exactly the outer payment, recorded once, still in the contract.
        assertEq(wip.balanceOf(address(r), id), 2);
        assertEq(wip.proceeds(id), PRICE * 2);
        assertEq(wip.totalProceeds(), PRICE * 2);
        assertEq(address(wip).balance, PRICE * 2);
        assertEq(address(r).balance, 1 ether);
        assertEq(payoutA.balance, 0);

        wip.release(id);
        assertEq(payoutA.balance, PRICE * 2);
    }

    function test_Reentrancy_ReceiverReentersMint_Uncaught_RevertsWhole() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        ReentrantReceiver r = new ReentrantReceiver(wip, false);
        vm.deal(address(r), 1 ether);
        vm.warp(START);
        vm.prank(buyer);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        r.buy{value: PRICE}(id, 1);
        assertEq(wip.proceeds(id), 0);
        assertEq(address(wip).balance, 0);
        assertEq(wip.balanceOf(address(r), id), 0);
    }

    function test_Reentrancy_PayoutReentersRelease() public {
        ReentrantPayout p = new ReentrantPayout();
        uint256 id = _create(URI_A, PRICE, payable(address(p)));
        p.arm(wip, id);
        vm.warp(START);
        _mint(id, 3);
        wip.release(id);
        assertEq(p.received(), PRICE * 3);
        assertEq(p.lastError(), abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector));
        assertEq(wip.proceeds(id), 0);
        assertEq(address(wip).balance, 0);
    }

    // ---------------------------------------------------------------- stray and forced ETH

    function test_PlainEthTransferRejected() public {
        vm.prank(stranger);
        (bool ok,) = address(wip).call{value: 1 wei}("");
        assertFalse(ok);
        vm.prank(stranger);
        (ok,) = address(wip).call{value: 1 wei}(hex"deadbeef");
        assertFalse(ok);
    }

    function test_ForcedEth_NotWithdrawable_AccountingIntact() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        vm.warp(START);
        _mint(id, 2);

        new ForceSender{value: 5 ether}(payable(address(wip)));
        assertEq(address(wip).balance, PRICE * 2 + 5 ether);
        assertEq(wip.totalProceeds(), PRICE * 2);

        wip.release(id);
        assertEq(payoutA.balance, PRICE * 2);
        assertEq(address(wip).balance, 5 ether);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.NothingToRelease.selector, id));
        wip.release(id);

        // Further mints and releases still pay exactly what was recorded.
        _mint(id, 1);
        wip.release(id);
        assertEq(payoutA.balance, PRICE * 3);
        assertEq(address(wip).balance, 5 ether);
    }

    // ---------------------------------------------------------------- immutability

    /// @dev The full public interface. Any new function (a setter, a withdraw) fails this test.
    function test_Abi_NoFunctionChangesTerms() public view {
        string memory json = vm.readFile("out/SnowmoonWIP.sol/SnowmoonWIP.json");
        string[] memory sigs = vm.parseJsonKeys(json, ".methodIdentifiers");
        string[24] memory expected = [
            // Sale and views
            "createToken(string,uint256,uint64,uint64,address)",
            "mint(uint256,uint256,address)",
            "release(uint256)",
            "uri(uint256)",
            "token(uint256)",
            "isOpen(uint256)",
            "proceeds(uint256)",
            "totalProceeds()",
            "tokenCount()",
            "contractURI()",
            "name()",
            "symbol()",
            // ERC-1155 (OpenZeppelin)
            "balanceOf(address,uint256)",
            "balanceOfBatch(address[],uint256[])",
            "isApprovedForAll(address,address)",
            "setApprovalForAll(address,bool)",
            "safeTransferFrom(address,address,uint256,uint256,bytes)",
            "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
            "supportsInterface(bytes4)",
            // Ownable2Step (OpenZeppelin)
            "owner()",
            "pendingOwner()",
            "transferOwnership(address)",
            "acceptOwnership()",
            "renounceOwnership()"
        ];
        assertEq(sigs.length, expected.length, "unexpected number of functions");
        for (uint256 i; i < expected.length; ++i) {
            bool found;
            for (uint256 j; j < sigs.length; ++j) {
                if (keccak256(bytes(sigs[j])) == keccak256(bytes(expected[i]))) found = true;
            }
            assertTrue(found, expected[i]);
        }
    }

    /// @dev Every state-changing function, called by the owner and by others, leaves the terms as they were.
    function test_TermsUnchangedByEveryFunction() public {
        uint256 id = _create(URI_A, PRICE, payoutA);
        bytes32 before = keccak256(abi.encode(wip.token(id)));
        vm.warp(START);
        _mint(id, 2);
        vm.prank(buyer);
        wip.safeTransferFrom(buyer, stranger, id, 1, "");
        vm.prank(buyer);
        wip.setApprovalForAll(stranger, true);
        uint256[] memory ids = new uint256[](1);
        uint256[] memory qs = new uint256[](1);
        ids[0] = id;
        qs[0] = 1;
        vm.prank(stranger);
        wip.safeBatchTransferFrom(buyer, stranger, ids, qs, "");
        _create(URI_B, PRICE * 2, payoutB);
        wip.release(id);
        vm.prank(owner);
        wip.transferOwnership(stranger);
        vm.prank(stranger);
        wip.acceptOwnership();
        vm.prank(stranger);
        wip.renounceOwnership();
        assertEq(keccak256(abi.encode(wip.token(id))), before);
        assertEq(wip.uri(id), URI_A);
        // After renouncing, nobody can create tokens; existing tokens keep selling and releasing.
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        wip.createToken(URI_A, PRICE, START, END, payoutA);
        _mint(id, 1);
        wip.release(id);
        assertEq(payoutA.balance, PRICE * 3);
    }

    function test_Ownership_TwoStep() public {
        vm.prank(owner);
        wip.transferOwnership(stranger);
        assertEq(wip.owner(), owner);
        assertEq(wip.pendingOwner(), stranger);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        wip.acceptOwnership();
        vm.prank(stranger);
        wip.acceptOwnership();
        assertEq(wip.owner(), stranger);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(wip.supportsInterface(0xd9b67a26)); // ERC-1155
        assertTrue(wip.supportsInterface(0x0e89341c)); // ERC-1155 metadata URI
        assertTrue(wip.supportsInterface(0x01ffc9a7)); // ERC-165
    }

    // ---------------------------------------------------------------- fuzz

    /// @dev Random mints over three tokens, forced ETH and releases: the books always balance.
    function testFuzz_Accounting(uint8[3] memory quantities, uint96 forced, uint8 releaseMask, uint256[3] memory prices)
        public
    {
        address payable[3] memory payouts = [payoutA, payoutB, payable(makeAddr("payoutC"))];
        uint256[3] memory ids;
        for (uint256 i; i < 3; ++i) {
            prices[i] = bound(prices[i], 1, 10 ether);
            vm.prank(owner);
            ids[i] = wip.createToken(URI_A, prices[i], START, END, payouts[i]);
        }
        vm.warp(START);
        uint256 expectedTotal;
        for (uint256 i; i < 3; ++i) {
            uint256 q = bound(quantities[i], 0, 50);
            if (q == 0) continue;
            vm.prank(buyer);
            wip.mint{value: prices[i] * q}(ids[i], q, buyer);
            expectedTotal += prices[i] * q;
            assertEq(wip.proceeds(ids[i]), prices[i] * q);
        }
        if (forced > 0) {
            vm.deal(address(this), forced);
            new ForceSender{value: forced}(payable(address(wip)));
        }
        assertEq(wip.totalProceeds(), expectedTotal);
        assertEq(address(wip).balance, expectedTotal + forced);

        for (uint256 i; i < 3; ++i) {
            if (releaseMask & (1 << i) == 0 || wip.proceeds(ids[i]) == 0) continue;
            uint256 amount = wip.proceeds(ids[i]);
            wip.release(ids[i]);
            assertEq(payouts[i].balance, amount);
            expectedTotal -= amount;
        }
        uint256 sum = wip.proceeds(ids[0]) + wip.proceeds(ids[1]) + wip.proceeds(ids[2]);
        assertEq(sum, wip.totalProceeds());
        assertEq(sum, expectedTotal);
        assertEq(address(wip).balance - forced, sum);
    }

    function testFuzz_PaymentMustBeExact(uint256 price, uint256 quantity, uint256 sent) public {
        price = bound(price, 1, 1e24);
        quantity = bound(quantity, 1, 1e6);
        sent = bound(sent, 0, 1e31);
        uint256 cost = price * quantity;
        vm.prank(owner);
        uint256 id = wip.createToken(URI_A, price, START, END, payoutA);
        vm.warp(START);
        vm.deal(buyer, sent);
        vm.prank(buyer);
        if (sent != cost) vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.WrongPayment.selector, cost, sent));
        wip.mint{value: sent}(id, quantity, buyer);
        assertEq(wip.proceeds(id), sent == cost ? cost : 0);
    }

    function testFuzz_Window(uint64 start, uint64 end, uint64 at) public {
        vm.warp(1_000);
        start = uint64(bound(start, 0, type(uint64).max - 2));
        end = uint64(bound(end, start + 1 > 1_001 ? start + 1 : 1_001, type(uint64).max - 1));
        vm.prank(owner);
        uint256 id = wip.createToken(URI_A, PRICE, start, end, payoutA);
        vm.warp(at);
        bool open = at >= start && at < end;
        assertEq(wip.isOpen(id), open);
        vm.prank(buyer);
        if (!open) vm.expectRevert(abi.encodeWithSelector(SnowmoonWIP.MintNotOpen.selector, id, start, end));
        wip.mint{value: PRICE}(id, 1, buyer);
    }
}
