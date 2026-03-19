// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "../interfaces/IAttestationVerifier.sol";

/// @title AttestationHub
/// @notice On-chain registry of attestation verifiers.
///         Consumer protocols call hub.verify() which delegates to the appropriate verifier.
contract AttestationHub {
    // ============ State ============

    uint256 public nextVerifierId = 1;
    mapping(uint256 => IAttestationVerifier) public verifiers;
    mapping(uint256 => address) public verifierOwners;

    // ============ Events ============

    event VerifierRegistered(
        uint256 indexed verifierId,
        address indexed owner,
        address verifierAddress,
        string name,
        string attestationType
    );

    // ============ External Functions ============

    /// @notice Register a new attestation verifier
    /// @param verifier The verifier contract to register
    /// @return verifierId The assigned verifier identifier
    function registerVerifier(IAttestationVerifier verifier) external returns (uint256 verifierId) {
        verifierId = nextVerifierId++;

        verifiers[verifierId] = verifier;
        verifierOwners[verifierId] = msg.sender;

        emit VerifierRegistered(
            verifierId,
            msg.sender,
            address(verifier),
            verifier.name(),
            verifier.attestationType()
        );
    }

    /// @notice Verify an attestation through a registered verifier
    /// @param verifierId The verifier to use
    /// @param identity The identity to verify
    /// @param proof Proof data (format depends on the verifier backend)
    /// @return valid Whether the attestation is valid
    function verify(
        uint256 verifierId,
        uint256 identity,
        bytes calldata proof
    ) external view returns (bool valid) {
        IAttestationVerifier verifier = verifiers[verifierId];
        require(address(verifier) != address(0), "Verifier not registered");
        return verifier.verify(identity, proof);
    }

    /// @notice Get the verifier contract for a given ID
    /// @param verifierId The verifier identifier
    /// @return The verifier contract
    function getVerifier(uint256 verifierId) external view returns (IAttestationVerifier) {
        return verifiers[verifierId];
    }
}
