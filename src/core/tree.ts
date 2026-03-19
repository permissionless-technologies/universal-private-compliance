/**
 * Merkle Tree
 *
 * LeanIMT-compatible Merkle tree with Poseidon hashing.
 * Used for ASP member trees and membership proofs.
 */

import { poseidon } from './poseidon.js'
import type { MerkleProof } from './types.js'

/**
 * Default tree depth (supports ~1M members)
 */
export const DEFAULT_TREE_DEPTH = 20

/**
 * Maximum tree depth
 */
export const MAX_TREE_DEPTH = 32

/**
 * LeanIMT-compatible Merkle Tree
 *
 * Features:
 * - Dynamic depth (grows as needed up to maxDepth)
 * - Single-child optimization (LeanIMT: when sibling is 0, propagate current)
 * - Async hash operations (Poseidon is async)
 */
export class MerkleTree {
  private leaves: bigint[] = []
  private nodes: Map<string, bigint> = new Map()
  private cachedRoot: bigint | null = null
  readonly maxDepth: number

  constructor(maxDepth: number = DEFAULT_TREE_DEPTH) {
    this.maxDepth = maxDepth
  }

  /**
   * Insert a leaf into the tree
   */
  insert(leaf: bigint): number {
    if (leaf === 0n) {
      throw new Error('Leaf cannot be zero')
    }
    const index = this.leaves.length
    this.leaves.push(leaf)
    this.cachedRoot = null
    this.nodes.clear()
    return index
  }

  /**
   * Get the number of leaves in the tree
   */
  get size(): number {
    return this.leaves.length
  }

  /**
   * Get the current depth of the tree
   */
  get depth(): number {
    if (this.leaves.length <= 1) return 0
    return Math.ceil(Math.log2(this.leaves.length))
  }

  /**
   * Check if a leaf exists in the tree
   */
  has(leaf: bigint): boolean {
    return this.leaves.includes(leaf)
  }

  /**
   * Get the index of a leaf
   */
  indexOf(leaf: bigint): number {
    return this.leaves.indexOf(leaf)
  }

  /**
   * Get the current root (async because of Poseidon)
   */
  async getRoot(): Promise<bigint> {
    if (this.leaves.length === 0) {
      return 0n
    }
    if (this.cachedRoot !== null) {
      return this.cachedRoot
    }
    this.cachedRoot = await this.computeRoot()
    return this.cachedRoot
  }

  /**
   * Get a Merkle proof for a leaf at index
   */
  async getProof(index: number): Promise<MerkleProof> {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds (size: ${this.leaves.length})`)
    }

    const pathElements: bigint[] = []
    const pathIndices: number[] = []
    const treeDepth = this.depth

    let currentIndex = index

    for (let level = 0; level < treeDepth; level++) {
      const siblingIndex = currentIndex ^ 1
      const isLeft = currentIndex % 2 === 0

      const sibling = await this.getNodeHash(level, siblingIndex)
      pathElements.push(sibling)
      pathIndices.push(isLeft ? 0 : 1)

      currentIndex = Math.floor(currentIndex / 2)
    }

    return {
      pathElements,
      pathIndices,
      leafIndex: index,
      root: await this.getRoot(),
    }
  }

  /**
   * Get the hash of a node at (level, index)
   */
  private async getNodeHash(level: number, index: number): Promise<bigint> {
    const key = `${level}:${index}`
    if (this.nodes.has(key)) {
      return this.nodes.get(key)!
    }

    let hash: bigint

    if (level === 0) {
      hash = index < this.leaves.length ? this.leaves[index]! : 0n
    } else {
      const leftChild = await this.getNodeHash(level - 1, index * 2)
      const rightChild = await this.getNodeHash(level - 1, index * 2 + 1)

      if (leftChild === 0n && rightChild === 0n) {
        hash = 0n
      } else if (rightChild === 0n) {
        // LeanIMT optimization: single child propagation
        hash = leftChild
      } else {
        hash = await poseidon([leftChild, rightChild])
      }
    }

    this.nodes.set(key, hash)
    return hash
  }

  /**
   * Compute the root hash
   */
  private async computeRoot(): Promise<bigint> {
    if (this.leaves.length === 0) return 0n
    if (this.leaves.length === 1) return this.leaves[0]!
    const treeDepth = this.depth
    return await this.getNodeHash(treeDepth, 0)
  }
}

/**
 * Build a Merkle tree from an array of leaves
 */
export function buildMerkleTree(leaves: bigint[], maxDepth?: number): MerkleTree {
  const tree = new MerkleTree(maxDepth)
  for (const leaf of leaves) {
    tree.insert(leaf)
  }
  return tree
}

/**
 * Verify a Merkle proof
 */
export async function verifyMerkleProof(
  leaf: bigint,
  proof: MerkleProof
): Promise<boolean> {
  let current = leaf

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i]!
    const isLeft = proof.pathIndices[i] === 0

    if (sibling === 0n) {
      // LeanIMT: missing sibling means propagation
      continue
    }

    if (isLeft) {
      current = await poseidon([current, sibling])
    } else {
      current = await poseidon([sibling, current])
    }
  }

  return current === proof.root
}
