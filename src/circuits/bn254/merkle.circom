pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * MerkleProof - Verify membership in a LeanIMT-compatible Merkle tree
 *
 * LeanIMT uses Poseidon(left, right) for internal nodes.
 * Path indices indicate position: 0 = left child, 1 = right child
 *
 * LeanIMT single-child optimization: when sibling is 0, propagate
 * the current hash instead of hashing. This allows variable-depth
 * trees to be verified with fixed-depth circuits.
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
        // Constrain pathIndices to be binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Check if sibling is zero (LeanIMT single-child case)
        isZeroSibling[i] = IsZero();
        isZeroSibling[i].in <== pathElements[i];

        // Select ordering based on position
        orderMux[i] = MultiMux1(2);
        orderMux[i].c[0][0] <== levelHashes[i];
        orderMux[i].c[0][1] <== pathElements[i];
        orderMux[i].c[1][0] <== pathElements[i];
        orderMux[i].c[1][1] <== levelHashes[i];
        orderMux[i].s <== pathIndices[i];

        // Hash parent node
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== orderMux[i].out[0];
        hashers[i].inputs[1] <== orderMux[i].out[1];

        // LeanIMT optimization: if sibling is 0, propagate current hash
        // Otherwise, use the computed hash
        levelMux[i] = Mux1();
        levelMux[i].c[0] <== hashers[i].out;  // sibling != 0: use hash
        levelMux[i].c[1] <== levelHashes[i];   // sibling == 0: propagate
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
