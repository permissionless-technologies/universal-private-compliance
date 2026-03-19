// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "../../interfaces/IAttestationVerifier.sol";
import "../../interfaces/IASPRegistry.sol";

/// @title MerkleASPVerifier
/// @notice Wraps ASPRegistryHub as an IAttestationVerifier.
///         Validates that a claimed ASP root is currently valid on-chain.
///
///         Proof format: abi.encode(uint256 aspId, uint256 root)
///         The ZK circuit has already verified the Merkle membership proof —
///         this contract only checks that the root is recognized by the registry.
contract MerkleASPVerifier is IAttestationVerifier {
    IASPRegistryHub public immutable aspHub;

    constructor(IASPRegistryHub _aspHub) {
        aspHub = _aspHub;
    }

    /// @notice Verify that a root is valid for a given ASP
    /// @param identity Not used directly (the ZK circuit already bound identity to the root)
    /// @param proof abi.encode(uint256 aspId, uint256 root)
    function verify(
        uint256 identity,
        bytes calldata proof
    ) external view override returns (bool valid) {
        (uint256 aspId, uint256 root) = abi.decode(proof, (uint256, uint256));
        return aspHub.isValidASPRoot(aspId, root);
    }

    function name() external pure override returns (string memory) {
        return "Merkle ASP Verifier";
    }

    function attestationType() external pure override returns (string memory) {
        return "MerkleASP";
    }
}
