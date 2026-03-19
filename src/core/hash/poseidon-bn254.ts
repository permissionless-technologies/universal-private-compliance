/**
 * Poseidon Hash over BN254
 *
 * ~100-bit security (post Kim-Barbulescu 2016).
 * Uses circomlibjs for compatibility with Circom circuits compiled for BN254.
 *
 * Use PoseidonBLS12381 for 128-bit security (institutional/audit requirements).
 */

import type { IHashFunction } from './interface.js'

// circomlibjs types
type PoseidonFn = {
  (inputs: bigint[]): Uint8Array
  F: {
    toObject: (val: Uint8Array) => bigint
  }
}

let instance: PoseidonFn | null = null

async function init(): Promise<PoseidonFn> {
  if (!instance) {
    const { buildPoseidon } = await import('circomlibjs')
    instance = await buildPoseidon() as PoseidonFn
  }
  return instance!
}

/**
 * BN254 field prime (used by Ethereum precompiles, Circom default)
 */
export const BN254_FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

export class PoseidonBN254 implements IHashFunction {
  readonly name = 'Poseidon-BN254'
  readonly fieldPrime = BN254_FIELD_PRIME
  readonly securityBits = 100

  async hash2(left: bigint, right: bigint): Promise<bigint> {
    return this.hashN([left, right])
  }

  async hashN(inputs: bigint[]): Promise<bigint> {
    const poseidonFn = await init()
    const hash = poseidonFn(inputs)
    return poseidonFn.F.toObject(hash)
  }
}
