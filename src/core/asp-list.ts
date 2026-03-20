/**
 * ASP List — Types and Utilities
 *
 * An ASP list is a curated registry of Association Set Providers for a specific chain,
 * similar to Uniswap's token lists. Platform operators maintain their own ASP lists
 * to control which compliance providers their users can choose from.
 *
 * UPC provides the types and loader — the lists themselves are maintained by consumers.
 */

// ============ Types ============

/**
 * ASP type classification
 */
export type ASPType =
  | 'auto-whitelist'       // Automatically adds members (e.g., on token mint/shield)
  | 'kyc'                  // Requires KYC verification
  | 'sanctions'            // Sanctions screening (OFAC, etc.)
  | 'accredited-investor'  // Accredited investor verification
  | 'custom'               // Custom attestation logic

/**
 * Security level of an ASP
 */
export type ASPSecurityLevel =
  | 'demo'          // For testing only — no real compliance checks
  | 'production'    // Real compliance checks, suitable for production
  | 'institutional' // Audited, documented ceremony, institutional grade

/**
 * A single ASP entry in the list
 */
export interface ASPEntry {
  /** On-chain ASP identifier (from ASPRegistryHub.registerASP()) */
  aspId: number
  /** Chain ID this ASP operates on */
  chainId: number
  /** Human-readable name */
  name: string
  /** Type of compliance check */
  type: ASPType
  /** Description of what this ASP verifies */
  description: string
  /** Operator address (who manages the Merkle tree) */
  operator: `0x${string}`
  /** ASPRegistryHub contract address */
  registryAddress: `0x${string}`
  /**
   * URL to fetch membership proofs.
   * Expected endpoints:
   *   GET {proofEndpoint}/{address} → { root, pathElements, pathIndices }
   *   GET {proofEndpoint}/../root   → { root }
   *   GET {proofEndpoint}/../status → { memberCount, ... }
   */
  proofEndpoint: string
  /**
   * URL for user registration (null for auto-whitelist ASPs).
   * For KYC ASPs, this links to the verification portal.
   */
  registrationUrl: string | null
  /** Security level */
  securityLevel: ASPSecurityLevel
  /** Whether this ASP is currently active */
  active: boolean
  /** Optional logo URL */
  logoUrl?: string
}

/**
 * ASP list for a specific chain
 */
export interface ASPList {
  /** List name */
  name: string
  /** Chain ID */
  chainId: number
  /** Semantic version */
  version: string
  /** Last update date (ISO 8601) */
  updatedAt: string
  /** ASP entries */
  asps: ASPEntry[]
}

// ============ Loader ============

/**
 * Load an ASP list from a JSON object.
 * Validates the structure and returns typed entries.
 */
export function parseASPList(json: unknown): ASPList {
  const list = json as ASPList
  if (!list.asps || !Array.isArray(list.asps)) {
    throw new Error('Invalid ASP list: missing "asps" array')
  }
  if (typeof list.chainId !== 'number') {
    throw new Error('Invalid ASP list: missing "chainId"')
  }
  return list
}

/**
 * Filter an ASP list to only active entries
 */
export function getActiveASPs(list: ASPList): ASPEntry[] {
  return list.asps.filter(asp => asp.active)
}

/**
 * Find an ASP by ID in a list
 */
export function findASPById(list: ASPList, aspId: number): ASPEntry | undefined {
  return list.asps.find(asp => asp.aspId === aspId)
}

/**
 * Fetch a membership proof from an ASP's proof endpoint
 */
export async function fetchASPProof(
  asp: ASPEntry,
  address: `0x${string}`
): Promise<{
  root: bigint
  pathElements: bigint[]
  pathIndices: number[]
}> {
  const res = await fetch(`${asp.proofEndpoint}/${address}`)
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Address ${address} not found in ASP "${asp.name}" (aspId: ${asp.aspId})`)
    }
    throw new Error(`Failed to fetch proof from ASP "${asp.name}": ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as {
    root: string
    pathElements: string[]
    pathIndices: number[]
  }

  return {
    root: BigInt(data.root),
    pathElements: data.pathElements.map(e => BigInt(e)),
    pathIndices: data.pathIndices,
  }
}
