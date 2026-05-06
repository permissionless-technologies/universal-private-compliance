/**
 * Membership Proof Generation
 *
 * Generate ZK-ready membership proofs for ASP trees.
 *
 * Two proof-shape conventions live here:
 *
 * - **LeanIMT (SNARK / BLS12-381 side, default).** Dynamic depth with
 *   zero-sibling propagation. `verifyMembershipProof` mirrors the
 *   convention: when `pathElements[i] === 0n`, skip the hash and
 *   propagate `current`. The verifying circuit on the SNARK side
 *   replays the same rule, so zero-padding extra levels is a no-op.
 * - **Always-hash, fixed-depth (STARK / Poseidon31 side).** No
 *   propagation; every level hashes regardless of the sibling. The
 *   in-trace AIR (`Poseidon31MerklePathEval` at `ASP_TREE_DEPTH = 20`)
 *   uses this convention, so a LeanIMT proof must be transformed via
 *   `padLeanIMTProofToDepth` before being fed to the prover.
 *
 * Default hash: Poseidon over BLS12-381 (128-bit security) for the
 * LeanIMT path; Poseidon31 over M31 for the always-hash path.
 */

import type { IHashFunction } from './hash/interface.js'
import { getDefaultHashFunction } from './hash/index.js'
import { hashTwo as poseidon31HashTwo } from './hash/poseidon31.js'
import { MerkleTree, DEFAULT_TREE_DEPTH } from './tree.js'
import type { MembershipProof } from './types.js'

/**
 * Pad LeanIMT proof arrays to a fixed depth.
 * Extra levels get zero siblings — `verifyMembershipProof` and the
 * SNARK circuit both treat zero-sibling levels as propagation no-ops,
 * so extending a short proof with zeros leaves verification semantics
 * unchanged. **NOT for STARK paths** — see `padLeanIMTProofToDepth`.
 */
function padProof(
  elements: bigint[],
  indices: number[],
  targetDepth: number
): { elements: bigint[]; indices: number[] } {
  const padElements = [...elements, ...Array(Math.max(0, targetDepth - elements.length)).fill(0n) as bigint[]]
  const padIndices = [...indices, ...Array(Math.max(0, targetDepth - indices.length)).fill(0) as number[]]
  return {
    elements: padElements.slice(0, targetDepth),
    indices: padIndices.slice(0, targetDepth),
  }
}

/**
 * Generate a membership proof for a single-member tree.
 *
 * With LeanIMT single-child optimization, a single-leaf tree
 * has root = leaf, and all path elements are 0.
 */
export function generateSingleMemberProof(
  identity: bigint,
  treeDepth: number = DEFAULT_TREE_DEPTH
): MembershipProof {
  return {
    root: identity,
    pathElements: Array(treeDepth).fill(0n) as bigint[],
    pathIndices: Array(treeDepth).fill(0) as number[],
  }
}

/**
 * Generate a membership proof for a multi-member tree.
 *
 * @param identity - The identity to prove membership for
 * @param allMembers - All members in the tree
 * @param treeDepth - Target tree depth for padding (default: 20)
 * @param hashFn - Hash function to use (default: Poseidon-BLS12-381)
 */
export async function generateMultiMemberProof(
  identity: bigint,
  allMembers: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH,
  hashFn?: IHashFunction
): Promise<MembershipProof> {
  if (allMembers.length <= 1) {
    return generateSingleMemberProof(identity, treeDepth)
  }

  const tree = new MerkleTree(treeDepth, hashFn)
  for (const member of allMembers) {
    tree.insert(member)
  }

  const index = tree.indexOf(identity)
  if (index === -1) {
    throw new Error(`Identity not found in member list (${allMembers.length} members)`)
  }

  const proof = await tree.getProof(index)
  const padded = padProof(proof.pathElements, proof.pathIndices, treeDepth)

  return {
    root: proof.root,
    pathElements: padded.elements,
    pathIndices: padded.indices,
  }
}

/**
 * Generate a membership proof, automatically choosing single or multi-member mode.
 *
 * @param identity - The identity to prove membership for
 * @param members - All members in the tree
 * @param treeDepth - Target tree depth for padding (default: 20)
 * @param hashFn - Hash function to use (default: Poseidon-BLS12-381)
 */
export async function generateMembershipProof(
  identity: bigint,
  members?: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH,
  hashFn?: IHashFunction
): Promise<MembershipProof> {
  if (!members || members.length === 0) {
    return generateSingleMemberProof(identity, treeDepth)
  }
  return generateMultiMemberProof(identity, members, treeDepth, hashFn)
}

