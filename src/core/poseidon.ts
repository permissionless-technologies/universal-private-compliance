/**
 * Poseidon Hash Utilities
 *
 * Wrapper around circomlibjs Poseidon hash implementation.
 * Used for Merkle tree hashing and identity derivation.
 */

// circomlibjs types (not exported by the library)
type PoseidonFn = {
  (inputs: bigint[]): Uint8Array
  F: {
    toObject: (val: Uint8Array) => bigint
    e: (val: bigint) => unknown
  }
}

// Lazily initialized Poseidon instance
let poseidonInstance: PoseidonFn | null = null

/**
 * BN254 field prime (same as used in Circom/snarkjs)
 */
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * Initialize Poseidon hash function (lazy loading)
 */
async function initPoseidon(): Promise<PoseidonFn> {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs')
    poseidonInstance = await buildPoseidon() as PoseidonFn
  }
  return poseidonInstance!
}

/**
 * Compute Poseidon hash of inputs
 *
 * @param inputs - Array of field elements to hash (up to 16 elements)
 * @returns Hash as bigint
 */
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const poseidonFn = await initPoseidon()
  const hash = poseidonFn(inputs)
  return poseidonFn.F.toObject(hash)
}

/**
 * Check if a value is within the BN254 field
 */
export function isValidFieldElement(value: bigint): boolean {
  return value >= 0n && value < FIELD_PRIME
}
