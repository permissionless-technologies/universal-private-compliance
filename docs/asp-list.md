# ASP Lists

## Overview

An ASP list is a curated registry of Association Set Providers for a specific chain — similar to [Uniswap's token lists](https://tokenlists.org/). Platform operators maintain their own lists to control which compliance providers their users can choose from.

UPC provides the **types, loader, and proof fetcher**. The lists themselves are maintained by whoever operates the ASPs.

## Format

```json
{
  "name": "My Platform ASP List",
  "chainId": 11155111,
  "version": "1.0.0",
  "updatedAt": "2026-03-20",
  "asps": [
    {
      "aspId": 1,
      "chainId": 11155111,
      "name": "Auto-Whitelist (Demo)",
      "type": "auto-whitelist",
      "description": "Automatically whitelists pool participants",
      "operator": "0x...",
      "registryAddress": "0xfd11c56a23314aa88dfbcc36254f33e5e8b010df",
      "proofEndpoint": "https://asp.example.com/proof",
      "registrationUrl": null,
      "securityLevel": "demo",
      "active": true
    }
  ]
}
```

## Per-Chain Structure

ASP lists are organized per chain:

```
deployments/
├── 11155111/          # Sepolia
│   ├── contracts.json # Deployed contract addresses
│   └── asp-list.json  # ASPs on Sepolia
├── 31337/             # Anvil (local dev)
│   ├── contracts.json
│   └── asp-list.json
└── 1/                 # Mainnet (future)
    ├── contracts.json
    └── asp-list.json
```

## ASP Entry Properties

| Property | Type | Description |
|----------|------|-------------|
| `aspId` | number | On-chain identifier from `ASPRegistryHub.registerASP()` |
| `chainId` | number | Chain this ASP operates on |
| `name` | string | Human-readable name |
| `type` | string | `auto-whitelist`, `kyc`, `sanctions`, `accredited-investor`, `custom` |
| `description` | string | What this ASP verifies |
| `operator` | address | Who manages the Merkle tree |
| `registryAddress` | address | ASPRegistryHub contract |
| `proofEndpoint` | string | URL to fetch membership proofs |
| `registrationUrl` | string? | URL for user registration (null for auto-whitelist) |
| `securityLevel` | string | `demo`, `production`, `institutional` |
| `active` | boolean | Whether this ASP is currently accepting proofs |

## Usage

### Loading an ASP list

```typescript
import { parseASPList, getActiveASPs, type ASPList } from '@permissionless-technologies/upc-sdk'

// Load from a JSON file, API, or bundled in your app
const raw = await fetch('/asp-list.json').then(r => r.json())
const list: ASPList = parseASPList(raw)

// Get only active ASPs
const activeASPs = getActiveASPs(list)
```

### Fetching a membership proof

```typescript
import { fetchASPProof, findASPById } from '@permissionless-technologies/upc-sdk'

const asp = findASPById(list, 1) // aspId = 1
if (!asp) throw new Error('ASP not found')

const proof = await fetchASPProof(asp, '0x1234...')
// → { root: bigint, pathElements: bigint[], pathIndices: number[] }
```

### Expected proof endpoint API

ASP services should expose these endpoints:

```
GET {proofEndpoint}/{address}  → { root, pathElements, pathIndices }
GET {baseUrl}/root             → { root }
GET {baseUrl}/members          → { members: string[] }
GET {baseUrl}/status           → { memberCount, isCatchingUp, aspId, lastPublishedRoot }
```

## For Platform Operators

1. Choose which ASPs your platform supports
2. Maintain an `asp-list.json` for each chain you deploy on
3. Serve the list to your frontend (bundled, API, or CDN)
4. The frontend uses `getActiveASPs()` to populate the ASP dropdown
5. When a user selects an ASP, use `fetchASPProof()` to get their membership proof

## For ASP Operators

See [Running an ASP](running-an-asp.md) for how to deploy and operate an ASP service.
