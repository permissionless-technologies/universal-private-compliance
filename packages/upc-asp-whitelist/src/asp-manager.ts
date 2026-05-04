/**
 * ASP Manager
 *
 * Shared logic for the auto-whitelist ASP:
 * - MemoryProvider for in-memory member storage
 * - Proof generation for API consumers
 * - Root publishing on-chain (debounced to avoid nonce conflicts)
 *
 * Used by both the local (viem) and Sepolia (Subsquid) entry points.
 */

import {
  createASPClient,
  MemoryProvider,
  MerkleTree,
  PoseidonM31,
  M31_FIELD_PRIME,
  computeIdentityFromAddress,
  DEFAULT_TREE_DEPTH,
  type ASPClient,
  type MembershipProof,
} from '@permissionless-technologies/upc-sdk'
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia, foundry } from 'viem/chains'

/**
 * Map an Ethereum address to a single M31 leaf (`BigInt(addr) % M31_P`).
 *
 * This matches the on-chain STARK pool's `addressToM31` reduction — the
 * `input_origin` column in the Poseidon31 ASP-Merkle path is the
 * depositor address modular-reduced into M31. The 31-bit truncation
 * means ~2^15.5 collision security per element; the tree depth + chain
 * extends beyond, but a collision on `addressToM31` lets two addresses
 * share an ASP slot. This is an existing soundness limitation of the
 * M31-origin design, documented in the Track C scope.
 */
export function addressToM31Leaf(address: Address): bigint {
  return BigInt(address) % M31_FIELD_PRIME
}

export interface ASPManagerConfig {
  rpcUrl: string
  registryAddress: Address
  operatorPrivateKey: `0x${string}`
  aspId?: bigint
  aspName?: string
  chainId?: number
}

export class ASPManager {
  readonly provider: MemoryProvider
  readonly client: ASPClient
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient

  /**
   * Parallel STARK-side Merkle tree using Poseidon31 over the same
   * membership set. Maintained in lock-step with the BLS provider so a
   * single `addAddress` call updates both trees and the next publish
   * sends both roots on-chain.
   */
  readonly starkTree: MerkleTree

  private syncedAddresses = new Set<string>()
  private starkLeavesByAddress = new Map<string, bigint>()
  private pendingAddresses = new Set<string>()
  private blockedAddresses = new Set<string>()
  private isCatchingUp = true
  private lastPublishedRoot = 0n
  private lastPublishedStarkRoot = 0n
  private isPublishing = false
  private isPublishingStark = false
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false
  private readonly PUBLISH_INTERVAL_MS = 30_000 // at most once per 30 seconds

