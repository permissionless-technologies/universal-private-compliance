/**
 * Root Publisher
 *
 * Publishes Merkle roots on-chain via the ASP Registry Hub.
 * Used by ASP operators to keep the on-chain root up to date.
 */

import { ASP_REGISTRY_HUB_ABI } from '../contracts/abi/ASPRegistryHub.js'
import type { RootPublisherConfig } from './types.js'

export class RootPublisher {
  private readonly registryAddress: `0x${string}`
  private readonly aspId: bigint

  constructor(config: RootPublisherConfig) {
    this.registryAddress = config.registryAddress
    this.aspId = config.aspId
  }

  /**
   * Publish a new root on-chain
   */
  async publishRoot(root: bigint, walletClient: any): Promise<`0x${string}`> {
    const hash = await walletClient.writeContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'updateRoot',
      args: [this.aspId, root],
    })
    return hash as `0x${string}`
  }

  /**
   * Get the current on-chain root
   */
  async getCurrentRoot(publicClient: any): Promise<bigint> {
    return publicClient.readContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'getCurrentRoot',
      args: [this.aspId],
    }) as Promise<bigint>
  }

  /**
   * Check if a root is valid on-chain
   */
  async isValidRoot(root: bigint, publicClient: any): Promise<boolean> {
    return publicClient.readContract({
      address: this.registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'isValidASPRoot',
      args: [this.aspId, root],
    }) as Promise<boolean>
  }
}
