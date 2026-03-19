/**
 * Membership Proof Generation
 *
 * Generate ZK-ready membership proofs for ASP trees.
 */

import { MerkleTree, DEFAULT_TREE_DEPTH } from './tree.js'
import type { MembershipProof } from './types.js'

/**
 * Pad proof arrays to a fixed depth.
 * Extra levels get 0 siblings — LeanIMT propagation makes these no-ops.
 */
function padProof(
  elements: bigint[],
  indices: number[],
  targetDepth: number
): { elements: bigint[]; indices: number[] } {
  const padElements = [...elements, ...Array(Math.max(0, targetDepth - elements.length)).fill(0n) as bigint[]]
  const padIndices = [...indices, ...Array(Math.max(0, targetDepth - indices.length)).fill(0) as number[]]
  return {
    elements: padElements.slice(0, targetDepth),
    indices: padIndices.slice(0, targetDepth),
  }
}

/**
 * Generate a membership proof for a single-member tree.
 *
 * With LeanIMT single-child optimization, a single-leaf tree
 * has root = leaf, and all path elements are 0.
 */
export function generateSingleMemberProof(
  identity: bigint,
  treeDepth: number = DEFAULT_TREE_DEPTH
): MembershipProof {
  return {
    root: identity, // LeanIMT optimization: single-leaf root = leaf
    pathElements: Array(treeDepth).fill(0n) as bigint[],
    pathIndices: Array(treeDepth).fill(0) as number[],
  }
}

/**
 * Generate a membership proof for a multi-member tree.
 *
 * Builds the full tree, finds the identity, and extracts a Merkle proof
 * padded to the specified tree depth.
 *
 * @param identity - The identity to prove membership for
 * @param allMembers - All members in the tree
 * @param treeDepth - Target tree depth for padding (default: 20)
 * @throws Error if identity is not found in the member list
 */
export async function generateMultiMemberProof(
  identity: bigint,
  allMembers: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH
): Promise<MembershipProof> {
  if (allMembers.length <= 1) {
    return generateSingleMemberProof(identity, treeDepth)
  }

  const tree = new MerkleTree(treeDepth)
  for (const member of allMembers) {
    tree.insert(member)
  }

  const index = tree.indexOf(identity)
  if (index === -1) {
    throw new Error(`Identity not found in member list (${allMembers.length} members)`)
  }

  const proof = await tree.getProof(index)
  const padded = padProof(proof.pathElements, proof.pathIndices, treeDepth)

  return {
    root: proof.root,
    pathElements: padded.elements,
    pathIndices: padded.indices,
  }
}

/**
 * Generate a membership proof, automatically choosing single or multi-member mode.
 *
 * @param identity - The identity to prove membership for
 * @param members - All members in the tree (if empty or single, uses single-member optimization)
 * @param treeDepth - Target tree depth for padding (default: 20)
 */
export async function generateMembershipProof(
  identity: bigint,
  members?: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH
): Promise<MembershipProof> {
  if (!members || members.length === 0) {
    return generateSingleMemberProof(identity, treeDepth)
  }
  return generateMultiMemberProof(identity, members, treeDepth)
}

/**
 * Compute the Merkle root for a set of members.
 */
export async function computeMerkleRoot(
  members: bigint[],
  treeDepth: number = DEFAULT_TREE_DEPTH
): Promise<bigint> {
  if (members.length === 0) return 0n
  if (members.length === 1) return members[0]! // single-member optimization
  const tree = new MerkleTree(treeDepth)
  for (const member of members) {
    tree.insert(member)
  }
  return tree.getRoot()
}

/**
 * Verify a membership proof locally.
 *
 * Recomputes the root from the proof and checks it matches.
 */
export async function verifyMembershipProof(
  identity: bigint,
  proof: MembershipProof
): Promise<boolean> {
  const { poseidon } = await import('./poseidon.js')

  let current = identity

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i] ?? 0n
    const index = proof.pathIndices[i] ?? 0

    if (sibling === 0n) {
      continue // LeanIMT: skip hashing when sibling is 0
    }

    if (index === 0) {
      current = await poseidon([current, sibling])
    } else {
      current = await poseidon([sibling, current])
    }
  }

  return current === proof.root
}
