# Getting Started

## Installation

```bash
npm install @permissionless-technologies/upc-sdk
```

### Peer Dependencies

The SDK requires `viem` as a peer dependency for Ethereum interaction:

```bash
npm install viem
```

For React hooks, also install:

```bash
npm install react wagmi
```

## Basic Usage

### 1. Create an ASP Client

```typescript
import { createASPClient, MemoryProvider } from '@permissionless-technologies/upc-sdk'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

const asp = createASPClient({
  provider: new MemoryProvider({ treeDepth: 20 }),
  publicClient,
  registryAddress: '0x...', // ASPRegistryHub address
})
```

### 2. Register an ASP On-Chain

```typescript
const aspId = await asp.register({
  name: 'My Compliance ASP',
  walletClient, // viem WalletClient
})
```

### 3. Add Members

```typescript
// Add a member's identity commitment
await asp.addMember(identityCommitment)

// Publish the updated Merkle root on-chain
await asp.publishRoot({ walletClient })
```

### 4. Generate a Membership Proof

```typescript
const proof = await asp.generateProof(myIdentity)
// proof.root — Merkle root
// proof.pathElements — Merkle path siblings
// proof.pathIndices — Left/right path indicators
```

### 5. Verify On-Chain

The proof's `root` is verified against the ASP registry on-chain. Consumer protocols call `AttestationHub.verify()` or `ASPRegistryHub.isValidASPRoot()`.

## Providers

The SDK uses a **provider pattern** for storage. Choose the provider that fits your use case:

| Provider | Use Case | Storage |
|----------|----------|---------|
| `MemoryProvider` | Tests, scripts | In-memory |
| `LocalStorageProvider` | Browser demos | `localStorage` |
| `RESTProvider` | Production backends | HTTP API |

See [Providers](providers.md) for details on implementing custom providers.

## Next Steps

- [Architecture](architecture.md) — understand the pluggable design
- [Providers](providers.md) — implement your own storage backend
- [Contracts](contracts.md) — smart contract reference
