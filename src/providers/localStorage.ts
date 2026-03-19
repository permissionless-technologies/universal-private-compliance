/**
 * LocalStorage Provider
 *
 * Browser localStorage-based ASP member storage.
 * Data persists across page reloads. Use for browser demos.
 *
 * Extracted from zkdemo-app/lib/asp-tree-store.ts.
 */

import { MerkleTree, DEFAULT_TREE_DEPTH } from '../core/tree.js'
import type { IASPProvider, MerkleProof } from '../core/types.js'

export interface LocalStorageProviderConfig {
  /** Chain ID for namespacing */
  chainId: number
  /** ASP ID for namespacing */
  aspId: bigint
  /** Merkle tree depth (default: 20) */
  treeDepth?: number
  /** Custom storage key prefix (default: 'upc_asp_tree_') */
  keyPrefix?: string
}

export class LocalStorageProvider implements IASPProvider {
  readonly name = 'LocalStorage'
  readonly treeDepth: number
  private readonly storageKey: string

  constructor(config: LocalStorageProviderConfig) {
    this.treeDepth = config.treeDepth ?? DEFAULT_TREE_DEPTH
    const prefix = config.keyPrefix ?? 'upc_asp_tree_'
    this.storageKey = `${prefix}${config.chainId}_${config.aspId}`
  }

  async addMember(identity: bigint): Promise<void> {
    if (identity === 0n) throw new Error('Identity cannot be zero')
    const members = await this.getMembers()
    if (members.includes(identity)) return // idempotent
    members.push(identity)
    this.save(members)
  }

  async removeMember(identity: bigint): Promise<void> {
    const members = await this.getMembers()
    const filtered = members.filter(m => m !== identity)
    this.save(filtered)
  }

  async getMembers(): Promise<bigint[]> {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as string[]
      return parsed.map(s => BigInt(s))
    } catch {
      return []
    }
  }

  async hasMember(identity: bigint): Promise<boolean> {
    const members = await this.getMembers()
    return members.includes(identity)
  }

  async getRoot(): Promise<bigint> {
    const members = await this.getMembers()
    if (members.length === 0) return 0n
    if (members.length === 1) return members[0]!
    const tree = this.buildTree(members)
    return tree.getRoot()
  }

  async getMerkleProof(identity: bigint): Promise<MerkleProof> {
    const members = await this.getMembers()
    const tree = this.buildTree(members)
    const index = tree.indexOf(identity)
    if (index === -1) throw new Error('Identity not found in tree')
    return tree.getProof(index)
  }

  private save(members: bigint[]): void {
    if (typeof window === 'undefined') return
    try {
      const serialized = members.map(m => m.toString())
      localStorage.setItem(this.storageKey, JSON.stringify(serialized))
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  private buildTree(members: bigint[]): MerkleTree {
    const tree = new MerkleTree(this.treeDepth)
    for (const m of members) {
      tree.insert(m)
    }
    return tree
  }
}

// ============================================================================
// Convenience functions for personal ASP ID storage
// ============================================================================

const ASP_ID_PREFIX = 'upc_personal_asp_'

/**
 * Store a personal ASP ID in localStorage
 */
export function storePersonalASPId(
  chainId: number,
  address: string,
  aspId: bigint
): void {
  if (typeof window === 'undefined') return
  try {
    const key = `${ASP_ID_PREFIX}${chainId}_${address.toLowerCase()}`
    localStorage.setItem(key, aspId.toString())
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load a stored personal ASP ID from localStorage
 */
export function loadPersonalASPId(
  chainId: number,
  address: string
): bigint | null {
  if (typeof window === 'undefined') return null
  try {
    const key = `${ASP_ID_PREFIX}${chainId}_${address.toLowerCase()}`
    const stored = localStorage.getItem(key)
    return stored ? BigInt(stored) : null
  } catch {
    return null
  }
}
