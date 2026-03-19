/**
 * Local Entry Point (Anvil / any RPC)
 *
 * Uses viem getLogs for historical catch-up and watchContractEvent for live updates.
 * Best for local development with Anvil or small chains.
 *
 * Usage:
 *   cp env.example .env
 *   # Edit .env with your Anvil addresses
 *   npm run dev:local
 */

import { type Address, parseAbiItem } from 'viem'
import { ASPManager } from './asp-manager.js'
import { createServer } from './server.js'

const RPC_URL = process.env.RPC_URL ?? 'http://localhost:8545'
const REGISTRY_ADDRESS = process.env.ASP_REGISTRY_ADDRESS as Address
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address
const OPERATOR_KEY = (process.env.OPERATOR_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`
const ASP_ID = process.env.ASP_ID ? BigInt(process.env.ASP_ID) : undefined
const PORT = parseInt(process.env.PORT ?? '3001')

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

// Batch size for historical log fetching
const BATCH_SIZE = 10_000n

async function main() {
  if (!REGISTRY_ADDRESS || !TOKEN_ADDRESS) {
    console.error('Set ASP_REGISTRY_ADDRESS and TOKEN_ADDRESS in .env')
    process.exit(1)
  }

  const manager = new ASPManager({
    rpcUrl: RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
    operatorPrivateKey: OPERATOR_KEY,
    aspId: ASP_ID,
  })

  // Register ASP (or use existing)
  await manager.initialize()

  // Start API server
  createServer(manager, PORT)

  // Step 1: Historical catch-up
  console.log(`\nCatching up on historical mint events for ${TOKEN_ADDRESS}...`)
  const latestBlock = await manager.publicClient.getBlockNumber()

  let fromBlock = 0n
  let totalMints = 0

  while (fromBlock <= latestBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > latestBlock
      ? latestBlock
      : fromBlock + BATCH_SIZE - 1n

    const logs = await manager.publicClient.getLogs({
      address: TOKEN_ADDRESS,
      event: TRANSFER_EVENT,
      args: { from: '0x0000000000000000000000000000000000000000' as Address },
      fromBlock,
      toBlock,
    })

    if (logs.length > 0) {
      const addresses = logs
        .map(log => log.args.to)
        .filter((addr): addr is Address => !!addr)

      const added = await manager.addAddresses(addresses)
      totalMints += added
    }

    fromBlock = toBlock + 1n
  }

  console.log(`Historical catch-up complete: ${totalMints} unique minters found`)
  manager.setCatchingUp(false)

  // Publish initial root
  await manager.publishRootIfChanged()

  // Step 2: Watch for live mint events
  console.log(`\nWatching for live mint events on ${TOKEN_ADDRESS}...`)

  manager.publicClient.watchContractEvent({
    address: TOKEN_ADDRESS,
    abi: [TRANSFER_EVENT],
    eventName: 'Transfer',
    args: { from: '0x0000000000000000000000000000000000000000' as Address },
    onLogs: async (logs) => {
      for (const log of logs) {
        const to = (log as any).args?.to as Address | undefined
        if (!to) continue

        const isNew = await manager.addAddress(to)
        if (isNew) {
          console.log(`New minter: ${to}`)
          await manager.publishRootIfChanged()
        }
      }
    },
  })

  console.log('Auto-whitelist ASP is running. Press Ctrl+C to stop.')
}

main().catch(console.error)
