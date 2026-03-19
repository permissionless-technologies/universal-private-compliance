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

  describe('LeanIMT propagation correctness', () => {
    it('3-leaf tree: right sibling of second pair is 0, left child propagates', async () => {
      // With 3 leaves [A, B, C]:
      //   Level 0: A  B  C  (empty)
      //   Level 1: H(A,B)  C  ← C propagates because right sibling is 0
      //   Level 2: H(H(A,B), C)
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      tree.insert(2n)
      tree.insert(3n)

      const root = await tree.getRoot()
      const hashAB = await bn254.hash2(1n, 2n)
      // C propagates (sibling is 0 → LeanIMT single-child)
      const expected = await bn254.hash2(hashAB, 3n)
      expect(root).toBe(expected)
    })

    it('4-leaf tree: balanced, no propagation', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      tree.insert(2n)
      tree.insert(3n)
      tree.insert(4n)

      const root = await tree.getRoot()
      const hashAB = await bn254.hash2(1n, 2n)
      const hashCD = await bn254.hash2(3n, 4n)
      const expected = await bn254.hash2(hashAB, hashCD)
      expect(root).toBe(expected)
    })

    it('5-leaf tree: mixed propagation', async () => {
      // 5 leaves: [A, B, C, D, E]
      //   Level 0: A  B  C  D  E  (empty) (empty) (empty)
      //   Level 1: H(A,B)  H(C,D)  E←propagates  0
      //   Level 2: H(H(A,B), H(C,D))  E←propagates
      //   Level 3: H(H(H(A,B),H(C,D)), E)
      const tree = new MerkleTree(20, bn254)
      for (let i = 1n; i <= 5n; i++) tree.insert(i)

      const root = await tree.getRoot()
      const h12 = await bn254.hash2(1n, 2n)
      const h34 = await bn254.hash2(3n, 4n)
      const h1234 = await bn254.hash2(h12, h34)
      // 5n propagates through two levels (sibling 0 at level 0, sibling 0 at level 1)
      const expected = await bn254.hash2(h1234, 5n)
      expect(root).toBe(expected)
    })

    it('proof verifies for each leaf in a 5-leaf tree', async () => {
      const tree = new MerkleTree(20, bn254)
      const leaves = [100n, 200n, 300n, 400n, 500n]
      for (const l of leaves) tree.insert(l)

      for (let i = 0; i < leaves.length; i++) {
        const proof = await tree.getProof(i)
        expect(await verifyMerkleProof(leaves[i]!, proof, bn254)).toBe(true)
      }
    })
  })

  describe('power-of-2 vs non-power-of-2', () => {
    it('2 and 3 leaf trees have different roots', async () => {
      const tree2 = new MerkleTree(20, bn254)
      tree2.insert(1n)
      tree2.insert(2n)

      const tree3 = new MerkleTree(20, bn254)
      tree3.insert(1n)
      tree3.insert(2n)
      tree3.insert(3n)

      expect(await tree2.getRoot()).not.toBe(await tree3.getRoot())
    })

    it('4 and 5 leaf trees have different roots', async () => {
      const tree4 = new MerkleTree(20, bn254)
      const tree5 = new MerkleTree(20, bn254)
      for (let i = 1n; i <= 4n; i++) { tree4.insert(i); tree5.insert(i) }
      tree5.insert(5n)

      expect(await tree4.getRoot()).not.toBe(await tree5.getRoot())
    })
  })

  describe('depth limits', () => {
    it('tree with depth 2 supports up to 4 leaves', async () => {
      const tree = new MerkleTree(2, bn254)
      tree.insert(1n)
      tree.insert(2n)
      tree.insert(3n)
      tree.insert(4n)
      expect(tree.size).toBe(4)
      const root = await tree.getRoot()
      expect(root).toBeTypeOf('bigint')

      // All 4 proofs should verify
      for (let i = 0; i < 4; i++) {
        const proof = await tree.getProof(i)
        expect(await verifyMerkleProof([1n, 2n, 3n, 4n][i]!, proof, bn254)).toBe(true)
      }
    })

    it('tree depth grows automatically', () => {
      const tree = new MerkleTree(20, bn254)
      expect(tree.depth).toBe(0)
      tree.insert(1n)
      expect(tree.depth).toBe(0) // single leaf = depth 0
      tree.insert(2n)
      expect(tree.depth).toBe(1) // 2 leaves = depth 1
      tree.insert(3n)
      expect(tree.depth).toBe(2) // 3 leaves = depth 2
      tree.insert(4n)
      expect(tree.depth).toBe(2) // 4 leaves = depth 2 (exact power of 2)
      tree.insert(5n)
      expect(tree.depth).toBe(3) // 5 leaves = depth 3
    })

    it('negative index throws', async () => {
      const tree = new MerkleTree(20, bn254)
      tree.insert(1n)
      await expect(tree.getProof(-1)).rejects.toThrow('out of bounds')
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
