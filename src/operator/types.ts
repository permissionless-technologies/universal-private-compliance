/**
 * Operator-side types
 */

export interface TreeManagerConfig {
  /** Merkle tree depth (default: 20) */
  treeDepth?: number
}

export interface RootPublisherConfig {
  /** ASP Registry Hub contract address */
  registryAddress: `0x${string}`
  /** ASP ID */
  aspId: bigint
}
