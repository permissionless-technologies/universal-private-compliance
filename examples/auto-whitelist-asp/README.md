# Auto-Whitelist ASP Example

An ASP (Association Set Provider) that automatically whitelists any address that mints an ERC20 token. Listens for `Transfer(from=0x0, to=recipient)` events and adds the recipient to the ASP's Merkle tree.

## Use Case

This is the simplest possible ASP: **"if you minted tokens, you're whitelisted."** Useful for:
- Demo environments where all pool users should be auto-approved
- Development testing with local Anvil chains
- Bootstrapping a compliance whitelist from existing token holder data

## Architecture

```
ERC20.mint(to) → Transfer(0x0, to, amount) event
                          │
                          ▼
             ┌─────────────────────┐
             │  Auto-Whitelist ASP  │
             │                      │
             │  1. Catch event       │
             │  2. addMember(to)     │
             │  3. publishRoot()     │
             │                      │
             │  API:                │
             │  GET /root           │
             │  GET /proof/:addr    │
             │  GET /members        │
             │  GET /status         │
             └─────────────────────┘
```

## Two Entry Points

| Entry Point | Command | Best For |
|-------------|---------|----------|
| **Local** (viem) | `npm run dev:local` | Anvil, local dev, small chains |
| **Sepolia** (Subsquid) | `npm run dev:sepolia` | Sepolia testnet, long-running, large history |

**Local** uses `viem.getLogs()` for historical catch-up and `watchContractEvent()` for live events. Simple but hits RPC for every historical block batch.

**Sepolia** uses Subsquid's `EvmBatchProcessor` which syncs from Subsquid's archive (no RPC needed for history), then switches to RPC for real-time events. Much faster and cheaper for chains with months of history.

Both share the same ASP logic (MemoryProvider, Express API, root publishing).

## Setup

```bash
# Install
npm install

# Copy env
cp env.example .env

# Edit .env with your contract addresses:
#   ASP_REGISTRY_ADDRESS — the ASPRegistryHub contract
#   TOKEN_ADDRESS — the ERC20 token to watch for mints
#   OPERATOR_PRIVATE_KEY — private key for publishing roots
```

## Run

```bash
# Local development (Anvil)
npm run dev:local

# Sepolia testnet
npm run dev:sepolia
```

## API

Once running, the ASP exposes a REST API:

```bash
# Get current Merkle root
curl http://localhost:3001/root
# → {"root":"12345678..."}

# Get membership proof for an address
curl http://localhost:3001/proof/0x1234...
# → {"root":"...","pathElements":["..."],"pathIndices":[0,1,...]}

# List all whitelisted addresses
curl http://localhost:3001/members
# → {"members":["0x1234...","0x5678..."]}

# Check sync status
curl http://localhost:3001/status
# → {"memberCount":42,"isCatchingUp":false,"aspId":"1","lastPublishedRoot":"..."}
```

## How It Works

1. On start, the ASP registers itself on-chain (or uses an existing ASP ID)
2. Fetches all historical `Transfer(from=0x0)` events for the token
3. Adds each mint recipient to an in-memory Merkle tree (MemoryProvider)
4. Publishes the Merkle root on-chain via `ASPRegistryHub.updateRoot()`
5. Watches for new mint events and updates the tree + root in real-time
6. Exposes an API for users to download their membership proof

Users take the proof from `GET /proof/:addr` and include it in their ZK circuit to prove they're in the ASP's whitelist — without revealing which address they are.
