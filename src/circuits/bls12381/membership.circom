pragma circom 2.1.0;

include "./merkle.circom";

/**
 * MembershipProof (BLS12-381)
 *
 * Proves that an identity is a member of an attestation tree
 * using Poseidon hash over the BLS12-381 scalar field (128-bit security).
 *
 * This is the core circuit template for Universal Private Compliance.
 * Consumer protocols embed this template in their own circuits to
 * require attestation as part of their ZK proofs.
 *
 * Proof system: PLONK (universal trusted setup, no per-circuit ceremony)
 * Compile:      circom membership.circom --r1cs --wasm --prime bls12381
 * Setup:        snarkjs plonk setup membership.r1cs pot.ptau membership.zkey
 * Prove:        snarkjs plonk prove membership.zkey witness.wtns proof.json public.json
 * Verify:       snarkjs plonk verify verification_key.json public.json proof.json
 *
 * Trusted setup: Perpetual Powers of Tau BLS12-381 (Phase 1 only, Phase 2 is deterministic)
 *   https://github.com/privacy-ethereum/perpetualpowersoftau
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
