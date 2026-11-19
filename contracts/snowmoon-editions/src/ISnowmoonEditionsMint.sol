// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

/// @title ISnowmoonEditionsMint
/// @notice The one collection function a seller calls.
interface ISnowmoonEditionsMint {
    /// @notice Mint `quantity` pieces of edition `id` to `to`. Only that edition's seller may call it, and it
    ///         never takes the edition past its size.
    function mint(address to, uint256 id, uint256 quantity) external;
}
