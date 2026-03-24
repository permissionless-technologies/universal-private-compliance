/**
 * ASP Signature Helpers
 *
 * Non-React utilities for EIP-712 signature management.
 * Used by both React hooks (useASPProof) and non-React clients.
 */

import type { Address } from 'viem'
import { ASP_EIP712_DOMAIN, ASP_EIP712_TYPES } from './eip712.js'

interface CachedSignature {
  sig: `0x${string}`
  timestamp: number
}

const cache = new Map<string, CachedSignature>()

/** Cache TTL: 4 minutes (1-minute margin before server's 5-minute window) */
const CACHE_MAX_AGE_SECONDS = 240

/**
 * Build the EIP-712 typed data message for signing.
 */
export function buildASPSignatureMessage(address: Address) {
  const timestamp = Math.floor(Date.now() / 1000)
  return {
    domain: ASP_EIP712_DOMAIN,
    types: ASP_EIP712_TYPES,
    primaryType: 'ASPRequest' as const,
    message: {
      address,
      timestamp: BigInt(timestamp),
    },
    timestamp,
  }
}

/**
 * Get a cached signature if still valid, or null.
 */
export function getCachedSignature(address: Address): CachedSignature | null {
  const key = address.toLowerCase()
  const cached = cache.get(key)
  if (!cached) return null

  const age = Math.floor(Date.now() / 1000) - cached.timestamp
  if (age >= CACHE_MAX_AGE_SECONDS) {
    cache.delete(key)
    return null
  }
  return cached
}

/**
 * Cache a freshly signed signature.
 */
export function cacheSignature(
  address: Address,
  sig: `0x${string}`,
  timestamp: number,
): void {
  cache.set(address.toLowerCase(), { sig, timestamp })
}

/**
 * Append signature query params to a URL.
 */
export function appendSignatureParams(
  url: string,
  sig: `0x${string}`,
  timestamp: number,
): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}sig=${sig}&timestamp=${timestamp}`
}
