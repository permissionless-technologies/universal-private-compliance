import { describe, it, expect } from 'vitest'
import { PoseidonBN254, BN254_FIELD_PRIME } from '../../src/core/hash/poseidon-bn254.js'
import { PoseidonBLS12381, BLS12_381_FIELD_PRIME } from '../../src/core/hash/poseidon-bls.js'
import { getDefaultHashFunction } from '../../src/core/hash/index.js'

describe('Hash Interface', () => {
  describe('PoseidonBN254', () => {
    const hash = new PoseidonBN254()

    it('has correct metadata', () => {
      expect(hash.name).toBe('Poseidon-BN254')
      expect(hash.fieldPrime).toBe(BN254_FIELD_PRIME)
      expect(hash.securityBits).toBe(100)
    })

    it('hashes two elements', async () => {
      const result = await hash.hash2(1n, 2n)
      expect(result).toBeTypeOf('bigint')
      expect(result).toBeGreaterThan(0n)
      expect(result).toBeLessThan(BN254_FIELD_PRIME)
    })

    it('hashes N elements', async () => {
      const result = await hash.hashN([1n, 2n, 3n])
      expect(result).toBeTypeOf('bigint')
      expect(result).toBeGreaterThan(0n)
    })

    it('is deterministic', async () => {
      const a = await hash.hash2(42n, 99n)
      const b = await hash.hash2(42n, 99n)
      expect(a).toBe(b)
    })

    it('produces different outputs for different inputs', async () => {
      const a = await hash.hash2(1n, 2n)
      const b = await hash.hash2(2n, 1n)
      expect(a).not.toBe(b)
    })
  })

  describe('PoseidonBLS12381', () => {
    const hash = new PoseidonBLS12381()

    it('has correct metadata', () => {
      expect(hash.name).toBe('Poseidon-BLS12-381')
      expect(hash.fieldPrime).toBe(BLS12_381_FIELD_PRIME)
      expect(hash.securityBits).toBe(128)
    })

    it('hashes two elements', async () => {
      const result = await hash.hash2(1n, 2n)
      expect(result).toBeTypeOf('bigint')
      expect(result).toBeGreaterThan(0n)
      expect(result).toBeLessThan(BLS12_381_FIELD_PRIME)
    })

    it('hashes N elements', async () => {
      const result = await hash.hashN([1n, 2n, 3n])
      expect(result).toBeTypeOf('bigint')
      expect(result).toBeGreaterThan(0n)
    })

    it('is deterministic', async () => {
      const a = await hash.hash2(42n, 99n)
      const b = await hash.hash2(42n, 99n)
      expect(a).toBe(b)
    })

    it('produces different outputs for different inputs', async () => {
      const a = await hash.hash2(1n, 2n)
      const b = await hash.hash2(2n, 1n)
      expect(a).not.toBe(b)
    })
  })

  describe('Cross-curve', () => {
    it('BN254 and BLS12-381 produce DIFFERENT hashes for same inputs', async () => {
      const bn254 = new PoseidonBN254()
      const bls = new PoseidonBLS12381()

      const bn254Hash = await bn254.hash2(1n, 2n)
      const blsHash = await bls.hash2(1n, 2n)

      expect(bn254Hash).not.toBe(blsHash)
    })

    it('field primes are different', () => {
      expect(BN254_FIELD_PRIME).not.toBe(BLS12_381_FIELD_PRIME)
      // BLS12-381 prime is larger
      expect(BLS12_381_FIELD_PRIME).toBeGreaterThan(BN254_FIELD_PRIME)
    })
  })

  describe('Default hash function', () => {
    it('defaults to BLS12-381 (128-bit security)', () => {
      const defaultHash = getDefaultHashFunction()
      expect(defaultHash.name).toBe('Poseidon-BLS12-381')
      expect(defaultHash.securityBits).toBe(128)
    })
  })
})
