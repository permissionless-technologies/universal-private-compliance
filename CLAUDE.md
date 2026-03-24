# CLAUDE.md

This file provides guidance to Claude Code when working with the Universal Private Compliance (UPC) SDK.

## Project Overview

**Universal Private Compliance (UPC)** — A standalone SDK for zero-knowledge compliance verification using Association Set Providers (ASPs). Extracted from the UPP SDK to be a general-purpose, pluggable attestation framework.

## Design Principles

1. **Pluggable providers** — Storage is abstracted via `IASPProvider`. The SDK never stores data directly.
2. **Pluggable verifiers** — On-chain verification is abstracted via `IAttestationVerifier`. Supports our Merkle ASP, Semaphore, WorldID, etc.
3. **Reusable** — Designed as a standalone npm package consumed by UPP SDK and any other protocol.
4. **Lightweight** — Minimal dependencies, tree-shakeable exports.
5. **Modern** — Built on viem (NOT ethers.js), ESM-first, TypeScript strict mode.

## Directory Structure

```
universal-private-compliance/
├── src/
│   ├── core/            # Core SDK: tree, proof, identity, client, types, hash
│   ├── asp/             # ASP service interfaces: IEventSource, IMembershipGate, API schema
│   ├── providers/       # IASPProvider + built-in implementations
│   ├── operator/        # ASP operator tools (tree management, root publishing)
│   ├── contracts/       # Solidity contracts + ABIs
│   │   ├── interfaces/  # IAttestationVerifier, IASPRegistry
│   │   └── src/         # AttestationHub, ASPRegistryHub, BLS12381, PlonkVerifier, adapters
│   ├── circuits/        # Circom membership proof templates (bn254/ + bls12381/)
│   ├── react/           # Optional React hooks
│   └── index.ts         # Public exports
├── packages/
│   └── upc-asp-whitelist/  # Auto-whitelist ASP service (@permissionless-technologies/upc-asp-whitelist)
├── deployments/         # Per-chain contract addresses + ASP lists
├── docs/                # Markdown documentation
└── test/                # Vitest tests
```

## Subpath Exports

```
@permissionless-technologies/upc-sdk          # Main entry (everything)
@permissionless-technologies/upc-sdk/core     # Core: tree, proof, hash, identity
@permissionless-technologies/upc-sdk/asp      # ASP service interfaces
@permissionless-technologies/upc-sdk/providers # Storage providers
@permissionless-technologies/upc-sdk/operator  # Operator tools
@permissionless-technologies/upc-sdk/react    # React hooks (optional)
```

## Build Commands

```bash
npm install     # Install dependencies
npm run build   # Build for production (ESM + CJS)
npm run dev     # Watch mode
npm test        # Run tests
npm run lint    # Lint code
```

## Cryptographic Defaults

- **Default hash: Poseidon over BLS12-381** (128-bit security)
- BN254 available as opt-in via `PoseidonBN254` (100-bit security)
- Hash is pluggable via `IHashFunction` interface in `src/core/hash/`
- Circuits: both `bn254/` and `bls12381/` versions in `src/circuits/`
- **Proof system: PLONK** (NOT Groth16) — universal trusted setup, no per-circuit ceremony
- Phase 1: [Perpetual Powers of Tau](https://github.com/privacy-ethereum/perpetualpowersoftau) BLS12-381 `.ptau` files
- Phase 2: Deterministic (`snarkjs plonk setup`) — no toxic waste, no MPC ceremony
- `OptionalMembershipProof` does NOT belong in UPC — bypass/ragequit is a pool concept, belongs in UPP

## Key Dependencies

- `poseidon-bls12381` — Poseidon hash over BLS12-381 (default, 128-bit)
- `circomlibjs` — Poseidon hash over BN254 (legacy, 100-bit)
- `viem` — Ethereum interaction (peer dependency)
- `wagmi` — React hooks (optional peer dependency)

## Tech Stack Rules

- Use `viem`, NOT `ethers.js` or `web3.js`
- ESM modules, NOT CommonJS
- TypeScript strict mode
- React hooks are optional — core SDK works without React

## ASP Service Interfaces (src/asp/)

Standard interfaces for building ASP services:
- `IEventSource` — "Where do addresses come from?" (RPC, Subsquid, webhook, custom)
- `IMembershipGate` — "Who gets whitelisted?" (AllowAll, Sanctions, KYC, custom)
- API Schema — Standard response types for `/root`, `/proof/:addr`, `/members`, `/status`

These are type-only exports. Implementations live in sub-packages (e.g., `upc-asp-whitelist`).

## Consumers

- `upp-sdk` — imports core proof generation and provider interface
- `zkdemo-app` — imports React hooks for ASP status display
- `upc-asp-whitelist` — implements IEventSource + IMembershipGate for auto-whitelisting

## Relationship to UPP SDK

UPC handles: identity, Merkle trees, membership proofs, ASP registration, root publishing, pluggable verification, ASP service interfaces.

UPP handles (pool-specific): origin tracking, ragequit, sourceTag, note commitments, swap orders, transfer/withdraw circuits.

The UPP SDK imports UPC for ASP operations and wraps them with pool-specific logic.
