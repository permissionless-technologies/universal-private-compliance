/**
 * Phase 7 live-proof integration test.
 *
 * Fetches a STARK-side ASP proof from the production asp-whitelist
 * service, runs it through `padLeanIMTProofToDepth`, and asserts that
 * `verifyMerklePath` reproduces the helper's `root` field. This
 * exercises the full request → parse → pad → AIR-verify chain against
 * a real, currently-published tree.
 *
 * **Skip gates:**
 *
 *  - Default-skipped offline. Set `UPC_LIVE_TESTS=1` to opt in.
 *  - Skipped if the service does not advertise at least one address
 *    via `/members` (we can't generate a proof without a member).
 *  - The service still publishes the LeanIMT root, so the helper's
 *    AIR-shape root will *not* match the on-chain `pub_asp_root` until
 *    the asp-whitelist switches publishing models. That mismatch is
 *    expected and out of scope for this test — we only assert the
 *    self-consistency `verifyMerklePath(...) === paddedRoot`.
 */

import { describe, expect, it } from 'vitest'
import { padLeanIMTProofToDepth } from '../../src/core/proof.js'
import { verifyMerklePath } from '../../src/core/hash/poseidon31.js'

const ENABLED = process.env.UPC_LIVE_TESTS === '1'
const SERVICE_URL =
  process.env.UPC_ASP_WHITELIST_URL ?? 'https://asp-whitelist.upd.io'
const ASP_DEPTH = 20

describe.skipIf(!ENABLED)('padLeanIMTProofToDepth — live asp-whitelist proof', () => {
  it('a real /stark-proof/:address response replays through verifyMerklePath', async () => {
    // 1. Pull at least one address from the public membership list.
    const membersResp = await fetch(`${SERVICE_URL}/members`)
    expect(membersResp.ok, `${SERVICE_URL}/members → ${membersResp.status}`).toBe(true)
    const membersJson = (await membersResp.json()) as { members?: string[] }
    const members = membersJson.members ?? []
    if (members.length === 0) {
      // Service is up but the curated set is empty — the proof endpoint
      // would reject for any address. Skip rather than fabricate one.
      console.warn('asp-whitelist /members returned 0 members; skipping')
      return
    }
    const target = members[0]!

    // 2. Pull a STARK-side proof for that address.
    const proofResp = await fetch(`${SERVICE_URL}/stark-proof/${target}`)
    expect(proofResp.ok, `${SERVICE_URL}/stark-proof/${target} → ${proofResp.status}`).toBe(true)
    type StarkProofWire = {
      leaf: string | number | bigint
      leafIndex?: number
      pathElements: (string | number | bigint)[]
      pathIndices: (string | number | bigint)[]
      root?: string | number | bigint
    }
    const wire = (await proofResp.json()) as StarkProofWire

    const leaf = BigInt(wire.leaf)
    const pathElements = wire.pathElements.map((x) => BigInt(x))
    const pathIndices = wire.pathIndices.map((x) => BigInt(x))

    // 3. Pad to AIR depth and assert self-consistency.
    const padded = padLeanIMTProofToDepth(
      leaf,
      pathElements,
      pathIndices,
      ASP_DEPTH
    )
    expect(padded.pathElements).toHaveLength(ASP_DEPTH)
    expect(padded.pathIndices).toHaveLength(ASP_DEPTH)
    expect(verifyMerklePath(leaf, padded.pathElements, padded.pathIndices))
      .toBe(padded.root)
  }, 30_000)
})
