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

## Pluggable Hash Functions

The SDK uses a pluggable hash interface (`IHashFunction`) for all Merkle tree operations. This allows switching between different elliptic curves based on security requirements.

```typescript
interface IHashFunction {
  hash2(left: bigint, right: bigint): Promise<bigint>
  hashN(inputs: bigint[]): Promise<bigint>
  readonly fieldPrime: bigint
  readonly name: string
  readonly securityBits: number
}
```

### Built-in Implementations

| Implementation | Curve | Security | Status |
|---------------|-------|----------|--------|
| `PoseidonBLS12381` | BLS12-381 | 128-bit | **Default** |
| `PoseidonBN254` | BN254 | ~100-bit | Legacy/opt-in |

### Why BLS12-381?

BN254 (alt_bn128) was originally estimated at 128-bit security, but the Kim-Barbulescu attack (2016) reduced it to ~100 bits. This is below the 128-bit threshold required by institutional audits and NIST recommendations.

BLS12-381 provides proper 128-bit security and is now gas-efficient on Ethereum since EIP-2537 precompiles went live with Pectra (May 2025).

### Using BN254 (opt-in)

```typescript
import { MerkleTree, PoseidonBN254 } from '@permissionless-technologies/universal-private-compliance'

const tree = new MerkleTree(20, new PoseidonBN254())
```

### Circuit Variants

Circuits are provided for both curves:
- `src/circuits/bls12381/` — compile with `circom ... --prime bls12381`
- `src/circuits/bn254/` — compile with standard `circom` (default BN254)

## Proof System & Trusted Setup

### Why PLONK (not Groth16)

UPC uses **PLONK** as its proof system, not Groth16. This is a deliberate choice for institutional auditability:

| | Groth16 | PLONK |
|---|---|---|
| **Phase 1 setup** | Universal (PPoT) | Universal (PPoT) |
| **Phase 2 setup** | Per-circuit MPC ceremony | **Deterministic** (no ceremony) |
| **Toxic waste** | Yes — if all ceremony participants collude, proofs can be forged | **None** — Phase 2 is fully determined by the circuit + Phase 1 |
| **Proof size** | ~256 bytes | ~768 bytes |
| **Audit question** | "Who ran the ceremony? How was toxic waste destroyed?" | "Phase 1 is PPoT (community ceremony). Phase 2 is deterministic." |

For a compliance system where a forged membership proof means bypassing KYC/sanctions checks, eliminating per-circuit ceremony risk is essential.

### Trusted Setup (Phase 1)

Phase 1 uses the [Perpetual Powers of Tau](https://github.com/privacy-ethereum/perpetualpowersoftau) community ceremony:
- BLS12-381: 18 independent contributors
- Phase-2-ready `.ptau` files for powers of 2 up to 28
- Publicly verifiable transcript

Phase 2 (`snarkjs plonk setup`) is fully deterministic — it takes the circuit's R1CS and the Phase 1 `.ptau` file as inputs and produces a unique, reproducible proving key. No additional ceremony, no toxic waste.

### Compilation & Setup Commands

```bash
# Compile (BLS12-381)
circom membership.circom --r1cs --wasm --prime bls12381

# Download PPoT Phase 1 file
wget https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/bls12-381/powersOfTau28_hez_final_14.ptau

# Phase 2 — deterministic, no ceremony
snarkjs plonk setup membership.r1cs powersOfTau28_hez_final_14.ptau membership.zkey

# Generate proof
snarkjs plonk prove membership.zkey witness.wtns proof.json public.json

# Verify
snarkjs plonk verify verification_key.json public.json proof.json
```

### Long-term: STARKs

For post-quantum security, UPC is designed to support STARKs (via the Stwo prover) which require **no trusted setup at all**. The pluggable hash interface (`IHashFunction`) makes this transition straightforward — STARKs use different fields (M31) and hash functions (Keccak).

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
