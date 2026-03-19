pragma circom 2.1.0;

include "poseidon-bls12381-circom/circuits/poseidon255.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * MerkleProof (BLS12-381)
 *
 * LeanIMT-compatible Merkle tree membership verification using
 * Poseidon hash over the BLS12-381 scalar field (128-bit security).
 *
 * Compile with: circom merkle.circom --r1cs --wasm --prime bls12381
 */
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component hashers[levels];
    component orderMux[levels];
    component isZeroSibling[levels];
    component levelMux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        isZeroSibling[i] = IsZero();
        isZeroSibling[i].in <== pathElements[i];

        orderMux[i] = MultiMux1(2);
        orderMux[i].c[0][0] <== levelHashes[i];
        orderMux[i].c[0][1] <== pathElements[i];
        orderMux[i].c[1][0] <== pathElements[i];
        orderMux[i].c[1][1] <== levelHashes[i];
        orderMux[i].s <== pathIndices[i];

        // Poseidon255 for BLS12-381 (128-bit security)
        hashers[i] = Poseidon255(2);
        hashers[i].inputs[0] <== orderMux[i].out[0];
        hashers[i].inputs[1] <== orderMux[i].out[1];

        levelMux[i] = Mux1();
        levelMux[i].c[0] <== hashers[i].out;
        levelMux[i].c[1] <== levelHashes[i];
        levelMux[i].s <== isZeroSibling[i].out;
        levelHashes[i + 1] <== levelMux[i].out;
    }

    root <== levelHashes[levels];
}

/**
 * LeafIndex - Reconstruct leaf index from path indices
 */
template LeafIndex(levels) {
    signal input pathIndices[levels];
    signal output index;

    component bits2num = Bits2Num(levels);
    for (var i = 0; i < levels; i++) {
        bits2num.in[i] <== pathIndices[i];
    }
    index <== bits2num.out;
}
