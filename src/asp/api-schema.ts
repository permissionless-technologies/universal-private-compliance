/**
 * ASP API Schema — Standard response types for ASP services.
 *
 * Any ASP server implementation (Express, Hono, Fastify, etc.)
 * should return these response shapes from the standard endpoints.
 *
 * Standard endpoints:
 *   GET /root              → ASPRootResponse
 *   GET /proof/:address    → ASPProofResponse (EIP-712 gated, 404 if not a member)
 *   GET /status            → ASPStatusResponse (global stats)
 *   GET /status/:address   → ASPAddressStatusResponse (per-address, rate-limited)
 *
 * Standard error responses:
 *   400 → { error: "Invalid address" }
 *   401 → { error: "Missing sig or timestamp" }
 *   403 → { error: "Invalid signature" }
 *   404 → { error: "Address not whitelisted" }
 *   429 → { error: "Rate limit exceeded" }
 *   500 → { error: "<description>" }
 */

/**
 * Response for GET /root
 */
export interface ASPRootResponse {
  /** Current Merkle root (decimal string) */
  root: string
}

/**
 * Response for GET /proof/:address
 */
export interface ASPProofResponse {
  /** Merkle root (decimal string) */
  root: string
  /** Path elements / siblings (decimal strings) */
  pathElements: string[]
  /** Path indices (0 = left, 1 = right) */
  pathIndices: number[]
}

/**
 * Per-address compliance status.
 */
export type ASPAddressStatus = 'whitelisted' | 'pending' | 'blocked' | 'unknown'

/**
 * Response for GET /status/:address (public, rate-limited)
 */
export interface ASPAddressStatusResponse {
  /** Checksummed address */
  address: string
  /** Compliance status */
  status: ASPAddressStatus
}

/**
 * Response for GET /status (global)
 */
export interface ASPStatusResponse {
  /** Number of whitelisted members */
  memberCount: number
  /** Number of blocked/rejected addresses */
  blockedCount: number
  /** Sanctions blocklist size (if applicable) */
  blocklistSize?: number
  /** Whether the event source is still catching up on history */
  isCatchingUp: boolean
  /** On-chain ASP ID (decimal string, null if not registered) */
  aspId: string | null
  /** Last published Merkle root (decimal string) */
  lastPublishedRoot: string
}

/**
 * Standard error response
 */
export interface ASPErrorResponse {
  error: string
}