  constructor(private config: ASPManagerConfig) {
    const chain = config.chainId === 11155111 ? sepolia : foundry
    const account = privateKeyToAccount(config.operatorPrivateKey)

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    })

    this.walletClient = createWalletClient({
      chain,
      transport: http(config.rpcUrl),
      account,
    })

    this.provider = new MemoryProvider()

    // STARK-side parallel tree using Poseidon31 over M31. Output of
    // `hash2` is a single M31 element matching the on-chain pool's
    // `pub_asp_root`. LeanIMT with dynamic depth — the in-trace AIR
    // pads to its fixed `ASP_TREE_DEPTH = 20`; that padding lives in
    // the SDK's prover wiring (Phase 7), not here.
    this.starkTree = new MerkleTree(DEFAULT_TREE_DEPTH, new PoseidonM31())

    this.client = createASPClient({
      provider: this.provider,
      publicClient: this.publicClient,
      registryAddress: config.registryAddress,
    })

    if (config.aspId) {
      this.client.setASPId(config.aspId)
    }
  }

  /**
   * Register a new ASP on-chain (or use existing aspId from config)
   */
  async initialize(): Promise<bigint> {
    if (this.client.getASPId()) {
      console.log(`Using existing ASP ID: ${this.client.getASPId()}`)
      return this.client.getASPId()!
    }

    const aspId = await this.client.register({
      name: this.config.aspName ?? 'Auto-Whitelist ASP',
      walletClient: this.walletClient,
    })

    console.log(`Registered new ASP with ID: ${aspId}`)
    return aspId
  }

  /**
   * Add an address to the whitelist.
   * Updates both the BLS-side provider AND the STARK-side parallel
   * tree. Does NOT publish either root — call schedulePublish() or
   * publishRootIfChanged() separately.
   *
   * @returns true if the address was new
   */
  async addAddress(address: Address): Promise<boolean> {
    const normalized = address.toLowerCase()
    if (this.syncedAddresses.has(normalized)) return false
    if (this.blockedAddresses.has(normalized)) return false

    const identity = computeIdentityFromAddress(address)
    await this.provider.addMember(identity)

    // Mirror into the STARK tree. Skip if the address's M31 reduction
    // collides with a previously-added address — duplicate leaves are
    // rejected by `MerkleTree.insert()` and would also be ambiguous
    // for proof generation. Collisions are rare (~2^15.5 birthday
    // bound) but possible at scale; the operator should monitor and
    // resolve via address-list curation if hit.
    const starkLeaf = addressToM31Leaf(address)
    if (!this.starkTree.has(starkLeaf)) {
      this.starkTree.insert(starkLeaf)
    }
    this.starkLeavesByAddress.set(normalized, starkLeaf)

    this.syncedAddresses.add(normalized)
    this.pendingAddresses.add(normalized)
    this.dirty = true
    return true
  }

  /**
   * Mark an address as blocked (failed gate check)
   */
  markBlocked(address: Address): void {
    this.blockedAddresses.add(address.toLowerCase())
  }

  /**
   * Add multiple addresses in batch
   */
  async addAddresses(addresses: Address[]): Promise<number> {
    let added = 0
    for (const addr of addresses) {
      if (await this.addAddress(addr)) added++
    }
    return added
  }

  /**
   * Schedule a debounced root publish.
   * Collects changes and publishes at most once per PUBLISH_INTERVAL_MS.
   * Waits for any in-flight publish to complete before starting another.
   */
  schedulePublish(): void {
    if (!this.dirty) return
    if (this.publishTimer) return // already scheduled

    this.publishTimer = setTimeout(async () => {
      this.publishTimer = null
      await this.publishRootIfChanged()
    }, this.PUBLISH_INTERVAL_MS)
  }

  /**
   * Publish the current Merkle root on-chain (if changed).
   *
   * Publishes BOTH the BLS-side root (for SNARK paths) and the STARK-
   * side root (for STARK paths). Both are sent if either changed; the
   * operator is expected to keep them in lock-step so a stale STARK
   * root can't be used to bypass compliance on STARK paths.
   *
   * Serializes per-side publishes — waits for in-flight tx on the same
   * side before sending another.
   *
   * Returns `true` if at least one root was published.
   */
  async publishRootIfChanged(): Promise<boolean> {
    let publishedAny = false

    // BLS side
    const currentRoot = await this.provider.getRoot()
    const blsChanged = currentRoot !== this.lastPublishedRoot && currentRoot !== 0n
    if (blsChanged) {
      if (this.isPublishing) {
        this.dirty = true // will be picked up by next schedulePublish
      } else {
        this.isPublishing = true
        try {
          const hash = await this.client.publishRoot({ walletClient: this.walletClient })
          this.lastPublishedRoot = currentRoot
          publishedAny = true
          console.log(`Published BLS root (${this.syncedAddresses.size} members): ${hash}`)
        } catch (err) {
          console.error('Failed to publish BLS root:', err instanceof Error ? err.message : err)
        } finally {
          this.isPublishing = false
        }
      }
    }

    // STARK side — runs independently so a transient failure on one
    // side doesn't block the other. Lock-step is enforced eventually
    // because the next schedulePublish() retries any side that lagged.
    const starkRoot = await this.starkTree.getRoot()
    const starkChanged =
      starkRoot !== this.lastPublishedStarkRoot && starkRoot !== 0n
    if (starkChanged) {
      if (this.isPublishingStark) {
        this.dirty = true
      } else {
        this.isPublishingStark = true
        try {
          const hash = await this.client.publishStarkRoot(starkRoot, {
            walletClient: this.walletClient,
          })
          this.lastPublishedStarkRoot = starkRoot
          publishedAny = true
          console.log(
            `Published STARK root (${this.starkTree.size} leaves): ${hash}`
          )
        } catch (err) {
          console.error(
            'Failed to publish STARK root:',
            err instanceof Error ? err.message : err
          )
        } finally {
          this.isPublishingStark = false
        }
      }
    }

    if (publishedAny) {
      this.pendingAddresses.clear()
      this.dirty = this.isPublishing || this.isPublishingStark
    }

    return publishedAny
  }

  /**
   * Generate a membership proof for an address
   */
  async getProof(address: Address): Promise<MembershipProof> {
    const identity = computeIdentityFromAddress(address)
    return this.client.generateProof(identity)
  }

  /**
   * Current STARK-side Merkle root (Poseidon31, single M31 element).
   * Returns `0n` until the first member is added.
   */
  async getStarkRoot(): Promise<bigint> {
    return this.starkTree.getRoot()
  }

  /**
   * Generate a STARK-side membership proof for an address. Throws if
   * the address is not in the whitelist.
   *
   * The returned `pathElements` and `pathIndices` follow the LeanIMT
   * convention (dynamic depth = `ceil(log2(memberCount))`). The
   * in-trace AIR expects fixed `ASP_TREE_DEPTH = 20`; pad to that depth
   * with zero siblings + zero index_bits before passing to the prover.
   * (Padding lives in the SDK prover wiring, not here.)
   */
  async getStarkProof(address: Address): Promise<{
    root: bigint
    leaf: bigint
    leafIndex: number
    pathElements: bigint[]
    pathIndices: number[]
  }> {
    const normalized = address.toLowerCase()
    const leaf = this.starkLeavesByAddress.get(normalized)
    if (leaf === undefined) {
      throw new Error(`Address ${address} not in STARK tree`)
    }
    const idx = this.starkTree.indexOf(leaf)
    if (idx < 0) {
      throw new Error(
        `STARK leaf for ${address} (${leaf}) is missing from the tree — internal inconsistency`
      )
    }
    const proof = await this.starkTree.getProof(idx)
    return {
      root: proof.root,
      leaf,
      leafIndex: proof.leafIndex,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
    }
  }

  /**
   * Check if an address is whitelisted
   */
  isWhitelisted(address: Address): boolean {
    return this.syncedAddresses.has(address.toLowerCase())
  }

  /**
   * Get the per-address compliance status.
   */
  getAddressStatus(address: Address): 'whitelisted' | 'pending' | 'blocked' | 'unknown' {
    const normalized = address.toLowerCase()
    if (this.blockedAddresses.has(normalized)) return 'blocked'
    if (this.syncedAddresses.has(normalized)) {
      if (this.pendingAddresses.has(normalized)) return 'pending'
      return 'whitelisted'
    }
    return 'unknown'
  }

  /**
   * Number of members in the tree.
   */
  get memberCount(): number {
    return this.syncedAddresses.size
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      memberCount: this.syncedAddresses.size,
      blockedCount: this.blockedAddresses.size,
      isCatchingUp: this.isCatchingUp,
      aspId: this.client.getASPId()?.toString() ?? null,
      lastPublishedRoot: this.lastPublishedRoot.toString(),
      lastPublishedStarkRoot: this.lastPublishedStarkRoot.toString(),
      starkMemberCount: this.starkTree.size,
    }
  }

  setCatchingUp(v: boolean) {
    this.isCatchingUp = v
  }
}
