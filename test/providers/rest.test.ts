import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RESTProvider } from '../../src/providers/rest.js'

function createMockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const key = `${method} ${url}`

    // Find matching response (exact match or prefix match)
    const match = responses[key] ?? Object.entries(responses).find(([k]) => key.startsWith(k))?.[1]

    if (!match) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response
    }

    return {
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      statusText: 'OK',
      json: async () => match.body,
    } as Response
  })
}

describe('RESTProvider', () => {
  describe('addMember', () => {
    it('POSTs to /members', async () => {
      const mockFetch = createMockFetch({
        'POST https://api.test.com/members': { status: 201, body: {} },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      await provider.addMember(42n)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/members',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ identity: '42' }),
        })
      )
    })

    it('rejects zero identity', async () => {
      const mockFetch = createMockFetch({})
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })
      await expect(provider.addMember(0n)).rejects.toThrow('zero')
    })

    it('throws on server error', async () => {
      const mockFetch = createMockFetch({
        'POST https://api.test.com/members': { status: 500, body: {} },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })
      await expect(provider.addMember(42n)).rejects.toThrow('Failed to add member')
    })
  })

  describe('removeMember', () => {
    it('DELETEs /members/:identity', async () => {
      const mockFetch = createMockFetch({
        'DELETE https://api.test.com/members/42': { status: 204, body: {} },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      await provider.removeMember(42n)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/members/42',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('getMembers', () => {
    it('GETs /members and deserializes bigints', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/members': {
          status: 200,
          body: { members: ['10', '20', '30'] },
        },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      const members = await provider.getMembers()
      expect(members).toEqual([10n, 20n, 30n])
    })
  })

  describe('hasMember', () => {
    it('returns true for existing member', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/members': {
          status: 200,
          body: { members: ['10', '20'] },
        },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      expect(await provider.hasMember(10n)).toBe(true)
      expect(await provider.hasMember(99n)).toBe(false)
    })
  })

  describe('getRoot', () => {
    it('GETs /root and deserializes bigint', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/root': {
          status: 200,
          body: { root: '123456789' },
        },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      expect(await provider.getRoot()).toBe(123456789n)
    })
  })

  describe('getMerkleProof', () => {
    it('GETs /proof/:identity and deserializes', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/proof/42': {
          status: 200,
          body: {
            pathElements: ['100', '200'],
            pathIndices: [0, 1],
            leafIndex: 0,
            root: '999',
          },
        },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })

      const proof = await provider.getMerkleProof(42n)
      expect(proof.pathElements).toEqual([100n, 200n])
      expect(proof.pathIndices).toEqual([0, 1])
      expect(proof.leafIndex).toBe(0)
      expect(proof.root).toBe(999n)
    })

    it('throws on 404', async () => {
      const mockFetch = createMockFetch({})
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', fetch: mockFetch as any })
      await expect(provider.getMerkleProof(42n)).rejects.toThrow('Failed to get proof')
    })
  })

  describe('configuration', () => {
    it('strips trailing slash from baseUrl', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/root': { status: 200, body: { root: '0' } },
      })
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com/', fetch: mockFetch as any })

      await provider.getRoot()
      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/root', expect.anything())
    })

    it('sends API key in Authorization header', async () => {
      const mockFetch = createMockFetch({
        'GET https://api.test.com/root': { status: 200, body: { root: '0' } },
      })
      const provider = new RESTProvider({
        baseUrl: 'https://api.test.com',
        apiKey: 'sk_test_123',
        fetch: mockFetch as any,
      })

      await provider.getRoot()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_123',
          }),
        })
      )
    })

    it('has correct metadata', () => {
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com', treeDepth: 15 })
      expect(provider.name).toBe('REST API')
      expect(provider.treeDepth).toBe(15)
    })

    it('defaults to depth 20', () => {
      const provider = new RESTProvider({ baseUrl: 'https://api.test.com' })
      expect(provider.treeDepth).toBe(20)
    })
  })
})
