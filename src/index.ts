/**
 * Universal Private Compliance SDK
 *
 * Default hash: Poseidon over BLS12-381 (128-bit security).
 * Alternative: Poseidon over BN254 (100-bit security) via PoseidonBN254.
 */

// Hash (pluggable)
export type { IHashFunction } from './core/hash/interface.js'
export { PoseidonBN254, BN254_FIELD_PRIME } from './core/hash/poseidon-bn254.js'
export { PoseidonBLS12381, BLS12_381_FIELD_PRIME } from './core/hash/poseidon-bls.js'
export { PoseidonM31, M31_FIELD_PRIME } from './core/hash/poseidon-m31.js'
export {
  hashM31,
  hashTwo,
  computeOwnerHash,
  computeCommitment,
  computeNullifier,
  verifyMerklePath,
  POSEIDON31_DIGEST_SIZE,
  POSEIDON31_SECRET_LIMBS,
} from './core/hash/index.js'
export { getDefaultHashFunction } from './core/hash/index.js'

// Core
export { MerkleTree, buildMerkleTree, verifyMerkleProof, DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH } from './core/tree.js'

// Always-hash tree — STARK-side canonical tree model. Cross-leaf root
// agreement holds by construction; this is what the asp-whitelist's
// STARK-side tree uses to back a single shared `pub_asp_root`.
export {
  AlwaysHashMerkleTree,
  buildAlwaysHashMerkleTree,
  DEFAULT_ALWAYS_HASH_DEPTH,
  MAX_ALWAYS_HASH_DEPTH,
} from './core/always-hash-tree.js'
export type { AlwaysHashMerkleProof } from './core/always-hash-tree.js'
export {
  generateMembershipProof,
  generateSingleMemberProof,
  generateMultiMemberProof,
  computeMerkleRoot,
  verifyMembershipProof,
} from './core/proof.js'

// Transitional compatibility shim — see the helper's docstring before
// using. Not a substitute for an always-hash STARK-side tree model.
export { padLeanIMTProofToDepth } from './core/proof.js'
export type { AIRShapeProof } from './core/proof.js'
export {
  computeIdentityFromBabyJubJub,
  computeIdentityFromAddress,
  computeIdentityFromSecret,
} from './core/identity.js'
export { ASPClient, createASPClient } from './core/client.js'

// Types
export type {
  MerkleProof,
  MembershipProof,
  ASPInfo,
  ASPClientConfig,
  RegisterASPOptions,
  PublishRootOptions,
  IASPProvider,
} from './core/types.js'

// Providers
export { MemoryProvider } from './providers/memory.js'
export { LocalStorageProvider, storePersonalASPId, loadPersonalASPId } from './providers/localStorage.js'
export { RESTProvider } from './providers/rest.js'

// ASP List
export type { ASPEntry, ASPList, ASPType, ASPSecurityLevel } from './core/asp-list.js'
export { parseASPList, getActiveASPs, findASPById, fetchASPProof } from './core/asp-list.js'

// ASP Service Interfaces
export type {
  IEventSource,
  EventSourceStatus,
  IMembershipGate,
  MembershipGateStats,
  ASPRootResponse,
  ASPProofResponse,
  ASPStarkRootResponse,
  ASPStarkProofResponse,
  ASPAddressStatus,
  ASPAddressStatusResponse,
  ASPStatusResponse,
  ASPErrorResponse,
} from './asp/index.js'

// ASP Fetch Helpers — STARK side (BLS side: fetchASPProof from ./core/asp-list)
export { fetchStarkASPRoot, fetchStarkASPProof } from './asp/index.js'
export type { ASPStarkProofData } from './asp/index.js'

// ASP EIP-712 & Signature Helpers
export {
  ASP_EIP712_DOMAIN,
  ASP_EIP712_TYPES,
  ASP_SIGNATURE_MAX_AGE_SECONDS,
  buildASPSignatureMessage,
  getCachedSignature,
  cacheSignature,
  appendSignatureParams,
} from './asp/index.js'

// Contract ABIs
export { ASP_REGISTRY_HUB_ABI } from './contracts/abi/ASPRegistryHub.js'
