/**
 * Hash Function Interface
 *
 * Abstraction layer for ZK-friendly hash functions.
 * Allows plugging in different hash functions (Poseidon-BN254, Poseidon-BLS12-381, etc.)
 * depending on the required security level and target proof system.
 */

/**
 * Interface for ZK-friendly hash functions used in Merkle trees and identity commitments.
 */
export interface IHashFunction {
  /**
   * Hash two field elements (for Merkle tree internal nodes).
   * This is the hot path — called once per tree level per proof.
   */
  hash2(left: bigint, right: bigint): Promise<bigint>

  /**
   * Hash N field elements (for identity commitments, etc.).
   * Used for flexible-arity hashing outside of Merkle trees.
   */
  hashN(inputs: bigint[]): Promise<bigint>

  /**
   * The prime of the underlying field.
   * All hash outputs are elements of F_p where p is this prime.
   */
  readonly fieldPrime: bigint

  /**
   * Human-readable name (e.g., "Poseidon-BN254", "Poseidon-BLS12-381").
   */
  readonly name: string

  /**
   * Approximate security level in bits.
   */
  readonly securityBits: number
}
