import { describe, expect, it } from 'vitest'

import {
  computeCommitment,
  computeNullifier,
  computeOwnerHash,
  hashM31,
  hashTwo,
  verifyMerklePath,
  M31_PRIME,
} from '../../src/core/hash/poseidon31.js'
import { permute } from '../../src/core/hash/poseidon31-perm.js'
import { PoseidonM31, M31_FIELD_PRIME } from '../../src/core/hash/poseidon-m31.js'

/**
 * Canonical Plonky3 test vector: permute([0, 1, 2, ..., 15]).
 * Mirrors `poseidon31_perm.rs::reference_matches_plonky3_canonical_vector`.
 */
const PLONKY3_PERMUTE_0_TO_15: bigint[] = [
  0x0b2c803an, 0x5b1ee4d1n, 0x49c6b1e3n, 0x2cdc280cn,
  0x310a60c8n, 0x530a729en, 0x4e61bcb4n, 0x2e84d3c3n,
  0x58709c08n, 0x7e82ac42n, 0x2162bcefn, 0x6d153ab6n,
  0x742cf0e3n, 0x2f21632dn, 0x61adce1en, 0x1973d6f1n,
]

/**
 * Canonical hash test vectors from
 * `poseidon31.rs::print_canonical_test_vectors`.
 */
const HASH_VEC_1234: bigint[] = [
  1696513454n, 252222151n, 709948652n, 1405243831n,
]
const HASH_TWO_7_11: bigint = 774415644n
const OWNER_HASH_1_TO_8: bigint[] = [
  1188992545n, 278103476n, 220129049n, 427360980n,
]
const COMMITMENT_REPRESENTATIVE: bigint[] = [
  661111406n, 1254808279n, 1055378432n, 2110939937n,
]
const NULLIFIER_LEAF_17: bigint[] = [
  1123645984n, 1766937374n, 1321103500n, 507190005n,
]

describe('Poseidon31 perm', () => {
  it('matches Plonky3 canonical vector for permute([0..15])', () => {
    const state: bigint[] = Array.from({ length: 16 }, (_, i) => BigInt(i))
    permute(state)
    expect(state).toEqual(PLONKY3_PERMUTE_0_TO_15)
  })

  it('produces canonical-form M31 outputs', () => {
    const state: bigint[] = Array.from({ length: 16 }, (_, i) => BigInt(i * 7 + 1))
    permute(state)
    for (const x of state) {
      expect(x).toBeGreaterThanOrEqual(0n)
      expect(x).toBeLessThan(M31_PRIME)
    }
  })

  it('rejects wrong-length state', () => {
    expect(() => permute([0n])).toThrow(/length 16/)
  })
})

describe('Poseidon31 sponge', () => {
  it('matches Rust hash_m31([1, 2, 3, 4]) test vector', () => {
    expect(hashM31([1n, 2n, 3n, 4n])).toEqual(HASH_VEC_1234)
  })

  it('matches Rust hash_two(7, 11) test vector', () => {
    expect(hashTwo(7n, 11n)).toBe(HASH_TWO_7_11)
  })

  it('hash_two equals first digest element', () => {
    const full = hashM31([7n, 11n])
    expect(hashTwo(7n, 11n)).toBe(full[0])
  })

  it('is deterministic', () => {
    const a = hashM31([1n, 2n, 3n])
    const b = hashM31([1n, 2n, 3n])
    expect(a).toEqual(b)
  })

  it('domain-separates by input length (capacity[0] = len)', () => {
    const a = hashM31([1n, 2n, 3n])
    const b = hashM31([1n, 2n])
    expect(a).not.toEqual(b)
  })

  it('rejects out-of-range inputs', () => {
    expect(() => hashM31([-1n])).toThrow(/not in/)
    expect(() => hashM31([M31_PRIME])).toThrow(/not in/)
  })
})

describe('Poseidon31 domain helpers', () => {
  it('matches Rust owner_hash([1..8]) vector', () => {
    const secret: bigint[] = Array.from({ length: 8 }, (_, i) => BigInt(i + 1))
    expect(computeOwnerHash(secret)).toEqual(OWNER_HASH_1_TO_8)
  })

  it('matches Rust commitment(amount=1_000_000, oh, blinding=987_654, origin=0xdead, token=0xcafe)', () => {
    const secret: bigint[] = Array.from({ length: 8 }, (_, i) => BigInt(i + 1))
    const ownerHash = computeOwnerHash(secret)
    const commitment = computeCommitment(
      1_000_000n,
      ownerHash,
      987_654n,
      0xdeadn,
      0xcafen
    )
    expect(commitment).toEqual(COMMITMENT_REPRESENTATIVE)
  })

  it('matches Rust nullifier(secret, leaf_index=17, commitment) vector', () => {
    const secret: bigint[] = Array.from({ length: 8 }, (_, i) => BigInt(i + 1))
    const ownerHash = computeOwnerHash(secret)
    const commitment = computeCommitment(
      1_000_000n,
      ownerHash,
      987_654n,
      0xdeadn,
      0xcafen
    )
    const nullifier = computeNullifier(secret, 17n, commitment)
    expect(nullifier).toEqual(NULLIFIER_LEAF_17)
  })

  it('rejects wrong-shape secrets', () => {
    expect(() => computeOwnerHash([1n, 2n])).toThrow(/8 limbs/)
  })
})

describe('Poseidon31 Merkle path verification', () => {
  it('returns the leaf for an empty path', () => {
    expect(verifyMerklePath(42n, [], [])).toBe(42n)
  })

  it('reverses sibling order based on index_bit', () => {
    const r0 = verifyMerklePath(1n, [2n], [0n])
    const r1 = verifyMerklePath(1n, [2n], [1n])
    expect(r0).not.toBe(r1)
    expect(r0).toBe(hashTwo(1n, 2n))
    expect(r1).toBe(hashTwo(2n, 1n))
  })

  it('rejects mismatched path lengths', () => {
    expect(() => verifyMerklePath(0n, [1n, 2n], [0n])).toThrow(/length mismatch/)
  })
})

describe('PoseidonM31 IHashFunction adapter', () => {
  const hash = new PoseidonM31()

  it('has correct metadata', () => {
    expect(hash.name).toBe('Poseidon-M31')
    expect(hash.fieldPrime).toBe(M31_FIELD_PRIME)
    expect(hash.fieldPrime).toBe(M31_PRIME)
  })

  it('hash2 returns a value in [0, M31_PRIME)', async () => {
    const result = await hash.hash2(1n, 2n)
    expect(result).toBeGreaterThanOrEqual(0n)
    expect(result).toBeLessThan(M31_PRIME)
  })

  it('hash2 matches the Rust hash_two test vector', async () => {
    expect(await hash.hash2(7n, 11n)).toBe(HASH_TWO_7_11)
  })

  it('hashN returns the first digest limb', async () => {
    const direct = hashM31([1n, 2n, 3n, 4n])
    expect(await hash.hashN([1n, 2n, 3n, 4n])).toBe(direct[0])
  })

  it('is deterministic and asymmetric', async () => {
    expect(await hash.hash2(1n, 2n)).toBe(await hash.hash2(1n, 2n))
    expect(await hash.hash2(1n, 2n)).not.toBe(await hash.hash2(2n, 1n))
  })
})
