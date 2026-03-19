import { describe, it, expect } from 'vitest'
import {
  generateMembershipProof,
  generateSingleMemberProof,
  generateMultiMemberProof,
  computeMerkleRoot,
  verifyMembershipProof,
} from '../../src/core/proof.js'
import { PoseidonBN254 } from '../../src/core/hash/poseidon-bn254.js'
import { PoseidonBLS12381 } from '../../src/core/hash/poseidon-bls.js'

describe('Membership Proof', () => {
  const bn254 = new PoseidonBN254()

  describe('generateSingleMemberProof', () => {
    it('root equals identity (LeanIMT optimization)', () => {
      const proof = generateSingleMemberProof(42n)
      expect(proof.root).toBe(42n)
      expect(proof.pathElements).toHaveLength(20) // default depth
      expect(proof.pathElements.every(e => e === 0n)).toBe(true)
      expect(proof.pathIndices.every(i => i === 0)).toBe(true)
    })

    it('respects custom depth', () => {
      const proof = generateSingleMemberProof(42n, 10)
      expect(proof.pathElements).toHaveLength(10)
    })
  })

  describe('generateMultiMemberProof', () => {
    it('generates valid proof for member in tree', async () => {
      const members = [10n, 20n, 30n]
      const proof = await generateMultiMemberProof(20n, members, 20, bn254)
      expect(proof.root).toBeTypeOf('bigint')
      expect(proof.root).not.toBe(0n)
      expect(proof.pathElements).toHaveLength(20)
    })

    it('throws for non-member', async () => {
      const members = [10n, 20n, 30n]
      await expect(generateMultiMemberProof(99n, members, 20, bn254))
        .rejects.toThrow('not found')
    })

    it('falls back to single-member for 1 member', async () => {
      const proof = await generateMultiMemberProof(42n, [42n], 20, bn254)
      expect(proof.root).toBe(42n) // LeanIMT single-leaf optimization
    })
  })

  describe('generateMembershipProof (auto-select)', () => {
    it('uses single-member mode for empty members', async () => {
      const proof = await generateMembershipProof(42n, undefined, 20, bn254)
      expect(proof.root).toBe(42n)
    })

    it('uses multi-member mode for multiple members', async () => {
      const proof = await generateMembershipProof(10n, [10n, 20n], 20, bn254)
      expect(proof.root).not.toBe(10n) // multi-member root ≠ single leaf
    })
  })

  describe('verifyMembershipProof', () => {
    it('valid proof verifies', async () => {
      const members = [10n, 20n, 30n, 40n]
      const proof = await generateMembershipProof(30n, members, 20, bn254)
      expect(await verifyMembershipProof(30n, proof, bn254)).toBe(true)
    })

    it('wrong identity fails', async () => {
      const members = [10n, 20n, 30n]
      const proof = await generateMembershipProof(10n, members, 20, bn254)
      expect(await verifyMembershipProof(99n, proof, bn254)).toBe(false)
    })

    it('single-member proof verifies', async () => {
      const proof = generateSingleMemberProof(42n)
      expect(await verifyMembershipProof(42n, proof, bn254)).toBe(true)
    })
  })

  describe('computeMerkleRoot', () => {
    it('empty = 0', async () => {
      expect(await computeMerkleRoot([], 20, bn254)).toBe(0n)
    })

    it('single = leaf', async () => {
      expect(await computeMerkleRoot([42n], 20, bn254)).toBe(42n)
    })

    it('multiple members', async () => {
      const root = await computeMerkleRoot([1n, 2n, 3n], 20, bn254)
      expect(root).toBeTypeOf('bigint')
      expect(root).not.toBe(0n)
    })
  })

  describe('cross-curve proof', () => {
    it('BLS12-381 proof does not verify with BN254 hash', async () => {
      const bls = new PoseidonBLS12381()
      const members = [10n, 20n]
      const proof = await generateMembershipProof(10n, members, 20, bls)

      // Verify with wrong hash should fail
      expect(await verifyMembershipProof(10n, proof, bn254)).toBe(false)
    })

    it('BLS12-381 proof verifies with BLS12-381 hash', async () => {
      const bls = new PoseidonBLS12381()
      const members = [10n, 20n, 30n]
      const proof = await generateMembershipProof(20n, members, 20, bls)
      expect(await verifyMembershipProof(20n, proof, bls)).toBe(true)
    })
  })
})
