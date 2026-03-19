/**
 * Identity Derivation
 *
 * Utilities for computing ZK-friendly identity commitments
 * from various key formats.
 */

import { poseidon } from './poseidon.js'

/**
 * Compute a Poseidon-based identity commitment from a BabyJubJub public key.
 *
 * This is the standard identity format for SNARK circuits.
 *
 * @param pubKeyX - X coordinate of the BabyJubJub public key
 * @param pubKeyY - Y coordinate of the BabyJubJub public key
 * @returns Identity commitment as Poseidon(pubKeyX, pubKeyY)
 */
export async function computeIdentityFromBabyJubJub(
  pubKeyX: bigint,
  pubKeyY: bigint
): Promise<bigint> {
  return poseidon([pubKeyX, pubKeyY])
}

/**
 * Compute an identity commitment from an Ethereum address.
 *
 * For simple allowlists where the identity is just the address.
 * The address is cast to a field element (uint160 fits in BN254 field).
 *
 * @param address - Ethereum address (hex string)
 * @returns Address as bigint
 */
export function computeIdentityFromAddress(address: `0x${string}`): bigint {
  return BigInt(address)
}

/**
 * Compute a Poseidon-hashed identity from a secret.
 *
 * Similar to Semaphore v4's identity model: identity = hash(secret).
 *
 * @param secret - A secret value known only to the user
 * @returns Identity commitment as Poseidon(secret)
 */
export async function computeIdentityFromSecret(secret: bigint): Promise<bigint> {
  return poseidon([secret])
}
