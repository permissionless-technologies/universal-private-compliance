// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "../interfaces/IASPRegistry.sol";

/// @title ASP Registry Hub
/// @notice Manages multiple ASP (Association Set Provider) whitelists.
///         Each ASP maintains its own Merkle tree root of approved identities.
contract ASPRegistryHub is IASPRegistryHub {
    // ============ State ============

    uint256 public nextASPId = 1;
    mapping(uint256 => ASPInfo) public asps;

    // Root history for each ASP
    uint256 public constant ROOT_HISTORY_SIZE = 64;
    mapping(uint256 => mapping(uint256 => uint256)) public aspRootHistory;
    mapping(uint256 => uint256) public aspRootIndex;

    // ============ Events ============

    event ASPRegistered(uint256 indexed aspId, address indexed operator, string name);
    event ASPRootUpdated(uint256 indexed aspId, uint256 oldRoot, uint256 newRoot);

    // ============ External Functions ============

    /// @notice Register a new ASP
    function registerASP(string calldata name) external returns (uint256 aspId) {
        aspId = nextASPId++;

        asps[aspId] = ASPInfo({
            id: aspId,
            operator: msg.sender,
            name: name,
            currentRoot: 0,
            lastUpdated: block.timestamp
        });

        emit ASPRegistered(aspId, msg.sender, name);
    }

    /// @notice Update an ASP's whitelist root
    function updateRoot(uint256 aspId, uint256 newRoot) external {
        ASPInfo storage asp = asps[aspId];
        require(asp.operator == msg.sender, "Not ASP operator");

        uint256 oldRoot = asp.currentRoot;
        asp.currentRoot = newRoot;
        asp.lastUpdated = block.timestamp;

        // Store in history
        uint256 nextIndex = (aspRootIndex[aspId] + 1) % ROOT_HISTORY_SIZE;
        aspRootHistory[aspId][nextIndex] = newRoot;
        aspRootIndex[aspId] = nextIndex;

        emit ASPRootUpdated(aspId, oldRoot, newRoot);
    }

    /// @notice Check if a root is valid for an ASP
    function isValidASPRoot(uint256 aspId, uint256 root) external view returns (bool) {
        if (root == 0) return false;
        if (asps[aspId].operator == address(0)) return false;

        // Check current root first
        if (asps[aspId].currentRoot == root) return true;

        // Check history
        uint256 index = aspRootIndex[aspId];
        for (uint256 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            if (aspRootHistory[aspId][index] == root) return true;
            if (index == 0) {
                index = ROOT_HISTORY_SIZE - 1;
            } else {
                index--;
            }
        }

        return false;
    }

    /// @notice Get current root for an ASP
    function getCurrentRoot(uint256 aspId) external view returns (uint256) {
        return asps[aspId].currentRoot;
    }

    /// @notice Get ASP info
    function getASP(uint256 aspId) external view returns (ASPInfo memory) {
        return asps[aspId];
    }
}
