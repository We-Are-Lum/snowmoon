// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";
import {Base, RogueSeller, NonReceiver, Holder, PermissiveFallback} from "./utils/Helpers.sol";

contract SnowmoonEditionsTest is Base {
    // ---------------------------------------------------------------- construction

    function test_constructor() public view {
        assertEq(editions.creator(), creator);
        assertEq(editions.pendingCreator(), address(0));
        assertEq(editions.name(), "Snowmoon Editions");
        assertEq(editions.symbol(), "SNOWMOON");
        assertEq(editions.contractURI(), "ipfs://collection");
        assertEq(editions.editionCount(), 0);
        assertEq(editions.MAX_EDITION_SIZE(), 256);
        assertEq(editions.MAX_EDITIONS_PER_WINDOW(), 2);
        assertEq(editions.WINDOW(), 30 days);
        assertEq(seller.collection(), address(editions));
    }

    function test_constructor_rejectsZeroCreator() public {
        vm.expectRevert(SnowmoonEditions.ZeroAddress.selector);
        new SnowmoonEditions(address(0), "");
    }

    function test_noPayableEntry() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(editions).call{value: 1}("");
        assertFalse(ok, "plain ETH transfer must revert");
        vm.prank(stranger);
        (ok,) = address(seller).call{value: 1}("");
        assertFalse(ok, "plain ETH transfer to the seller must revert");
    }

    // ---------------------------------------------------------------- creating editions

    function test_createEdition_storesEverything() public {
        bytes memory data = _data(START, TOP, 0);
        vm.expectEmit(true, true, true, true, address(editions));
        emit SnowmoonEditions.EditionCreated(1, address(seller), payoutA, 256, "ipfs://e1", data, block.timestamp);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://e1", 256, address(seller), payoutA, data);
        assertEq(id, 1);
        assertEq(editions.editionCount(), 1);
        assertEq(editions.uri(1), "ipfs://e1");
        assertEq(editions.sellerOf(1), address(seller));
        assertEq(editions.payoutOf(1), payoutA);
        assertEq(editions.maxSupplyOf(1), 256);
        assertEq(editions.createdAt(1), block.timestamp);
        assertEq(editions.totalMinted(1), 0);
        assertTrue(editions.exists(1));
        assertFalse(editions.exists(2));
        // the seller was configured in the same transaction
        LadderSeller.Ladder memory l = seller.ladder(1);
        assertTrue(l.configured);
        assertEq(l.payout, payoutA);
        assertEq(l.maxSupply, 256);
        assertEq(l.startPrice, START);
        assertEq(l.topPrice, TOP);
    }

    function test_createEdition_idsSequential() public {
        assertEq(_create(5), 1);
        assertEq(_create(6), 2);
        vm.warp(block.timestamp + 30 days);
        assertEq(_create(7), 3);
    }

    function test_createEdition_onlyCreator() public {
        vm.prank(stranger);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
    }

    function test_createEdition_sizeBounds() public {
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.BadMaxSupply.selector, 0));
        editions.createEdition("ipfs://x", 0, address(seller), payoutA, _data(START, TOP, 0));
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.BadMaxSupply.selector, 257));
        editions.createEdition("ipfs://x", 257, address(seller), payoutA, _data(START, TOP, 0));
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
        editions.createEdition("ipfs://x", 256, address(seller), payoutA, _data(START, TOP, 0));
        vm.stopPrank();
    }

    function test_createEdition_sellerMustBeContract() public {
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.SellerNotContract.selector, stranger));
        editions.createEdition("ipfs://x", 1, stranger, payoutA, "");
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.SellerNotContract.selector, address(0)));
        editions.createEdition("ipfs://x", 1, address(0), payoutA, "");
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.SellerNotContract.selector, address(editions)));
        editions.createEdition("ipfs://x", 1, address(editions), payoutA, "");
        vm.stopPrank();
    }

    function test_createEdition_refusesSellerWithoutMagicValue() public {
        PermissiveFallback pf = new PermissiveFallback();
        vm.prank(creator);
        vm.expectRevert(); // configure returns no data, so decoding the magic value fails
        editions.createEdition("ipfs://x", 256, address(pf), payoutA, "");
        assertEq(editions.editionCount(), 0);
    }

    function test_createEdition_refusesPayoutThatCanNeverPassItOn() public {
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.BadPayout.selector, address(editions)));
        editions.createEdition("ipfs://x", 1, address(seller), address(editions), _data(START, TOP, 0));
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.BadPayout.selector, address(seller)));
        editions.createEdition("ipfs://x", 1, address(seller), address(seller), _data(START, TOP, 0));
        vm.stopPrank();
    }

    function test_createEdition_rejectsZeroPayoutAndEmptyUri() public {
        vm.startPrank(creator);
        vm.expectRevert(SnowmoonEditions.ZeroAddress.selector);
        editions.createEdition("ipfs://x", 1, address(seller), address(0), _data(START, TOP, 0));
        vm.expectRevert(SnowmoonEditions.EmptyURI.selector);
        editions.createEdition("", 1, address(seller), payoutA, _data(START, TOP, 0));
        vm.stopPrank();
    }

    function test_createEdition_badSellerDataRevertsWholeCreation() public {
        vm.startPrank(creator);
        vm.expectRevert(LadderSeller.BadSellerData.selector);
        editions.createEdition("ipfs://x", 3, address(seller), payoutA, hex"1234");
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPrices.selector, 0, TOP));
        editions.createEdition("ipfs://x", 3, address(seller), payoutA, _data(0, TOP, 0));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPrices.selector, TOP, START));
        editions.createEdition("ipfs://x", 3, address(seller), payoutA, _data(TOP, START, 0));
        vm.stopPrank();
        assertEq(editions.editionCount(), 0, "nothing was created");
    }

    function test_uri_unknownEditionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.UnknownEdition.selector, 1));
        editions.uri(1);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.UnknownEdition.selector, 0));
        editions.uri(0);
    }

    // ---------------------------------------------------------------- rate limit

    function test_rateLimit_thirdRevertsOneSecondEarly_succeedsAt30Days() public {
        uint256 t0 = block.timestamp;
        _create(1);
        _create(1);
        assertEq(editions.nextEditionAllowedAt(), t0 + 30 days);

        vm.warp(t0 + 30 days - 1);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.TooSoon.selector, t0 + 30 days));
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));

        vm.warp(t0 + 30 days);
        assertEq(_create(1), 3);
    }

    /// Spacing: second edition `gap` seconds after the first. The third is due 30 days after the second most
    /// recent (the first), the fourth 30 days after the second, and so on.
    function _checkSpacing(uint256 gap) internal {
        uint256 t1 = block.timestamp;
        _create(1);
        vm.warp(t1 + gap);
        uint256 t2 = block.timestamp;
        _create(1);

        uint256 due3 = t1 + 30 days;
        if (due3 > block.timestamp) {
            vm.warp(due3 - 1);
            vm.prank(creator);
            vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.TooSoon.selector, due3));
            editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
            vm.warp(due3);
        }
        uint256 t3 = block.timestamp;
        _create(1);

        uint256 due4 = t2 + 30 days;
        if (due4 > block.timestamp) {
            vm.warp(due4 - 1);
            vm.prank(creator);
            vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.TooSoon.selector, due4));
            editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
            vm.warp(due4);
        }
        _create(1);
        assertEq(editions.nextEditionAllowedAt(), t3 + 30 days);
    }

    function test_rateLimit_spacing_sameBlock() public {
        _checkSpacing(0);
    }

    function test_rateLimit_spacing_oneDay() public {
        _checkSpacing(1 days);
    }

    function test_rateLimit_spacing_fifteenDays() public {
        _checkSpacing(15 days);
    }

    function test_rateLimit_spacing_justUnderWindow() public {
        _checkSpacing(30 days - 1);
    }

    function test_rateLimit_spacing_overWindow() public {
        _checkSpacing(45 days);
    }

    /// Any three consecutive editions span at least 30 days, whatever the timing of attempts.
    function testFuzz_rateLimit_neverThreeIn30Days(uint32[8] memory gaps) public {
        uint256[] memory times = new uint256[](9);
        uint256 n;
        for (uint256 i; i < gaps.length; ++i) {
            vm.warp(block.timestamp + (uint256(gaps[i]) % (40 days)));
            vm.prank(creator);
            try editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0)) {
                times[n++] = block.timestamp;
            } catch {}
        }
        for (uint256 i = 2; i < n; ++i) {
            assertGe(times[i], times[i - 2] + 30 days);
        }
    }

    // ---------------------------------------------------------------- minting and supply

    function test_mint_onlyEditionsSeller() public {
        uint256 id = _create(10);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.NotSeller.selector, id, stranger));
        editions.mint(stranger, id, 1);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.NotSeller.selector, id, creator));
        editions.mint(creator, id, 1);
        // unknown edition: nobody is its seller, not even address(0)
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.NotSeller.selector, 99, address(0)));
        editions.mint(stranger, 99, 1);
    }

    function test_rogueSeller_cannotPassSizeOrTouchOtherEditions() public {
        uint256 ladderId = _create(10);
        RogueSeller rogue = new RogueSeller(editions);
        vm.prank(creator);
        uint256 rogueId = editions.createEdition("ipfs://rogue", 5, address(rogue), payoutA, "");

        rogue.mintAny(stranger, rogueId, 5);
        assertEq(editions.totalMinted(rogueId), 5);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.ExceedsMaxSupply.selector, rogueId, 5, 1, 5));
        rogue.mintAny(stranger, rogueId, 1);

        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.NotSeller.selector, ladderId, address(rogue)));
        rogue.mintAny(stranger, ladderId, 1);
        assertEq(editions.totalMinted(ladderId), 0);
    }

    function test_rogueSeller_mintInConfigureStillCapped() public {
        RogueSeller rogue = new RogueSeller(editions);
        rogue.setMintInConfigure(true);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://rogue", 7, address(rogue), payoutA, "");
        assertEq(editions.totalMinted(id), 7);
        assertEq(editions.balanceOf(address(rogue), id), 7);
        vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.ExceedsMaxSupply.selector, id, 7, 1, 7));
        rogue.mintAny(stranger, id, 1);
    }

    function testFuzz_supply_neverExceeded(uint8 sizeSeed, uint16[6] memory qs) public {
        uint256 size = bound(sizeSeed, 1, 256);
        RogueSeller rogue = new RogueSeller(editions);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://rogue", size, address(rogue), payoutA, "");
        for (uint256 i; i < qs.length; ++i) {
            uint256 q = qs[i];
            uint256 minted = editions.totalMinted(id);
            if (q == 0) {
                vm.expectRevert(SnowmoonEditions.ZeroQuantity.selector);
            } else if (minted + q > size) {
                vm.expectRevert(abi.encodeWithSelector(SnowmoonEditions.ExceedsMaxSupply.selector, id, minted, q, size));
            }
            rogue.mintAny(stranger, id, q);
            assertLe(editions.totalMinted(id), size);
        }
    }

    function test_mint_toNonReceiverContractReverts() public {
        uint256 id = _create(10);
        NonReceiver nr = new NonReceiver();
        uint256 cost = seller.quote(id, 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(nr)));
        seller.mint{value: cost}(id, 1, address(nr));
        assertEq(editions.totalMinted(id), 0);
        assertEq(seller.sold(id), 0);
        assertEq(seller.held(id), 0);
    }

    function test_mint_toReceiverContractWorks() public {
        uint256 id = _create(10);
        Holder h = new Holder();
        uint256 cost = seller.quote(id, 2);
        vm.prank(buyer);
        seller.mint{value: cost}(id, 2, address(h));
        assertEq(editions.balanceOf(address(h), id), 2);
    }

    function test_mint_toZeroAddressReverts() public {
        uint256 id = _create(10);
        uint256 cost = seller.quote(id, 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(0)));
        seller.mint{value: cost}(id, 1, address(0));
    }

    // ---------------------------------------------------------------- creator handover

    function test_handover_twoStep() public {
        address next = makeAddr("next creator");
        vm.prank(creator);
        editions.transferCreator(next);
        assertEq(editions.creator(), creator, "nothing changes until accepted");
        assertEq(editions.pendingCreator(), next);

        // the old creator still creates; the pending one can't yet
        vm.prank(next);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
        _create(1);

        vm.prank(next);
        editions.acceptCreator();
        assertEq(editions.creator(), next);
        assertEq(editions.pendingCreator(), address(0));

        vm.prank(creator);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
        vm.prank(next);
        editions.createEdition("ipfs://x", 1, address(seller), payoutA, _data(START, TOP, 0));
    }

    function test_handover_pendingWhoNeverAcceptsChangesNothing() public {
        address next = makeAddr("next creator");
        vm.prank(creator);
        editions.transferCreator(next);
        vm.warp(block.timestamp + 3650 days);
        assertEq(editions.creator(), creator);
        vm.prank(next);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.transferCreator(stranger);
        vm.prank(next);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.setContractURI("ipfs://hijack");
        _create(1);
    }

    function test_handover_onlyPendingAccepts_andCancel() public {
        address next = makeAddr("next creator");
        vm.prank(stranger);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.transferCreator(stranger);

        vm.prank(creator);
        editions.transferCreator(next);
        vm.prank(stranger);
        vm.expectRevert(SnowmoonEditions.NotPendingCreator.selector);
        editions.acceptCreator();

        // cancel by naming nobody
        vm.prank(creator);
        editions.transferCreator(address(0));
        vm.prank(next);
        vm.expectRevert(SnowmoonEditions.NotPendingCreator.selector);
        editions.acceptCreator();
        // address(0) can never accept
        vm.prank(address(0));
        vm.expectRevert(SnowmoonEditions.NotPendingCreator.selector);
        editions.acceptCreator();
        assertEq(editions.creator(), creator);
    }

    function test_contractURI_onlyCreator() public {
        vm.prank(stranger);
        vm.expectRevert(SnowmoonEditions.NotCreator.selector);
        editions.setContractURI("ipfs://x");
        vm.expectEmit(address(editions));
        emit SnowmoonEditions.ContractURIUpdated();
        vm.prank(creator);
        editions.setContractURI("ipfs://v2");
        assertEq(editions.contractURI(), "ipfs://v2");
    }

    // ---------------------------------------------------------------- immutability

    /// The complete public interface of both contracts. Any new function (a setter, a withdraw, a burn) fails
    /// this test. The state-changing ones are marked; none of them takes an edition's seller, payout, link or size.
    function test_immutability_fullInterface() public view {
        string[27] memory col = [
            // state-changing
            "createEdition(string,uint256,address,address,bytes)",
            "mint(address,uint256,uint256)",
            "transferCreator(address)",
            "acceptCreator()",
            "setContractURI(string)",
            "setApprovalForAll(address,bool)",
            "safeTransferFrom(address,address,uint256,uint256,bytes)",
            "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
            // views
            "MAX_EDITION_SIZE()",
            "MAX_EDITIONS_PER_WINDOW()",
            "WINDOW()",
            "name()",
            "symbol()",
            "creator()",
            "pendingCreator()",
            "editionCount()",
            "nextEditionAllowedAt()",
            "uri(uint256)",
            "contractURI()",
            "edition(uint256)",
            "sellerOf(uint256)",
            "payoutOf(uint256)",
            "maxSupplyOf(uint256)",
            "totalMinted(uint256)",
            "createdAt(uint256)",
            "exists(uint256)",
            "supportsInterface(bytes4)"
        ];
        string[] memory got = vm.parseJsonKeys(vm.readFile("out/SnowmoonEditions.sol/SnowmoonEditions.json"), ".methodIdentifiers");
        // plus ERC-1155 views balanceOf, balanceOfBatch, isApprovedForAll
        assertEq(got.length, col.length + 3, "SnowmoonEditions: unexpected number of functions");
        for (uint256 i; i < col.length; ++i) assertTrue(_has(got, col[i]), col[i]);
        assertTrue(_has(got, "balanceOf(address,uint256)"));
        assertTrue(_has(got, "balanceOfBatch(address[],uint256[])"));
        assertTrue(_has(got, "isApprovedForAll(address,address)"));

        string[18] memory sel = [
            // state-changing
            "configure(uint256,uint256,address,bytes)",
            "mint(uint256,uint256,address)",
            "release(uint256)",
            // views
            "PRICE_STEP()",
            "MAX_PER_TX()",
            "collection()",
            "encodeSettings(uint256,uint256,uint64)",
            "priceOf(uint256,uint256)",
            "nextPrice(uint256)",
            "quote(uint256,uint256)",
            "remaining(uint256)",
            "sold(uint256)",
            "held(uint256)",
            "ladder(uint256)",
            "isOpen(uint256)",
            "MAX_PRICE()",
            "MAX_START_DELAY()",
            ""
        ];
        got = vm.parseJsonKeys(vm.readFile("out/LadderSeller.sol/LadderSeller.json"), ".methodIdentifiers");
        assertEq(got.length, 17, "LadderSeller: unexpected number of functions");
        for (uint256 i; i < 17; ++i) assertTrue(_has(got, sel[i]), sel[i]);
    }

    function _has(string[] memory got, string memory sig) internal pure returns (bool) {
        for (uint256 j; j < got.length; ++j) {
            if (keccak256(bytes(got[j])) == keccak256(bytes(sig))) return true;
        }
        return false;
    }

    /// After creation, none of the state-changing functions moves an edition's seller, payout, link or size.
    function test_immutability_editionFieldsNeverChange() public {
        uint256 id = _create(20);
        SnowmoonEditions.Edition memory before = editions.edition(id);
        LadderSeller.Ladder memory lBefore = seller.ladder(id);

        _buy(id, 10);
        seller.release(id);
        vm.prank(creator);
        editions.setContractURI("ipfs://new");
        address next = makeAddr("next");
        vm.prank(creator);
        editions.transferCreator(next);
        vm.prank(next);
        editions.acceptCreator();
        vm.prank(next);
        editions.createEdition("ipfs://other", 5, address(seller), payoutB, _data(START, TOP, 0));
        vm.prank(buyer);
        editions.safeTransferFrom(buyer, stranger, id, 3, "");
        // reconfiguring from the collection is impossible (only createEdition calls configure, once per new id)
        vm.prank(address(editions));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.AlreadyConfigured.selector, id));
        seller.configure(id, 256, stranger, _data(1, 1, 0));

        SnowmoonEditions.Edition memory afterE = editions.edition(id);
        assertEq(afterE.seller, before.seller);
        assertEq(afterE.payout, before.payout);
        assertEq(afterE.uri, before.uri);
        assertEq(afterE.maxSupply, before.maxSupply);
        assertEq(afterE.createdAt, before.createdAt);
        LadderSeller.Ladder memory lAfter = seller.ladder(id);
        assertEq(lAfter.payout, lBefore.payout);
        assertEq(lAfter.startPrice, lBefore.startPrice);
        assertEq(lAfter.topPrice, lBefore.topPrice);
        assertEq(lAfter.startTime, lBefore.startTime);
        assertEq(lAfter.maxSupply, lBefore.maxSupply);
        assertEq(lAfter.lnRatio, lBefore.lnRatio);
    }
}
