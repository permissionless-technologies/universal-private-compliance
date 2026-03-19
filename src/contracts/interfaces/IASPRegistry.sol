// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

/// @notice ASP Registry Hub interface
/// @dev Manages multiple ASP (Association Set Provider) whitelists
interface IASPRegistryHub {
    /// @notice Check if an ASP root is valid for a given ASP ID
    /// @param aspId The ASP identifier
    /// @param root The claimed ASP Merkle root
    /// @return True if the root is currently valid for that ASP
    function isValidASPRoot(uint256 aspId, uint256 root) external view returns (bool);

    /// @notice Get current ASP root for an ASP ID
    /// @param aspId The ASP identifier
    /// @return The current root of that ASP's whitelist tree
    function getCurrentRoot(uint256 aspId) external view returns (uint256);

    /// @notice Register a new ASP
    /// @param name Human-readable name for the ASP
    /// @return aspId The assigned ASP identifier
    function registerASP(string calldata name) external returns (uint256 aspId);

    /// @notice Update an ASP's root (only ASP operator)
    /// @param aspId The ASP identifier
    /// @param newRoot The new whitelist root
    function updateRoot(uint256 aspId, uint256 newRoot) external;
}

/// @notice Individual ASP information
struct ASPInfo {
    uint256 id;
    address operator;
    string name;
    uint256 currentRoot;
    uint256 lastUpdated;
}
