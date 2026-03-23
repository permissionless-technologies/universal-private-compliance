# Universal Private Compliance (UPC)

Pluggable zero-knowledge attestation & ASP (Association Set Provider) framework for Ethereum.

Part of the **Permissionless Technologies** product family:
- **UPD** — Universal Private Dollar
- **UPP** — Universal Private Pool
- **UPC** — Universal Private Compliance (this package)

## What is UPC?

UPC provides a standard interface for **zero-knowledge compliance verification** on Ethereum. It allows:

- **Institutions** to operate ASPs (Association Set Providers) — Merkle trees of approved identities
- **Users** to prove membership in an ASP via ZK proof without revealing their identity
- **Protocols** to require attestations (KYC, age, residency, sanctions clearance) through a pluggable interface
- **Third parties** to build custom attestation backends (Semaphore, WorldID, zkPass, etc.)

## Security

**Default: BLS12-381 (128-bit security).**

UPC defaults to Poseidon hash over the BLS12-381 curve, providing 128-bit security that meets institutional audit requirements. BN254 (~100-bit security) is available as an opt-in alternative.

| Curve | Security | Use Case |
|-------|----------|----------|
| **BLS12-381** (default) | 128-bit | Production, institutional compliance |
| BN254 (opt-in) | ~100-bit | Legacy compatibility, testing |

The hash function is fully pluggable via the `IHashFunction` interface — you can use either curve, or implement your own.

### Proof System: PLONK

UPC uses **PLONK** (not Groth16) to eliminate per-circuit trusted setup ceremonies. Phase 1 uses the [Perpetual Powers of Tau](https://github.com/privacy-ethereum/perpetualpowersoftau) community ceremony (18 BLS12-381 contributors). Phase 2 is fully deterministic — no toxic waste, no ceremony participants to audit. Long-term, STARKs (no setup at all) are supported via the pluggable hash interface.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              AttestationHub (on-chain)             │
│                                                    │
│  verify(verifierId, identity, proof) → bool        │
│                                                    │
├──────────┬──────────────┬──────────────┬──────────┤
│          │              │              │          │
│ MerkleASP│  Semaphore   │   WorldID    │  Custom  │
│ Verifier │  Adapter     │   Adapter    │ Adapter  │
└──────────┴──────────────┴──────────────┴──────────┘

┌──────────────────────────────────────────────────┐
│              Provider Interface (off-chain)        │
│                                                    │
│  IASPProvider { addMember, getRoot, getProof }     │
│                                                    │
├──────────┬──────────────┬──────────────┬──────────┤
│          │              │              │          │
│  Memory  │ LocalStorage │   REST API   │  Custom  │
│ Provider │  Provider    │   Provider   │ Provider │
└──────────┴──────────────┴──────────────┴──────────┘
```

## Quick Start

```bash
npm install @permissionless-technologies/upc-sdk
```

### As an ASP Operator

```typescript
import { createASPClient, MemoryProvider } from '@permissionless-technologies/upc-sdk'

const asp = createASPClient({
  provider: new MemoryProvider({ treeDepth: 20 }),
  publicClient,
  registryAddress: '0x...',
})

// Register your ASP on-chain
const aspId = await asp.register({ name: 'My KYC ASP', walletClient })

// Add approved members
await asp.addMember(identityCommitment)

// Publish the Merkle root on-chain
await asp.publishRoot({ walletClient })
```

### As a User (proving membership)

```typescript
import { createASPClient, LocalStorageProvider } from '@permissionless-technologies/upc-sdk'

const asp = createASPClient({
  provider: new LocalStorageProvider({ chainId: 1, aspId: 1n }),
  publicClient,
  registryAddress: '0x...',
})

// Generate a ZK membership proof
const proof = await asp.generateProof(myIdentity)
// → { root, pathElements, pathIndices }
```

### As a Protocol (verifying compliance)

```solidity
import { IAttestationVerifier } from "@permissionless-technologies/upc/interfaces/IAttestationVerifier.sol";

contract MyProtocol {
    IAttestationVerifier public attestationHub;

    function doSomething(uint256 verifierId, uint256 identity, bytes calldata proof) external {
        require(attestationHub.verify(identity, proof), "Attestation required");
        // ... proceed with business logic
    }
}
```

## Custom Providers

Implement `IASPProvider` to connect any storage backend:

```typescript
import type { IASPProvider } from '@permissionless-technologies/upc-sdk'

class MyDatabaseProvider implements IASPProvider {
  name = 'My Database'
  treeDepth = 20

  async addMember(identity: bigint): Promise<void> { /* ... */ }
  async removeMember(identity: bigint): Promise<void> { /* ... */ }
  async getMembers(): Promise<bigint[]> { /* ... */ }
  async hasMember(identity: bigint): Promise<boolean> { /* ... */ }
  async getRoot(): Promise<bigint> { /* ... */ }
  async getMerkleProof(identity: bigint): Promise<MerkleProof> { /* ... */ }
}
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [ASP Lists](docs/asp-list.md)
- [Custom Providers](docs/providers.md)
- [Smart Contracts](docs/contracts.md)
- [Running an ASP Service](docs/running-an-asp.md)
- [Protocol Integration](docs/integration.md)

## License

See [LICENSE](LICENSE) file.
