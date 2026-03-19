import { describe, it, expect } from 'vitest'
import { MemoryProvider } from '../../src/providers/memory.js'
import { MerkleTree } from '../../src/core/tree.js'
import { verifyMerkleProof } from '../../src/core/tree.js'
import { PoseidonBN254 } from '../../src/core/hash/poseidon-bn254.js'
import { getDefaultHashFunction } from '../../src/core/hash/index.js'

describe('Provider ↔ Tree root consistency', () => {
  const bn254 = new PoseidonBN254()

  it('provider root matches manually built tree root (default hash)', async () => {
    const provider = new MemoryProvider()
    const members = [10n, 20n, 30n, 40n]
    for (const m of members) await provider.addMember(m)

    const defaultHash = getDefaultHashFunction()
    const tree = new MerkleTree(provider.treeDepth, defaultHash)
    for (const m of members) tree.insert(m)

    expect(await provider.getRoot()).toBe(await tree.getRoot())
  })

  it('provider root matches manually built tree root (single member)', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(42n)

    const defaultHash = getDefaultHashFunction()
    const tree = new MerkleTree(provider.treeDepth, defaultHash)
    tree.insert(42n)

    expect(await provider.getRoot()).toBe(await tree.getRoot())
    expect(await provider.getRoot()).toBe(42n) // LeanIMT single-leaf
  })

  it('provider proof verifies against provider root', async () => {
    const provider = new MemoryProvider()
    const members = [100n, 200n, 300n]
    for (const m of members) await provider.addMember(m)

    const root = await provider.getRoot()

    for (const m of members) {
      const proof = await provider.getMerkleProof(m)
      expect(proof.root).toBe(root)
      // Verify using the default hash (same one provider uses internally)
      expect(await verifyMerkleProof(m, proof)).toBe(true)
    }
  })

  it('root changes after add/remove', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await provider.addMember(20n)
    const root1 = await provider.getRoot()

    await provider.addMember(30n)
    const root2 = await provider.getRoot()
    expect(root2).not.toBe(root1)

    await provider.removeMember(30n)
    const root3 = await provider.getRoot()
    expect(root3).toBe(root1) // back to original
  })

  it('root is 0 after removing all members', async () => {
    const provider = new MemoryProvider()
    await provider.addMember(10n)
    await provider.removeMember(10n)
    expect(await provider.getRoot()).toBe(0n)
  })
})
