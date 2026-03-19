/**
 * Hash module — pluggable ZK-friendly hash functions
 *
 * Default: PoseidonBLS12381 (128-bit security)
 * Alternative: PoseidonBN254 (100-bit security, Circom/Ethereum legacy)
 */

export type { IHashFunction } from './interface.js'
export { PoseidonBN254, BN254_FIELD_PRIME } from './poseidon-bn254.js'
export { PoseidonBLS12381, BLS12_381_FIELD_PRIME } from './poseidon-bls.js'

import { PoseidonBLS12381 } from './poseidon-bls.js'

/**
 * The default hash function for the UPC SDK.
 * BLS12-381 Poseidon — 128-bit security.
 */
export function getDefaultHashFunction() {
  return new PoseidonBLS12381()
}
