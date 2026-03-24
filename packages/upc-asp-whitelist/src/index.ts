/**
 * @permissionless-technologies/upc-asp-whitelist
 *
 * Generic auto-whitelist ASP service — watches any on-chain event and
 * automatically whitelists addresses extracted from a specified topic index,
 * after sanctions screening.
 *
 * The package is pool-agnostic. The deployment project provides:
 *   - Which event to watch (as an AbiEvent object)
 *   - Which topic contains the address to whitelist
 *   - Which contract address to watch
 *
 * Two indexer modes:
 *   - 'rpc' (default): viem getLogs + watchEvent. Best for local/Anvil.
 *   - 'subsquid': Subsquid archive for history. Best for Sepolia/mainnet.
 */

import {
  type AbiEvent,
  type Address,
  getAddress,
  toEventSelector,
} from 'viem'
import { ASPManager, type ASPManagerConfig } from './asp-manager.js'
import { createServer } from './server.js'

export type { ASPManagerConfig } from './asp-manager.js'
export { ASPManager } from './asp-manager.js'
export { createServer } from './server.js'
export { passesSanctionsCheck, getBlocklistSize } from './sanctions.js'

const BATCH_SIZE = 10_000n

export interface ASPServiceConfig {
  /** RPC endpoint URL */
  rpcUrl: string
  /** ASP Registry Hub contract address */
  registryAddress: `0x${string}`
  /** Contract address to watch (undefined = all contracts emitting this event) */
  watchAddress?: `0x${string}`

  /**
   * ABI event definition to watch.
   * Topic hash is derived at runtime via toEventSelector().
   *
   * Pass directly from a Foundry-generated ABI:
   *   import { POOL_ABI } from '@permissionless-technologies/upp-sdk'
   *   event: POOL_ABI.find(e => e.type === 'event' && e.name === 'Shielded')!
   *
   * Or parse from a string (for local dev):
   *   import { parseAbiItem } from 'viem'
   *   event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
   */
  event: AbiEvent

  /**
   * Which topic index contains the address to whitelist.
   * 1-indexed (topic[0] is the event signature hash).
   *
   * Examples:
   *   Shielded(address indexed token, address indexed depositor, ...) → addressTopicIndex: 2
   *   Transfer(address indexed from, address indexed to, uint256 value) → addressTopicIndex: 2
   */
  addressTopicIndex: number

  /**
   * Optional: filter on an additional topic to narrow events.
   * E.g., for Transfer mints only: { index: 1, value: '0x000...000' } (from = zero)
   */
  filterTopic?: { index: number; value: string }

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
  /**
   * Indexer mode:
   *   rpc — viem getLogs for history (best for local/Anvil)
   *   subsquid — Subsquid archive for history (best for Sepolia/mainnet)
   * Default: 'rpc'
   */
  indexer?: 'rpc' | 'subsquid'
  /** Subsquid archive URL (required when indexer='subsquid') */
  subsquidArchive?: string
}

/**
 * Start an auto-whitelist ASP service.
 *
 * @returns The ASPManager instance (for programmatic access)
 */
