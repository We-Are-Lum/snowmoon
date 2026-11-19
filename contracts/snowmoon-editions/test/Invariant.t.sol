// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";
import {RogueSeller, EthRejecter} from "./utils/Helpers.sol";

/// @dev Drives the two contracts with random creations, purchases (with random overpayment), releases, rogue
///      mints and time jumps. Every call it makes must succeed (fail_on_revert), so it only makes valid ones,
///      and records what should be true in ghost variables.
contract Handler is Test {
    SnowmoonEditions public editions;
    LadderSeller public seller;
    RogueSeller public rogue;
    address public creator;
    EthRejecter public rejecter;

    struct Ghost {
        address seller;
        address payout;
        uint256 maxSupply;
        uint256 createdAt;
        bytes32 uriHash;
        uint256 paid;
        uint256 released;
        uint256 minted;
    }

    uint256[] public ids;
    mapping(uint256 => Ghost) public ghost;
    mapping(address => uint256) public receivedByPayout;
    uint256[] public creationTimes;
    address[] public buyers;
    address[] public payouts;
    uint256 public calls;

    constructor(SnowmoonEditions e, LadderSeller s, address c) {
        editions = e;
        seller = s;
        creator = c;
        rogue = new RogueSeller(e);
        rejecter = new EthRejecter();
        for (uint256 i; i < 4; ++i) {
            address b = makeAddr(string.concat("buyer", vm.toString(i)));
            vm.deal(b, 1e30);
            buyers.push(b);
        }
        payouts.push(makeAddr("payout0"));
        payouts.push(makeAddr("payout1"));
        payouts.push(address(rejecter));
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function creationTimesLength() external view returns (uint256) {
        return creationTimes.length;
    }

    function buyersLength() external view returns (uint256) {
        return buyers.length;
    }

    function create(uint256 sizeSeed, uint256 startSeed, uint256 ratioSeed, uint256 payoutSeed, bool useRogue) external {
        calls++;
        if (block.timestamp < editions.nextEditionAllowedAt()) return; // would revert TooSoon
        uint256 size = bound(sizeSeed, 1, 256);
        uint256 start = bound(startSeed, 1, 1e18);
        uint256 top = start * bound(ratioSeed, 1, 1e6);
        address payout = payouts[payoutSeed % payouts.length];
        address s = useRogue ? address(rogue) : address(seller);
        string memory uri = string.concat("ipfs://", vm.toString(ids.length + 1));
        vm.prank(creator);
        uint256 id = editions.createEdition(uri, size, s, payout, abi.encode(start, top, uint256(0)));
        ids.push(id);
        creationTimes.push(block.timestamp);
        ghost[id] = Ghost(s, payout, size, block.timestamp, keccak256(bytes(uri)), 0, 0, 0);
    }

    function buy(uint256 idSeed, uint256 qSeed, uint256 extraSeed, uint256 buyerSeed) external {
        calls++;
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        Ghost storage g = ghost[id];
        if (g.seller != address(seller)) return;
        uint256 left = seller.remaining(id);
        if (left == 0) return;
        uint256 q = bound(qSeed, 1, left < 10 ? left : 10);
        uint256 cost = seller.quote(id, q);
        uint256 pay = cost + bound(extraSeed, 0, 10 ether);
        address b = buyers[buyerSeed % buyers.length];
        uint256 before = b.balance;
        vm.prank(b);
        seller.mint{value: pay}(id, q, b);
        assertEq(before - b.balance, cost, "charged exactly the cost");
        g.paid += cost;
        g.minted += q;
    }

    function rogueMint(uint256 idSeed, uint256 qSeed) external {
        calls++;
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        Ghost storage g = ghost[id];
        if (g.seller != address(rogue)) return;
        uint256 left = g.maxSupply - g.minted;
        if (left == 0) {
            // the collection refuses one more, whatever the seller wants
            vm.expectRevert();
            rogue.mintAny(address(rogue), id, 1);
            return;
        }
        uint256 q = bound(qSeed, 1, left);
        rogue.mintAny(address(rogue), id, q);
        g.minted += q;
    }

    function release(uint256 idSeed, address caller) external {
        calls++;
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        Ghost storage g = ghost[id];
        uint256 amount = g.paid - g.released;
        if (amount == 0) return;
        if (g.payout == address(rejecter)) {
            vm.expectRevert(abi.encodeWithSelector(LadderSeller.ReleaseFailed.selector, id));
            vm.prank(caller);
            seller.release(id);
            return;
        }
        uint256 before = g.payout.balance;
        vm.prank(caller);
        seller.release(id);
        assertEq(g.payout.balance - before, amount);
        g.released += amount;
        receivedByPayout[g.payout] += amount;
    }

    function warp(uint256 secondsSeed) external {
        calls++;
        vm.warp(block.timestamp + bound(secondsSeed, 1, 40 days));
    }
}

contract InvariantTest is Test {
    SnowmoonEditions editions;
    LadderSeller seller;
    Handler handler;
    address creator = makeAddr("creator");

    function setUp() public {
        vm.warp(1_800_000_000);
        editions = new SnowmoonEditions(creator, "ipfs://collection");
        seller = new LadderSeller(address(editions));
        handler = new Handler(editions, seller, creator);
        targetContract(address(handler));
    }

    /// No edition ever goes past its size; the collection's count matches what was minted.
    function invariant_supply() public view {
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.ids(i);
            (,, uint256 maxSupply,,,,, uint256 minted) = handler.ghost(id);
            assertLe(editions.totalMinted(id), editions.maxSupplyOf(id));
            assertLe(editions.maxSupplyOf(id), 256);
            assertEq(editions.totalMinted(id), minted);
            assertEq(editions.maxSupplyOf(id), maxSupply);
        }
    }

    /// The seller's count and the collection's count agree, and buyers hold exactly what was minted.
    function invariant_sellerCountsMatchCollection() public view {
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.ids(i);
            if (editions.sellerOf(id) != address(seller)) continue;
            assertEq(seller.sold(id), editions.totalMinted(id));
            uint256 held;
            for (uint256 b; b < handler.buyersLength(); ++b) held += editions.balanceOf(handler.buyers(b), id);
            assertEq(held, editions.totalMinted(id));
        }
    }

    /// Per edition: held = payments - releases; the seller's ETH is exactly the sum of what it holds.
    function invariant_accounting() public view {
        uint256 total;
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.ids(i);
            (,,,,, uint256 paid, uint256 released,) = handler.ghost(id);
            if (editions.sellerOf(id) != address(seller)) {
                assertEq(paid, 0);
                continue;
            }
            LadderSeller.Ladder memory l = seller.ladder(id);
            assertEq(l.paid, paid);
            assertEq(l.released, released);
            assertEq(seller.held(id), paid - released);
            total += paid - released;
        }
        assertEq(address(seller).balance, total);
        assertEq(address(editions).balance, 0);
    }

    /// lastMintAt is set exactly when something was sold, never in the future, and the summary agrees with the counts.
    function invariant_lastMintAndSummary() public view {
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.ids(i);
            if (editions.sellerOf(id) != address(seller)) continue;
            uint256 t = seller.lastMintAt(id);
            assertLe(t, block.timestamp);
            assertEq(t > 0, seller.sold(id) > 0);
            LadderSeller.Summary memory s = seller.summary(id);
            assertEq(s.sold, editions.totalMinted(id));
            assertEq(s.held, seller.held(id));
            assertEq(s.remaining, seller.remaining(id));
            assertEq(s.open, seller.isOpen(id));
            if (s.remaining > 0) assertEq(s.nextPrice, seller.quote(id, 1));
            else assertEq(s.nextPrice, 0);
        }
    }

    /// Nothing about an edition changes after creation.
    function invariant_immutable() public view {
        for (uint256 i; i < handler.idsLength(); ++i) {
            uint256 id = handler.ids(i);
            (address s, address payout, uint256 maxSupply, uint256 createdAt, bytes32 uriHash,,,) = handler.ghost(id);
            SnowmoonEditions.Edition memory e = editions.edition(id);
            assertEq(e.seller, s);
            assertEq(e.payout, payout);
            assertEq(e.maxSupply, maxSupply);
            assertEq(e.createdAt, createdAt);
            assertEq(keccak256(bytes(e.uri)), uriHash);
            if (s == address(seller)) assertEq(seller.ladder(id).payout, payout);
        }
    }

    /// Never three editions within 30 days; ids are 1..editionCount.
    function invariant_rateLimit() public view {
        uint256 n = handler.creationTimesLength();
        assertEq(editions.editionCount(), n);
        for (uint256 i = 2; i < n; ++i) {
            assertGe(handler.creationTimes(i), handler.creationTimes(i - 2) + 30 days);
        }
    }

    /// Payout addresses received exactly what was released to them, and the creator never changed.
    function invariant_payoutsAndCreator() public view {
        address p0 = handler.payouts(0);
        address p1 = handler.payouts(1);
        assertEq(p0.balance, handler.receivedByPayout(p0));
        assertEq(p1.balance, handler.receivedByPayout(p1));
        assertEq(editions.creator(), creator);
    }
}
