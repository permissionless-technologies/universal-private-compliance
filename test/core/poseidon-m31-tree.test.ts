/**
 * Integration: PoseidonM31 + MerkleTree
 *
 * Verifies that the SDK's `MerkleTree` over `PoseidonM31` produces
 * the same per-level chain that the in-trace Poseidon31 ASP-Merkle
 * AIR verifies. Specifically:
 *
 * - Leaves are single M31 elements.
 * - `hash2(left, right)` = first limb of `Poseidon31([left, right])`.
 * - A LeanIMT path verifies via `hashTwo` chained from leaf up to root.
 */

import { describe, expect, it } from 'vitest'
import { MerkleTree, verifyMerkleProof } from '../../src/core/tree.js'
import { PoseidonM31, M31_FIELD_PRIME } from '../../src/core/hash/poseidon-m31.js'
import { hashTwo, M31_PRIME, verifyMerklePath } from '../../src/core/hash/poseidon31.js'

const m31 = new PoseidonM31()

describe('MerkleTree with PoseidonM31', () => {
  it('exposes a root in [0, M31_PRIME)', async () => {
    const tree = new MerkleTree(20, m31)
    tree.insert(123n)
    tree.insert(456n)
    const root = await tree.getRoot()
    expect(root).toBeGreaterThanOrEqual(0n)
    expect(root).toBeLessThan(M31_FIELD_PRIME)
    expect(M31_FIELD_PRIME).toBe(M31_PRIME)
  })

  it('proof verifies via the IHashFunction chain', async () => {
    const tree = new MerkleTree(20, m31)
    const leaves: bigint[] = [11n, 22n, 33n, 44n, 55n]
    for (const l of leaves) tree.insert(l)

    const idx = 2 // leaf 33
    const proof = await tree.getProof(idx)
    expect(proof.leafIndex).toBe(idx)
    expect(await verifyMerkleProof(33n, proof, m31)).toBe(true)
  })

  it('proof reproduces via the lower-level verifyMerklePath helper', async () => {
    // Cross-check: the SDK's `MerkleTree.getProof()` returns a path
    // that, when fed to the AIR-mirroring `verifyMerklePath` (single
    // M31 chain via hashTwo), yields the same root. This is the
    // contract the in-trace AIR enforces.
    const tree = new MerkleTree(20, m31)
    const leaves: bigint[] = [7n, 13n, 19n]
    for (const l of leaves) tree.insert(l)

    const idx = 1 // leaf 13
    const proof = await tree.getProof(idx)

    // Convert pathIndices to bigint M31 form (verifyMerklePath takes bigint).
    const pathIndices = proof.pathIndices.map(i => BigInt(i))

    // LeanIMT zero-sibling propagation: when sibling === 0, the chain
    // skips the hash and propagates `current`. The in-trace AIR does
    // not propagate — it always hashes — so the SDK's path must be
    // padded/stripped of zero levels before being fed to the AIR.
    // Here we replay the same propagation rule the SDK uses to
    // verify the proof shape end-to-end.
    let current = 13n
    for (let i = 0; i < proof.pathElements.length; i++) {
      const sibling = proof.pathElements[i]!
      if (sibling === 0n) continue // LeanIMT propagation
      if (proof.pathIndices[i] === 0) {
        current = hashTwo(current, sibling)
      } else {
        current = hashTwo(sibling, current)
      }
    }
    expect(current).toBe(proof.root)

    // The naked verifyMerklePath helper does NOT propagate (matches the
    // AIR). It produces a different result for the same path because
    // it always hashes. Test this divergence explicitly so consumers
    // know which path-shape the AIR expects.
    const aliasedRoot = verifyMerklePath(13n, proof.pathElements, pathIndices)
    if (proof.pathElements.some(e => e === 0n)) {
      expect(aliasedRoot).not.toBe(proof.root)
    } else {
      expect(aliasedRoot).toBe(proof.root)
    }
  })

  it('rejects insertions of M31-out-of-range values via the underlying perm', async () => {
    const tree = new MerkleTree(20, m31)
    // The tree itself doesn't bounds-check, but the perm does on hash().
    // Inserting >= M31_PRIME and asking for a root surfaces the perm error.
    tree.insert(M31_PRIME) // actually = 2^31 - 1, on the boundary
    tree.insert(M31_PRIME + 1n)
    await expect(tree.getRoot()).rejects.toThrow(/not in/)
  })
})
