/**
 * Core types for Universal Private Compliance SDK
 */

/**
 * Merkle proof for a leaf in an ASP tree
 */
export interface MerkleProof {
  /** Path elements (siblings) */
  pathElements: bigint[]
  /** Path indices (0 = left, 1 = right) */
  pathIndices: number[]
  /** Leaf index in the tree */
  leafIndex: number
  /** Tree root */
  root: bigint
}

/**
 * ASP membership proof — ready for circuit input
 */
export interface MembershipProof {
  /** ASP's published Merkle root */
  root: bigint
  /** Path elements (siblings), padded to tree depth */
  pathElements: bigint[]
  /** Path indices, padded to tree depth */
  pathIndices: number[]
}

/**
 * On-chain ASP information
 */
export interface ASPInfo {
  /** ASP identifier */
  id: bigint
  /** Operator address */
  operator: `0x${string}`
  /** Human-readable name */
  name: string
  /** Current Merkle root */
  currentRoot: bigint
  /** Last update timestamp */
  lastUpdated: bigint
}

/**
 * Configuration for creating an ASP client
 */
export interface ASPClientConfig {
  /** Provider for off-chain member storage */
  provider: IASPProvider
  /** viem PublicClient for reading chain data */
  publicClient: unknown // viem PublicClient — kept as unknown to avoid hard dep
  /** ASP Registry Hub contract address */
  registryAddress: `0x${string}`
  /** ASP ID (if already registered) */
  aspId?: bigint
}

/**
 * Options for registering a new ASP
 */
export interface RegisterASPOptions {
  /** Human-readable name for the ASP */
  name: string
  /** viem WalletClient for sending transactions */
  walletClient: unknown // viem WalletClient
}

/**
 * Options for publishing a root on-chain
 */
export interface PublishRootOptions {
  /** viem WalletClient for sending transactions */
  walletClient: unknown // viem WalletClient
}

/**
 * Provider interface for ASP member storage
 *
 * Implementations handle where and how members are stored.
 * The SDK is agnostic to the storage backend.
 */
export interface IASPProvider {
  /** Add a member identity to the tree */
  addMember(identity: bigint): Promise<void>
  /** Remove a member identity from the tree */
  removeMember(identity: bigint): Promise<void>
  /** Get all member identities */
  getMembers(): Promise<bigint[]>
  /** Check if an identity is a member */
  hasMember(identity: bigint): Promise<boolean>
  /** Get the current Merkle root */
  getRoot(): Promise<bigint>
  /** Get a Merkle proof for a specific identity */
  getMerkleProof(identity: bigint): Promise<MerkleProof>
  /** Human-readable provider name */
  readonly name: string
  /** Merkle tree depth (determines max members: 2^depth) */
  readonly treeDepth: number
}
