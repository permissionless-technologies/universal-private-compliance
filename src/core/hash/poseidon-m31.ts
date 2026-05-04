/**
 * Poseidon2-Mersenne31 hash adapter — IHashFunction over M31.
 *
 * Field: Mersenne31 prime, P = 2^31 - 1.
 * Output: a single M31 element (first limb of the 4-element Poseidon31
 * digest, matching the in-trace AIR convention).
 *
 * Used by the STARK side of the dual-root ASP service to maintain a
 * Merkle tree whose root binds 1:1 with the on-chain `pub_asp_root` that
 * the Poseidon31 STARK AIR consumes.
 *
 * Security: the digest is truncated to 31 bits, so collision security is
 * ~2^15.5 by birthday bound. This matches the original Keccak-M31 STARK
 * design's per-element collision resistance and the in-trace AIR's
 * single-limb Merkle chain. Higher-security applications should use
 * `PoseidonBLS12381` instead — Poseidon31 here is specifically for
 * STARK-side Merkle trees that the Poseidon31 AIR can verify.
 */

import type { IHashFunction } from './interface.js'
import { hashM31, hashTwo, M31_PRIME } from './poseidon31.js'

/** Mersenne31 prime: 2^31 - 1. */
export const M31_FIELD_PRIME = M31_PRIME

export class PoseidonM31 implements IHashFunction {
  readonly name = 'Poseidon-M31'
  readonly fieldPrime = M31_FIELD_PRIME
  /**
   * Effective collision security for the truncated single-limb digest.
   * Higher-security paths should use Poseidon-BLS12-381.
   */
  readonly securityBits = 16

  async hash2(left: bigint, right: bigint): Promise<bigint> {
    return hashTwo(left, right)
  }

  async hashN(inputs: bigint[]): Promise<bigint> {
    return hashM31(inputs)[0]!
  }
}
