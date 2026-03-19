/**
 * Merkle Tree
 *
 * LeanIMT-compatible Merkle tree with pluggable hash function.
 * Default hash: Poseidon over BLS12-381 (128-bit security).
 */

import type { IHashFunction } from './hash/interface.js'
import { getDefaultHashFunction } from './hash/index.js'
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
 * - Pluggable hash function (default: Poseidon-BLS12-381, 128-bit security)
 * - Async hash operations
 */
export class MerkleTree {
  private leaves: bigint[] = []
  private nodes: Map<string, bigint> = new Map()
  private cachedRoot: bigint | null = null
  readonly maxDepth: number
  readonly hashFn: IHashFunction

  constructor(maxDepth: number = DEFAULT_TREE_DEPTH, hashFn?: IHashFunction) {
    this.maxDepth = maxDepth
    this.hashFn = hashFn ?? getDefaultHashFunction()
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
   * Get the current root (async because hash is async)
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
        hash = await this.hashFn.hash2(leftChild, rightChild)
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
export function buildMerkleTree(leaves: bigint[], maxDepth?: number, hashFn?: IHashFunction): MerkleTree {
  const tree = new MerkleTree(maxDepth, hashFn)
  for (const leaf of leaves) {
    tree.insert(leaf)
  }
  return tree
}

/**
 * Verify a Merkle proof using the specified hash function.
 * Defaults to BLS12-381 Poseidon (128-bit security).
 */
export async function verifyMerkleProof(
  leaf: bigint,
  proof: MerkleProof,
  hashFn?: IHashFunction
): Promise<boolean> {
  const hash = hashFn ?? getDefaultHashFunction()
  let current = leaf

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i]!
    const isLeft = proof.pathIndices[i] === 0

    if (sibling === 0n) {
      continue // LeanIMT: missing sibling means propagation
    }

    if (isLeft) {
      current = await hash.hash2(current, sibling)
    } else {
      current = await hash.hash2(sibling, current)
    }
  }

  return current === proof.root
}
