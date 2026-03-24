/**
 * IMembershipGate — "Who gets whitelisted?"
 *
 * A membership gate decides whether a candidate address should be
 * added to the ASP's Merkle tree. It sits between the event source
 * and the tree — screening, approving, or rejecting addresses.
 *
 * Built-in implementations:
 *   - AllowAllGate (approves everyone, for demos)
 *   - SanctionsGate (blocklist-based screening)
 *
 * Custom implementations could include:
 *   - KYCGate (calls a KYC provider API)
 *   - ChainalysisGate (Chainalysis sanctions API)
 *   - ManualGate (admin approval via dashboard)
 *   - CompositeGate (chains multiple gates: sanctions AND kyc)
 */

/**
 * Statistics for a membership gate.
 */
export interface MembershipGateStats {
  /** Total addresses checked */
  checked: number
  /** Total addresses approved */
  approved: number
  /** Total addresses rejected */
  rejected: number
}

/**
 * Interface for membership gates that decide who gets whitelisted.
 *
 * Gates are called for every candidate address before it's added
 * to the Merkle tree. They can be synchronous (blocklist lookup)
 * or asynchronous (API call to a KYC provider).
 */
export interface IMembershipGate {
  /**
   * Check if an address should be whitelisted.
   *
   * @param address - The candidate address
   * @returns true if the address is approved for whitelisting
   */
  approve(address: `0x${string}`): Promise<boolean>

  /**
   * Human-readable gate name (e.g., "Sanctions Screen", "KYC Verified").
   */
  readonly name: string

  /**
   * Get gate statistics.
   */
  getStats(): MembershipGateStats
}
