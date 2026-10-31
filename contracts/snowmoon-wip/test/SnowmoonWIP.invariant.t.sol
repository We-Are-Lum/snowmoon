// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SnowmoonWIP} from "../src/SnowmoonWIP.sol";
import {ForceSender, PaymentCheckingReceiver, Payout} from "./utils/Helpers.sol";

/// @dev Drives random mints, releases, transfers, forced ETH and time jumps over three tokens.
contract Handler is Test {
    SnowmoonWIP public immutable wip;
    uint256[3] public ids;
    address payable[3] public payouts;
    address[4] public buyers;
    /// A contract holder that accepts the hook and checks the payment is recorded before it runs.
    PaymentCheckingReceiver public immutable receiver;

    uint256 public ghostForced;
    uint256 public ghostReceiverMints; // mints that went through the hook-checking contract
    uint256[3] public ghostPaid; // per token, all mint payments ever
    uint256[3] public ghostReleased; // per token, all releases ever
    uint256[3] public ghostMinted; // per token, editions ever minted

    constructor(SnowmoonWIP wip_, uint256[3] memory ids_, address payable[3] memory payouts_) {
        wip = wip_;
        ids = ids_;
        payouts = payouts_;
        receiver = new PaymentCheckingReceiver(wip_);
        for (uint256 i; i < 4; ++i) {
            buyers[i] = makeAddr(string(abi.encodePacked("buyer", vm.toString(i))));
        }
    }

    function mint(uint256 tokenSeed, uint256 buyerSeed, uint256 quantity) external {
        address b = buyers[buyerSeed % 4];
        _mint(tokenSeed % 3, b, b, quantity);
    }

    /// A buyer mints to the contract that accepts the hook and checks the payment was recorded first.
    function mintToContract(uint256 tokenSeed, uint256 buyerSeed, uint256 quantity) external {
        _mint(tokenSeed % 3, buyers[buyerSeed % 4], address(receiver), quantity);
    }

    function _mint(uint256 k, address b, address to, uint256 quantity) internal {
        quantity = bound(quantity, 1, 20);
        if (!wip.isOpen(ids[k])) return;
        uint256 cost = wip.token(ids[k]).price * quantity;
        vm.deal(b, cost);
        receiver.expect(wip.proceeds(ids[k]) + cost, wip.totalProceeds() + cost);
        vm.prank(b);
        wip.mint{value: cost}(ids[k], quantity, to);
        ghostPaid[k] += cost;
        ghostMinted[k] += quantity;
        if (to == address(receiver)) ghostReceiverMints++;
    }

    function release(uint256 tokenSeed, uint256 callerSeed) external {
        uint256 k = tokenSeed % 3;
        uint256 amount = wip.proceeds(ids[k]);
        if (amount == 0) return;
        vm.prank(buyers[callerSeed % 4]);
        wip.release(ids[k]);
        ghostReleased[k] += amount;
    }

    function transfer(uint256 tokenSeed, uint256 fromSeed, uint256 toSeed, uint256 quantity) external {
        uint256 k = tokenSeed % 3;
        address from = buyers[fromSeed % 4];
        uint256 bal = wip.balanceOf(from, ids[k]);
        if (bal == 0) return;
        quantity = bound(quantity, 1, bal);
        vm.prank(from);
        wip.safeTransferFrom(from, buyers[toSeed % 4], ids[k], quantity, "");
    }

    function force(uint256 amount) external {
        amount = bound(amount, 1, 100 ether);
        vm.deal(address(this), amount);
        new ForceSender{value: amount}(payable(address(wip)));
        ghostForced += amount;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 3 days));
    }

    function buyerAt(uint256 i) external view returns (address) {
        return buyers[i];
    }
}

contract SnowmoonWIPInvariantTest is Test {
    SnowmoonWIP wip;
    Handler handler;
    uint256[3] ids;
    address payable[3] payouts;
    bytes32[3] termsHash;

    function setUp() public {
        address owner = makeAddr("owner");
        vm.warp(1_796_662_800 - 1 days);
        wip = new SnowmoonWIP(owner, "Snowmoon WIP", "SMWIP", "ipfs://c");
        payouts = [payable(address(new Payout())), payable(address(new Payout())), payable(address(new Payout()))];
        uint64 start = uint64(block.timestamp + 1 hours);
        vm.startPrank(owner);
        ids[0] = wip.createToken("ipfs://a", 0.002 ether, start, start + 11 days, payouts[0]);
        ids[1] = wip.createToken("ipfs://b", 0.01 ether, start, start + 5 days, payouts[1]);
        ids[2] = wip.createToken("ipfs://c", 1 wei, uint64(block.timestamp), start + 20 days, payouts[2]);
        vm.stopPrank();
        for (uint256 i; i < 3; ++i) {
            termsHash[i] = keccak256(abi.encode(wip.token(ids[i])));
        }
        handler = new Handler(wip, ids, payouts);
        targetContract(address(handler));
    }

    /// Sum of per-token proceeds equals the recorded total, which equals the balance minus forced ETH.
    function invariant_Accounting() public view {
        uint256 sum;
        for (uint256 i; i < 3; ++i) {
            sum += wip.proceeds(ids[i]);
        }
        assertEq(sum, wip.totalProceeds());
        assertEq(address(wip).balance, sum + handler.ghostForced());
    }

    /// Each token's payout got exactly what was released for it; proceeds = paid - released.
    function invariant_PerTokenFlows() public view {
        for (uint256 i; i < 3; ++i) {
            assertEq(payouts[i].balance, handler.ghostReleased(i));
            assertEq(wip.proceeds(ids[i]), handler.ghostPaid(i) - handler.ghostReleased(i));
        }
    }

    /// Editions held by buyers equal editions minted.
    function invariant_Supply() public view {
        for (uint256 i; i < 3; ++i) {
            uint256 held;
            for (uint256 b; b < 4; ++b) {
                held += wip.balanceOf(handler.buyerAt(b), ids[i]);
            }
            held += wip.balanceOf(address(handler.receiver()), ids[i]);
            assertEq(held, handler.ghostMinted(i));
        }
    }

    /// Every mint to the contract ran its hook, and each hook saw its payment already recorded
    /// (otherwise the mint reverts, and fail_on_revert fails the run).
    function afterInvariant() public view {
        assertEq(handler.receiver().hookCalls(), handler.ghostReceiverMints());
    }

    /// Token terms never change.
    function invariant_TermsFixed() public view {
        for (uint256 i; i < 3; ++i) {
            assertEq(keccak256(abi.encode(wip.token(ids[i]))), termsHash[i]);
        }
    }

    /// Forced ETH is never paid out: the contract always holds at least the forced amount.
    function invariant_ForcedEthStays() public view {
        assertGe(address(wip).balance, handler.ghostForced());
    }
}
