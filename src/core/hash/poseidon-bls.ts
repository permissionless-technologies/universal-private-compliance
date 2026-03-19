/**
 * Poseidon Hash over BLS12-381
 *
 * 128-bit security — meets institutional audit requirements.
 * Uses the poseidon-bls12381 npm package with constants derived from
 * the official Poseidon reference implementation.
 *
 * This is the DEFAULT hash function for the UPC SDK.
 *
 * Compatible with:
 * - Circom circuits compiled with `--prime bls12381`
 * - poseidon-bls12381-circom Circom templates
 * - EIP-2537 on-chain verification (Pectra, live since May 2025)
 */

import type { IHashFunction } from './interface.js'

/**
 * BLS12-381 scalar field prime
 */
export const BLS12_381_FIELD_PRIME = 52435875175126190479447740508185965837690552500527637822603658699938581184513n

export class PoseidonBLS12381 implements IHashFunction {
  readonly name = 'Poseidon-BLS12-381'
  readonly fieldPrime = BLS12_381_FIELD_PRIME
  readonly securityBits = 128

  async hash2(left: bigint, right: bigint): Promise<bigint> {
    return this.hashN([left, right])
  }

  async hashN(inputs: bigint[]): Promise<bigint> {
    // poseidon-bls12381 exports poseidon1, poseidon2, ..., poseidon16
    // We dynamically import the right arity function
    const mod = await import('poseidon-bls12381')
    const arityFn = `poseidon${inputs.length}` as keyof typeof mod
    const fn = mod[arityFn]
    if (typeof fn !== 'function') {
      throw new Error(`Poseidon-BLS12-381 does not support arity ${inputs.length} (max 16)`)
    }
    return (fn as (inputs: bigint[]) => bigint)(inputs)
  }
}
