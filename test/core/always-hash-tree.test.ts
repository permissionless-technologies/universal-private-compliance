/**
 * AlwaysHashMerkleTree — fixed-depth, no-propagation Merkle tree for
 * the STARK side. The headline contract this file pins:
 *
 *   For every leaf in the same tree, `getProof(idx).root` is the
 *   same value, AND `verifyMerklePath(leaf, pathElements,
 *   pathIndices) === root` — independent of how sparsely populated
 *   the tree is.
 *
 * That's the property `padLeanIMTProofToDepth` couldn't deliver, and
 * the reason this class exists.
 */

import { describe, expect, it } from 'vitest'
import {
  AlwaysHashMerkleTree,
  buildAlwaysHashMerkleTree,
  DEFAULT_ALWAYS_HASH_DEPTH,
} from '../../src/core/always-hash-tree.js'
import { MerkleTree } from '../../src/core/tree.js'
import { PoseidonM31, M31_FIELD_PRIME } from '../../src/core/hash/poseidon-m31.js'
import { hashTwo, verifyMerklePath } from '../../src/core/hash/poseidon31.js'
import { padLeanIMTProofToDepth } from '../../src/core/proof.js'

const m31 = new PoseidonM31()
const ASP_DEPTH = 20

describe('AlwaysHashMerkleTree', () => {
  // -------------------------------------------------------------------------
  // Headline invariant: every leaf's proof verifies against the same root.
  // -------------------------------------------------------------------------

  it('cross-leaf root agreement: every member proof verifies against ONE root', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    const leaves = [11n, 22n, 33n, 44n, 55n, 66n, 77n] // 7 leaves → sparse subtree, the case LeanIMT couldn't handle
    for (const l of leaves) tree.insert(l)

    const root = await tree.getRoot()

    for (let idx = 0; idx < leaves.length; idx++) {
      const proof = await tree.getProof(idx)
      expect(proof.root).toBe(root) // every leaf agrees on the root
      expect(proof.depth).toBe(ASP_DEPTH)
      expect(proof.pathElements).toHaveLength(ASP_DEPTH)
      expect(proof.pathIndices).toHaveLength(ASP_DEPTH)
      expect(verifyMerklePath(leaves[idx]!, proof.pathElements, proof.pathIndices))
        .toBe(root)
    }
  })

  it('membership root advances deterministically with each insert', async () => {
    // Snapshot roots after each insert so consumers can rely on a
    // stable "after we add this address, the root becomes X" shape.
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    const seen = new Set<bigint>()
    for (let i = 1; i <= 5; i++) {
      tree.insert(BigInt(100 + i))
      const r = await tree.getRoot()
      expect(seen.has(r)).toBe(false) // root must change each insert
      seen.add(r)
    }
  })

  // -------------------------------------------------------------------------
  // ZSR table: precomputed empty-subtree roots.
  // -------------------------------------------------------------------------

  it('ZSR(0) = 0n and ZSR(k) = hashTwo(ZSR(k-1), ZSR(k-1))', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    expect(await tree.getZeroSubtreeRoot(0)).toBe(0n)
    let prev = 0n
    for (let k = 1; k <= ASP_DEPTH; k++) {
      const got = await tree.getZeroSubtreeRoot(k)
      expect(got).toBe(hashTwo(prev, prev))
      prev = got
    }
  })

  it('empty tree root = ZSR(depth)', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    const expected = await tree.getZeroSubtreeRoot(ASP_DEPTH)
    expect(await tree.getRoot()).toBe(expected)
  })

  it('ZSR cache is a single source of truth (same value across instances at same depth)', async () => {
    const a = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    const b = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    for (let k = 0; k <= ASP_DEPTH; k++) {
      expect(await a.getZeroSubtreeRoot(k)).toBe(await b.getZeroSubtreeRoot(k))
    }
  })

  // -------------------------------------------------------------------------
  // Equivalence with padLeanIMTProofToDepth on power-of-two trees.
  // -------------------------------------------------------------------------

  it('agrees with LeanIMT + padLeanIMTProofToDepth when the LeanIMT proof has no propagation', async () => {
    // Power-of-two leafCount with `depth === log2(leafCount)`: the
    // LeanIMT proof has no zero siblings, so padding is identity-on
    // -path and the two trees compute the same root.
    const fullDepth = 3
    const leafCount = 1 << fullDepth // 8
    const leaves: bigint[] = []
    for (let i = 0; i < leafCount; i++) leaves.push(BigInt(0x1000 + i))

    const lean = new MerkleTree(fullDepth, m31)
    const always = new AlwaysHashMerkleTree(fullDepth, m31)
    for (const l of leaves) {
      lean.insert(l)
      always.insert(l)
    }

    expect(await lean.getRoot()).toBe(await always.getRoot())

    // Cross-check the proofs match too.
    for (let i = 0; i < leafCount; i++) {
      const leanProof = await lean.getProof(i)
      const padded = padLeanIMTProofToDepth(
        leaves[i]!,
        leanProof.pathElements,
        leanProof.pathIndices,
        fullDepth
      )
      const alwaysProof = await always.getProof(i)
      expect(padded.root).toBe(alwaysProof.root)
      expect(padded.pathElements).toEqual(alwaysProof.pathElements)
      expect(padded.pathIndices).toEqual(alwaysProof.pathIndices)
    }
  })

  it('diverges from LeanIMT root in sparse trees (the reason this class exists)', async () => {
    // The same input set the padLeanIMTProofToDepth divergence test
    // hits — but here the always-hash tree gives a single coherent
    // root that none of the per-leaf padded LeanIMT roots match.
    const leaves = [101n, 102n, 103n, 104n, 105n] // 5 → sparse
    const lean = new MerkleTree(ASP_DEPTH, m31)
    const always = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    for (const l of leaves) {
      lean.insert(l)
      always.insert(l)
    }
    const leanRoot = await lean.getRoot()
    const alwaysRoot = await always.getRoot()

    expect(alwaysRoot).not.toBe(leanRoot) // different model, different root

    // Importantly: every always-hash member proof verifies against
    // alwaysRoot, even though the corresponding padded LeanIMT proofs
    // do not converge to a single root.
    for (let idx = 0; idx < leaves.length; idx++) {
      const proof = await always.getProof(idx)
      expect(proof.root).toBe(alwaysRoot)
      expect(verifyMerklePath(leaves[idx]!, proof.pathElements, proof.pathIndices))
        .toBe(alwaysRoot)
    }
  })

  // -------------------------------------------------------------------------
  // M31 sanity, capacity, error paths.
  // -------------------------------------------------------------------------

  it('all path entries fit in M31 (sanity check for downstream AIR consumption)', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    for (let i = 1; i <= 9; i++) tree.insert(BigInt(i * 1000))
    const proof = await tree.getProof(4)
    for (const e of proof.pathElements) {
      expect(e).toBeGreaterThanOrEqual(0n)
      expect(e).toBeLessThan(M31_FIELD_PRIME)
    }
  })

  it('rejects 0n leaf (collision with empty-leaf sentinel)', () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    expect(() => tree.insert(0n)).toThrow(/cannot be zero/)
  })

  it('rejects insertion past capacity', () => {
    const tree = new AlwaysHashMerkleTree(2, m31) // capacity 4
    for (let i = 1; i <= 4; i++) tree.insert(BigInt(i))
    expect(() => tree.insert(99n)).toThrow(/at capacity/)
  })

  it('rejects out-of-range depth in constructor', () => {
    expect(() => new AlwaysHashMerkleTree(0, m31)).toThrow(/depth must be/)
    expect(() => new AlwaysHashMerkleTree(33, m31)).toThrow(/depth must be/)
    expect(() => new AlwaysHashMerkleTree(2.5, m31)).toThrow(/depth must be/)
  })

  it('rejects out-of-bounds proof index', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    tree.insert(1n)
    await expect(tree.getProof(-1)).rejects.toThrow(/out of bounds/)
    await expect(tree.getProof(1)).rejects.toThrow(/out of bounds/)
  })

  it('rejects out-of-range ZSR level', async () => {
    const tree = new AlwaysHashMerkleTree(ASP_DEPTH, m31)
    await expect(tree.getZeroSubtreeRoot(-1)).rejects.toThrow(/out of range/)
    await expect(tree.getZeroSubtreeRoot(ASP_DEPTH + 1)).rejects.toThrow(/out of range/)
  })

  it('buildAlwaysHashMerkleTree seeds the root cache for cheap subsequent reads', async () => {
    const tree = await buildAlwaysHashMerkleTree(
      [1n, 2n, 3n],
      DEFAULT_ALWAYS_HASH_DEPTH,
      m31
    )
    expect(tree.size).toBe(3)
    const root = await tree.getRoot()
    // Sanity: same root via the imperative path.
    const reference = new AlwaysHashMerkleTree(DEFAULT_ALWAYS_HASH_DEPTH, m31)
    reference.insert(1n)
    reference.insert(2n)
    reference.insert(3n)
    expect(root).toBe(await reference.getRoot())
  })
})
