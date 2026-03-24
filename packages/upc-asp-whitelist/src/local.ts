/**
 * Local Entry Point (Anvil / any RPC)
 *
 * Thin wrapper around startASPService() that reads config from env.
 * Parses the event signature from EVENT_SIGNATURE env var.
 *
 * Usage:
 *   cp env.example .env && npm run dev:local
 */

import { parseAbiItem } from 'viem'
import { startASPService } from './index.js'

const eventSignature = process.env.EVENT_SIGNATURE
  ?? 'event Shielded(address indexed token, address indexed depositor, bytes32 indexed commitment, uint256 leafIndex, bytes encryptedNote)'

const event = parseAbiItem(eventSignature)
if (event.type !== 'event') {
  console.error('EVENT_SIGNATURE must be an event definition')
  process.exit(1)
}

startASPService({
  rpcUrl: process.env.RPC_URL ?? 'http://localhost:8545',
  registryAddress: process.env.ASP_REGISTRY_ADDRESS as `0x${string}`,
  watchAddress: process.env.WATCH_ADDRESS as `0x${string}` | undefined,
  event,
  addressTopicIndex: parseInt(process.env.ADDRESS_TOPIC_INDEX ?? '2'),
  operatorPrivateKey: (process.env.OPERATOR_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`,
  aspId: process.env.ASP_ID ? BigInt(process.env.ASP_ID) : undefined,
  port: parseInt(process.env.PORT ?? '3001'),
  deployBlock: process.env.DEPLOY_BLOCK ? BigInt(process.env.DEPLOY_BLOCK) : 0n,
}).catch(console.error)
