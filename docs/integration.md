# Integrating UPC into a Protocol

## Overview

This guide shows how to integrate Universal Private Compliance (UPC) into an existing protocol that needs ASP-based compliance. The example uses the Universal Private Pool (UPP) SDK, but the pattern applies to any protocol.

## Installation

```bash
npm install @permissionless-technologies/universal-private-compliance
```

## Pattern: Thin Adapter Layer

Rather than rewriting your protocol's compliance code, create a thin adapter that delegates to UPC while keeping your existing public API:

```typescript
// your-sdk/src/asp.ts — thin wrapper around UPC
import {
  generateMembershipProof,
  generateSingleMemberProof,
  verifyMembershipProof,
  computeMerkleRoot,
  DEFAULT_TREE_DEPTH,
  PoseidonBN254,  // or PoseidonBLS12381 for 128-bit security
} from '@permissionless-technologies/universal-private-compliance'

// Your protocol-specific proof type (adds aspId, etc.)
export interface ASPProof {
  aspId: bigint
  aspRoot: bigint
  aspPathElements: bigint[]
  aspPathIndices: number[]
}

// Choose hash function based on your deployed circuits
const hashFn = new PoseidonBN254() // use PoseidonBLS12381 for new deployments

export async function generateASPProof(
  aspId: bigint,
  identity: bigint,
  members?: bigint[]
): Promise<ASPProof> {
  const proof = await generateMembershipProof(identity, members, DEFAULT_TREE_DEPTH, hashFn)
  return {
    aspId,
    aspRoot: proof.root,
    aspPathElements: proof.pathElements,
    aspPathIndices: proof.pathIndices,
  }
}
```

## Using the ASP List

Load the ASP list to let users choose which ASP to use:

```typescript
import {
  type ASPList,
  type ASPEntry,
  parseASPList,
  getActiveASPs,
  fetchASPProof,
} from '@permissionless-technologies/universal-private-compliance'

// Load list (from your own JSON, CDN, or bundled)
const raw = await fetch('/asp-list.json').then(r => r.json())
const list = parseASPList(raw)

// Show active ASPs in dropdown
const asps = getActiveASPs(list)

// When user selects an ASP and needs a proof
const proof = await fetchASPProof(selectedASP, userAddress)
```

## Re-exporting the ABI

If your SDK re-exports the ASP Registry ABI, import it from UPC:

```typescript
// your-sdk/src/contracts/abi/index.ts
export { ASP_REGISTRY_HUB_ABI } from '@permissionless-technologies/universal-private-compliance'
```

## Hash Function Selection

| Scenario | Hash | Why |
|----------|------|-----|
| Existing deployed circuits (BN254) | `PoseidonBN254` | Backward compat with deployed verifiers |
| New deployments | `PoseidonBLS12381` | 128-bit security for institutional compliance |

Pass the hash function to `generateMembershipProof()` and `verifyMembershipProof()` — they default to BLS12-381 if not specified.

## On-Chain Integration

Your protocol's smart contract calls `ASPRegistryHub.isValidASPRoot(aspId, root)` to verify the ASP root is current. No changes needed — UPC uses the same contract interface.

For the pluggable `AttestationHub` architecture (multiple verifier backends), see [Smart Contracts](contracts.md).