/**
 * Compute the Merkle root for a set of members.
 */
export async function computeMerkleRoot(
  members: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH,
  hashFn?: IHashFunction
): Promise<bigint> {
  if (members.length === 0) return 0n
  if (members.length === 1) return members[0]!
  const tree = new MerkleTree(treeDepth, hashFn)
  for (const member of members) {
    tree.insert(member)
  }
  return tree.getRoot()
}

/**
 * Verify a membership proof locally.
 *
 * @param identity - The identity to verify
 * @param proof - The membership proof to check
 * @param hashFn - Hash function to use (default: Poseidon-BLS12-381)
 */
export async function verifyMembershipProof(
  identity: bigint,
  proof: MembershipProof,
  hashFn?: IHashFunction
): Promise<boolean> {
  const hash = hashFn ?? getDefaultHashFunction()

  let current = identity

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i] ?? 0n
    const index = proof.pathIndices[i] ?? 0

    if (sibling === 0n) {
      continue
    }

    if (index === 0) {
      current = await hash.hash2(current, sibling)
    } else {
      current = await hash.hash2(sibling, current)
    }
  }

  return current === proof.root
}

// ---------------------------------------------------------------------------
// STARK / always-hash conversion
// ---------------------------------------------------------------------------

/**
 * Padded path + AIR-shape root produced by [`padLeanIMTProofToDepth`].
 *
 * `root` is the AIR-shape root: the value an always-hash verifier of
 * `targetDepth` levels lands on after starting from the leaf and
 * processing `pathElements` / `pathIndices`. Crucially this is **not**
 * (in general) the LeanIMT root, because the always-hash semantics
 * differs from LeanIMT propagation:
 *
 *   - When the LeanIMT proof carries a zero sibling at level `i`, the
 *     LeanIMT root computation skips the hash and propagates `current`.
 *   - The AIR (and `verifyMerklePath`) hashes anyway. Once you replay
 *     a LeanIMT proof through always-hash semantics, the resulting
 *     root differs from the LeanIMT root the moment any sibling was
 *     zero or the dynamic LeanIMT depth was below `targetDepth`.
 *
 * The on-chain pool's `pub_asp_root` is whatever the AIR computes, so
 * this `root` is what the asp-whitelist must publish for STARK paths.
 * The `pathElements` / `pathIndices` fields satisfy the contract
 * `verifyMerklePath(leaf, pathElements, pathIndices) === root`.
 */
export interface AIRShapeProof {
  /** Path siblings at the AIR's fixed depth. Length equals `targetDepth`. */
  pathElements: bigint[]
  /**
   * Path index bits, one per level. Length equals `targetDepth`.
   * Bigint to match the in-circuit M31 representation that
   * `verifyMerklePath` consumes.
   */
  pathIndices: bigint[]
  /**
   * AIR-shape root: the value `verifyMerklePath` recovers given
   * `(leaf, pathElements, pathIndices)`. Differs from the input
   * LeanIMT root whenever propagation kicked in.
   */
  root: bigint
}

