/**
 * Local Entry Point (Anvil / any RPC)
 *
 * Uses viem getLogs for historical catch-up and watchContractEvent for live updates.
 * Best for local development with Anvil or small chains.
 *
 * Supports two event sources:
 *   WATCH_MODE=pool   → watches UPP pool Shielded events (depositors)
 *   WATCH_MODE=mint   → watches ERC20 Transfer(from=0x0) events (minters)
 *
 * Usage:
 *   cp env.example .env
 *   npm run dev:local
 */

import { type Address, parseAbiItem } from 'viem'
import { ASPManager } from './asp-manager.js'
import { createServer } from './server.js'

const RPC_URL = process.env.RPC_URL ?? 'http://localhost:8545'
const REGISTRY_ADDRESS = process.env.ASP_REGISTRY_ADDRESS as Address
const WATCH_ADDRESS = process.env.WATCH_ADDRESS as Address // Pool or token address
const WATCH_MODE = (process.env.WATCH_MODE ?? 'pool') as 'pool' | 'mint'
const OPERATOR_KEY = (process.env.OPERATOR_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`
const ASP_ID = process.env.ASP_ID ? BigInt(process.env.ASP_ID) : undefined
const PORT = parseInt(process.env.PORT ?? '3001')
const DEPLOY_BLOCK = process.env.DEPLOY_BLOCK ? BigInt(process.env.DEPLOY_BLOCK) : 0n

const SHIELDED_EVENT = parseAbiItem('event Shielded(address indexed token, address indexed depositor, bytes32 indexed commitment, uint256 leafIndex, bytes encryptedNote)')
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const BATCH_SIZE = 10_000n

async function main() {
  if (!REGISTRY_ADDRESS || !WATCH_ADDRESS) {
    console.error('Set ASP_REGISTRY_ADDRESS and WATCH_ADDRESS in .env')
    console.error('  WATCH_ADDRESS = pool address (WATCH_MODE=pool) or token address (WATCH_MODE=mint)')
    process.exit(1)
  }

  const manager = new ASPManager({
    rpcUrl: RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
    operatorPrivateKey: OPERATOR_KEY,
    aspId: ASP_ID,
  })

  await manager.initialize()
  createServer(manager, PORT)

  // Historical catch-up
  const modeLabel = WATCH_MODE === 'pool' ? 'pool shield' : 'token mint'
  console.log(`\nCatching up on historical ${modeLabel} events for ${WATCH_ADDRESS}...`)
  const latestBlock = await manager.publicClient.getBlockNumber()

  let fromBlock = DEPLOY_BLOCK
  let total = 0

  while (fromBlock <= latestBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > latestBlock
      ? latestBlock
      : fromBlock + BATCH_SIZE - 1n

    let addresses: Address[] = []

    if (WATCH_MODE === 'pool') {
      const logs = await manager.publicClient.getLogs({
        address: WATCH_ADDRESS,
        event: SHIELDED_EVENT,
        fromBlock,
        toBlock,
      })
      addresses = logs
        .map(log => log.args.depositor)
        .filter((addr): addr is Address => !!addr)
    } else {
      const logs = await manager.publicClient.getLogs({
        address: WATCH_ADDRESS,
        event: TRANSFER_EVENT,
        args: { from: '0x0000000000000000000000000000000000000000' as Address },
        fromBlock,
        toBlock,
      })
      addresses = logs
        .map(log => log.args.to)
        .filter((addr): addr is Address => !!addr)
    }

    if (addresses.length > 0) {
      total += await manager.addAddresses(addresses)
    }

    fromBlock = toBlock + 1n
  }

  console.log(`Historical catch-up complete: ${total} unique addresses whitelisted`)
  manager.setCatchingUp(false)
  await manager.publishRootIfChanged()

  // Live event watching
  console.log(`\nWatching for live ${modeLabel} events on ${WATCH_ADDRESS}...`)

  if (WATCH_MODE === 'pool') {
    manager.publicClient.watchContractEvent({
      address: WATCH_ADDRESS,
      abi: [SHIELDED_EVENT],
      eventName: 'Shielded',
      onLogs: async (logs) => {
        for (const log of logs) {
          const depositor = (log as any).args?.depositor as Address | undefined
          if (!depositor) continue
          const isNew = await manager.addAddress(depositor)
          if (isNew) {
            console.log(`New depositor: ${depositor}`)
            await manager.publishRootIfChanged()
          }
        }
      },
    })
  } else {
    manager.publicClient.watchContractEvent({
      address: WATCH_ADDRESS,
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
  }

  console.log('Auto-whitelist ASP is running. Press Ctrl+C to stop.')
}

main().catch(console.error)
