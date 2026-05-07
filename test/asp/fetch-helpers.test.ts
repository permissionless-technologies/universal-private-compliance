/**
 * Unit tests for the STARK-side fetch helpers. Exercises the wire-shape
 * normalization (decimal-string → bigint, JSON-number indices preserved,
 * length-vs-depth invariant) without hitting a live service.
 *
 * The shape these expect is the same one upc-asp-whitelist@>=0.8.0
 * actually serves — see packages/upc-asp-whitelist/src/server.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  fetchStarkASPRoot,
  fetchStarkASPProof,
  type ASPStarkProofData,
} from '../../src/asp/fetch-helpers.js'

const SERVICE_URL = 'https://asp-whitelist.example/'
const ADDRESS = '0x5AD2d0Ebe451B9bC2550e600f2D2Acd31113053E' as const

const SAMPLE_ROOT = '455822768'
const SAMPLE_PROOF = {
  root: SAMPLE_ROOT,
  leaf: '1538708370',
  leafIndex: 0,
  depth: 20,
  pathElements: [
    '0',
    '547821186',
    '58871899',
    '2093510231',
    '2058304791',
    '554807235',
    '1067433618',
    '1376958371',
    '587083826',
    '1303412285',
    '1615498177',
    '1785991433',
    '552035037',
    '1465835680',
    '1623217334',
    '635065528',
    '1913627191',
    '60100704',
    '1189999584',
    '1146390209',
  ],
  pathIndices: Array(20).fill(0),
}

function mockOkJson(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch
}

function mockStatus(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch
}

describe('fetchStarkASPRoot', () => {
  it('parses /stark-root JSON into a bigint', async () => {
    const fetchFn = mockOkJson({ root: SAMPLE_ROOT })
    const root = await fetchStarkASPRoot(SERVICE_URL, fetchFn)
    expect(root).toBe(455822768n)
    expect(fetchFn).toHaveBeenCalledWith('https://asp-whitelist.example/stark-root')
  })

  it('strips trailing slash from the service URL', async () => {
    const fetchFn = mockOkJson({ root: SAMPLE_ROOT })
    await fetchStarkASPRoot('https://asp-whitelist.example///', fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('https://asp-whitelist.example///stark-root')
    // Implementation only strips one trailing slash; pin the behavior so a
    // future "be smart about multiple slashes" change is a deliberate choice
    // rather than a silent surprise.
  })

  it('throws on non-2xx with a useful message', async () => {
    const fetchFn = mockStatus(503)
    await expect(fetchStarkASPRoot(SERVICE_URL, fetchFn))
      .rejects.toThrow(/stark-root.*503/)
  })
})

describe('fetchStarkASPProof', () => {
  it('parses /stark-proof JSON into bigint pathElements + numeric pathIndices', async () => {
    const fetchFn = mockOkJson(SAMPLE_PROOF)
    const proof = await fetchStarkASPProof(SERVICE_URL, ADDRESS, fetchFn)

    expect(proof).not.toBeNull()
    const p = proof as ASPStarkProofData

    expect(p.root).toBe(455822768n)
    expect(p.leaf).toBe(1538708370n)
    expect(p.leafIndex).toBe(0)
    expect(p.depth).toBe(20)
    expect(p.pathElements).toHaveLength(20)
    expect(p.pathElements.every(e => typeof e === 'bigint')).toBe(true)
    expect(p.pathElements[0]).toBe(0n)
    expect(p.pathElements[1]).toBe(547821186n)
    expect(p.pathIndices).toHaveLength(20)
    // pathIndices must remain numbers — guaranteed binary, JSON-friendly.
    expect(p.pathIndices.every(i => typeof i === 'number' && (i === 0 || i === 1))).toBe(true)
    expect(fetchFn).toHaveBeenCalledWith(
      `https://asp-whitelist.example/stark-proof/${ADDRESS}`
    )
  })

  it('returns null on 404 (address not whitelisted)', async () => {
    const fetchFn = mockStatus(404, { error: 'Address not whitelisted' })
    const proof = await fetchStarkASPProof(SERVICE_URL, ADDRESS, fetchFn)
    expect(proof).toBeNull()
  })

  it('throws on 429 so callers can implement backoff', async () => {
    const fetchFn = mockStatus(429, { error: 'Rate limit exceeded' })
    await expect(fetchStarkASPProof(SERVICE_URL, ADDRESS, fetchFn))
      .rejects.toThrow(/stark-proof.*429/)
  })

  it('throws on any other non-2xx', async () => {
    const fetchFn = mockStatus(500, { error: 'boom' })
    await expect(fetchStarkASPProof(SERVICE_URL, ADDRESS, fetchFn))
      .rejects.toThrow(/stark-proof.*500/)
  })
})
