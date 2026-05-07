/**
 * Plain (non-React) fetch helpers for ASP service STARK endpoints.
 *
 * These return parsed bigint values so callers don't have to convert
 * decimal strings themselves. Thin wrappers over `fetch` + JSON.
 *
 * For React state-managed fetches, see `useStarkASPProof` in the /react
 * subpath. The hook is built on top of these helpers, so the wire shape
 * is normalized in one place.
 *
 * The SNARK-side BLS proof helpers live in `core/asp-list.ts` (taking
 * an `ASPEntry`). The STARK side has no parallel helper there because
 * `ASPEntry` doesn't yet describe a stark proof endpoint URL — when it
 * does, this module's helpers are what `asp-list.ts` should call into.
 */
import type {
  ASPStarkRootResponse,
  ASPStarkProofResponse,
} from './api-schema.js'

/**
 * Parsed STARK proof — bigint-typed, ready for AlwaysHashMerkleTree
 * verification or in-circuit witness assembly.
 */
export interface ASPStarkProofData {
  /** STARK tree root */
  root: bigint
  /** Leaf value (M31-encoded address) */
  leaf: bigint
  /** Index of the leaf in insertion order (0-based) */
  leafIndex: number
  /** Tree depth — pinned alongside the proof so verifiers don't guess */
  depth: number
  /** Sibling at each level; length === depth */
  pathElements: bigint[]
  /** Side bit at each level (0 or 1); length === depth */
  pathIndices: number[]
}

/**
 * Fetch the current STARK-side Merkle root from an ASP service.
 *
 * Throws on any non-2xx status — the root endpoint shouldn't return
 * 404, so we don't have a "not found" path here. Use `try/catch` to
 * distinguish service-unavailable from connectivity errors.
 */
export async function fetchStarkASPRoot(
  serviceUrl: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<bigint> {
  const url = `${serviceUrl.replace(/\/$/, '')}/stark-root`
  const res = await fetchFn(url)
  if (!res.ok) {
    throw new Error(`fetchStarkASPRoot ${url} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as ASPStarkRootResponse
  return BigInt(data.root)
}

/**
 * Fetch a STARK membership proof for `address` from an ASP service.
 *
 * Returns `null` on 404 (address not whitelisted). Throws on any other
 * non-2xx — including 429 (rate limited), which the caller may want to
 * retry with backoff.
 *
 * The returned proof is fixed-depth and always verifies against the
 * value `fetchStarkASPRoot` returns at the same point in time (cross-
 * leaf root agreement, by construction of `AlwaysHashMerkleTree`).
 */
export async function fetchStarkASPProof(
  serviceUrl: string,
  address: `0x${string}`,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<ASPStarkProofData | null> {
  const url = `${serviceUrl.replace(/\/$/, '')}/stark-proof/${address}`
  const res = await fetchFn(url)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`fetchStarkASPProof ${url} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as ASPStarkProofResponse
  return {
    root: BigInt(data.root),
    leaf: BigInt(data.leaf),
    leafIndex: data.leafIndex,
    depth: data.depth,
    pathElements: data.pathElements.map(e => BigInt(e)),
    pathIndices: data.pathIndices,
  }
}
