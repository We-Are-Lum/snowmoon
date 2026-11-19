// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SnowmoonEditions} from "../src/SnowmoonEditions.sol";
import {LadderSeller} from "../src/LadderSeller.sol";

/// @notice Read-only: builds the Safe transaction that creates one ladder edition, checks it against the chain,
///         prints the calldata and the full price ladder, and writes a Safe Transaction Builder file.
/// @dev Sends nothing. The Safe's signers load the JSON in the Safe app (Transaction Builder, "Load") and sign it.
///
///   EDITIONS=0x.. SELLER=0x.. URI=ipfs://<cid> SIZE=256 PAYOUT=0x<split> \
///   START_PRICE_WEI=500000000000000 TOP_PRICE_WEI=500000000000000000 START_TIME=0 \
///   forge script script/EditionTx.s.sol --rpc-url sepolia
///
/// Writes safe-tx/create-edition-<next id>-<chain id>.json.
contract EditionTx is Script {
    struct Params {
        SnowmoonEditions editions;
        LadderSeller seller;
        string uri;
        uint256 size;
        address payout;
        uint256 startPrice;
        uint256 topPrice;
        uint64 startTime;
    }

    function run() external {
        Params memory p;
        p.editions = SnowmoonEditions(vm.envAddress("EDITIONS"));
        p.seller = LadderSeller(vm.envAddress("SELLER"));
        p.uri = vm.envString("URI");
        p.size = vm.envUint("SIZE");
        p.payout = vm.envAddress("PAYOUT");
        p.startPrice = vm.envUint("START_PRICE_WEI");
        p.topPrice = vm.envUint("TOP_PRICE_WEI");
        p.startTime = uint64(vm.envOr("START_TIME", uint256(0)));

        require(p.seller.collection() == address(p.editions), "seller is bound to another collection");
        require(p.payout.code.length > 0, "PAYOUT has no code: create the split first");
        bytes memory data = calldataFor(p);
        uint256 nextId = p.editions.editionCount() + 1;
        uint256 allowedAt = p.editions.nextEditionAllowedAt();
        console2.log("collection       ", address(p.editions));
        console2.log("creator (Safe)   ", p.editions.creator());
        console2.log("next edition id  ", nextId);
        console2.log("allowed from     ", allowedAt, allowedAt > block.timestamp ? "(NOT YET: the Safe tx would fail)" : "(ok now)");

        _simulateAndPrint(p, data);

        console2.log("to     ", address(p.editions));
        console2.log("value  0");
        console2.logBytes(data);
        string memory dir = "safe-tx";
        vm.createDir(dir, true);
        string memory path = string.concat(dir, "/create-edition-", vm.toString(nextId), "-", vm.toString(block.chainid), ".json");
        vm.writeFile(path, _builderJson(address(p.editions), data, nextId));
        console2.log("wrote", path);
    }

    /// The createEdition calldata for these settings (also used by the fork rehearsal).
    function calldataFor(Params memory p) public pure returns (bytes memory) {
        bytes memory sellerData = abi.encode(p.startPrice, p.topPrice, uint256(p.startTime));
        return abi.encodeCall(SnowmoonEditions.createEdition, (p.uri, p.size, address(p.seller), p.payout, sellerData));
    }

    /// Runs the creation locally as the creator (nothing is sent) and prints the ladder the seller will charge.
    function _simulateAndPrint(Params memory p, bytes memory data) internal {
        vm.prank(p.editions.creator());
        (bool ok, bytes memory ret) = address(p.editions).call(data);
        require(ok, "createEdition would revert (rate limit, size, or settings)");
        uint256 id = abi.decode(ret, (uint256));
        uint256 total;
        for (uint256 n = 1; n <= p.size; ++n) {
            uint256 price = p.seller.priceOf(id, n);
            total += price;
            if (n <= 3 || n + 3 > p.size || n % 32 == 0) {
                console2.log(string.concat("  piece ", vm.toString(n), ": ", _eth(price), " ETH"));
            }
        }
        console2.log(string.concat("  whole edition: ", _eth(total), " ETH"));
    }

    function _eth(uint256 wei_) internal pure returns (string memory) {
        uint256 micro = wei_ / 1e12; // whole steps of 0.000001 ETH
        string memory frac = vm.toString(1e6 + micro % 1e6);
        bytes memory f = bytes(frac);
        bytes memory six = new bytes(6);
        for (uint256 i; i < 6; ++i) six[i] = f[i + 1];
        return string.concat(vm.toString(micro / 1e6), ".", string(six));
    }

    function _builderJson(address to, bytes memory data, uint256 id) internal view returns (string memory) {
        return string.concat(
            '{"version":"1.0","chainId":"', vm.toString(block.chainid),
            '","createdAt":', vm.toString(block.timestamp * 1000),
            ',"meta":{"name":"Snowmoon WIP: create edition ', vm.toString(id),
            '","description":"SnowmoonEditions.createEdition, built by script/EditionTx.s.sol"},',
            '"transactions":[{"to":"', vm.toString(to), '","value":"0","data":"', vm.toString(data),
            '","contractMethod":null,"contractInputsValues":null}]}'
        );
    }
}
