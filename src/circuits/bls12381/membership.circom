pragma circom 2.1.0;

include "./merkle.circom";

/**
 * MembershipProof (BLS12-381)
 *
 * Proves that an identity is a member of an attestation tree
 * using Poseidon hash over the BLS12-381 scalar field (128-bit security).
 *
 * Compile with: circom membership.circom --r1cs --wasm --prime bls12381
 *
 * Trusted setup: Use Perpetual Powers of Tau BLS12-381 .ptau files
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

/**
 * OptionalMembershipProof (BLS12-381)
 *
 * For circuits that need a bypass mechanism (e.g., ragequit in UPP).
 */
template OptionalMembershipProof(levels) {
    signal input identity;
    signal input attestationRoot;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input bypass;

    bypass * (1 - bypass) === 0;

    component merkle = MerkleProof(levels);
    merkle.leaf <== identity;

    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    signal rootDiff <== attestationRoot - merkle.root;
    signal mustMatch <== 1 - bypass;
    rootDiff * mustMatch === 0;
}
