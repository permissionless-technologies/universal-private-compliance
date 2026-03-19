pragma circom 2.1.0;

include "./merkle.circom";

/**
 * MembershipProof
 * ===============
 *
 * Proves that an identity is a member of an attestation tree.
 *
 * This is the core circuit template for Universal Private Compliance.
 * Consumer protocols embed this template in their own circuits to
 * require attestation as part of their ZK proofs.
 *
 * The attestation tree structure:
 *   leaf = identity (ZK commitment: Poseidon(key) or raw address)
 *   root = ASP operator's published root (updated as members are added/removed)
 *
 * Usage in consumer circuits:
 *   component asp = MembershipProof(20);
 *   asp.identity <== myIdentitySignal;
 *   asp.attestationRoot <== aspRootPublicInput;
 *   // ... feed path elements and indices ...
 */
template MembershipProof(levels) {
    signal input identity;                         // The identity to prove membership for
    signal input attestationRoot;                  // The ASP's published Merkle root
    signal input pathElements[levels];             // Merkle proof path
    signal input pathIndices[levels];              // Position in tree

    // Verify the identity is in the attestation tree
    component merkle = MerkleProof(levels);
    merkle.leaf <== identity;

    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    // Constrain the computed root to match the attestation root
    merkle.root === attestationRoot;
}

/**
 * OptionalMembershipProof
 * =======================
 *
 * For circuits that need a bypass mechanism (e.g., ragequit in UPP).
 *
 * - If bypass = 0: must prove membership
 * - If bypass = 1: skip membership check
 */
template OptionalMembershipProof(levels) {
    signal input identity;
    signal input attestationRoot;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input bypass;                          // 0 or 1

    // Constrain bypass to be binary
    bypass * (1 - bypass) === 0;

    // Compute the membership proof
    component merkle = MerkleProof(levels);
    merkle.leaf <== identity;

    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    // If not bypassed, root must match. If bypassed, this check is skipped.
    signal rootDiff <== attestationRoot - merkle.root;
    signal mustMatch <== 1 - bypass;
    rootDiff * mustMatch === 0;
}
