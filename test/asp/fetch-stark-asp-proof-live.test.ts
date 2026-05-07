/**
 * Phase 4 (Track C, post-cutover) live smoke test.
 *
 * Fetches a STARK-side ASP proof from the production asp-whitelist
 * service via the SDK's `fetchStarkASPProof` helper, then validates
 * the two non-ragequit invariants the on-chain pool relies on:
 *
 *   1. The fetched `proof.root` equals the value `/stark-root` is
 *      currently advertising — every member proof verifies against
 *      the same root (AlwaysHashMerkleTree's headline property), and
 *      that root is what `currentStarkRoot(aspId)` exposes on-chain.
 *
 *   2. `verifyMerklePath(leaf, pathElements, pathIndices) === root`
 *      — the AIR-shape always-hash verifier reproduces the same root
 *      from the witness, so a proof built with these values would
 *      satisfy the in-trace asp_merkle_root constraint.
 *
 * Together these mean: if a STARK transfer/withdraw witness is built
 * with this proof's pathElements/pathIndices and `aspRootBigInt =
 * proof.root`, the AIR will accept it and the on-chain
 * _requireValidSTARKRoot(aspRoot) check will pass — i.e. the full
 * non-ragequit path is wired end-to-end.
 *
 * **Skip gates:**
 *  - Default-skipped offline. Set `UPC_LIVE_TESTS=1` to opt in.
 *  - Set `UPC_LIVE_TESTS_ADDRESS=0x...` to override the target. The
 *    address must be a checksummed member of the configured ASP. The
 *    default is the single-member address discovered on Sepolia after
 *    the 2026-05-07 always-hash cutover; will need updating if the
 *    membership set changes shape.
 */

import { describe, expect, it } from 'vitest'
import {
  fetchStarkASPRoot,
  fetchStarkASPProof,
} from '../../src/asp/fetch-helpers.js'
import { verifyMerklePath } from '../../src/core/hash/poseidon31.js'

const ENABLED = process.env.UPC_LIVE_TESTS === '1'
const SERVICE_URL =
  process.env.UPC_ASP_WHITELIST_URL ?? 'https://asp-whitelist.upd.io'
const TARGET_ADDRESS = (
  process.env.UPC_LIVE_TESTS_ADDRESS ??
  '0x5AD2d0Ebe451B9bC2550e600f2D2Acd31113053E'
) as `0x${string}`
const ASP_DEPTH = 20

describe.skipIf(!ENABLED)('fetchStarkASPProof — live non-ragequit smoke', () => {
  it('fetched proof verifies under always-hash semantics and matches /stark-root', async () => {
    const [publishedRoot, proof] = await Promise.all([
      fetchStarkASPRoot(SERVICE_URL),
      fetchStarkASPProof(SERVICE_URL, TARGET_ADDRESS),
    ])

    expect(proof, `${TARGET_ADDRESS} should be whitelisted in the configured ASP`)
      .not.toBeNull()
    if (proof === null) return

    // (1) Cross-leaf root agreement: the proof's root === published root
    // === on-chain currentStarkRoot(aspId). True because every leaf's
    // proof in an AlwaysHashMerkleTree converges on the same root.
    expect(proof.root).toBe(publishedRoot)

    // (2) Shape invariants pinned by the wire format. These match what
    // the upp-sdk witness builders expect after Number()-coercion of
    // pathElements.
    expect(proof.depth).toBe(ASP_DEPTH)
    expect(proof.pathElements).toHaveLength(ASP_DEPTH)
    expect(proof.pathIndices).toHaveLength(ASP_DEPTH)
    expect(proof.pathIndices.every((i) => i === 0 || i === 1)).toBe(true)

    // (3) The proof verifies under the AIR-shape always-hash verifier
    // — i.e. an in-trace ASP-Merkle proof built with these values would
    // satisfy `asp_merkle_perm.state[N_ROUNDS][0] == pub_asp_root`.
    const pathIndicesBig = proof.pathIndices.map((i) => BigInt(i))
    const recomputed = verifyMerklePath(
      proof.leaf,
      proof.pathElements,
      pathIndicesBig,
    )
    expect(recomputed).toBe(proof.root)
  }, 30_000)
})
