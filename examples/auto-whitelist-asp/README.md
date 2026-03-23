# Auto-Whitelist ASP Example

This example shows how to run the `@permissionless-technologies/upc-asp-whitelist` package.

The actual implementation lives in [`packages/upc-asp-whitelist/`](../../packages/upc-asp-whitelist/). This example is a minimal `index.ts` that configures and starts the service.

## Usage

```bash
npm install @permissionless-technologies/upc-asp-whitelist

# Create index.ts:
```

```typescript
import { startASPService } from '@permissionless-technologies/upc-asp-whitelist'

await startASPService({
  rpcUrl: 'http://localhost:8545',
  registryAddress: '0x...',
  watchAddress: '0x...',
  watchMode: 'pool',
  operatorPrivateKey: '0x...',
  port: 3001,
})
```

See the [package README](../../packages/upc-asp-whitelist/README.md) for full documentation.
