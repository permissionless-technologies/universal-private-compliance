/**
 * AlwaysHashMerkleTree — fixed-depth Merkle tree under always-hash
 * semantics. Every internal node is `hashFn.hash2(left, right)`
 * regardless of whether either child is empty; empty subtrees are
 * represented by precomputed zero-subtree roots `ZSR(k)`.
 *
 * Use this for STARK-side ASP / state trees that the in-trace
 * Poseidon31 AIR consumes. The AIR has no propagation primitive
 * (every level hashes), so a tree built under always-hash semantics
 * is the only model where every member's depth-D proof verifies
 * against a single shared root. The LeanIMT-based [`MerkleTree`] is
 * still the right choice for SNARK-side trees whose verifying
 * circuit explicitly mirrors LeanIMT propagation.
 *
 * Cross-class relationship to [`padLeanIMTProofToDepth`]:
 *
 *   - The padding helper is a *transitional* compatibility shim: it
 *     takes a LeanIMT proof and produces a self-consistent
 *     fixed-depth proof, but in sparse trees different leaves'
 *     proofs land on different roots. Useful for verifying single-
 *     membership end-to-end against a leaf-specific root, not for
 *     publishing a shared `pub_asp_root`.
 *   - This class is the *operational* fix: insert leaves once, get
 *     a single root, get fixed-depth proofs that all verify against
 *     it. This is what the asp-whitelist's STARK-side tree should
 *     use, and what the SDK + zkdemo prover wiring should consume.
 *
 * @see padLeanIMTProofToDepth — compatibility shim for LeanIMT proofs.
 * @see verifyMerklePath — sync always-hash verifier in the
 *      Poseidon31 module that mirrors the in-trace AIR.
 */

import type { IHashFunction } from './hash/interface.js'
import { PoseidonM31 } from './hash/poseidon-m31.js'

/**
 * Default depth for ASP-side STARK trees, matching the in-trace AIR's
 * `ASP_TREE_DEPTH = 20`.
 */
export const DEFAULT_ALWAYS_HASH_DEPTH = 20

/**
 * Maximum supported depth. The tree's leaf capacity is `2^depth`, so
 * deeper trees are mostly a memory/proof-size concern.
 */
export const MAX_ALWAYS_HASH_DEPTH = 32

/**
 * Proof shape returned by [`AlwaysHashMerkleTree.getProof`].
 *
 * `pathIndices` are `bigint[]` so the result can be fed straight into
 * the Poseidon31 [`verifyMerklePath`] without conversion. Length of
 * both `pathElements` and `pathIndices` is exactly the tree's `depth`.
 */
export interface AlwaysHashMerkleProof {
  /** Sibling at each level. Length equals the tree's `depth`. */
  pathElements: bigint[]
  /** Side bit at each level (0n = current is left, 1n = right). */
  pathIndices: bigint[]
  /** Index of the leaf being proven (0-based). */
  leafIndex: number
  /** Tree root the proof verifies against. */
  root: bigint
  /** Fixed depth — pinned alongside the proof so verifiers don't guess. */
  depth: number
}

/**
 * Fixed-depth Merkle tree where every internal node hashes its two
 * children regardless of fill. Empty subtrees are represented by
 * precomputed zero-subtree roots, and every member's proof verifies
 * against the same root.
 *
 * Capacity is `2^depth`. Inserting beyond capacity throws.
 *
 * Hash function defaults to Poseidon-M31 (matches the STARK AIR). Any
 * `IHashFunction` works in principle, but cross-leaf agreement only
 * matters for AIR-aligned trees today.
 */
export class AlwaysHashMerkleTree {
  private leaves: bigint[] = []
  private nodes = new Map<string, bigint>()
  /** ZSR cache: `zsr[k]` is the root of an entirely-empty subtree of depth `k`. */
  private zsrCache: bigint[] | null = null
  private cachedRoot: bigint | null = null

  readonly depth: number
  readonly hashFn: IHashFunction

  constructor(
    depth: number = DEFAULT_ALWAYS_HASH_DEPTH,
    hashFn?: IHashFunction
  ) {
    if (!Number.isInteger(depth) || depth < 1 || depth > MAX_ALWAYS_HASH_DEPTH) {
      throw new Error(
        `AlwaysHashMerkleTree: depth must be an integer in [1, ${MAX_ALWAYS_HASH_DEPTH}], got ${depth}`
      )
    }
    this.depth = depth
    this.hashFn = hashFn ?? new PoseidonM31()
  }

  /** Maximum number of leaves the tree can hold (`2^depth`). */
  get capacity(): number {
    // `depth ≤ 32` guarantees `2^depth ≤ 2^32`, well within JS's safe
    // integer range.
    return 2 ** this.depth
  }

  /** Number of leaves currently inserted. */
  get size(): number {
    return this.leaves.length
  }

