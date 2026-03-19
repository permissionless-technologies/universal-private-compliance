import { describe, it, expect } from 'vitest'
import { MemoryProvider } from '../../src/providers/memory.js'

describe('MemoryProvider', () => {
  it('starts empty', async () => {
    const provider = new MemoryProvider()
    expect(await provider.getMembers()).toEqual([])
    expect(await provider.getRoot()).toBe(0n)
  })

  it('adds a member', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(42n)
    expect(await provider.hasMember(42n)).toBe(true)
    expect(await provider.getMembers()).toEqual([42n])
  })

  it('rejects zero identity', async () => {
    const provider = new MemoryProvider()
    await expect(provider.addMember(0n)).rejects.toThrow('zero')
  })

  it('add is idempotent', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(42n)
    await provider.addMember(42n) // duplicate
    expect((await provider.getMembers()).length).toBe(1)
  })

  it('removes a member', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await provider.addMember(20n)
    await provider.removeMember(10n)
    expect(await provider.hasMember(10n)).toBe(false)
    expect(await provider.hasMember(20n)).toBe(true)
  })

  it('single member root = member (LeanIMT)', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(42n)
    expect(await provider.getRoot()).toBe(42n)
  })

  it('multiple members root ≠ 0', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await provider.addMember(20n)
    const root = await provider.getRoot()
    expect(root).not.toBe(0n)
    expect(root).toBeTypeOf('bigint')
  })

  it('getMerkleProof returns valid proof', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await provider.addMember(20n)
    const proof = await provider.getMerkleProof(10n)
    expect(proof.root).toBeTypeOf('bigint')
    expect(proof.pathElements).toBeInstanceOf(Array)
  })

  it('getMerkleProof throws for non-member', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await expect(provider.getMerkleProof(99n)).rejects.toThrow('not found')
  })

  it('has correct metadata', () => {
    const provider = new MemoryProvider({ treeDepth: 15 })
    expect(provider.name).toBe('Memory')
    expect(provider.treeDepth).toBe(15)
  })

  it('defaults to depth 20', () => {
    const provider = new MemoryProvider()
    expect(provider.treeDepth).toBe(20)
  })
})
