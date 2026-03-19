// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "../../interfaces/IAttestationVerifier.sol";
import "../PlonkVerifierBLS12381.sol";

/// @title PlonkMembershipVerifier
/// @notice IAttestationVerifier adapter that verifies PLONK membership proofs on-chain.
///         Uses the BLS12-381 PLONK verifier with EIP-2537 precompiles.
///
///         This verifier checks that a ZK proof demonstrates:
///         "identity ∈ MerkleTree(attestationRoot)"
///
///         Proof format: abi.encode(PlonkVerifierBLS12381.Proof, uint256[] pubSignals)
///         where pubSignals = [identity, attestationRoot]
///
/// @dev Deploy with the circuit-specific verification key from snarkjs:
///      snarkjs plonk setup membership.r1cs pot.ptau membership.zkey
///      snarkjs zkey export verificationkey membership.zkey vk.json
contract PlonkMembershipVerifier is IAttestationVerifier {
    PlonkVerifierBLS12381 public immutable plonkVerifier;

    constructor(PlonkVerifierBLS12381 _plonkVerifier) {
        plonkVerifier = _plonkVerifier;
    }

    /// @notice Verify a PLONK membership proof
    /// @param identity The identity claimed to be in the attestation tree
    /// @param proof ABI-encoded PLONK proof + public signals
    /// @return valid True if the proof verifies
    function verify(
        uint256 identity,
        bytes calldata proof
    ) external view override returns (bool valid) {
        // Decode the PLONK proof and public signals
        (
            PlonkVerifierBLS12381.Proof memory plonkProof,
            uint256[] memory pubSignals
        ) = abi.decode(proof, (PlonkVerifierBLS12381.Proof, uint256[]));

        // Verify public signals match the claimed identity
        // pubSignals[0] = identity, pubSignals[1] = attestationRoot
        require(pubSignals.length >= 1, "Missing public signals");
        require(pubSignals[0] == identity, "Identity mismatch");

        return plonkVerifier.verifyProof(plonkProof, pubSignals);
    }

    function name() external pure override returns (string memory) {
        return "PLONK Membership Verifier (BLS12-381)";
    }

    function attestationType() external pure override returns (string memory) {
        return "PlonkMembership";
    }
}