  /**
   * Append a leaf and return its index. Rejects `0n` because the
   * tree uses `0n` as the empty-leaf sentinel that drives ZSR(0).
   * Rejects when at capacity.
   */
  insert(leaf: bigint): number {
    if (leaf === 0n) {
      throw new Error('AlwaysHashMerkleTree: leaf cannot be zero (collides with empty-leaf sentinel)')
    }
    if (this.leaves.length >= this.capacity) {
      throw new Error(
        `AlwaysHashMerkleTree: tree at capacity (${this.capacity} leaves at depth ${this.depth})`
      )
    }
    const index = this.leaves.length
    this.leaves.push(leaf)
    this.cachedRoot = null
    this.nodes.clear()
    return index
  }

  /** Index of `leaf` in insertion order, or `-1` if absent. */
  indexOf(leaf: bigint): number {
    return this.leaves.indexOf(leaf)
  }

  /** Whether `leaf` was inserted. */
  has(leaf: bigint): boolean {
    return this.leaves.includes(leaf)
  }

  /**
   * Compute (or return cached) root. Always exactly one value per
   * tree state — the headline cross-leaf-agreement property holds by
   * construction.
   */
  async getRoot(): Promise<bigint> {
    if (this.cachedRoot !== null) return this.cachedRoot
    const root = await this.getNodeHash(this.depth, 0)
    this.cachedRoot = root
    return root
  }

  /**
   * Build a depth-D proof for the leaf at `index`. The returned
   * `pathElements` / `pathIndices` are length `this.depth`, and
   * `verifyMerklePath(leaf, pathElements, pathIndices) === root`
   * holds for every leaf in the tree.
   */
  async getProof(index: number): Promise<AlwaysHashMerkleProof> {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error(
        `AlwaysHashMerkleTree: leaf index ${index} out of bounds (size: ${this.leaves.length})`
      )
    }

    const pathElements: bigint[] = []
    const pathIndices: bigint[] = []
    let currentIndex = index

    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = currentIndex ^ 1
      const isLeft = currentIndex % 2 === 0
      const sibling = await this.getNodeHash(level, siblingIndex)
      pathElements.push(sibling)
      pathIndices.push(isLeft ? 0n : 1n)
      currentIndex = currentIndex >>> 1
    }

    return {
      pathElements,
      pathIndices,
      leafIndex: index,
      root: await this.getRoot(),
      depth: this.depth,
    }
  }

  /**
   * Zero-subtree root at `level` — the value an entirely-empty
   * subtree of depth `level` would hash to. Exposed because the
   * asp-whitelist's HTTP layer benefits from sharing these constants
   * with the on-chain side without re-hashing them per request.
   *
   *   ZSR(0) = 0n
   *   ZSR(k) = hashFn(ZSR(k-1), ZSR(k-1))
   */
  async getZeroSubtreeRoot(level: number): Promise<bigint> {
    if (!Number.isInteger(level) || level < 0 || level > this.depth) {
      throw new Error(
        `AlwaysHashMerkleTree: ZSR level ${level} out of range [0, ${this.depth}]`
      )
    }
    await this.ensureZsrCache()
    return this.zsrCache![level]!
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async ensureZsrCache(): Promise<void> {
    if (this.zsrCache !== null) return
    const zsr: bigint[] = new Array(this.depth + 1) as bigint[]
    zsr[0] = 0n
    for (let k = 1; k <= this.depth; k++) {
      const prev = zsr[k - 1]!
      zsr[k] = await this.hashFn.hash2(prev, prev)
    }
    this.zsrCache = zsr
  }

  /**
   * Returns true when the subtree rooted at `(level, index)` is
   * entirely empty — i.e. holds no real leaves. Lets `getNodeHash`
   * short-circuit to ZSR(level) without redundantly recomputing
   * empty-subtree hashes.
   */
  private isSubtreeEmpty(level: number, index: number): boolean {
    // The subtree at (level, index) covers leaf positions
    // [index << level, (index + 1) << level). It's empty iff every
    // position in that range is past the inserted leaves.
    const subtreeStart = index * (1 << level)
    return subtreeStart >= this.leaves.length
  }

  private async getNodeHash(level: number, index: number): Promise<bigint> {
    const key = `${level}:${index}`
    const cached = this.nodes.get(key)
    if (cached !== undefined) return cached

    let hash: bigint
    if (this.isSubtreeEmpty(level, index)) {
      // Whole subtree empty → reuse precomputed ZSR.
      await this.ensureZsrCache()
      hash = this.zsrCache![level]!
    } else if (level === 0) {
      hash = this.leaves[index]!
    } else {
      const left = await this.getNodeHash(level - 1, index * 2)
      const right = await this.getNodeHash(level - 1, index * 2 + 1)
      hash = await this.hashFn.hash2(left, right)
    }
    this.nodes.set(key, hash)
    return hash
  }
}

/** Build an [`AlwaysHashMerkleTree`] from an array of leaves. */
export async function buildAlwaysHashMerkleTree(
  leaves: bigint[],
  depth: number = DEFAULT_ALWAYS_HASH_DEPTH,
  hashFn?: IHashFunction
): Promise<AlwaysHashMerkleTree> {
  const tree = new AlwaysHashMerkleTree(depth, hashFn)
  for (const leaf of leaves) tree.insert(leaf)
  // Eagerly seed the root cache so the first getProof call is cheap.
  await tree.getRoot()
  return tree
}
