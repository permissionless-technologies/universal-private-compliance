/**
 * Sanctions Gate
 *
 * Rejects addresses on a blocklist. In production, replace the blocklist
 * with a real sanctions API (Chainalysis, TRM Labs, Elliptic, etc.).
 *
 * Implements IMembershipGate from @permissionless-technologies/upc-sdk/asp
 */

import type { IMembershipGate, MembershipGateStats } from '@permissionless-technologies/upc-sdk/asp'

export interface SanctionsGateConfig {
  /** Blocked addresses (lowercase). Addresses on this list are rejected. */
  blocklist?: string[]
}

export class SanctionsGate implements IMembershipGate {
  readonly name = 'Sanctions Screen'
  private blocklist: Set<string>
  private stats: MembershipGateStats = { checked: 0, approved: 0, rejected: 0 }

  constructor(config?: SanctionsGateConfig) {
    this.blocklist = new Set(
      (config?.blocklist ?? []).map(a => a.toLowerCase())
    )
  }

  async approve(address: `0x${string}`): Promise<boolean> {
    this.stats.checked++
    if (this.blocklist.has(address.toLowerCase())) {
      this.stats.rejected++
      return false
    }
    this.stats.approved++
    return true
  }

  getStats(): MembershipGateStats {
    return { ...this.stats }
  }

  /** Number of addresses on the blocklist */
  get blocklistSize(): number {
    return this.blocklist.size
  }
}
