/**
 * Poseidon2-Mersenne31 (width 16) permutation — pure-BigInt M31 arithmetic.
 *
 * Line-by-line port of [poseidon31_perm.rs](https://github.com/permissionless-technologies/universal-private-pool/blob/main/stwo-prover/src/poseidon31_perm.rs)
 * — the in-circuit AIR follows the same algorithm, so this implementation
 * exists as the canonical off-circuit reference for the JS side.
 *
 * Cross-validated against the Plonky3 canonical test vector for
 * `permute([0..16])` and against the Rust port's
 * `print_canonical_test_vectors` outputs (see the test suite).
 *
 * # Field representation
 *
 * M31 elements are stored as `bigint` in canonical form `[0, P)` where
 * `P = 2^31 - 1`. Multiplication uses BigInt arithmetic to avoid
 * 53-bit-safe-integer overflow; addition and subtraction stay within
 * 32-bit range and are reduced once at the end.
 */

import {
  RC_EXTERNAL_INITIAL,
  RC_EXTERNAL_TERMINAL,
  RC_INTERNAL,
  INTERNAL_DIAG_SHIFTS,
  N_FULL_ROUNDS_INITIAL,
  N_FULL_ROUNDS_TERMINAL,
  N_PARTIAL_ROUNDS,
  WIDTH,
} from './poseidon31-constants.js'

/** Mersenne31 prime: 2^31 - 1. */
export const M31_PRIME = (1n << 31n) - 1n

/** Reduce a non-negative bigint to canonical M31 representation. */
function modM31(x: bigint): bigint {
  const r = x % M31_PRIME
  return r < 0n ? r + M31_PRIME : r
}

function add(a: bigint, b: bigint): bigint {
  return modM31(a + b)
}

function sub(a: bigint, b: bigint): bigint {
  return modM31(a - b)
}

function mul(a: bigint, b: bigint): bigint {
  return modM31(a * b)
}

function double(a: bigint): bigint {
  return add(a, a)
}

/** S-box: x^5 over M31. */
function sbox(x: bigint): bigint {
  const x2 = mul(x, x)
  const x4 = mul(x2, x2)
  return mul(x4, x)
}

/**
 * Apply the 4×4 MDS matrix
 *
 *   [ 2 3 1 1 ]
 *   [ 1 2 3 1 ]
 *   [ 1 1 2 3 ]
 *   [ 3 1 1 2 ]
 *
 * in place (mutates the array).
 */
function applyMat4(x: bigint[]): void {
  const x0 = x[0]!
  const x1 = x[1]!
  const x2 = x[2]!
  const x3 = x[3]!

  const t01 = add(x0, x1)
  const t23 = add(x2, x3)
  const t0123 = add(t01, t23)
  const t01123 = add(t0123, x1)
  const t01233 = add(t0123, x3)

  // x[3] = 3*x[0] + x[1] + x[2] + 2*x[3]
  x[3] = add(t01233, double(x0))
  // x[1] = x[0] + 2*x[1] + 3*x[2] + x[3]   (read x[2] before overwriting)
  x[1] = add(t01123, double(x2))
  // x[0] = 2*x[0] + 3*x[1] + x[2] + x[3]
  x[0] = add(t01123, t01)
  // x[2] = x[0] + x[1] + 2*x[2] + 3*x[3]
  x[2] = add(t01233, t23)
}

/**
 * Light external linear layer for WIDTH=16:
 *   1. apply_mat4 to each consecutive 4-element chunk
 *   2. cross-chunk sums sums[k] = state[k] + state[k+4] + state[k+8] + state[k+12]
 *   3. state[i] += sums[i % 4]
 */
function mdsLightPermutation(state: bigint[]): void {
  for (let c = 0; c < WIDTH; c += 4) {
    const chunk = [state[c]!, state[c + 1]!, state[c + 2]!, state[c + 3]!]
    applyMat4(chunk)
    state[c] = chunk[0]!
    state[c + 1] = chunk[1]!
    state[c + 2] = chunk[2]!
    state[c + 3] = chunk[3]!
  }

  const sums: bigint[] = [0n, 0n, 0n, 0n]
  for (let k = 0; k < 4; k++) {
    sums[k] = add(add(state[k]!, state[k + 4]!), add(state[k + 8]!, state[k + 12]!))
  }

  for (let i = 0; i < WIDTH; i++) {
    state[i] = add(state[i]!, sums[i % 4]!)
  }
}

/** Multiply x by 2^shift over M31 via repeated doubling. */
function mulPowTwo(x: bigint, shift: number): bigint {
  let acc = x
  for (let i = 0; i < shift; i++) {
    acc = double(acc)
  }
  return acc
}

/**
 * Internal diffusion = (1 + diag(V_16)).
 *
 *   full_sum  = sum(state)
 *   state[0]  = full_sum - 2*state[0]
 *   state[i]  = full_sum + 2^DIAG_SHIFTS[i-1] * state[i]   for i in 1..16
 */
function internalLinearLayer(state: bigint[]): void {
  let fullSum = 0n
  for (let i = 0; i < WIDTH; i++) {
    fullSum = add(fullSum, state[i]!)
  }

  state[0] = sub(fullSum, double(state[0]!))
  for (let i = 1; i < WIDTH; i++) {
    state[i] = add(fullSum, mulPowTwo(state[i]!, INTERNAL_DIAG_SHIFTS[i - 1]!))
  }
}

/** One full external round: add round constants, S-box, mdsLightPermutation. */
function externalRound(state: bigint[], rc: readonly bigint[]): void {
  for (let i = 0; i < WIDTH; i++) {
    state[i] = add(state[i]!, rc[i]!)
  }
  for (let i = 0; i < WIDTH; i++) {
    state[i] = sbox(state[i]!)
  }
  mdsLightPermutation(state)
}

/** One partial round: add constant + S-box on state[0], then internal diffusion. */
function internalRound(state: bigint[], rc: bigint): void {
  state[0] = add(state[0]!, rc)
  state[0] = sbox(state[0]!)
  internalLinearLayer(state)
}

/**
 * Apply the full Poseidon2 width-16 Mersenne31 permutation in place.
 *
 * Order:
 *   1. Initial mdsLightPermutation (no constants, no S-box).
 *   2. 4 initial full rounds.
 *   3. 14 partial rounds.
 *   4. 4 terminal full rounds.
 *
 * Mutates `state` in place; expects `state.length === 16` with each
 * element in canonical M31 form.
 */
export function permute(state: bigint[]): void {
  if (state.length !== WIDTH) {
    throw new Error(`Poseidon31 permute: expected state of length ${WIDTH}, got ${state.length}`)
  }

  mdsLightPermutation(state)

  for (let r = 0; r < N_FULL_ROUNDS_INITIAL; r++) {
    externalRound(state, RC_EXTERNAL_INITIAL[r]!)
  }
  for (let r = 0; r < N_PARTIAL_ROUNDS; r++) {
    internalRound(state, RC_INTERNAL[r]!)
  }
  for (let r = 0; r < N_FULL_ROUNDS_TERMINAL; r++) {
    externalRound(state, RC_EXTERNAL_TERMINAL[r]!)
  }
}
