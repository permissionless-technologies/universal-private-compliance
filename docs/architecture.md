# Architecture

## Overview

Universal Private Compliance (UPC) provides two layers of abstraction:

1. **Off-chain**: `IASPProvider` — pluggable storage for Merkle tree members
2. **On-chain**: `IAttestationVerifier` — pluggable verification of attestation proofs

## Core Primitive

An ASP (Association Set Provider) performs one fundamental operation:

> **Maintain a Merkle tree of approved identities and enable ZK membership proofs.**

```
Identity → Poseidon(key) → MerkleTree → Root → On-chain
                                          ↓
User proves: "I am in this tree" (ZK, no identity revealed)
```

## Off-Chain Architecture (Provider System)

```
┌─────────────────────────────────────────┐
│           ASPClient                      │
│                                          │
│  addMember()     generateProof()         │
│  removeMember()  publishRoot()           │
│  register()      isValidRoot()           │
│                                          │
├──────────────────────────────────────────┤
│           IASPProvider                    │
│                                          │
│  addMember(identity)                     │
│  removeMember(identity)                  │
│  getMembers() → bigint[]                 │
│  getRoot() → bigint                      │
│  getMerkleProof(identity) → MerkleProof  │
└──┬──────────┬──────────────┬─────────────┘
   │          │              │
┌──▼──┐  ┌───▼──────┐  ┌───▼────────┐
│Mem  │  │ Local    │  │  REST API  │
│ory  │  │ Storage  │  │  Provider  │
└─────┘  └──────────┘  └────────────┘
```

The `ASPClient` orchestrates between the provider (off-chain storage) and the blockchain (on-chain registry). It never stores data directly — all persistence is delegated to the provider.

## On-Chain Architecture (Verifier System)

```
┌──────────────────────────────┐
│       AttestationHub          │
│                                │
│ registerVerifier(v) → id       │
│ verify(id, identity, proof)    │
│ getVerifier(id) → IVerifier    │
└───┬────────────┬───────────┬──┘
    │            │           │
┌───▼──────┐ ┌──▼────────┐ ┌▼──────────┐
│MerkleASP │ │ Semaphore │ │ Custom    │
│Verifier  │ │ Adapter   │ │ Adapter   │
│          │ │           │ │           │
│ Validates│ │ Delegates │ │ Your own  │
│ root via │ │ to        │ │ logic     │
│ ASPReg.  │ │ Semaphore │ │           │
└──────────┘ └───────────┘ └───────────┘
```

Each adapter implements `IAttestationVerifier`:

```solidity
interface IAttestationVerifier {
    function verify(uint256 identity, bytes calldata proof) external view returns (bool);
    function name() external view returns (string memory);
    function attestationType() external view returns (string memory);
}
```

## Identity Model

Identities stored in the Merkle tree are ZK-friendly hashes:

| Format | Field | Use Case |
|--------|-------|----------|
| `Poseidon(PK.x, PK.y)` | BN254 | SNARK circuits |
| `keccak(address)` | bytes32 | Address-based compliance |
| Raw `address` | uint160 | Simple allowlists |

## Proof Composability

### Mode A: Embedded Gadget (recommended)

Consumer protocols import the `MembershipProof` Circom template directly into their circuits. The ASP root becomes a public input to the combined proof.

```circom
include "universal-private-compliance/circuits/membership.circom";

component asp = MembershipProof(20);
asp.identity <== myIdentitySignal;
asp.attestationRoot <== aspRootPublicInput;
```

### Mode B: Standalone Verification

For protocols that can't modify their circuits, generate an independent proof and verify it on-chain via the `AttestationHub`.

## Revocation

When a member is removed:

1. ASP operator calls `provider.removeMember(identity)`
2. Tree is rebuilt, new root computed
3. New root published on-chain via `asp.publishRoot()`
4. Old roots remain valid for 64 more updates (history buffer)
5. After old roots expire, proofs for the revoked identity fail
