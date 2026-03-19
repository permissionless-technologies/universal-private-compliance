/**
 * ASP Client
 *
 * High-level API for interacting with the ASP system.
 * Orchestrates between providers (off-chain storage) and
 * the blockchain (on-chain registry).
 */

import { generateMembershipProof } from './proof.js'
import type {
  ASPClientConfig,
  IASPProvider,
  MembershipProof,
  RegisterASPOptions,
  PublishRootOptions,
} from './types.js'
import { ASP_REGISTRY_HUB_ABI } from '../contracts/abi/ASPRegistryHub.js'

/**
 * ASP Client instance
 */
export class ASPClient {
  private readonly provider: IASPProvider
  private readonly publicClient: any // viem PublicClient
  private readonly registryAddress: `0x${string}`
  private aspId: bigint | undefined

  constructor(config: ASPClientConfig) {
    this.provider = config.provider
    this.publicClient = config.publicClient
    this.registryAddress = config.registryAddress
    this.aspId = config.aspId
  }

  /**
   * Register a new ASP on-chain
   */
  async register(options: RegisterASPOptions): Promise<bigint> {
    const walletClient = options.walletClient as any

    const hash = await walletClient.writeContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'registerASP',
      args: [options.name],
    })

    // Wait for receipt to get the ASP ID from events
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash })

    // Extract ASP ID from ASPRegistered event
    for (const log of receipt.logs) {
      try {
        // ASPRegistered(uint256 indexed aspId, address indexed operator, string name)
        // The aspId is the first indexed topic
        if (log.topics[1]) {
          this.aspId = BigInt(log.topics[1])
          return this.aspId
        }
      } catch {
        continue
      }
    }

    throw new Error('Failed to extract ASP ID from transaction receipt')
  }

  /**
   * Get the current ASP ID
   */
  getASPId(): bigint | undefined {
    return this.aspId
  }

  /**
   * Set the ASP ID (for existing registrations)
   */
  setASPId(aspId: bigint): void {
    this.aspId = aspId
  }

  /**
   * Add a member identity to the tree
   */
  async addMember(identity: bigint): Promise<void> {
    await this.provider.addMember(identity)
  }

  /**
   * Remove a member identity from the tree
   */
  async removeMember(identity: bigint): Promise<void> {
    await this.provider.removeMember(identity)
  }

  /**
   * Get all members
   */
  async getMembers(): Promise<bigint[]> {
    return this.provider.getMembers()
  }

  /**
   * Check if an identity is a member
   */
  async hasMember(identity: bigint): Promise<boolean> {
    return this.provider.hasMember(identity)
  }

  /**
   * Get the current Merkle root from the provider
   */
  async getRoot(): Promise<bigint> {
    return this.provider.getRoot()
  }

  /**
   * Generate a membership proof for an identity
   */
  async generateProof(identity: bigint): Promise<MembershipProof> {
    const members = await this.provider.getMembers()
    return generateMembershipProof(identity, members, this.provider.treeDepth)
  }

  /**
   * Publish the current Merkle root on-chain
   */
  async publishRoot(options: PublishRootOptions): Promise<`0x${string}`> {
    if (!this.aspId) {
      throw new Error('ASP not registered. Call register() first or set aspId.')
    }

    const root = await this.provider.getRoot()
    const walletClient = options.walletClient as any

    const hash = await walletClient.writeContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'updateRoot',
      args: [this.aspId, root],
    })

    return hash as `0x${string}`
  }

  /**
   * Check if a root is valid on-chain (current or historical)
   */
  async isValidRoot(root: bigint): Promise<boolean> {
    if (!this.aspId) return false

    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'isValidASPRoot',
      args: [this.aspId, root],
    }) as Promise<boolean>
  }

  /**
   * Get the current on-chain root
   */
  async getCurrentOnChainRoot(): Promise<bigint> {
    if (!this.aspId) return 0n

    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'getCurrentRoot',
      args: [this.aspId],
    }) as Promise<bigint>
  }

  /**
   * Get the provider
   */
  getProvider(): IASPProvider {
    return this.provider
  }
}

/**
 * Create a new ASP client
 */
export function createASPClient(config: ASPClientConfig): ASPClient {
  return new ASPClient(config)
}
