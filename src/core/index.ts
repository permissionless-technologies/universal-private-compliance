/**
 * Core module — tree, proof generation, identity, types
 */

export { MerkleTree, buildMerkleTree, verifyMerkleProof, DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH } from './tree.js'
export {
  generateMembershipProof,
  generateSingleMemberProof,
  generateMultiMemberProof,
  computeMerkleRoot,
  verifyMembershipProof,
} from './proof.js'
export {
  computeIdentityFromBabyJubJub,
  computeIdentityFromAddress,
  computeIdentityFromSecret,
} from './identity.js'
export { poseidon, isValidFieldElement, FIELD_PRIME } from './poseidon.js'
export { ASPClient, createASPClient } from './client.js'
export type {
  MerkleProof,
  MembershipProof,
  ASPInfo,
  ASPClientConfig,
  RegisterASPOptions,
  PublishRootOptions,
  IASPProvider,
} from './types.js'
