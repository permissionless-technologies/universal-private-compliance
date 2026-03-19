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
│   ├── core/            # Core SDK: tree, proof, identity, client, types
│   ├── providers/       # IASPProvider + built-in implementations
│   ├── operator/        # ASP operator tools (tree management, root publishing)
│   ├── contracts/       # Solidity contracts + ABIs
│   │   ├── interfaces/  # IAttestationVerifier, IASPRegistry
│   │   └── src/         # AttestationHub, ASPRegistryHub, verifier adapters
│   ├── circuits/        # Circom membership proof templates
│   ├── react/           # Optional React hooks
│   └── index.ts         # Public exports
├── examples/            # Example integrations
├── docs/                # Markdown documentation
└── test/                # Vitest tests
```

## Build Commands

```bash
npm install     # Install dependencies
npm run build   # Build for production (ESM + CJS)
npm run dev     # Watch mode
npm test        # Run tests
npm run lint    # Lint code
```

## Key Dependencies

- `circomlibjs` — Poseidon hash (lazy-loaded)
- `viem` — Ethereum interaction (peer dependency)
- `wagmi` — React hooks (optional peer dependency)

## Tech Stack Rules

- Use `viem`, NOT `ethers.js` or `web3.js`
- ESM modules, NOT CommonJS
- TypeScript strict mode
- React hooks are optional — core SDK works without React

## Consumers

- `upp-sdk` — imports core proof generation and provider interface
- `zkdemo-app` — imports React hooks and LocalStorageProvider for demo UI

## Relationship to UPP SDK

UPC handles: identity, Merkle trees, membership proofs, ASP registration, root publishing, pluggable verification.

UPP handles (pool-specific): origin tracking, ragequit, sourceTag, note commitments, swap orders, transfer/withdraw circuits.

The UPP SDK imports UPC for ASP operations and wraps them with pool-specific logic.
