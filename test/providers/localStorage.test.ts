import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalStorageProvider, storePersonalASPId, loadPersonalASPId } from '../../src/providers/localStorage.js'

// Mock localStorage
const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
  get length() { return storage.size },
  key: (index: number) => [...storage.keys()][index] ?? null,
}

// Install mock — need both window and localStorage for the typeof window check
vi.stubGlobal('window', { localStorage: mockLocalStorage })
vi.stubGlobal('localStorage', mockLocalStorage)

describe('LocalStorageProvider', () => {
  beforeEach(() => {
    storage.clear()
  })

  const createProvider = () => new LocalStorageProvider({ chainId: 1, aspId: 1n })

  describe('basic CRUD', () => {
    it('starts empty', async () => {
      const provider = createProvider()
      expect(await provider.getMembers()).toEqual([])
      expect(await provider.getRoot()).toBe(0n)
    })

    it('adds a member', async () => {
      const provider = createProvider()
      await provider.addMember(42n)
      expect(await provider.hasMember(42n)).toBe(true)
    })

    it('rejects zero identity', async () => {
      const provider = createProvider()
      await expect(provider.addMember(0n)).rejects.toThrow('zero')
    })

    it('add is idempotent', async () => {
      const provider = createProvider()
      await provider.addMember(42n)
      await provider.addMember(42n)
      expect((await provider.getMembers()).length).toBe(1)
    })

    it('removes a member', async () => {
      const provider = createProvider()
      await provider.addMember(10n)
      await provider.addMember(20n)
      await provider.removeMember(10n)
      expect(await provider.hasMember(10n)).toBe(false)
      expect(await provider.hasMember(20n)).toBe(true)
    })
  })

  describe('serialization roundtrip', () => {
    it('bigint survives serialize → deserialize', async () => {
      const provider = createProvider()
      const testValues = [
        1n,
        42n,
        BigInt('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
        2n ** 200n + 7n, // very large number
      ]

      for (const v of testValues) {
        await provider.addMember(v)
      }

      // Create a NEW provider instance (reads from localStorage, not in-memory)
      const provider2 = createProvider()
      const members = await provider2.getMembers()
      expect(members).toHaveLength(testValues.length)

      for (const v of testValues) {
        expect(members).toContain(v)
      }
    })

    it('root is consistent after serialization roundtrip', async () => {
      const provider1 = createProvider()
      await provider1.addMember(10n)
      await provider1.addMember(20n)
      await provider1.addMember(30n)
      const root1 = await provider1.getRoot()

      // New instance reads from localStorage
      const provider2 = createProvider()
      const root2 = await provider2.getRoot()
      expect(root2).toBe(root1)
    })

    it('proof is valid after serialization roundtrip', async () => {
      const provider1 = createProvider()
      await provider1.addMember(100n)
      await provider1.addMember(200n)

      // New instance
      const provider2 = createProvider()
      const proof = await provider2.getMerkleProof(100n)
      expect(proof.root).toBeTypeOf('bigint')
      expect(proof.pathElements.length).toBeGreaterThan(0)
    })
  })

  describe('namespacing', () => {
    it('different chainId/aspId use different storage keys', async () => {
      const p1 = new LocalStorageProvider({ chainId: 1, aspId: 1n })
      const p2 = new LocalStorageProvider({ chainId: 1, aspId: 2n })
      const p3 = new LocalStorageProvider({ chainId: 2, aspId: 1n })

      await p1.addMember(10n)
      await p2.addMember(20n)
      await p3.addMember(30n)

      expect(await p1.getMembers()).toEqual([10n])
      expect(await p2.getMembers()).toEqual([20n])
      expect(await p3.getMembers()).toEqual([30n])
    })
  })

  describe('metadata', () => {
    it('has correct defaults', () => {
      const provider = createProvider()
      expect(provider.name).toBe('LocalStorage')
      expect(provider.treeDepth).toBe(20)
    })

    it('custom treeDepth', () => {
      const provider = new LocalStorageProvider({ chainId: 1, aspId: 1n, treeDepth: 15 })
      expect(provider.treeDepth).toBe(15)
    })
  })
})

describe('Personal ASP ID storage', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('store and load roundtrip', () => {
    storePersonalASPId(1, '0xabc', 42n)
    expect(loadPersonalASPId(1, '0xabc')).toBe(42n)
  })

  it('returns null when not set', () => {
    expect(loadPersonalASPId(1, '0xdef')).toBeNull()
  })

  it('case-insensitive address', () => {
    storePersonalASPId(1, '0xABC', 7n)
    expect(loadPersonalASPId(1, '0xabc')).toBe(7n)
  })

  it('different chain IDs are independent', () => {
    storePersonalASPId(1, '0xabc', 10n)
    storePersonalASPId(2, '0xabc', 20n)
    expect(loadPersonalASPId(1, '0xabc')).toBe(10n)
    expect(loadPersonalASPId(2, '0xabc')).toBe(20n)
  })
})
