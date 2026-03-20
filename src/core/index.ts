/**
 * Core module — tree, proof generation, identity, types, hash
 */

// Hash (pluggable)
export type { IHashFunction } from './hash/interface.js'
export { PoseidonBN254, BN254_FIELD_PRIME } from './hash/poseidon-bn254.js'
export { PoseidonBLS12381, BLS12_381_FIELD_PRIME } from './hash/poseidon-bls.js'
export { getDefaultHashFunction } from './hash/index.js'

// Tree
export { MerkleTree, buildMerkleTree, verifyMerkleProof, DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH } from './tree.js'

// Proof
export {
  generateMembershipProof,
  generateSingleMemberProof,
  generateMultiMemberProof,
  computeMerkleRoot,
  verifyMembershipProof,
} from './proof.js'

// Identity
export {
  computeIdentityFromBabyJubJub,
  computeIdentityFromAddress,
  computeIdentityFromSecret,
} from './identity.js'

// Legacy Poseidon (convenience — use hash module for new code)
export { poseidon, isValidFieldElement, FIELD_PRIME } from './poseidon.js'

// Client
export { ASPClient, createASPClient } from './client.js'

// Types
export type {
  MerkleProof,
  MembershipProof,
  ASPInfo,
  ASPClientConfig,
  RegisterASPOptions,
  PublishRootOptions,
  IASPProvider,
} from './types.js'

// ASP List
export type { ASPEntry, ASPList, ASPType, ASPSecurityLevel } from './asp-list.js'
export { parseASPList, getActiveASPs, findASPById, fetchASPProof } from './asp-list.js'