/**
 * **TRANSITIONAL — not the long-term canonical tree model.** This is
 * a compatibility shim for adapting LeanIMT proofs (the SDK's existing
 * `MerkleTree` shape) to the always-hash Poseidon31 AIR until the
 * STARK-side tree itself is rebuilt under always-hash semantics
 * (`AlwaysHashMerkleTree`, planned). The helper's per-leaf output is
 * self-consistent, but in sparsely-populated LeanIMT trees different
 * leaves produce different roots, so it cannot back a single
 * `pub_asp_root` shared by every member — see the limitation note
 * below before reaching for it in production paths.
 *
 * Transform a LeanIMT proof into a self-consistent, always-hash,
 * fixed-depth proof the in-trace Poseidon31 ASP-Merkle AIR can
 * consume.
 *
 * Algorithm (proof of correctness sits inline in
 * `pad-lean-imt-proof-to-depth.test.ts`):
 *
 *   1. **Strip propagation levels.** Drop every `(sibling = 0n,
 *      indexBit)` pair from the input — those are LeanIMT no-ops that
 *      the AIR has no analogue for. Keep the relative order of the
 *      surviving non-zero levels.
 *   2. **Replay survivors through always-hash.** Walking from the
 *      leaf, fold each kept level through the supplied `hashTwoFn`
 *      (default: Poseidon31 `hashTwo`) using the level's `indexBit`.
 *   3. **Extend with a zero-hash chain to `targetDepth`.** For every
 *      remaining level, append `(sibling = 0n, indexBit = 0n)` and
 *      fold `current = hashTwoFn(current, 0n)`. The output's
 *      `pathElements`/`pathIndices` are length `targetDepth`; the
 *      final `current` is the AIR-shape root the prover will see.
 *
 * `verifyMerklePath(leaf, output.pathElements, output.pathIndices)`
 * is guaranteed by construction to return `output.root`.
 *
 * # Limitation: cross-leaf root agreement
 *
 * In a sparsely-populated LeanIMT tree (`leafCount` not a power of
 * two), different leaves carry different numbers of propagation
 * levels in their proofs. Stripping then padding produces depth-20
 * proofs that all self-verify but **land on different roots across
 * leaves**. Concretely, for a 5-leaf tree the leftmost leaf has 3
 * non-zero LeanIMT levels (3 real hashes + 17 zero pads = 20), while
 * the rightmost has 1 (1 real hash + 19 zero pads = 20). The two
 * roots differ.
 *
 * This is fine for verifying *one* membership proof end-to-end (the
 * AIR replays exactly what this helper computed), but it means the
 * asp-whitelist cannot use the LeanIMT-then-pad shape to publish a
 * single `pub_asp_root` shared by every member. That requires
 * building the tree itself under always-hash semantics — every
 * internal node hashes regardless, empty subtrees represented by
 * precomputed `ZSR(k)` values. Tracked as a Phase 7 follow-up.
 *
 * Until that follow-up lands, downstream consumers should call this
 * helper only when:
 *   - The LeanIMT proof has no zero siblings (the `leafCount` is a
 *     power of two and the leaf sits in the dense subtree), OR
 *   - They are operating against a single-membership root produced
 *     for that specific leaf (i.e., not a globally-published one).
 *
 * @param leaf — The leaf value the proof attests membership for.
 * @param pathElements — Sibling at each LeanIMT level.
 * @param pathIndices — Side bit at each LeanIMT level (0 = current is
 *   left, 1 = current is right). Accepted as `number[]` (the
 *   `MerkleTree.getProof()` shape) or `bigint[]`.
 * @param targetDepth — The AIR's fixed depth (e.g. `20` for ASP-Merkle,
 *   `32` for state-Merkle).
 * @param hashTwoFn — Pair-hash override. Defaults to the Poseidon31
 *   `hashTwo` that the AIR's chain primitive uses. Override only for
 *   unit tests or alternative AIRs.
 * @throws if `pathElements.length` exceeds `targetDepth` (a LeanIMT
 *   path strictly longer than the AIR depth has nowhere to go) or if
 *   `pathElements.length !== pathIndices.length`.
 */
export function padLeanIMTProofToDepth(
  leaf: bigint,
  pathElements: bigint[],
  pathIndices: readonly (number | bigint)[],
  targetDepth: number,
  hashTwoFn: (left: bigint, right: bigint) => bigint = poseidon31HashTwo
): AIRShapeProof {
  if (pathElements.length !== pathIndices.length) {
    throw new Error(
      `padLeanIMTProofToDepth: pathElements (${pathElements.length}) vs pathIndices (${pathIndices.length}) length mismatch`
    )
  }
  if (pathElements.length > targetDepth) {
    throw new Error(
      `padLeanIMTProofToDepth: input depth (${pathElements.length}) exceeds targetDepth (${targetDepth}) — the LeanIMT tree is taller than the AIR can verify`
    )
  }

  const outElements: bigint[] = []
  const outIndices: bigint[] = []
  let current = leaf

  // Pass 1: strip zero-sibling levels, replay survivors through always-hash.
  for (let i = 0; i < pathElements.length; i++) {
    const sibling = pathElements[i]!
    if (sibling === 0n) {
      // LeanIMT propagation level — the AIR has no representation for
      // it because it always hashes. Drop the level entirely.
      continue
    }
    const idxRaw = pathIndices[i]!
    const idx = typeof idxRaw === 'bigint' ? idxRaw : BigInt(idxRaw)
    if (idx !== 0n && idx !== 1n) {
      throw new Error(
        `padLeanIMTProofToDepth: pathIndices[${i}] = ${idx} must be 0 or 1`
      )
    }
    outElements.push(sibling)
    outIndices.push(idx)
    current = idx === 0n ? hashTwoFn(current, sibling) : hashTwoFn(sibling, current)
  }

  // Pass 2: zero-pad to targetDepth using always-hash. Each padded
  // level uses indexBit = 0 by convention (current goes on the left).
  while (outElements.length < targetDepth) {
    outElements.push(0n)
    outIndices.push(0n)
    current = hashTwoFn(current, 0n)
  }

  return {
    pathElements: outElements,
    pathIndices: outIndices,
    root: current,
  }
}

