/**
 * RPC Event Source
 *
 * Uses viem getLogs for historical catch-up and watchContractEvent for live events.
 * Best for local development (Anvil) or chains with short history.
 *
 * Implements IEventSource from @permissionless-technologies/upc-sdk/asp
 */

import {
  type AbiEvent,
  type Address,
  type PublicClient,
  getAddress,
  toEventSelector,
} from 'viem'
import type { IEventSource, EventSourceStatus } from '@permissionless-technologies/upc-sdk/asp'

const BATCH_SIZE = 10_000n

export interface RpcEventSourceConfig {
  /** viem PublicClient */
  publicClient: PublicClient
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
}

export class RpcEventSource implements IEventSource {
  private stopped = false
  private isCatchingUp = true
  private lastBlock?: bigint
  private unwatch?: () => void

  constructor(private config: RpcEventSourceConfig) {}

  async start(onAddress: (address: `0x${string}`) => Promise<void>): Promise<void> {
    const { publicClient, watchAddress, event, addressTopicIndex, deployBlock = 0n } = this.config

    // Historical catch-up
    console.log(`[RPC] Catching up on historical events...`)
    const latestBlock = await publicClient.getBlockNumber()

    let fromBlock = deployBlock

    while (fromBlock <= latestBlock && !this.stopped) {
      const toBlock = fromBlock + BATCH_SIZE - 1n > latestBlock
        ? latestBlock
        : fromBlock + BATCH_SIZE - 1n

      const logs = await publicClient.getLogs({
        address: watchAddress as Address | undefined,
        event: event as any,
        fromBlock,
        toBlock,
      })

      for (const log of logs) {
        if (this.config.filterTopic) {
          const filterValue = (log as any).topics?.[this.config.filterTopic.index]
          if (filterValue !== this.config.filterTopic.value) continue
        }

        const addr = this.extractAddress((log as any).topics ?? [], addressTopicIndex)
        if (addr) await onAddress(addr)
      }

      this.lastBlock = toBlock
      fromBlock = toBlock + 1n
    }

    console.log(`[RPC] Historical catch-up complete`)
    this.isCatchingUp = false

    if (this.stopped) return

    // Live watcher
    console.log(`[RPC] Watching for live events...`)
    this.unwatch = publicClient.watchContractEvent({
      address: watchAddress as Address | undefined,
      abi: [event] as any,
      eventName: event.name,
      onLogs: async (logs) => {
        for (const log of logs) {
          if (this.config.filterTopic) {
            const filterValue = (log as any).topics?.[this.config.filterTopic.index]
            if (filterValue !== this.config.filterTopic.value) continue
          }

          const addr = this.extractAddress((log as any).topics ?? [], addressTopicIndex)
          if (addr) await onAddress(addr)
        }
      },
    })
  }

  stop(): void {
    this.stopped = true
    this.unwatch?.()
  }

  getStatus(): EventSourceStatus {
    return {
      isCatchingUp: this.isCatchingUp,
      lastBlock: this.lastBlock,
      sourceName: 'RPC (viem)',
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
