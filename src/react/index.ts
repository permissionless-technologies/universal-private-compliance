/**
 * React module — optional hooks for React applications
 */

export { useASP, storePersonalASPId } from './use-asp.js'
export type { UseASPConfig, ASPStatus, UseASPReturn } from './use-asp.js'

export { useASPRegistry } from './use-asp-registry.js'
export type { UseASPRegistryConfig, UseASPRegistryReturn } from './use-asp-registry.js'

export { useASPTreeManager } from './use-asp-tree-manager.js'
export type { UseASPTreeManagerConfig, UseASPTreeManagerReturn } from './use-asp-tree-manager.js'

// Platform-managed ASP hooks
export { useASPMembership } from './use-asp-membership.js'
export type { UseASPMembershipConfig, UseASPMembershipReturn, ASPMembershipStatus } from './use-asp-membership.js'

export { useASPProof } from './use-asp-proof.js'
export type { UseASPProofConfig, UseASPProofReturn, ASPProofData } from './use-asp-proof.js'
