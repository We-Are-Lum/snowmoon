// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.28;

/// @title IEditionSeller
/// @notice What the Snowmoon editions collection needs from any seller: one call, once per edition, at the
///         edition's creation, carrying the seller's settings for that edition. A seller then sells by calling
///         `SnowmoonEditions.mint`, which only that edition's seller may call and which never goes past the
///         edition's size.
interface IEditionSeller {
    /// @notice Called by the collection inside `createEdition`, in the same transaction. A seller must accept it
    ///         only from its own collection, only once per edition, and revert if `data` isn't valid for it
    ///         (which makes the whole `createEdition` revert).
    /// @param id        The new edition's id.
    /// @param maxSupply The edition's size (1 to 256), fixed for good.
    /// @param payout    The edition's payout address, fixed for good.
    /// @param data      The seller's own settings for this edition, fixed for good.
    /// @return magic    Must be `IEditionSeller.configure.selector`, so a contract that merely doesn't revert (a
    ///                  permissive fallback, a wallet) can't be made a seller by mistake.
    function configure(uint256 id, uint256 maxSupply, address payout, bytes calldata data)
        external
        returns (bytes4 magic);
}
