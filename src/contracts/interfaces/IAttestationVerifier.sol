// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

/// @title IAttestationVerifier
/// @notice Standard interface for any attestation verification backend.
///         Implement this to plug in Merkle ASPs, Semaphore, WorldID, zkPass, or custom logic.
interface IAttestationVerifier {
    /// @notice Verify that an identity holds a specific attestation
    /// @param identity The ZK identity commitment (or other identifier)
    /// @param proof Arbitrary proof data (format depends on backend)
    /// @return valid Whether the attestation is verified
    function verify(
        uint256 identity,
        bytes calldata proof
    ) external view returns (bool valid);

    /// @notice Human-readable name of this verifier
    function name() external view returns (string memory);

    /// @notice What type of attestation this verifier checks (e.g., "KYC", "Age18+", "SanctionsClear")
    function attestationType() external view returns (string memory);
}
