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
  computeIdentityFromAddress,
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

  private syncedAddresses = new Set<string>()
  private pendingAddresses = new Set<string>()
  private blockedAddresses = new Set<string>()
  private isCatchingUp = true
  private lastPublishedRoot = 0n
  private isPublishing = false
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
   * Does NOT publish the root — call schedulePublish() or publishRootIfChanged() separately.
   *
   * @returns true if the address was new
   */
  async addAddress(address: Address): Promise<boolean> {
    const normalized = address.toLowerCase()
    if (this.syncedAddresses.has(normalized)) return false
    if (this.blockedAddresses.has(normalized)) return false

    const identity = computeIdentityFromAddress(address)
    await this.provider.addMember(identity)
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
   * Serializes publishes — waits for in-flight tx before sending another.
   */
  async publishRootIfChanged(): Promise<boolean> {
    const currentRoot = await this.provider.getRoot()
    if (currentRoot === this.lastPublishedRoot) return false
    if (currentRoot === 0n) return false

    // Wait for any in-flight publish to complete
    if (this.isPublishing) {
      this.dirty = true // will be picked up by next schedulePublish
      return false
    }

    this.isPublishing = true
    try {
      const hash = await this.client.publishRoot({ walletClient: this.walletClient })
      this.lastPublishedRoot = currentRoot
      this.pendingAddresses.clear()
      this.dirty = false
      console.log(`Published root (${this.syncedAddresses.size} members): ${hash}`)
      return true
    } catch (err) {
      console.error('Failed to publish root:', err instanceof Error ? err.message : err)
      return false
    } finally {
      this.isPublishing = false
    }
  }

  /**
   * Generate a membership proof for an address
   */
  async getProof(address: Address): Promise<MembershipProof> {
    const identity = computeIdentityFromAddress(address)
    return this.client.generateProof(identity)
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
    }
  }

  setCatchingUp(v: boolean) {
    this.isCatchingUp = v
  }
}
