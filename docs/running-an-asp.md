# Running an ASP Service

## Overview

An ASP (Association Set Provider) is a service that maintains a Merkle tree of approved identities and exposes a proof API. This guide shows how to deploy and operate one using the `auto-whitelist-asp` example.

The example is a **standalone deployable service** — it's not part of the UPC SDK. It's a consumer of the SDK, demonstrating how an ASP operator would build their service.

## Architecture

```
On-chain events (pool shield / token mint)
         │
         ▼
┌─────────────────────────┐
│   ASP Service            │
│                          │
│  1. Index events         │  ← viem getLogs or Subsquid
│  2. Sanctions check      │  ← dummy blocklist or real API
│  3. Add to Merkle tree   │  ← UPC MemoryProvider
│  4. Publish root         │  ← ASPRegistryHub.updateRoot()
│  5. Serve proof API      │  ← Express (GET /proof/:addr)
└─────────────────────────┘
```

## Quick Start

```bash
cd examples/auto-whitelist-asp
npm install
cp env.example .env
# Edit .env with your contract addresses

# Local (Anvil)
npm run dev:local

# Sepolia (Subsquid)
npm run dev:sepolia
```

## Configuration

### Event Source

The service can watch two types of events:

| `WATCH_MODE` | Event | What gets whitelisted |
|---|---|---|
| `pool` (default) | `Shielded(token, depositor, ...)` | Anyone who deposits into the UPP pool |
| `mint` | `Transfer(from=0x0, to, amount)` | Anyone who mints an ERC20 token |

Set `WATCH_ADDRESS` to the pool address (for `pool` mode) or the token address (for `mint` mode).

### Sanctions Screening

Set `SANCTIONS_BLOCKLIST` in `.env` to a comma-separated list of addresses to block:

```
SANCTIONS_BLOCKLIST=0x1234...,0x5678...
```

On Sepolia/testnet, leave it empty — everyone passes. In production, replace the `sanctions.ts` module with a real API call to Chainalysis, TRM Labs, or your compliance provider.

### ASP Registration

On first startup, the service registers itself with `ASPRegistryHub.registerASP()` and stores the returned `ASP_ID`. Set `ASP_ID` in `.env` to skip re-registration on restart.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /root` | Current Merkle root |
| `GET /proof/:address` | Membership proof for an address |
| `GET /members` | All whitelisted addresses |
| `GET /status` | Sync status, member count, blocklist stats |

### Proof Response Format

```json
{
  "root": "123456789...",
  "pathElements": ["111...", "222...", "333..."],
  "pathIndices": [0, 1, 0, ...]
}
```

This proof is passed to the ZK circuit's `MembershipProof` template to prove the address is in the ASP's whitelist without revealing which address it is.

## Two Entry Points

### Local (viem) — `npm run dev:local`

Uses `viem.getLogs()` for historical catch-up and `watchContractEvent()` for live events. Simple, no external dependencies, works with any RPC. Best for:
- Local Anvil development
- Small chains with short history
- Testing

### Sepolia (Subsquid) — `npm run dev:sepolia`

Uses Subsquid's `EvmBatchProcessor` for historical catch-up. Syncs from Subsquid's archive (not the RPC), avoiding API quota issues. Best for:
- Long-running Sepolia deployments
- Chains with months of history
- Production (swap Subsquid archive URL per chain)

## Persistence

The current implementation uses `MemoryProvider` — the tree is rebuilt from chain events on every restart. For production:
- Use a persistent provider (database-backed)
- Or accept the rebuild time (fast with Subsquid for history)

## Adding to an ASP List

After deploying your ASP service, add it to your platform's `asp-list.json`:

```json
{
  "aspId": 1,
  "chainId": 11155111,
  "name": "Auto-Whitelist ASP",
  "type": "auto-whitelist",
  "description": "Whitelists all pool depositors after sanctions screening",
  "operator": "0x...",
  "registryAddress": "0xfd11c56a23314aa88dfbcc36254f33e5e8b010df",
  "proofEndpoint": "https://your-asp-service.example.com/proof",
  "registrationUrl": null,
  "securityLevel": "demo",
  "active": true
}
```

See [ASP Lists](asp-list.md) for the full format specification.
