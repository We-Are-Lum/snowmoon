// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {LadderSeller} from "../src/LadderSeller.sol";
import {Base} from "./utils/Helpers.sol";

/// @dev The read functions for the site (owner, 2026-11-18): lastMintAt, pricesOf, summary. They change no price and no
///      payment: every other test runs unchanged, and these check each view against the ones it summarises.
contract NonReceiverForViews {}

contract RejecterForViews {
    receive() external payable {
        revert();
    }
}

contract ViewsTest is Base {
    function test_lastMintAt() public {
        uint256 a = _create(20);
        uint256 b = _create(20, START, TOP, payoutB);
        assertEq(seller.lastMintAt(a), 0, "never minted");
        _buy(a, 2);
        assertEq(seller.lastMintAt(a), block.timestamp);
        assertEq(seller.lastMintAt(b), 0, "other editions untouched");
        vm.warp(block.timestamp + 1 hours);
        _buy(a, 1);
        assertEq(seller.lastMintAt(a), block.timestamp, "updated on each mint");
        uint256 t = block.timestamp;
        vm.warp(block.timestamp + 1 days);
        seller.release(a);
        assertEq(seller.lastMintAt(a), t, "release doesn't change it");
        assertEq(seller.lastMintAt(99), 0);
    }

    function test_lastMintAt_notSetByFailedMint() public {
        uint256 a = _create(5);
        uint256 cost = seller.quote(a, 1);
        vm.prank(buyer);
        vm.expectRevert();
        seller.mint{value: cost - 1}(a, 1, buyer);
        assertEq(seller.lastMintAt(a), 0);
    }

    function test_lastMintAt_notSetWhenTheCollectionOrRefundFails() public {
        uint256 a = _create(5);
        NonReceiverForViews nr = new NonReceiverForViews();
        uint256 cost = seller.quote(a, 1);
        vm.prank(buyer);
        vm.expectRevert();
        seller.mint{value: cost}(a, 1, address(nr)); // the collection refuses a non-receiver
        RejecterForViews r = new RejecterForViews();
        vm.deal(address(r), 1 ether);
        vm.prank(address(r));
        vm.expectRevert(LadderSeller.RefundFailed.selector);
        seller.mint{value: cost + 1}(a, 1, buyer); // the refund fails
        assertEq(seller.lastMintAt(a), 0);
        assertEq(seller.sold(a), 0);
    }

    function test_ladder_fieldOrder() public {
        uint256 id = _create(7);
        _buy(id, 2);
        LadderSeller.Ladder memory l = seller.ladder(id);
        assertEq(l.sold, 2);
        assertTrue(l.configured);
        assertEq(l.lastMintAt, block.timestamp);
        assertEq(l.paid, seller.held(id));
        assertEq(l.payout, payoutA);
        // The ABI order the site decodes: (startPrice, topPrice, startTime, payout, maxSupply, sold, configured,
        // lastMintAt, paid, released, lnRatio).
        (bool ok, bytes memory raw) = address(seller).staticcall(abi.encodeCall(LadderSeller.ladder, (id)));
        assertTrue(ok);
        (,,,, uint256 size, uint256 soldRaw, bool conf, uint256 lastRaw, uint256 paidRaw,,) =
            abi.decode(raw, (uint256, uint256, uint256, address, uint256, uint256, bool, uint256, uint256, uint256, uint256));
        assertEq(size, 7);
        assertEq(soldRaw, 2);
        assertTrue(conf);
        assertEq(lastRaw, block.timestamp);
        assertEq(paidRaw, l.paid);
    }

    function test_pricesOf_wholeLadderMatchesPriceOf() public {
        uint256 id = _create(256);
        uint256[] memory p = seller.pricesOf(id, 1, 256);
        assertEq(p.length, 256);
        for (uint256 n = 1; n <= 256; ++n) assertEq(p[n - 1], seller.priceOf(id, n));
        assertEq(p[0], START);
        assertEq(p[255], TOP);
    }

    function testFuzz_pricesOf_range(uint8 sizeSeed, uint16 firstSeed, uint16 countSeed) public {
        uint256 size = bound(sizeSeed, 1, 256);
        uint256 id = _create(size);
        uint256 first = bound(firstSeed, 1, size);
        uint256 count = bound(countSeed, 1, size - first + 1);
        uint256[] memory p = seller.pricesOf(id, first, count);
        assertEq(p.length, count);
        for (uint256 i; i < count; ++i) assertEq(p[i], seller.priceOf(id, first + i));
    }

    function test_pricesOf_badRanges() public {
        uint256 id = _create(10);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 1));
        seller.pricesOf(id, 1, 0);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 0));
        seller.pricesOf(id, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 0));
        seller.pricesOf(id, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 2));
        seller.pricesOf(id, 2, 10);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, type(uint256).max));
        seller.pricesOf(id, type(uint256).max, 1);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 1));
        seller.pricesOf(id, 1, type(uint256).max);
        assertEq(seller.pricesOf(id, 10, 1)[0], seller.priceOf(id, 10));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 7));
        seller.pricesOf(7, 1, 1);
    }

    function test_summary_matchesTheOtherViews() public {
        uint256 id = _create(12);
        _check(id);
        _buy(id, 5);
        _check(id);
        _buy(id, 7);
        LadderSeller.Summary memory s = _check(id);
        assertEq(s.nextPrice, 0, "sold out: no next price");
        assertFalse(s.open);
        assertEq(s.remaining, 0);
    }

    function test_summary_notOpenYet() public {
        uint64 opens = uint64(block.timestamp + 1 days);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://later", 3, address(seller), payoutA, _data(START, TOP, opens));
        LadderSeller.Summary memory s = seller.summary(id);
        assertFalse(s.open);
        assertEq(s.startTime, opens);
        assertEq(s.nextPrice, START, "the price is shown before opening");
        vm.warp(opens);
        assertTrue(seller.summary(id).open);
    }

    function test_summary_unknownEdition() public {
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 4));
        seller.summary(4);
    }

    function _check(uint256 id) internal view returns (LadderSeller.Summary memory s) {
        s = seller.summary(id);
        LadderSeller.Ladder memory l = seller.ladder(id);
        assertEq(s.id, id);
        assertEq(s.maxSupply, editions.maxSupplyOf(id));
        assertEq(s.sold, editions.totalMinted(id));
        assertEq(s.sold, seller.sold(id));
        assertEq(s.remaining, seller.remaining(id));
        assertEq(s.startPrice, l.startPrice);
        assertEq(s.topPrice, l.topPrice);
        if (s.remaining > 0) assertEq(s.nextPrice, seller.nextPrice(id));
        if (s.remaining > 0) assertEq(s.nextPrice, seller.quote(id, 1));
        assertEq(s.startTime, l.startTime);
        assertEq(s.lastMintAt, seller.lastMintAt(id));
        assertEq(s.open, seller.isOpen(id));
        assertEq(s.payout, editions.payoutOf(id));
        assertEq(s.held, seller.held(id));
        assertEq(s.uri, editions.uri(id));
    }
}
