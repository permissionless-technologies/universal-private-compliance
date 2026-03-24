/**
 * Subsquid Event Source
 *
 * Uses Subsquid archive for efficient historical catch-up (no RPC quota hit),
 * then switches to RPC for live blocks.
 * Best for Sepolia, mainnet, or any chain with long history.
 *
 * Implements IEventSource from @permissionless-technologies/upc-sdk/asp
 */

import { type AbiEvent, getAddress, toEventSelector } from 'viem'
import type { IEventSource, EventSourceStatus } from '@permissionless-technologies/upc-sdk/asp'

export interface SubsquidEventSourceConfig {
  /** Subsquid archive URL */
  archive: string
  /** RPC endpoint (for live blocks after catch-up) */
  rpcUrl: string
  /** Contract address to watch (undefined = all) */
  watchAddress?: `0x${string}`
  /** ABI event to watch */
  event: AbiEvent
  /** Which topic index contains the address (1-indexed after topic0) */
  addressTopicIndex: number
  /** Optional topic filter */
  filterTopic?: { index: number; value: string }
  /** Block to start from */
  deployBlock?: bigint
  /** Finality confirmations (default: 10) */
  finalityConfirmation?: number
}

export class SubsquidEventSource implements IEventSource {
  private isCatchingUp = true
  private lastBlock?: bigint
  private processor: any = null

  constructor(private config: SubsquidEventSourceConfig) {}

  async start(onAddress: (address: `0x${string}`) => Promise<void>): Promise<void> {
    const {
      archive, rpcUrl, watchAddress, event, addressTopicIndex,
      deployBlock = 0n, finalityConfirmation = 10,
    } = this.config

    const topicHash = toEventSelector(event)

    // Dynamic import — subsquid is an optional dependency
    const { EvmBatchProcessor } = await import('@subsquid/evm-processor')

    const processor = new EvmBatchProcessor()
      .setGateway(archive)
      .setRpcEndpoint(rpcUrl)
      .setFinalityConfirmation(finalityConfirmation)
      .setBlockRange({ from: Number(deployBlock) })

    this.processor = processor

    // Build log filter
    const logFilter: Record<string, any> = { topic0: [topicHash] }
    if (watchAddress) logFilter.address = [watchAddress.toLowerCase()]
    if (this.config.filterTopic) {
      logFilter[`topic${this.config.filterTopic.index}`] = [this.config.filterTopic.value]
    }

    processor.addLog(logFilter)
    processor.setFields({ log: { topics: true, data: true } })

    console.log(`[Subsquid] Starting processor...`)

    const inMemoryStore = {
      async connect() {
        return { hash: '0x', height: Number(deployBlock) || 0 }
      },
      async transact(_info: any, cb: (store: any) => Promise<void>) {
        await cb({})
      },
    }

    processor.run(inMemoryStore as any, async (ctx: any) => {
      for (const block of ctx.blocks) {
        for (const log of block.logs) {
          const addr = this.extractAddress(log.topics ?? [], addressTopicIndex)
          if (addr) await onAddress(addr)
        }
        this.lastBlock = BigInt(block.header.height)
      }

      if (ctx.isHead && this.isCatchingUp) {
        this.isCatchingUp = false
        console.log(`[Subsquid] Historical catch-up complete`)
      }
    })
  }

  stop(): void {
    // Subsquid processor doesn't have a clean stop method
    // In practice, the process exits
  }

  getStatus(): EventSourceStatus {
    return {
      isCatchingUp: this.isCatchingUp,
      lastBlock: this.lastBlock,
      sourceName: 'Subsquid',
    }
  }

  private extractAddress(topics: string[], index: number): `0x${string}` | null {
    const topic = topics[index]
    if (!topic || topic.length < 42) return null
    try {
      return getAddress('0x' + topic.slice(26)) as `0x${string}`
    } catch {
      return null
    }
  }
}
