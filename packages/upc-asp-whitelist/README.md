# @permissionless-technologies/upc-asp-whitelist

Auto-whitelist ASP service for the Universal Private Compliance (UPC) ecosystem.

Watches on-chain events (pool deposits or token mints) and automatically whitelists addresses after sanctions screening. Exposes a proof API for users to fetch their membership proofs.

## Quick Start

```bash
npm install @permissionless-technologies/upc-asp-whitelist
```

```typescript
import { startASPService } from '@permissionless-technologies/upc-asp-whitelist'

await startASPService({
  rpcUrl: 'http://localhost:8545',
  registryAddress: '0x...',       // ASPRegistryHub contract
  watchAddress: '0x...',          // Pool or token address
  watchMode: 'pool',             // 'pool' or 'mint'
  operatorPrivateKey: '0x...',
  port: 3001,
})
```

## Docker Deployment

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY index.ts .
CMD ["npx", "tsx", "index.ts"]
```

```json
{
  "dependencies": {
    "@permissionless-technologies/upc-asp-whitelist": "^0.1.0"
  }
}
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /root` | Current SNARK-side Merkle root (Poseidon over BLS12-381) |
| `GET /proof/:address` | SNARK-side membership proof |
| `GET /stark-root` | Current STARK-side Merkle root (Poseidon31) |
| `GET /stark-proof/:address` | STARK-side membership proof |
| `GET /status` | Service sync status |
| `GET /status/:address` | Per-address whitelist status |
| `GET /health` | Liveness probe |

## Part of the UPC Ecosystem

- `@permissionless-technologies/upc-sdk` — Core compliance SDK
- `@permissionless-technologies/upc-asp-whitelist` — This package
- `@permissionless-technologies/upc-asp-kyc` — KYC ASP (coming soon)
- `@permissionless-technologies/upc-asp-sanctions` — Sanctions ASP (coming soon)
