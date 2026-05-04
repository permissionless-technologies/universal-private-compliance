/**
 * Poseidon2-Mersenne31 sponge — off-circuit reference for the STARK side.
 *
 * Mirror of [poseidon31.rs](https://github.com/permissionless-technologies/universal-private-pool/blob/main/stwo-prover/src/poseidon31.rs)
 * — the in-circuit Poseidon31 AIR consumes the same round constants and
 * sponge convention. Outputs match the Rust reference byte-for-byte.
 *
 * Sponge construction (8-rate / 8-capacity):
 *   - state[0..8]    = absorbed elements (added to previous state, mod M31)
 *   - state[8..16]   = capacity, with `state[8]` initialised to the input
 *                       length to domain-separate variable-length inputs
 *   - On absorb, add the input chunk to the rate portion and apply the perm.
 *   - Squeeze: take the first DIGEST_SIZE elements after the final perm.
 */

import {
  CAPACITY,
  DIGEST_SIZE,
  RATE,
  SECRET_LIMBS,
  WIDTH,
} from './poseidon31-constants.js'
import { M31_PRIME, permute } from './poseidon31-perm.js'

export { CAPACITY, DIGEST_SIZE, RATE, SECRET_LIMBS, WIDTH, M31_PRIME }

/** Reduce a non-negative bigint to canonical M31. */
function modM31(x: bigint): bigint {
  const r = x % M31_PRIME
  return r < 0n ? r + M31_PRIME : r
}

/**
 * Hash an arbitrary number of M31 elements, returning a 4-element digest.
 *
 * Inputs must already be in canonical M31 form (non-negative `bigint < 2^31 - 1`).
 * Throws if any input is out of range.
 */
export function hashM31(inputs: bigint[]): bigint[] {
  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i]!
    if (v < 0n || v >= M31_PRIME) {
      throw new Error(`hashM31: input[${i}] = ${v} not in [0, M31_PRIME)`)
    }
  }

  // Start from zero state, encode input length in capacity[0] for domain
  // separation.
  const state: bigint[] = new Array(WIDTH).fill(0n)
  state[RATE] = BigInt(inputs.length)

  for (let i = 0; i < inputs.length; i += RATE) {
    const end = Math.min(i + RATE, inputs.length)
    for (let j = 0; j < end - i; j++) {
      state[j] = modM31(state[j]! + inputs[i + j]!)
    }
    permute(state)
  }

  return state.slice(0, DIGEST_SIZE)
}

/**
 * Hash exactly two M31 elements and return only the first digest element.
 * Used for Merkle tree internal nodes.
 */
export function hashTwo(left: bigint, right: bigint): bigint {
  return hashM31([left, right])[0]!
}

/**
 * Compute the spender's owner_hash from an 8-limb owner_secret.
 *
 *   owner_hash = Poseidon31(owner_secret[0..8])
 */
export function computeOwnerHash(ownerSecret: bigint[]): bigint[] {
  if (ownerSecret.length !== SECRET_LIMBS) {
    throw new Error(
      `computeOwnerHash: expected ${SECRET_LIMBS} limbs, got ${ownerSecret.length}`
    )
  }
  return hashM31(ownerSecret)
}

/**
 * Compute a note commitment.
 *
 *   commitment = Poseidon31(amount, owner_hash[0..4], blinding, origin, token)
 */
export function computeCommitment(
  amount: bigint,
  ownerHash: bigint[],
  blinding: bigint,
  origin: bigint,
  token: bigint
): bigint[] {
  if (ownerHash.length !== DIGEST_SIZE) {
    throw new Error(
      `computeCommitment: ownerHash must have ${DIGEST_SIZE} limbs, got ${ownerHash.length}`
    )
  }
  return hashM31([
    amount,
    ownerHash[0]!,
    ownerHash[1]!,
    ownerHash[2]!,
    ownerHash[3]!,
    blinding,
    origin,
    token,
  ])
}

/**
 * Compute a nullifier.
 *
 *   nullifier = Poseidon31(owner_secret[0..8], leaf_index, commitment[0..4])
 */
export function computeNullifier(
  ownerSecret: bigint[],
  leafIndex: bigint,
  commitment: bigint[]
): bigint[] {
  if (ownerSecret.length !== SECRET_LIMBS) {
    throw new Error(
      `computeNullifier: ownerSecret must have ${SECRET_LIMBS} limbs, got ${ownerSecret.length}`
    )
  }
  if (commitment.length !== DIGEST_SIZE) {
    throw new Error(
      `computeNullifier: commitment must have ${DIGEST_SIZE} limbs, got ${commitment.length}`
    )
  }
  const inputs: bigint[] = [
    ...ownerSecret,
    leafIndex,
    ...commitment,
  ]
  return hashM31(inputs)
}

/**
 * Verify a Poseidon31 Merkle proof path. Returns the computed root.
 *
 * Single-element chain: each level produces one M31 (the first element of
 * the 4-element digest). Matches the in-trace AIR's
 * `state_merkle_perm.state[N_ROUNDS][0]` chain.
 */
export function verifyMerklePath(
  leaf: bigint,
  pathElements: bigint[],
  pathIndices: bigint[]
): bigint {
  if (pathElements.length !== pathIndices.length) {
    throw new Error(
      `verifyMerklePath: pathElements (${pathElements.length}) vs pathIndices (${pathIndices.length}) length mismatch`
    )
  }
  let current = leaf
  for (let i = 0; i < pathElements.length; i++) {
    const sibling = pathElements[i]!
    const index = pathIndices[i]!
    let left: bigint
    let right: bigint
    if (index === 0n) {
      left = current
      right = sibling
    } else {
      left = sibling
      right = current
    }
    current = hashTwo(left, right)
  }
  return current
}
