/**
 * Local Entry Point (Anvil / any RPC)
 *
 * Thin wrapper around startASPService() that reads config from env.
 *
 * Usage:
 *   cp env.example .env && npm run dev:local
 */

import { startASPService } from './index.js'

startASPService({
  rpcUrl: process.env.RPC_URL ?? 'http://localhost:8545',
  registryAddress: process.env.ASP_REGISTRY_ADDRESS as `0x${string}`,
  watchAddress: process.env.WATCH_ADDRESS as `0x${string}`,
  watchMode: (process.env.WATCH_MODE ?? 'pool') as 'pool' | 'mint',
  operatorPrivateKey: (process.env.OPERATOR_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`,
  aspId: process.env.ASP_ID ? BigInt(process.env.ASP_ID) : undefined,
  port: parseInt(process.env.PORT ?? '3001'),
  deployBlock: process.env.DEPLOY_BLOCK ? BigInt(process.env.DEPLOY_BLOCK) : 0n,
}).catch(console.error)
