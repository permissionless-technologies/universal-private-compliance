/**
 * @permissionless-technologies/upc-asp-whitelist
 *
 * Auto-whitelist ASP service — watches on-chain events and automatically
 * whitelists addresses after sanctions screening.
 *
 * Two indexer modes:
 *   - 'rpc' (default): uses viem getLogs for history + watchEvent for live.
 *     Best for local dev / Anvil / short history.
 *   - 'subsquid': uses Subsquid archive for history (no RPC quota hit),
 *     then RPC for live. Best for Sepolia / mainnet / long history.
 */

import { type Address, parseAbiItem, getAddress } from 'viem'
import { ASPManager, type ASPManagerConfig } from './asp-manager.js'
import { createServer } from './server.js'

export type { ASPManagerConfig } from './asp-manager.js'
export { ASPManager } from './asp-manager.js'
export { createServer } from './server.js'
export { passesSanctionsCheck, getBlocklistSize } from './sanctions.js'

const SHIELDED_EVENT = parseAbiItem('event Shielded(address indexed token, address indexed depositor, bytes32 indexed commitment, uint256 leafIndex, bytes encryptedNote)')
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

// Pre-computed event topic hashes for Subsquid
const TRANSFER_TOPIC_HASH = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
// keccak256("Shielded(address,address,bytes32,uint256,bytes)")
const SHIELDED_TOPIC_HASH = '0x182f8e2402f7dc817cf49fd6c7d3e02dab246a031754c5e3e9db83a28a4b1a01'
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000'

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
  /**
   * Indexer mode:
   *   rpc — use viem getLogs for historical catch-up (hits RPC, best for local/Anvil)
   *   subsquid — use Subsquid archive for history (no RPC quota hit, best for Sepolia/mainnet)
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
    watchAddress,
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

  if (indexer === 'subsquid') {
    await startSubsquidIndexer(manager, config)
  } else {
    await startRpcIndexer(manager, config)
  }

  return manager
}

// ============================================================================
// RPC Indexer (viem getLogs + watchEvent)
// ============================================================================

async function startRpcIndexer(manager: ASPManager, config: ASPServiceConfig) {
  const { watchAddress, watchMode, deployBlock = 0n } = config

  const modeLabel = watchMode === 'pool' ? 'pool shield' : 'token mint'
  console.log(`\n[RPC] Catching up on historical ${modeLabel} events for ${watchAddress}...`)
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

  console.log(`[RPC] Historical catch-up complete: ${total} unique addresses whitelisted`)
  manager.setCatchingUp(false)
  await manager.publishRootIfChanged()

  startLiveWatcher(manager, config)
}

// ============================================================================
// Subsquid Indexer (archive for history, then live via Subsquid's built-in RPC)
// ============================================================================

async function startSubsquidIndexer(manager: ASPManager, config: ASPServiceConfig) {
  const { watchAddress, watchMode, rpcUrl, subsquidArchive, deployBlock = 0n } = config

  if (!subsquidArchive) {
    throw new Error('subsquidArchive URL required when indexer="subsquid"')
  }

  // Dynamic import — subsquid is an optional dependency
  const { EvmBatchProcessor } = await import('@subsquid/evm-processor')

  const modeLabel = watchMode === 'pool' ? 'pool shield' : 'token mint'

  const processor = new EvmBatchProcessor()
    .setGateway(subsquidArchive)
    .setRpcEndpoint(rpcUrl)
    .setFinalityConfirmation(10)
    .setBlockRange({ from: Number(deployBlock) })

  if (watchMode === 'pool') {
    processor.addLog({
      address: [watchAddress.toLowerCase()],
      topic0: [SHIELDED_TOPIC_HASH],
    })
  } else {
    processor.addLog({
      address: [watchAddress.toLowerCase()],
      topic0: [TRANSFER_TOPIC_HASH],
      topic1: [ZERO_TOPIC],
    })
  }

  processor.setFields({ log: { topics: true, data: true } })

  console.log(`\n[Subsquid] Starting processor for ${modeLabel} events on ${watchAddress}...`)

  // No-op database — we don't persist indexed data to a DB,
  // the ASPManager's MemoryProvider is our state.
  // Implements the minimal Subsquid Database<S> interface.
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
          if (watchMode === 'pool') {
            // Shielded event: depositor is topic2 (second indexed param)
            if (log.topics[2]) {
              addresses.push(getAddress('0x' + log.topics[2].slice(26)) as Address)
            }
          } else {
            // Transfer event: 'to' is topic2
            if (log.topics[2]) {
              addresses.push(getAddress('0x' + log.topics[2].slice(26)) as Address)
            }
          }
        }
      }

      if (addresses.length > 0) {
        const added = await manager.addAddresses(addresses)
        if (added > 0) {
          const lastBlock = ctx.blocks[ctx.blocks.length - 1]?.header?.height ?? '?'
          console.log(`[Subsquid] Block ${lastBlock}: +${added} new addresses (${manager.getWhitelistedAddresses().length} total)`)
        }
      }

      if (ctx.isHead) {
        if (manager.getStatus().isCatchingUp) {
          manager.setCatchingUp(false)
          console.log(`\n[Subsquid] Historical catch-up complete: ${manager.getWhitelistedAddresses().length} unique addresses`)
        }
        await manager.publishRootIfChanged()
      }
    }
  )
}

// ============================================================================
// Live Event Watcher (used by RPC mode only; Subsquid handles its own live)
// ============================================================================

function startLiveWatcher(manager: ASPManager, config: ASPServiceConfig) {
  const { watchAddress, watchMode } = config
  const modeLabel = watchMode === 'pool' ? 'pool shield' : 'token mint'
  console.log(`[RPC] Watching for live ${modeLabel} events on ${watchAddress}...`)

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
            console.log(`[Live] New depositor: ${depositor}`)
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
            console.log(`[Live] New minter: ${to}`)
            await manager.publishRootIfChanged()
          }
        }
      },
    })
  }

  console.log('Auto-whitelist ASP is running. Press Ctrl+C to stop.')
}
