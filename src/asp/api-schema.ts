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
 * Response for GET /stark-root
 *
 * Distinct from ASPRootResponse — the STARK side uses an always-hash
 * fixed-depth tree (AlwaysHashMerkleTree), so its root is a different
 * value from the SNARK-side LeanIMT root over the same membership set.
 * Kept as its own type so callers can't silently substitute one for
 * the other.
 */
export interface ASPStarkRootResponse {
  /** Current STARK-side Merkle root (decimal string, M31 field) */
  root: string
}

/**
 * Response for GET /stark-proof/:address
 *
 * Always-hash, fixed-depth proof. Verifies against the same value
 * GET /stark-root returns, for every member in the tree (cross-leaf
 * root agreement). pathIndices on the wire are JSON numbers (0 or 1)
 * — the underlying tree uses bigint indices but they're guaranteed
 * binary, and JSON has no native BigInt encoding.
 */
export interface ASPStarkProofResponse {
  /** Tree root (decimal string, M31 field) */
  root: string
  /** Leaf value the proof is for (decimal string, M31-encoded address) */
  leaf: string
  /** Index of the leaf in insertion order (0-based) */
  leafIndex: number
  /** Tree depth — fixed across every proof in this tree */
  depth: number
  /** Sibling at each level (decimal strings, length === depth) */
  pathElements: string[]
  /** Side bit at each level (0 = current is left, 1 = right; length === depth) */
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
