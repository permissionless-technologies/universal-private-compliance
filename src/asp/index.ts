/**
 * ASP Service Interfaces
 *
 * Standard interfaces for building ASP (Association Set Provider) services.
 * Implementations live in separate packages (e.g., @permissionless-technologies/upc-asp-whitelist).
 */

// Event Source — "Where do addresses come from?"
export type { IEventSource, EventSourceStatus } from './event-source.js'

// Membership Gate — "Who gets whitelisted?"
export type { IMembershipGate, MembershipGateStats } from './membership-gate.js'

// API Schema — Standard response types
export type {
  ASPRootResponse,
  ASPProofResponse,
  ASPStarkRootResponse,
  ASPStarkProofResponse,
  ASPAddressStatus,
  ASPAddressStatusResponse,
  ASPStatusResponse,
  ASPErrorResponse,
} from './api-schema.js'

// Fetch Helpers — Plain (non-React) async helpers for STARK endpoints
export { fetchStarkASPRoot, fetchStarkASPProof } from './fetch-helpers.js'
export type { ASPStarkProofData } from './fetch-helpers.js'

// EIP-712 — Signature constants for gated endpoints
export {
  ASP_EIP712_DOMAIN,
  ASP_EIP712_TYPES,
  ASP_SIGNATURE_MAX_AGE_SECONDS,
} from './eip712.js'

// Signature helpers — Non-React utilities for EIP-712 signing
export {
  buildASPSignatureMessage,
  getCachedSignature,
  cacheSignature,
  appendSignatureParams,
} from './signature.js'
