// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {SnowmoonWIP} from "../../src/SnowmoonWIP.sol";

/// @dev A contract that rejects every ETH transfer (no receive, no fallback).
contract EthRejecter {}

/// @dev A payout stand-in: a deployed contract that accepts ETH (a PushSplit in production).
contract Payout {
    receive() external payable {}
}

/// @dev Sends its balance to any address by self-destructing (EIP-6780 still moves the ETH).
contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev A receiver that, inside onERC1155Received, re-enters `mint` and `release`.
///      With `swallow` it catches the re-entry's revert and lets the outer mint finish;
///      without, the re-entry's revert bubbles up and the whole outer mint reverts.
contract ReentrantReceiver is IERC1155Receiver {
    SnowmoonWIP public immutable wip;
    bool public swallow;
    uint256 public reentryAttempts;
    uint256 public reentrySuccesses;
    bytes public lastMintError;
    bytes public lastReleaseError;

    constructor(SnowmoonWIP wip_, bool swallow_) payable {
        wip = wip_;
        swallow = swallow_;
    }

    function buy(uint256 id, uint256 quantity) external payable {
        wip.mint{value: msg.value}(id, quantity, address(this));
    }

    function onERC1155Received(address, address, uint256 id, uint256, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(wip)) return this.onERC1155Received.selector;
        if (reentryAttempts > 0) return this.onERC1155Received.selector; // only once
        reentryAttempts++;
        uint256 price = wip.token(id).price;

        if (swallow) {
            try wip.mint{value: price}(id, 1, address(this)) {
                reentrySuccesses++;
            } catch (bytes memory err) {
                lastMintError = err;
            }
            try wip.release(id) {
                reentrySuccesses++;
            } catch (bytes memory err) {
                lastReleaseError = err;
            }
        } else {
            wip.mint{value: price}(id, 1, address(this));
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == 0x01ffc9a7;
    }
}

/// @dev A payout that re-enters `release` (and `mint`) when it receives ETH.
contract ReentrantPayout {
    SnowmoonWIP public wip;
    uint256 public targetId;
    bytes public lastError;
    uint256 public received;

    function arm(SnowmoonWIP wip_, uint256 id) external {
        wip = wip_;
        targetId = id;
    }

    receive() external payable {
        received += msg.value;
        try wip.release(targetId) {}
        catch (bytes memory err) {
            lastError = err;
        }
    }
}

/// @dev A receiver that accepts the hook and, inside onERC1155Received, requires that this mint's payment
///      is already recorded: proceeds(id) and totalProceeds() must equal what the caller set with `expect`.
///      If the payment were recorded after `_mint`, the hook would see the old values and revert.
contract PaymentCheckingReceiver is IERC1155Receiver {
    SnowmoonWIP public immutable wip;
    uint256 public expectedProceeds;
    uint256 public expectedTotal;
    uint256 public hookCalls;
    uint256 public seenProceeds;
    uint256 public seenTotal;

    error PaymentNotRecordedYet(uint256 proceeds, uint256 expectedProceeds, uint256 total, uint256 expectedTotal);

    constructor(SnowmoonWIP wip_) {
        wip = wip_;
    }

    function expect(uint256 proceeds_, uint256 total_) external {
        expectedProceeds = proceeds_;
        expectedTotal = total_;
    }

    function onERC1155Received(address, address, uint256 id, uint256, bytes calldata) external returns (bytes4) {
        if (msg.sender == address(wip)) {
            hookCalls++;
            seenProceeds = wip.proceeds(id);
            seenTotal = wip.totalProceeds();
            if (seenProceeds != expectedProceeds || seenTotal != expectedTotal) {
                revert PaymentNotRecordedYet(seenProceeds, expectedProceeds, seenTotal, expectedTotal);
            }
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == 0x01ffc9a7;
    }
}
