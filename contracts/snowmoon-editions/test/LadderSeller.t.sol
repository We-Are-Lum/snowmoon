// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {stdJson} from "forge-std/StdJson.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";
import {Base, EthRejecter, ReentrantBuyer, ReentrantPayout, Holder} from "./utils/Helpers.sol";

contract LadderSellerTest is Base {
    using stdJson for string;

    // ---------------------------------------------------------------- configure

    function test_configure_onlyCollection() public {
        vm.prank(stranger);
        vm.expectRevert(LadderSeller.NotCollection.selector);
        seller.configure(1, 10, payoutA, _data(START, TOP, 0));
        vm.prank(creator);
        vm.expectRevert(LadderSeller.NotCollection.selector);
        seller.configure(1, 10, payoutA, _data(START, TOP, 0));
    }

    function test_configure_oncePerEdition() public {
        uint256 id = _create(10);
        vm.prank(address(editions));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.AlreadyConfigured.selector, id));
        seller.configure(id, 10, payoutB, _data(1, 2, 0));
    }

    function test_configure_settingsChecks() public {
        vm.startPrank(address(editions));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadMaxSupply.selector, 0));
        seller.configure(1, 0, payoutA, _data(START, TOP, 0));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadMaxSupply.selector, 257));
        seller.configure(1, 257, payoutA, _data(START, TOP, 0));
        vm.expectRevert(LadderSeller.ZeroAddress.selector);
        seller.configure(1, 1, address(0), _data(START, TOP, 0));
        vm.expectRevert(LadderSeller.BadSellerData.selector);
        seller.configure(1, 1, payoutA, abi.encode(START, TOP));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadStartTime.selector, uint256(type(uint64).max) + 1));
        seller.configure(1, 1, payoutA, abi.encode(START, TOP, uint256(type(uint64).max) + 1));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPrices.selector, 0, 0));
        seller.configure(1, 1, payoutA, _data(0, 0, 0));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPrices.selector, 2, 1));
        seller.configure(1, 1, payoutA, _data(2, 1, 0));
        uint256 tooBig = seller.MAX_PRICE() + 1;
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPrices.selector, 1, tooBig));
        seller.configure(1, 1, payoutA, _data(1, tooBig, 0));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPayout.selector, address(seller)));
        seller.configure(1, 1, address(seller), _data(START, TOP, 0));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPayout.selector, address(editions)));
        seller.configure(1, 1, address(editions), _data(START, TOP, 0));
        // an opening time in milliseconds is refused; a year ahead is the limit
        uint64 ms = uint64(block.timestamp * 1000);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadStartTime.selector, ms));
        seller.configure(1, 1, payoutA, _data(START, TOP, ms));
        uint64 late = uint64(block.timestamp + 365 days + 1);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadStartTime.selector, late));
        seller.configure(1, 1, payoutA, _data(START, TOP, late));
        assertEq(seller.configure(2, 3, payoutA, _data(START, TOP, uint64(block.timestamp + 365 days))), LadderSeller.configure.selector);
        // the widest allowed ladder works
        seller.configure(1, 256, payoutA, _data(1, seller.MAX_PRICE(), 0));
        vm.stopPrank();
        assertEq(seller.priceOf(1, 1), 1);
        assertEq(seller.priceOf(1, 256), seller.MAX_PRICE());
    }

    function test_quote_agreesWithMint() public {
        uint64 opens = uint64(block.timestamp + 1 days);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://x", 20, address(seller), payoutA, _data(START, TOP, opens));
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadQuantity.selector, 11));
        seller.quote(id, 11);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadQuantity.selector, 0));
        seller.quote(id, 0);
        assertFalse(seller.isOpen(id), "not open before startTime");
        vm.warp(opens);
        assertTrue(seller.isOpen(id));
        _buyAll(id);
        assertFalse(seller.isOpen(id), "not open when sold out");
        assertFalse(seller.isOpen(99));
    }

    function test_forcedEthDoesNotBreakAccounting() public {
        uint256 id = _create(10);
        uint256 cost = _buy(id, 3);
        vm.deal(address(seller), address(seller).balance + 5 ether); // as selfdestruct would
        assertEq(seller.held(id), cost);
        seller.release(id);
        assertEq(payoutA.balance, cost, "only the edition's own payments go out");
        assertEq(address(seller).balance, 5 ether, "forced ETH stays, counted nowhere");
    }

    function test_encodeSettings_matchesConfigureFormat() public {
        bytes memory d = seller.encodeSettings(START, TOP, 1234);
        assertEq(d, _data(START, TOP, 1234));
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://x", 3, address(seller), payoutA, d);
        assertEq(seller.ladder(id).startTime, 1234);
    }

    // ---------------------------------------------------------------- the ladder against the reference tables

    function _checkReference(string memory name) internal {
        _checkReference(name, vm.readFile(string.concat("test/reference/", name, ".json")), "");
    }

    struct Table {
        uint256 start;
        uint256 top;
        uint256 size;
        string[] prices;
        uint256[] near;
    }

    function _checkReference(string memory name, string memory json, string memory at) internal {
        Table memory t;
        t.start = vm.parseUint(json.readString(string.concat(at, ".start")));
        t.top = vm.parseUint(json.readString(string.concat(at, ".top")));
        t.size = json.readUint(string.concat(at, ".size"));
        t.prices = json.readStringArray(string.concat(at, ".prices"));
        t.near = json.readUintArray(string.concat(at, ".near"));
        assertEq(t.prices.length, t.size);

        uint256 id = _create(t.size, t.start, t.top, payoutA);
        uint256 exact;
        uint256 prev;
        for (uint256 n = 1; n <= t.size; ++n) {
            uint256 got = seller.priceOf(id, n);
            if (_checkPiece(name, t, n, got)) exact++;
            assertGe(got, prev, "never decreases");
            prev = got;
        }
        assertEq(seller.priceOf(id, 1), t.start, "piece 1 is exactly the start price");
        assertEq(seller.priceOf(id, t.size), t.size == 1 ? t.start : t.top, "the last piece is exactly the top price");
        emit log_named_string("table", name);
        emit log_named_uint("  pieces matching exactly", exact);
        emit log_named_uint("  of", t.size);
        // fresh editions for the next table (two per 30 days)
        vm.warp(block.timestamp + 30 days);
    }

    /// True when the on-chain price equals the reference exactly. Otherwise the piece must be one the reference
    /// marks as within 1e-14 of a step boundary, and the price within one step.
    function _checkPiece(string memory name, Table memory t, uint256 n, uint256 got) internal view returns (bool) {
        uint256 want = vm.parseUint(t.prices[n - 1]);
        assertGe(got, t.start);
        assertLe(got, t.top);
        if (n > 1 && n < t.size && got != t.start && got != t.top) assertEq(got % 1e12, 0, "interior on the step");
        if (got == want) return true;
        bool isNear;
        for (uint256 k; k < t.near.length; ++k) if (t.near[k] == n) isNear = true;
        assertTrue(isNear, string.concat(name, ": mismatch away from a step boundary at piece ", vm.toString(n)));
        assertApproxEqAbs(got, want, 1e12, "within one step");
        return false;
    }

    function test_reference_first256() public {
        _checkReference("first_256");
    }

    function test_reference_first100() public {
        _checkReference("first_100");
    }

    function test_reference_first2() public {
        _checkReference("first_2");
    }

    function test_reference_first1() public {
        _checkReference("first_1");
    }

    function test_reference_otherLadders() public {
        _checkReference("small_256");
        _checkReference("flat_256");
        _checkReference("steep_256");
        _checkReference("gentle_256");
        _checkReference("odd_100");
        _checkReference("tiny_start_100");
        _checkReference("third_3");
        _checkReference("big_256");
        _checkReference("max_256");
        _checkReference("widest_256");
    }

    /// 60 random ladders (sizes 1 to 256, start 1e12 to 1e18 wei, top up to a million times start).
    function test_reference_random() public {
        string memory json = vm.readFile("test/reference/random.json");
        for (uint256 i; i < 60; ++i) {
            _checkReference(string.concat("random_", vm.toString(i)), json, string.concat(".cases[", vm.toString(i), "]"));
        }
    }

    function test_firstLadder_numbers() public {
        uint256 id = _create(256);
        assertEq(seller.priceOf(id, 1), 0.0005 ether);
        assertEq(seller.priceOf(id, 2), 0.000513 ether);
        assertEq(seller.priceOf(id, 256), 0.5 ether);
        assertEq(seller.priceOf(id, 255), 0.486637 ether);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 0));
        seller.priceOf(id, 0);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 257));
        seller.priceOf(id, 257);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 9));
        seller.priceOf(9, 1);
    }

    /// Endpoints exact, never decreasing, within [start, top], interior on the step, for any settings.
    function testFuzz_ladder_shape(uint96 a, uint96 b, uint16 sizeSeed) public {
        uint256 start = bound(a, 1, seller.MAX_PRICE());
        uint256 top = bound(b, start, seller.MAX_PRICE());
        uint256 size = bound(sizeSeed, 1, 256);
        uint256 id = _create(size, start, top, payoutA);
        uint256 step = seller.PRICE_STEP();
        uint256 prev;
        for (uint256 n = 1; n <= size; ++n) {
            uint256 p = seller.priceOf(id, n);
            assertGe(p, prev, "never decreases");
            assertGe(p, start);
            assertLe(p, top);
            if (n > 1 && n < size && p != start && p != top) assertEq(p % step, 0, "interior on the step");
            prev = p;
        }
        assertEq(seller.priceOf(id, 1), start);
        assertEq(seller.priceOf(id, size), size == 1 ? start : top);
    }

    /// Near the first ladder's settings (the likely range), each interior price is the exact geometric value
    /// rounded down to the step, give or take one step only at boundaries. Checked here against a bound from the
    /// neighbouring endpoint ratio rather than a table: p(n)/p(n-1) stays within the ideal step ratio.
    function testFuzz_ladder_stepRatio(uint64 a, uint32 mult) public {
        uint256 start = bound(a, 1e14, 1e17);
        uint256 top = start * bound(mult, 2, 5000);
        uint256 id = _create(256, start, top, payoutA);
        for (uint256 n = 2; n <= 256; ++n) {
            uint256 p = seller.priceOf(id, n);
            uint256 q = seller.priceOf(id, n - 1);
            // p >= q and p <= q * ratio^(1/255) + 2 steps (rounding), with ratio^(1/255) <= 1.034 for 5000x
            assertGe(p, q);
            assertLe(p, q * 1034 / 1000 + 2 * seller.PRICE_STEP());
        }
    }

    // ---------------------------------------------------------------- buying

    function test_mint_chargesSumOfPrices() public {
        uint256 id = _create(256);
        uint256 expected = seller.priceOf(id, 1) + seller.priceOf(id, 2) + seller.priceOf(id, 3);
        assertEq(seller.quote(id, 3), expected);
        uint256 before = buyer.balance;
        vm.expectEmit(address(seller));
        emit LadderSeller.Minted(id, buyer, buyer, 1, 3, expected);
        vm.prank(buyer);
        uint256 first = seller.mint{value: expected}(id, 3, buyer);
        assertEq(first, 1);
        assertEq(before - buyer.balance, expected);
        assertEq(address(seller).balance, expected);
        assertEq(seller.held(id), expected);
        assertEq(editions.balanceOf(buyer, id), 3);
        assertEq(seller.nextPrice(id), seller.priceOf(id, 4));
        assertEq(seller.remaining(id), 253);
    }

    function test_mint_refundsExcess() public {
        uint256 id = _create(256);
        uint256 cost = seller.quote(id, 2);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        seller.mint{value: 1 ether}(id, 2, buyer);
        assertEq(before - buyer.balance, cost, "charged the actual cost only");
        assertEq(address(seller).balance, cost);
    }

    /// Two buyers quote the same price; the first moves it; the second, having sent a margin, still gets the next
    /// piece at the new price and is refunded the rest.
    function test_mint_raceWithMargin() public {
        uint256 id = _create(256);
        address other = makeAddr("other buyer");
        vm.deal(other, 10 ether);
        uint256 quoted = seller.quote(id, 1);
        vm.prank(other);
        seller.mint{value: quoted}(id, 1, other);
        // the price moved
        uint256 nowCost = seller.quote(id, 1);
        assertGt(nowCost, quoted);
        // an exact payment at the old quote fails; one with a 5% margin works
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.Underpaid.selector, nowCost, quoted));
        seller.mint{value: quoted}(id, 1, buyer);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        seller.mint{value: quoted * 105 / 100}(id, 1, buyer);
        assertEq(before - buyer.balance, nowCost);
    }

    function test_mint_underpaymentReverts() public {
        uint256 id = _create(256);
        uint256 cost = seller.quote(id, 5);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.Underpaid.selector, cost, cost - 1));
        seller.mint{value: cost - 1}(id, 5, buyer);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.Underpaid.selector, cost, 0));
        seller.mint(id, 5, buyer);
    }

    function test_mint_quantityCap() public {
        uint256 id = _create(256);
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadQuantity.selector, 0));
        seller.mint{value: 1 ether}(id, 0, buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadQuantity.selector, 11));
        seller.mint{value: 10 ether}(id, 11, buyer);
        seller.mint{value: 10 ether}(id, 10, buyer);
        vm.stopPrank();
        assertEq(editions.balanceOf(buyer, id), 10);
    }

    function test_mint_soldOut() public {
        uint256 id = _create(12);
        _buy(id, 10);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NotEnoughLeft.selector, 2, 3));
        seller.mint{value: 10 ether}(id, 3, buyer);
        _buy(id, 2);
        assertEq(seller.remaining(id), 0);
        assertEq(editions.totalMinted(id), 12);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NotEnoughLeft.selector, 0, 1));
        seller.mint{value: 10 ether}(id, 1, buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.BadPiece.selector, 13));
        seller.nextPrice(id);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NotEnoughLeft.selector, 0, 1));
        seller.quote(id, 1);
    }

    function test_mint_whole256LadderCost() public {
        uint256 id = _create(256);
        uint256 sum;
        for (uint256 n = 1; n <= 256; ++n) sum += seller.priceOf(id, n);
        _buyAll(id);
        assertEq(address(seller).balance, sum);
        assertEq(seller.held(id), sum);
        emit log_named_decimal_uint("whole 256 ladder, ETH", sum, 18);
    }

    function test_mint_startTime() public {
        uint64 opens = uint64(block.timestamp + 1 days);
        vm.prank(creator);
        uint256 id = editions.createEdition("ipfs://x", 10, address(seller), payoutA, _data(START, TOP, opens));
        vm.warp(opens - 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NotStarted.selector, opens));
        seller.mint{value: 1 ether}(id, 1, buyer);
        vm.warp(opens);
        _buy(id, 1);
        assertEq(editions.totalMinted(id), 1);
    }

    function test_mint_unknownEdition() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 1));
        seller.mint{value: 1 ether}(1, 1, buyer);
    }

    function test_mint_buyerMayMintForSomeoneElse() public {
        uint256 id = _create(10);
        uint256 cost = seller.quote(id, 1);
        vm.prank(buyer);
        seller.mint{value: cost + 1}(id, 1, stranger);
        assertEq(editions.balanceOf(stranger, id), 1);
        assertEq(editions.balanceOf(buyer, id), 0);
    }

    function test_mint_refundToRejectingSenderReverts() public {
        uint256 id = _create(10);
        EthRejecter r = new EthRejecter();
        vm.deal(address(r), 1 ether);
        uint256 cost = seller.quote(id, 1);
        vm.prank(address(r));
        vm.expectRevert(LadderSeller.RefundFailed.selector);
        seller.mint{value: cost + 1}(id, 1, buyer);
        // exact payment needs no refund and works
        vm.prank(address(r));
        seller.mint{value: cost}(id, 1, buyer);
        assertEq(editions.balanceOf(buyer, id), 1);
    }

    function testFuzz_payment(uint8 sizeSeed, uint8 qSeed, uint96 extra, uint8 preSeed) public {
        uint256 size = bound(sizeSeed, 1, 256);
        uint256 id = _create(size);
        uint256 pre = bound(preSeed, 0, size - 1);
        while (pre > 0) {
            uint256 q0 = pre > 10 ? 10 : pre;
            _buy(id, q0);
            pre -= q0;
        }
        uint256 left = seller.remaining(id);
        uint256 q = bound(qSeed, 1, left < 10 ? left : 10);
        uint256 sold = seller.sold(id);
        uint256 sum;
        for (uint256 n = sold + 1; n <= sold + q; ++n) sum += seller.priceOf(id, n);
        assertEq(seller.quote(id, q), sum);

        uint256 heldBefore = seller.held(id);
        uint256 balBefore = buyer.balance;
        uint256 pay = sum + bound(extra, 0, 100 ether);
        vm.prank(buyer);
        seller.mint{value: pay}(id, q, buyer);
        assertEq(balBefore - buyer.balance, sum, "charged exactly the sum of prices");
        assertEq(seller.held(id) - heldBefore, sum);
        assertEq(seller.sold(id), sold + q);
        assertEq(editions.totalMinted(id), sold + q);
    }

    // ---------------------------------------------------------------- release

    function test_release_toPayoutOnly_anyoneCalls() public {
        uint256 a = _create(10, START, TOP, payoutA);
        uint256 b = _create(10, START, TOP, payoutB);
        uint256 costA = _buy(a, 4);
        uint256 costB = _buy(b, 2);
        vm.expectEmit(address(seller));
        emit LadderSeller.Released(a, payoutA, costA);
        vm.prank(stranger);
        assertEq(seller.release(a), costA);
        assertEq(payoutA.balance, costA);
        assertEq(payoutB.balance, 0);
        assertEq(stranger.balance, 0);
        assertEq(seller.held(a), 0);
        assertEq(seller.held(b), costB);
        assertEq(address(seller).balance, costB);

        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NothingToRelease.selector, a));
        seller.release(a);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.NothingToRelease.selector, 77));
        seller.release(77);

        // more sales, released again
        uint256 more = _buy(a, 1);
        seller.release(a);
        assertEq(payoutA.balance, costA + more);
        LadderSeller.Ladder memory l = seller.ladder(a);
        assertEq(l.paid, costA + more);
        assertEq(l.released, costA + more);
    }

    function test_release_rejectingPayoutDoesNotLockOthers() public {
        EthRejecter bad = new EthRejecter();
        uint256 a = _create(10, START, TOP, address(bad));
        uint256 b = _create(10, START, TOP, payoutB);
        uint256 costA = _buy(a, 3);
        uint256 costB = _buy(b, 3);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.ReleaseFailed.selector, a));
        seller.release(a);
        assertEq(seller.held(a), costA, "kept for a later release");
        seller.release(b);
        assertEq(payoutB.balance, costB);
        // sales continue on the edition whose payout rejects ETH
        _buy(a, 1);
        assertEq(address(seller).balance, seller.held(a));
    }

    // ---------------------------------------------------------------- reentrancy

    function test_reentrancy_buyerOnTokenReceipt() public {
        uint256 id = _create(10);
        ReentrantBuyer rb = new ReentrantBuyer(seller);
        vm.deal(address(rb), 10 ether);
        uint256 cost = seller.quote(id, 1);
        rb.buy{value: cost}(id, 1, ReentrantBuyer.Mode.MintOnToken);
        assertEq(rb.attemptsOnToken(), 1);
        assertEq(bytes4(rb.lastError()), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(editions.balanceOf(address(rb), id), 1, "no extra piece");
        assertEq(seller.sold(id), 1);
        assertEq(address(seller).balance, cost);
    }

    function test_reentrancy_buyerOnRefund() public {
        uint256 id = _create(10);
        ReentrantBuyer rb = new ReentrantBuyer(seller);
        uint256 cost = seller.quote(id, 1);
        vm.deal(address(this), 10 ether);
        // the reentry is blocked, the buyer's receive reverts, so the refund fails and the whole mint reverts
        vm.expectRevert(LadderSeller.RefundFailed.selector);
        rb.buy{value: cost * 3}(id, 1, ReentrantBuyer.Mode.MintOnRefund);
        assertEq(seller.sold(id), 0);
        assertEq(address(seller).balance, 0);

        // reentering release during the refund is also blocked; the mint itself goes through
        rb.buy{value: cost * 3}(id, 1, ReentrantBuyer.Mode.ReleaseOnRefund);
        assertEq(bytes4(rb.lastError()), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(seller.held(id), cost);
        assertEq(editions.balanceOf(address(rb), id), 1);
    }

    function test_reentrancy_payout() public {
        ReentrantPayout rp = new ReentrantPayout(seller);
        uint256 a = _create(10, START, TOP, address(rp));
        uint256 b = _create(10, START, TOP, payoutB);
        rp.setId(a);
        uint256 costA = _buy(a, 5);
        uint256 costB = _buy(b, 5);
        seller.release(a);
        assertEq(rp.attempts(), 1);
        assertTrue(rp.releaseBlocked());
        assertTrue(rp.mintBlocked());
        assertEq(address(rp).balance, costA, "exactly its edition's balance");
        assertEq(seller.held(b), costB, "other editions untouched");
        assertEq(address(seller).balance, costB);
        assertEq(editions.balanceOf(address(rp), a), 0);
    }

    // ---------------------------------------------------------------- views

    function test_views_unknownEdition() public {
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 3));
        seller.remaining(3);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 3));
        seller.quote(3, 1);
        vm.expectRevert(abi.encodeWithSelector(LadderSeller.UnknownEdition.selector, 3));
        seller.nextPrice(3);
        assertEq(seller.held(3), 0);
        assertEq(seller.sold(3), 0);
    }

    function test_holderContractCanBuyAndReceiveRefund() public {
        uint256 id = _create(10);
        Holder h = new Holder();
        vm.deal(address(h), 1 ether);
        uint256 cost = seller.quote(id, 2);
        vm.prank(address(h));
        seller.mint{value: cost + 0.1 ether}(id, 2, address(h));
        assertEq(address(h).balance, 1 ether - cost);
    }
}
