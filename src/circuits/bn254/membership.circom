pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "./merkle.circom";

/**
 * MembershipProof (BN254)
 *
 * Proves that an identity is a member of an attestation tree.
 * Uses Poseidon hash over the BN254 field (~100-bit security).
 *
 * NOTE: For institutional compliance, prefer the BLS12-381 variant
 * (128-bit security) in ../bls12381/membership.circom.
 *
 * Proof system: PLONK (universal trusted setup, no per-circuit ceremony)
 * Compile:      circom membership.circom --r1cs --wasm
 * Setup:        snarkjs plonk setup membership.r1cs pot.ptau membership.zkey
 *
 * Consumer protocols embed this template in their own circuits:
 *   component asp = MembershipProof(20);
 *   asp.identity <== myIdentitySignal;
 *   asp.attestationRoot <== aspRootPublicInput;
 */
template MembershipProof(levels) {
    signal input identity;
    signal input attestationRoot;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component merkle = MerkleProof(levels);
    merkle.leaf <== identity;

    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    merkle.root === attestationRoot;
}
