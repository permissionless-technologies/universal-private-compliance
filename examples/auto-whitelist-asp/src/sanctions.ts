/**
 * Sanctions Check (Dummy)
 *
 * In production, this would query a sanctions database (OFAC, EU sanctions, etc.)
 * or a third-party API like Chainalysis, TRM Labs, or Elliptic.
 *
 * For Sepolia/testing, the blocklist is empty — everyone passes.
 * Set SANCTIONS_BLOCKLIST in .env to a comma-separated list of addresses to block.
 */

import type { Address } from 'viem'

const blocklist: Set<string> = new Set(
  (process.env.SANCTIONS_BLOCKLIST ?? '')
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(a => a.length > 0)
)

/**
 * Check if an address passes the sanctions screening.
 *
 * @returns true if the address is clean (not on the blocklist)
 */
export function passesSanctionsCheck(address: Address): boolean {
  return !blocklist.has(address.toLowerCase())
}

/**
 * Get the number of blocked addresses
 */
export function getBlocklistSize(): number {
  return blocklist.size
}
