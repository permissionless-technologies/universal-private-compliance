/**
 * @permissionless-technologies/upc-asp-whitelist
 *
 * Auto-whitelist ASP service — watches on-chain events and automatically
 * whitelists addresses after sanctions screening.
 *
 * Usage:
 *   import { startASPService } from '@permissionless-technologies/upc-asp-whitelist'
 *
 *   startASPService({
 *     rpcUrl: 'http://localhost:8545',
 *     registryAddress: '0x...',
 *     watchAddress: '0x...',
 *     watchMode: 'pool',
 *     operatorPrivateKey: '0x...',
 *     port: 3001,
 *   })
 */

import { type Address, parseAbiItem } from 'viem'
import { ASPManager, type ASPManagerConfig } from './asp-manager.js'
import { createServer } from './server.js'

export type { ASPManagerConfig } from './asp-manager.js'
export { ASPManager } from './asp-manager.js'
export { createServer } from './server.js'
export { passesSanctionsCheck, getBlocklistSize } from './sanctions.js'

const SHIELDED_EVENT = parseAbiItem('event Shielded(address indexed token, address indexed depositor, bytes32 indexed commitment, uint256 leafIndex, bytes encryptedNote)')
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const BATCH_SIZE = 10_000n

export interface ASPServiceConfig {
  /** RPC endpoint URL */
  rpcUrl: string
  /** ASP Registry Hub contract address */
  registryAddress: `0x${string}`
  /** Address to watch for events (pool or token address) */
  watchAddress: `0x${string}`
  /**
   * Event source mode:
   *   pool — watch Shielded events (depositors get whitelisted)
   *   mint — watch Transfer(from=0x0) events (minters get whitelisted)
   */
  watchMode: 'pool' | 'mint'
  /** Private key for the ASP operator */
  operatorPrivateKey: `0x${string}`
  /** ASP ID (if already registered; omit to auto-register) */
  aspId?: bigint
  /** ASP name (used when auto-registering) */
  aspName?: string
  /** API server port (default: 3001) */
  port?: number
  /** Chain ID (default: auto-detect) */
  chainId?: number
  /** Block to start indexing from (default: 0) */
  deployBlock?: bigint
}

/**
 * Start an auto-whitelist ASP service.
 *
 * This starts an Express API server and begins watching for on-chain events.
 * Historical events are caught up first, then live events are watched.
 *
 * @returns The ASPManager instance (for programmatic access)
 */
export async function startASPService(config: ASPServiceConfig): Promise<ASPManager> {
  const {
    rpcUrl,
    registryAddress,
    watchAddress,
    watchMode,
    operatorPrivateKey,
    aspId,
    aspName,
    port = 3001,
    chainId,
    deployBlock = 0n,
  } = config

  const manager = new ASPManager({
    rpcUrl,
    registryAddress: registryAddress as Address,
    operatorPrivateKey: operatorPrivateKey as `0x${string}`,
    aspId,
    aspName,
    chainId,
  })

  await manager.initialize()
  createServer(manager, port)

  // Historical catch-up
  const modeLabel = watchMode === 'pool' ? 'pool shield' : 'token mint'
  console.log(`\nCatching up on historical ${modeLabel} events for ${watchAddress}...`)
  const latestBlock = await manager.publicClient.getBlockNumber()

  let fromBlock = deployBlock
  let total = 0

  while (fromBlock <= latestBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > latestBlock
      ? latestBlock
      : fromBlock + BATCH_SIZE - 1n

    let addresses: Address[] = []

    if (watchMode === 'pool') {
      const logs = await manager.publicClient.getLogs({
        address: watchAddress as Address,
        event: SHIELDED_EVENT,
        fromBlock,
        toBlock,
      })
      addresses = logs
        .map(log => log.args.depositor)
        .filter((addr): addr is Address => !!addr)
    } else {
      const logs = await manager.publicClient.getLogs({
        address: watchAddress as Address,
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
  console.log(`\nWatching for live ${modeLabel} events on ${watchAddress}...`)

  if (watchMode === 'pool') {
    manager.publicClient.watchContractEvent({
      address: watchAddress as Address,
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
      address: watchAddress as Address,
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
  return manager
}
