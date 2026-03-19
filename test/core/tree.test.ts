import { describe, it, expect } from 'vitest'
import { MerkleTree, buildMerkleTree, verifyMerkleProof } from '../../src/core/tree.js'
import { PoseidonBN254 } from '../../src/core/hash/poseidon-bn254.js'
import { PoseidonBLS12381 } from '../../src/core/hash/poseidon-bls.js'

describe('MerkleTree', () => {
  // Use BN254 for tests (faster initialization)
  const bn254 = new PoseidonBN254()

  describe('basic operations', () => {
    it('starts empty', () => {
      const tree = new MerkleTree(20, bn254)
      expect(tree.size).toBe(0)
      expect(tree.depth).toBe(0)
    })

    it('inserts a leaf', () => {
      const tree = new MerkleTree(20, bn254)
      const index = tree.insert(42n)
      expect(index).toBe(0)
      expect(tree.size).toBe(1)
    })

    it('rejects zero leaf', () => {
      const tree = new MerkleTree(20, bn254)
      expect(() => tree.insert(0n)).toThrow('Leaf cannot be zero')
    })

    it('has() and indexOf()', () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(100n)
      tree.insert(200n)
      expect(tree.has(100n)).toBe(true)
      expect(tree.has(300n)).toBe(false)
      expect(tree.indexOf(200n)).toBe(1)
      expect(tree.indexOf(300n)).toBe(-1)
    })
  })

  describe('root computation', () => {
    it('empty tree has root 0', async () => {
      const tree = new MerkleTree(20, bn254)
      expect(await tree.getRoot()).toBe(0n)
    })

    it('single leaf: root = leaf (LeanIMT)', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(42n)
      expect(await tree.getRoot()).toBe(42n)
    })

    it('two leaves: root = hash(leaf0, leaf1)', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      tree.insert(2n)
      const root = await tree.getRoot()
      const expected = await bn254.hash2(1n, 2n)
      expect(root).toBe(expected)
    })

    it('root is deterministic', async () => {
      const tree1 = new MerkleTree(20, bn254)
      tree1.insert(10n)
      tree1.insert(20n)

      const tree2 = new MerkleTree(20, bn254)
      tree2.insert(10n)
      tree2.insert(20n)

      expect(await tree1.getRoot()).toBe(await tree2.getRoot())
    })

    it('root changes when leaf is added', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      const root1 = await tree.getRoot()
      tree.insert(2n)
      const root2 = await tree.getRoot()
      expect(root1).not.toBe(root2)
    })
  })

  describe('proof generation and verification', () => {
    it('generates valid proof for single leaf', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(42n)
      const proof = await tree.getProof(0)
      expect(proof.root).toBe(42n)
      expect(proof.leafIndex).toBe(0)
      expect(await verifyMerkleProof(42n, proof, bn254)).toBe(true)
    })

    it('generates valid proof for multiple leaves', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(10n)
      tree.insert(20n)
      tree.insert(30n)

      for (let i = 0; i < 3; i++) {
        const leaf = [10n, 20n, 30n][i]!
        const proof = await tree.getProof(i)
        expect(await verifyMerkleProof(leaf, proof, bn254)).toBe(true)
      }
    })

    it('rejects tampered proof', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(10n)
      tree.insert(20n)
      const proof = await tree.getProof(0)

      // Tamper with proof
      const tampered = { ...proof, root: proof.root + 1n }
      expect(await verifyMerkleProof(10n, tampered, bn254)).toBe(false)
    })

    it('rejects wrong leaf', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(10n)
      tree.insert(20n)
      const proof = await tree.getProof(0)
      expect(await verifyMerkleProof(999n, proof, bn254)).toBe(false)
    })

    it('throws for out-of-bounds index', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      await expect(tree.getProof(5)).rejects.toThrow('out of bounds')
    })
  })

  describe('cross-curve', () => {
    it('same leaves produce different roots on different curves', async () => {
      const treeBN = new MerkleTree(20, bn254)
      const treeBLS = new MerkleTree(20, new PoseidonBLS12381())

      treeBN.insert(1n)
      treeBN.insert(2n)
      treeBLS.insert(1n)
      treeBLS.insert(2n)

      const rootBN = await treeBN.getRoot()
      const rootBLS = await treeBLS.getRoot()
      expect(rootBN).not.toBe(rootBLS)
    })
  })

  describe('buildMerkleTree helper', () => {
    it('builds from array', async () => {
      const tree = buildMerkleTree([1n, 2n, 3n], 20, bn254)
      expect(tree.size).toBe(3)
      expect(await tree.getRoot()).toBeTypeOf('bigint')
    })
  })
})