export async function startASPService(config: ASPServiceConfig): Promise<ASPManager> {
  const {
    rpcUrl,
    registryAddress,
    operatorPrivateKey,
    aspId,
    aspName,
    port = 3001,
    chainId,
    indexer = 'rpc',
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

  // Compute topic hash from event ABI
  const topicHash = toEventSelector(config.event)
  console.log(`\nEvent: ${config.event.name} → topic0: ${topicHash}`)
  console.log(`Watching: ${config.watchAddress ?? 'all contracts'}, extracting address from topic[${config.addressTopicIndex}]`)

  if (indexer === 'subsquid') {
    await startSubsquidIndexer(manager, config, topicHash)
  } else {
    await startRpcIndexer(manager, config, topicHash)
  }

  return manager
}

// ============================================================================
// Extract address from log topic
// ============================================================================

function extractAddress(topics: string[], addressTopicIndex: number): Address | null {
  const topic = topics[addressTopicIndex]
  if (!topic || topic.length < 42) return null
  try {
    return getAddress('0x' + topic.slice(26)) as Address
  } catch {
    return null
  }
}

// ============================================================================
// RPC Indexer (viem getLogs + watchEvent)
// ============================================================================

async function startRpcIndexer(manager: ASPManager, config: ASPServiceConfig, _topicHash: string) {
  const { watchAddress, event, addressTopicIndex, deployBlock = 0n } = config

  console.log(`\n[RPC] Catching up on historical events...`)
  const latestBlock = await manager.publicClient.getBlockNumber()

  let fromBlock = deployBlock
  let total = 0

  while (fromBlock <= latestBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > latestBlock
      ? latestBlock
      : fromBlock + BATCH_SIZE - 1n

    const logs = await manager.publicClient.getLogs({
      address: watchAddress as Address | undefined,
      event: event as any,
      fromBlock,
      toBlock,
    })

    const addresses: Address[] = []
    for (const log of logs) {
      // Apply filter topic if configured
      if (config.filterTopic) {
        const filterValue = (log as any).topics?.[config.filterTopic.index]
        if (filterValue !== config.filterTopic.value) continue
      }

      const addr = extractAddress((log as any).topics ?? [], addressTopicIndex)
      if (addr) addresses.push(addr)
    }

    if (addresses.length > 0) {
      total += await manager.addAddresses(addresses)
    }

    fromBlock = toBlock + 1n
  }

  console.log(`[RPC] Historical catch-up complete: ${total} unique addresses whitelisted`)
  manager.setCatchingUp(false)
  await manager.publishRootIfChanged()

  // Live watcher
  console.log(`[RPC] Watching for live events...`)
  manager.publicClient.watchContractEvent({
    address: watchAddress as Address | undefined,
    abi: [event] as any,
    eventName: event.name,
    onLogs: async (logs) => {
      for (const log of logs) {
        if (config.filterTopic) {
          const filterValue = (log as any).topics?.[config.filterTopic.index]
          if (filterValue !== config.filterTopic.value) continue
        }

        const addr = extractAddress((log as any).topics ?? [], addressTopicIndex)
        if (!addr) continue

        const isNew = await manager.addAddress(addr)
        if (isNew) {
          console.log(`[Live] New address: ${addr}`)
          await manager.publishRootIfChanged()
        }
      }
    },
  })

  console.log('Auto-whitelist ASP is running. Press Ctrl+C to stop.')
}

// ============================================================================
// Subsquid Indexer
// ============================================================================

async function startSubsquidIndexer(manager: ASPManager, config: ASPServiceConfig, topicHash: string) {
  const { watchAddress, addressTopicIndex, rpcUrl, subsquidArchive, deployBlock = 0n } = config

  if (!subsquidArchive) {
    throw new Error('subsquidArchive URL required when indexer="subsquid"')
  }

  const { EvmBatchProcessor } = await import('@subsquid/evm-processor')

  const processor = new EvmBatchProcessor()
    .setGateway(subsquidArchive)
    .setRpcEndpoint(rpcUrl)
    .setFinalityConfirmation(10)
    .setBlockRange({ from: Number(deployBlock) })

  // Build log filter
  const logFilter: Record<string, any> = { topic0: [topicHash] }
  if (watchAddress) logFilter.address = [watchAddress.toLowerCase()]
  if (config.filterTopic) {
    logFilter[`topic${config.filterTopic.index}`] = [config.filterTopic.value]
  }

  processor.addLog(logFilter)
  processor.setFields({ log: { topics: true, data: true } })

  console.log(`\n[Subsquid] Starting processor...`)

  const inMemoryStore = {
    async connect() {
      return { hash: '0x', height: Number(deployBlock) || 0 }
    },
    async transact(_info: any, cb: (store: any) => Promise<void>) {
      await cb({})
    },
  }

  processor.run(inMemoryStore as any, async (ctx: any) => {
    const addresses: Address[] = []

    for (const block of ctx.blocks) {
      for (const log of block.logs) {
        const addr = extractAddress(log.topics ?? [], addressTopicIndex)
        if (addr) addresses.push(addr)
      }
    }

    if (addresses.length > 0) {
      const added = await manager.addAddresses(addresses)
      if (added > 0) {
        const lastBlock = ctx.blocks[ctx.blocks.length - 1]?.header?.height ?? '?'
        console.log(`[Subsquid] Block ${lastBlock}: +${added} new (${manager.getWhitelistedAddresses().length} total)`)
      }
    }

    if (ctx.isHead) {
      if (manager.getStatus().isCatchingUp) {
        manager.setCatchingUp(false)
        console.log(`\n[Subsquid] Historical catch-up complete: ${manager.getWhitelistedAddresses().length} unique addresses`)
      }
      await manager.publishRootIfChanged()
    }
  })
}
