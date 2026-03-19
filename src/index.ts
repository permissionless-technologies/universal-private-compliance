/**
 * Universal Private Compliance SDK
 *
 * @packageDocumentation
 *
 * Pluggable zero-knowledge attestation & ASP (Association Set Provider) framework.
 *
 * @example
 * ```typescript
 * import { createASPClient, MemoryProvider } from '@permissionless-technologies/universal-private-compliance'
 *
 * const asp = createASPClient({
 *   provider: new MemoryProvider(),
 *   publicClient,
 *   registryAddress: '0x...',
 * })
 *
 * await asp.addMember(identityCommitment)
 * const proof = await asp.generateProof(identityCommitment)
 * ```
 */

// Core
export {
  MerkleTree,
  buildMerkleTree,
  verifyMerkleProof,
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
} from './core/tree.js'
export {
  generateMembershipProof,
  generateSingleMemberProof,
  generateMultiMemberProof,
  computeMerkleRoot,
  verifyMembershipProof,
} from './core/proof.js'
export {
  computeIdentityFromBabyJubJub,
  computeIdentityFromAddress,
  computeIdentityFromSecret,
} from './core/identity.js'
export { poseidon, isValidFieldElement, FIELD_PRIME } from './core/poseidon.js'
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

// Contract ABIs
export { ASP_REGISTRY_HUB_ABI } from './contracts/abi/ASPRegistryHub.js'
