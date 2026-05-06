/**
 * Phase 7 entry point: closing the LeanIMT-vs-always-hash mismatch.
 *
 * `poseidon-m31-tree.test.ts` documents the divergence with an explicit
 * assertion that the SDK's LeanIMT root and the AIR-mirroring
 * `verifyMerklePath` disagree on paths with zero siblings. This file
 * pins the contract that closes that gap: `padLeanIMTProofToDepth`
 * transforms a LeanIMT proof into a fixed-depth proof such that
 * `verifyMerklePath` recovers the AIR-shape root by construction.
 */

import { describe, expect, it } from 'vitest'
import { MerkleTree } from '../../src/core/tree.js'
import { PoseidonM31, M31_FIELD_PRIME } from '../../src/core/hash/poseidon-m31.js'
import { verifyMerklePath } from '../../src/core/hash/poseidon31.js'
import { padLeanIMTProofToDepth } from '../../src/core/proof.js'

const m31 = new PoseidonM31()
const ASP_DEPTH = 20

describe('padLeanIMTProofToDepth', () => {
  // -------------------------------------------------------------------------
  // Contract: verifyMerklePath(leaf, padded.pathElements, padded.pathIndices)
  //          === padded.root
  //
  // Holds for every leaf in every (single, sparse, dense, dynamic-depth)
  // tree shape we care about. The remaining tests pin the *shape* of the
  // padded path so we catch refactors that accidentally re-introduce the
  // old "pad with zeros, hope LeanIMT propagation saves us" model.
  // -------------------------------------------------------------------------

  it('roundtrips: padded path replays the AIR-shape root via verifyMerklePath', async () => {
    const tree = new MerkleTree(ASP_DEPTH, m31)
    const leaves = [11n, 22n, 33n, 44n, 55n] // dynamic depth = 3
    for (const l of leaves) tree.insert(l)

    for (let idx = 0; idx < leaves.length; idx++) {
      const leaf = leaves[idx]!
      const proof = await tree.getProof(idx)
      const padded = padLeanIMTProofToDepth(
        leaf,
        proof.pathElements,
        proof.pathIndices,
        ASP_DEPTH
      )

      // Length contract — exactly targetDepth, both arrays.
      expect(padded.pathElements).toHaveLength(ASP_DEPTH)
      expect(padded.pathIndices).toHaveLength(ASP_DEPTH)

      // The contract that the AIR will lean on.
      expect(verifyMerklePath(leaf, padded.pathElements, padded.pathIndices))
        .toBe(padded.root)

      // All path entries fit in M31 (sanity for downstream consumers).
      for (const e of padded.pathElements) expect(e).toBeLessThan(M31_FIELD_PRIME)
    }
  })

  it('AIR-shape root differs from LeanIMT root whenever propagation occurred', async () => {
    // Trees with non-power-of-two membership counts produce LeanIMT
    // proofs that include propagation levels — exactly the case the
    // helper exists to handle.
    const tree = new MerkleTree(ASP_DEPTH, m31)
    const leaves = [7n, 13n, 19n] // dynamic depth = 2, leaf 19 has zero sibling at level 1
    for (const l of leaves) tree.insert(l)
    const leanRoot = await tree.getRoot()

    // Pick the leaf whose LeanIMT proof carries a zero sibling.
    const proof = await tree.getProof(2)
    expect(proof.pathElements.some((e) => e === 0n)).toBe(true)

    const padded = padLeanIMTProofToDepth(
      19n,
      proof.pathElements,
      proof.pathIndices,
      ASP_DEPTH
    )

    // The AIR-shape root must reproduce via the always-hash verifier.
    expect(verifyMerklePath(19n, padded.pathElements, padded.pathIndices))
      .toBe(padded.root)

    // …and it must differ from the LeanIMT root, otherwise we haven't
    // actually closed the gap the helper exists to close.
    expect(padded.root).not.toBe(leanRoot)
  })

  it('padded indices are non-zero only at levels surviving propagation strip', async () => {
    // Pin layout: zero-sibling LeanIMT levels are dropped, and the
    // tail of the padded path is always (0n, 0n) so the AIR's selector
    // schedule at depth 20 lines up with our padding bytes.
    const tree = new MerkleTree(ASP_DEPTH, m31)
    const leaves = [7n, 13n, 19n]
    for (const l of leaves) tree.insert(l)

    const proof = await tree.getProof(2)
    const padded = padLeanIMTProofToDepth(
      19n,
      proof.pathElements,
      proof.pathIndices,
      ASP_DEPTH
    )

    // Find the cutover: where do the kept (sibling, idx) entries end?
    const keptEntries = proof.pathElements
      .map((sibling, i) => ({ sibling, idx: BigInt(proof.pathIndices[i]!) }))
      .filter((e) => e.sibling !== 0n)

    expect(keptEntries.length).toBeGreaterThan(0)
    for (let i = 0; i < keptEntries.length; i++) {
      expect(padded.pathElements[i]).toBe(keptEntries[i]!.sibling)
      expect(padded.pathIndices[i]).toBe(keptEntries[i]!.idx)
    }
    for (let i = keptEntries.length; i < ASP_DEPTH; i++) {
      expect(padded.pathElements[i]).toBe(0n)
      expect(padded.pathIndices[i]).toBe(0n)
    }
  })

  it('single-member tree → pure zero-hash chain of length targetDepth', async () => {
    // Edge case: with one leaf, the LeanIMT proof has dynamic depth 0
    // (no levels at all). The AIR-shape proof is therefore a pure
    // zero-hash chain rooted at the leaf, padded out 20 deep.
    const tree = new MerkleTree(ASP_DEPTH, m31)
    tree.insert(42n)

    const proof = await tree.getProof(0)
    expect(proof.pathElements).toHaveLength(0)

    const padded = padLeanIMTProofToDepth(
      42n,
      proof.pathElements,
      proof.pathIndices,
      ASP_DEPTH
    )

    expect(padded.pathElements).toEqual(Array(ASP_DEPTH).fill(0n))
    expect(padded.pathIndices).toEqual(Array(ASP_DEPTH).fill(0n))
    expect(verifyMerklePath(42n, padded.pathElements, padded.pathIndices))
      .toBe(padded.root)
  })

  it('documents the cross-leaf divergence: sparse trees do NOT yield a single shared root', async () => {
    // The honest counterpart to the "self-consistent" property: in a
    // LeanIMT tree whose leafCount is not a power of two, leaves
    // carrying *different* numbers of propagation levels produce
    // depth-20 proofs that all self-verify but land on *different*
    // roots. Pinning this divergence so a future refactor can't
    // accidentally claim a global "AIR-shape root" derivable from
    // padLeanIMTProofToDepth alone — the proper fix is a separate
    // always-hash tree class (see helper docstring).
    const tree = new MerkleTree(ASP_DEPTH, m31)
    const leaves = [101n, 102n, 103n, 104n, 105n] // 5 → propagation kicks in
    for (const l of leaves) tree.insert(l)

    const roots = await Promise.all(
      leaves.map(async (leaf, idx) => {
        const proof = await tree.getProof(idx)
        const padded = padLeanIMTProofToDepth(
          leaf,
          proof.pathElements,
          proof.pathIndices,
          ASP_DEPTH
        )
        // Self-consistency still holds for each leaf individually:
        expect(verifyMerklePath(leaf, padded.pathElements, padded.pathIndices))
          .toBe(padded.root)
        return padded.root
      })
    )

    // …but the roots are not all equal: the leftmost leaf (3 non-zero
    // LeanIMT levels) and the rightmost (1 non-zero level) fold a
    // different number of real hashes before zero-padding kicks in.
    const distinct = new Set(roots.map((r) => r.toString()))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('full-depth LeanIMT proof (no propagation) → AIR-shape root === LeanIMT root', async () => {
    // When the LeanIMT tree is exactly targetDepth deep with no zero
    // siblings, the helper degenerates to identity and the two roots
    // agree. This is the only configuration where they do.
    const fullDepth = 3
    const leafCount = 1 << fullDepth // 8 leaves → depth exactly 3
    const tree = new MerkleTree(fullDepth, m31)
    for (let i = 0; i < leafCount; i++) tree.insert(BigInt(100 + i))

    const leanRoot = await tree.getRoot()
    const proof = await tree.getProof(3)
    expect(proof.pathElements.every((e) => e !== 0n)).toBe(true)
    expect(proof.pathElements).toHaveLength(fullDepth)

    const padded = padLeanIMTProofToDepth(
      103n,
      proof.pathElements,
      proof.pathIndices,
      fullDepth
    )
    expect(padded.root).toBe(leanRoot)
  })

  it('accepts bigint pathIndices (the verifyMerklePath shape) directly', async () => {
    const tree = new MerkleTree(ASP_DEPTH, m31)
    for (const l of [1n, 2n, 3n, 4n]) tree.insert(l)

    const proof = await tree.getProof(2)
    const indicesAsBigint = proof.pathIndices.map((i) => BigInt(i))

    const fromNumbers = padLeanIMTProofToDepth(
      3n,
      proof.pathElements,
      proof.pathIndices,
      ASP_DEPTH
    )
    const fromBigints = padLeanIMTProofToDepth(
      3n,
      proof.pathElements,
      indicesAsBigint,
      ASP_DEPTH
    )
    expect(fromNumbers).toEqual(fromBigints)
  })

  it('rejects mismatched element / index lengths', () => {
    expect(() =>
      padLeanIMTProofToDepth(1n, [2n, 3n], [0], ASP_DEPTH)
    ).toThrow(/length mismatch/)
  })

  it('rejects input depth larger than targetDepth', () => {
    // A LeanIMT tree taller than the AIR can verify is a configuration
    // bug — fail fast rather than silently truncate.
    expect(() =>
      padLeanIMTProofToDepth(
        1n,
        Array(21).fill(1n) as bigint[],
        Array(21).fill(0) as number[],
        ASP_DEPTH
      )
    ).toThrow(/exceeds targetDepth/)
  })

  it('rejects out-of-range index bits', () => {
    expect(() =>
      padLeanIMTProofToDepth(1n, [2n], [2], ASP_DEPTH)
    ).toThrow(/must be 0 or 1/)
  })

  it('honours an injected hashTwoFn (proves Poseidon31-independence)', () => {
    // A trivial XOR-style fake hash makes the algorithm's structure
    // visible: with two non-zero siblings a, b at idx=0, then 18 zero
    // pads, the fake produces leaf ⊕ a ⊕ b ⊕ 0 ⊕ 0 ⊕ … = leaf ⊕ a ⊕ b.
    const fakeHash = (l: bigint, r: bigint): bigint => l ^ r

    const padded = padLeanIMTProofToDepth(
      0xdeadn,
      [0xa1n, 0xb2n], // both non-zero
      [0, 0],
      ASP_DEPTH,
      fakeHash
    )
    let expected = 0xdeadn ^ 0xa1n ^ 0xb2n
    // 18 zero-pads each XOR with 0 → no-op under XOR.
    expect(padded.root).toBe(expected)

    // verifyMerklePath uses Poseidon31 hashTwo under the hood, so it
    // would NOT match here — exactly what we want: the injected hash
    // is for testing the algorithm's structure, not for production
    // proofs. Sanity check that we haven't accidentally cross-wired:
    expect(padded.pathIndices.every((i) => i === 0n)).toBe(true)
  })
})

