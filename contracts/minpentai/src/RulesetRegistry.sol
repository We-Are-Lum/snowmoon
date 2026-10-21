// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;

/// @title Minpentai ruleset registry (snowmoon.party, onchain v1 spike)
/// @notice An append-only list of rulesets. A ruleset's ID is the keccak256 of its manifest's
/// canonical JSON (RFC 8785); the manifest pins the engine that replays matches recorded under it.
/// The owner can add a ruleset. Nobody, the owner included, can change or remove one once added,
/// and the owner can never be changed. There is no proxy and nothing to upgrade.
contract RulesetRegistry {
    struct Ruleset {
        string manifestURI;
        address author;
        bytes32 remixedFrom;
        uint64 addedAt;
    }

    address public immutable owner;
    mapping(bytes32 id => Ruleset) private _rulesets;
    bytes32[] private _ids;

    event RulesetAdded(bytes32 indexed id, bytes32 indexed remixedFrom, address indexed author, string manifestURI);

    error NotOwner();
    error ZeroId();
    error EmptyURI();
    error AlreadyAdded(bytes32 id);
    error UnknownRuleset(bytes32 id);

    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Add a ruleset. `remixedFrom` is zero or a ruleset already added.
    function add(bytes32 id, string calldata manifestURI, address author, bytes32 remixedFrom) external {
        if (msg.sender != owner) revert NotOwner();
        if (id == bytes32(0)) revert ZeroId();
        if (bytes(manifestURI).length == 0) revert EmptyURI();
        if (_rulesets[id].addedAt != 0) revert AlreadyAdded(id);
        if (remixedFrom != bytes32(0) && _rulesets[remixedFrom].addedAt == 0) revert UnknownRuleset(remixedFrom);
        _rulesets[id] = Ruleset(manifestURI, author, remixedFrom, uint64(block.timestamp));
        _ids.push(id);
        emit RulesetAdded(id, remixedFrom, author, manifestURI);
    }

    function get(bytes32 id) external view returns (Ruleset memory r) {
        r = _rulesets[id];
        if (r.addedAt == 0) revert UnknownRuleset(id);
    }

    function isAdded(bytes32 id) external view returns (bool) {
        return _rulesets[id].addedAt != 0;
    }

    function count() external view returns (uint256) {
        return _ids.length;
    }

    function idAt(uint256 i) external view returns (bytes32) {
        return _ids[i];
    }
}
