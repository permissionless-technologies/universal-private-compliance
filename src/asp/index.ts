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
  ASPMembersResponse,
  ASPStatusResponse,
  ASPErrorResponse,
} from './api-schema.js'
