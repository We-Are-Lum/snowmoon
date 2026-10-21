// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// Behaves like the EIP-2935 history contract for tests: 32 bytes of calldata (a block number) in,
/// that block's hash out; reverts for the current or a future block, for blocks more than 8,191
/// back, and for anything else. Hashes are set by the test (forge does not fill the real contract).
contract MockHistory {
    mapping(uint256 => bytes32) public hashes;

    function set(uint256 n, bytes32 h) external {
        hashes[n] = h;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        require(input.length == 32);
        uint256 n = abi.decode(input, (uint256));
        require(n < block.number && block.number - n <= 8191);
        return abi.encode(hashes[n]);
    }
}
