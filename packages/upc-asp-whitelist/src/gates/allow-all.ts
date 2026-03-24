/**
 * AllowAll Gate
 *
 * Approves every address. Use for demos and testing.
 *
 * Implements IMembershipGate from @permissionless-technologies/upc-sdk/asp
 */

import type { IMembershipGate, MembershipGateStats } from '@permissionless-technologies/upc-sdk/asp'

export class AllowAllGate implements IMembershipGate {
  readonly name = 'Allow All'
  private stats: MembershipGateStats = { checked: 0, approved: 0, rejected: 0 }

  async approve(_address: `0x${string}`): Promise<boolean> {
    this.stats.checked++
    this.stats.approved++
    return true
  }

  getStats(): MembershipGateStats {
    return { ...this.stats }
  }
}
