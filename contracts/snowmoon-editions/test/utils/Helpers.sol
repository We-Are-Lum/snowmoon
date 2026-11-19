// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {SnowmoonEditions} from "../../src/SnowmoonEditions.sol";
import {LadderSeller} from "../../src/LadderSeller.sol";
import {IEditionSeller} from "../../src/IEditionSeller.sol";

/// @dev Rejects every ETH transfer.
contract EthRejecter {
    receive() external payable {
        revert("no ETH");
    }
}

/// @dev Accepts ETH, has no ERC-1155 receiver hooks.
contract NonReceiver {
    receive() external payable {}
}

/// @dev Accepts ERC-1155 tokens and ETH.
contract Holder is IERC1155Receiver {
    receive() external payable {}

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IERC1155Receiver).interfaceId;
    }
}

/// @dev A seller that does nothing in configure and lets anyone ask it to mint: stands in for a buggy or hostile
///      seller. It can still only mint its own editions, and never past their size.
contract RogueSeller is IEditionSeller {
    SnowmoonEditions public immutable collection;
    bool public mintInConfigure;

    constructor(SnowmoonEditions c) {
        collection = c;
    }

    function setMintInConfigure(bool v) external {
        mintInConfigure = v;
    }

    function configure(uint256 id, uint256 maxSupply, address, bytes calldata) external returns (bytes4) {
        if (mintInConfigure) collection.mint(address(this), id, maxSupply);
        return IEditionSeller.configure.selector;
    }

    function mintAny(address to, uint256 id, uint256 quantity) external {
        collection.mint(to, id, quantity);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}

/// @dev A contract whose fallback accepts any call: it must not be accepted as a seller.
contract PermissiveFallback {
    fallback() external payable {}
}

/// @dev A buyer that tries to reenter while it receives the token and while it receives its refund.
contract ReentrantBuyer is IERC1155Receiver {
    LadderSeller public immutable seller;
    uint256 public id;
    uint256 public attemptsOnToken;
    uint256 public attemptsOnRefund;
    bytes public lastError;
    enum Mode {
        None,
        MintOnToken,
        MintOnRefund,
        ReleaseOnRefund
    }
    Mode public mode;

    constructor(LadderSeller s) {
        seller = s;
    }

    function buy(uint256 id_, uint256 quantity, Mode m) external payable {
        id = id_;
        mode = m;
        seller.mint{value: msg.value}(id_, quantity, address(this));
    }

    receive() external payable {
        if (mode == Mode.MintOnRefund) {
            attemptsOnRefund++;
            try seller.mint{value: address(this).balance}(id, 1, address(this)) {} catch (bytes memory e) {
                lastError = e;
                revert("reentry blocked"); // makes the refund fail, so the whole mint reverts
            }
        } else if (mode == Mode.ReleaseOnRefund) {
            attemptsOnRefund++;
            try seller.release(id) {} catch (bytes memory e) {
                lastError = e;
            }
        }
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        if (mode == Mode.MintOnToken) {
            attemptsOnToken++;
            try seller.mint{value: address(this).balance}(id, 1, address(this)) {} catch (bytes memory e) {
                lastError = e;
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

    function supportsInterface(bytes4 i) external pure returns (bool) {
        return i == type(IERC1155Receiver).interfaceId;
    }
}

/// @dev A payout address that tries to reenter release and mint while it receives ETH.
contract ReentrantPayout {
    LadderSeller public immutable seller;
    uint256 public id;
    uint256 public attempts;
    bool public releaseBlocked;
    bool public mintBlocked;

    constructor(LadderSeller s) {
        seller = s;
    }

    function setId(uint256 id_) external {
        id = id_;
    }

    receive() external payable {
        attempts++;
        try seller.release(id) {} catch {
            releaseBlocked = true;
        }
        try seller.mint{value: msg.value}(id, 1, address(this)) {} catch {
            mintBlocked = true;
        }
    }
}

abstract contract Base is Test {
    SnowmoonEditions internal editions;
    LadderSeller internal seller;

    address internal creator = makeAddr("creator (Safe)");
    address internal payoutA = makeAddr("payout A (split)");
    address internal payoutB = makeAddr("payout B (split)");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant START = 0.0005 ether;
    uint256 internal constant TOP = 0.5 ether;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        editions = new SnowmoonEditions(creator, "ipfs://collection");
        seller = new LadderSeller(address(editions));
        vm.deal(buyer, 1_000 ether);
    }

    function _data(uint256 start, uint256 top, uint64 startTime) internal pure returns (bytes memory) {
        return abi.encode(start, top, uint256(startTime));
    }

    function _create(uint256 size, uint256 start, uint256 top, address payout) internal returns (uint256 id) {
        vm.prank(creator);
        id = editions.createEdition("ipfs://edition", size, address(seller), payout, _data(start, top, 0));
    }

    function _create(uint256 size) internal returns (uint256) {
        return _create(size, START, TOP, payoutA);
    }

    function _buy(uint256 id, uint256 quantity) internal returns (uint256 cost) {
        cost = seller.quote(id, quantity);
        vm.prank(buyer);
        seller.mint{value: cost}(id, quantity, buyer);
    }

    function _buyAll(uint256 id) internal {
        uint256 left = seller.remaining(id);
        while (left > 0) {
            uint256 q = left > 10 ? 10 : left;
            _buy(id, q);
            left -= q;
        }
    }
}
