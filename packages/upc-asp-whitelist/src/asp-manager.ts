/**
 * ASP Manager
 *
 * Shared logic for the auto-whitelist ASP:
 * - MemoryProvider for in-memory member storage
 * - Proof generation for API consumers
 * - Root publishing on-chain
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
import { passesSanctionsCheck, getBlocklistSize } from './sanctions.js'
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
  private blockedAddresses = new Set<string>()
  private isCatchingUp = true
  private lastPublishedRoot = 0n

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
   * Add an address to the whitelist after sanctions screening.
   * Converts the address to an identity commitment and adds it to the Merkle tree.
   *
   * @returns true if the address was new and passed sanctions check
   */
  async addAddress(address: Address): Promise<boolean> {
    const normalized = address.toLowerCase()
    if (this.syncedAddresses.has(normalized)) return false
    if (this.blockedAddresses.has(normalized)) return false

    // Sanctions check — in production, this queries a real database
    if (!passesSanctionsCheck(address)) {
      this.blockedAddresses.add(normalized)
      console.log(`BLOCKED: ${address} failed sanctions check`)
      return false
    }

    const identity = computeIdentityFromAddress(address)
    await this.provider.addMember(identity)
    this.syncedAddresses.add(normalized)
    return true
  }

  /**
   * Add multiple addresses in batch (for historical catch-up)
   */
  async addAddresses(addresses: Address[]): Promise<number> {
    let added = 0
    for (const addr of addresses) {
      if (await this.addAddress(addr)) added++
    }
    return added
  }

  /**
   * Publish the current Merkle root on-chain (if it changed)
   */
  async publishRootIfChanged(): Promise<boolean> {
    const currentRoot = await this.provider.getRoot()
    if (currentRoot === this.lastPublishedRoot) return false
    if (currentRoot === 0n) return false

    try {
      const hash = await this.client.publishRoot({ walletClient: this.walletClient })
      this.lastPublishedRoot = currentRoot
      console.log(`Published root: ${currentRoot} (tx: ${hash})`)
      return true
    } catch (err) {
      console.error('Failed to publish root:', err)
      return false
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
   * Get all whitelisted addresses
   */
  getWhitelistedAddresses(): string[] {
    return [...this.syncedAddresses]
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      memberCount: this.syncedAddresses.size,
      blockedCount: this.blockedAddresses.size,
      blocklistSize: getBlocklistSize(),
      isCatchingUp: this.isCatchingUp,
      aspId: this.client.getASPId()?.toString() ?? null,
      lastPublishedRoot: this.lastPublishedRoot.toString(),
    }
  }

  setCatchingUp(v: boolean) {
    this.isCatchingUp = v
  }
}
