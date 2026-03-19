import { describe, it, expect } from 'vitest'
import {
  computeIdentityFromAddress,
  computeIdentityFromBabyJubJub,
  computeIdentityFromSecret,
} from '../../src/core/identity.js'

describe('Identity Derivation', () => {
  describe('computeIdentityFromAddress', () => {
    it('converts address to bigint', () => {
      const id = computeIdentityFromAddress('0x1234567890abcdef1234567890abcdef12345678')
      expect(id).toBe(BigInt('0x1234567890abcdef1234567890abcdef12345678'))
    })

    it('is deterministic', () => {
      const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`
      const a = computeIdentityFromAddress(addr)
      const b = computeIdentityFromAddress(addr)
      expect(a).toBe(b)
    })

    it('different addresses produce different identities', () => {
      const a = computeIdentityFromAddress('0x0000000000000000000000000000000000000001')
      const b = computeIdentityFromAddress('0x0000000000000000000000000000000000000002')
      expect(a).not.toBe(b)
    })

    it('zero address produces zero', () => {
      const id = computeIdentityFromAddress('0x0000000000000000000000000000000000000000')
      expect(id).toBe(0n)
    })

    it('max address is within uint160 range', () => {
      const id = computeIdentityFromAddress('0xffffffffffffffffffffffffffffffffffffffff')
      expect(id).toBe((1n << 160n) - 1n)
    })
  })

  describe('computeIdentityFromBabyJubJub', () => {
    it('produces a deterministic hash', async () => {
      const pubKeyX = 123456789n
      const pubKeyY = 987654321n
      const a = await computeIdentityFromBabyJubJub(pubKeyX, pubKeyY)
      const b = await computeIdentityFromBabyJubJub(pubKeyX, pubKeyY)
      expect(a).toBe(b)
    })

    it('different keys produce different identities', async () => {
      const a = await computeIdentityFromBabyJubJub(1n, 2n)
      const b = await computeIdentityFromBabyJubJub(2n, 1n)
      expect(a).not.toBe(b)
    })

    it('result is a non-zero bigint', async () => {
      const id = await computeIdentityFromBabyJubJub(42n, 99n)
      expect(id).toBeTypeOf('bigint')
      expect(id).toBeGreaterThan(0n)
    })

    it('x and y order matters', async () => {
      const a = await computeIdentityFromBabyJubJub(100n, 200n)
      const b = await computeIdentityFromBabyJubJub(200n, 100n)
      expect(a).not.toBe(b)
    })
  })

  describe('computeIdentityFromSecret', () => {
    it('produces a deterministic hash', async () => {
      const secret = 42n
      const a = await computeIdentityFromSecret(secret)
      const b = await computeIdentityFromSecret(secret)
      expect(a).toBe(b)
    })

    it('different secrets produce different identities', async () => {
      const a = await computeIdentityFromSecret(1n)
      const b = await computeIdentityFromSecret(2n)
      expect(a).not.toBe(b)
    })

    it('result is a non-zero bigint', async () => {
      const id = await computeIdentityFromSecret(12345n)
      expect(id).toBeTypeOf('bigint')
      expect(id).toBeGreaterThan(0n)
    })
  })

  describe('cross-function uniqueness', () => {
    it('address-based and secret-based identities differ for same numeric value', async () => {
      // computeIdentityFromAddress returns raw bigint
      // computeIdentityFromSecret returns Poseidon(secret)
      const addrId = computeIdentityFromAddress('0x0000000000000000000000000000000000000001')
      const secretId = await computeIdentityFromSecret(1n)
      expect(addrId).not.toBe(secretId)
    })
  })
})
