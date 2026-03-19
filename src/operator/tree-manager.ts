/**
 * Tree Manager
 *
 * Server-side tree management for ASP operators.
 * Wraps a provider with batch operations and tree statistics.
 */

import type { IASPProvider, MerkleProof } from '../core/types.js'

export class TreeManager {
  constructor(private readonly provider: IASPProvider) {}

  /**
   * Add a single member
   */
  async addMember(identity: bigint): Promise<void> {
    await this.provider.addMember(identity)
  }

  /**
   * Add multiple members in batch
   */
  async addMembers(identities: bigint[]): Promise<void> {
    for (const identity of identities) {
      await this.provider.addMember(identity)
    }
  }

  /**
   * Remove a single member
   */
  async removeMember(identity: bigint): Promise<void> {
    await this.provider.removeMember(identity)
  }

  /**
   * Get all current members
   */
  async getMembers(): Promise<bigint[]> {
    return this.provider.getMembers()
  }

  /**
   * Get tree statistics
   */
  async getStats(): Promise<{
    memberCount: number
    treeDepth: number
    maxMembers: number
    root: bigint
  }> {
    const members = await this.provider.getMembers()
    const root = await this.provider.getRoot()
    return {
      memberCount: members.length,
      treeDepth: this.provider.treeDepth,
      maxMembers: 2 ** this.provider.treeDepth,
      root,
    }
  }

  /**
   * Get the current root
   */
  async getRoot(): Promise<bigint> {
    return this.provider.getRoot()
  }

  /**
   * Get a proof for a specific identity
   */
  async getProof(identity: bigint): Promise<MerkleProof> {
    return this.provider.getMerkleProof(identity)
  }

  /**
   * Check if an identity is a member
   */
  async hasMember(identity: bigint): Promise<boolean> {
    return this.provider.hasMember(identity)
  }
}
