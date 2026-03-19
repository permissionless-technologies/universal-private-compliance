/**
 * Memory Provider
 *
 * In-memory ASP member storage. Data is lost when the process exits.
 * Use for tests, scripts, and prototyping.
 */

import { MerkleTree, DEFAULT_TREE_DEPTH } from '../core/tree.js'
import type { IASPProvider, MerkleProof } from '../core/types.js'

export interface MemoryProviderConfig {
  /** Merkle tree depth (default: 20) */
  treeDepth?: number
}

export class MemoryProvider implements IASPProvider {
  readonly name = 'Memory'
  readonly treeDepth: number
  private members: Set<bigint> = new Set()

  constructor(config?: MemoryProviderConfig) {
    this.treeDepth = config?.treeDepth ?? DEFAULT_TREE_DEPTH
  }

  async addMember(identity: bigint): Promise<void> {
    if (identity === 0n) throw new Error('Identity cannot be zero')
    this.members.add(identity)
  }

  async removeMember(identity: bigint): Promise<void> {
    this.members.delete(identity)
  }

  async getMembers(): Promise<bigint[]> {
    return [...this.members]
  }

  async hasMember(identity: bigint): Promise<boolean> {
    return this.members.has(identity)
  }

  async getRoot(): Promise<bigint> {
    const members = [...this.members]
    if (members.length === 0) return 0n
    if (members.length === 1) return members[0]!
    const tree = this.buildTree(members)
    return tree.getRoot()
  }

  async getMerkleProof(identity: bigint): Promise<MerkleProof> {
    const members = [...this.members]
    const tree = this.buildTree(members)
    const index = tree.indexOf(identity)
    if (index === -1) throw new Error('Identity not found in tree')
    return tree.getProof(index)
  }

  private buildTree(members: bigint[]): MerkleTree {
    const tree = new MerkleTree(this.treeDepth)
    for (const m of members) {
      tree.insert(m)
    }
    return tree
  }
}
