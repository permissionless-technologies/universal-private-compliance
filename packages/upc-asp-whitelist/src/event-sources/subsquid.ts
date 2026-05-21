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
  /**
   * Subsquid API key. Required as of mid-2026 — Subsquid gated the v2 archive
   * endpoints (`v2.archive.subsquid.io/network/...`) behind authenticated
   * requests; missing keys produce 401s and silent indexing stalls.
   *
   * Get one at https://app.subsquid.io and pass it here, or set the
   * `SQD_API_KEY` environment variable to let the Subsquid SDK pick it up
   * automatically (Subsquid's documented default per
   * @subsquid/evm-processor@1.30.x `GatewaySettings.apiKey`).
   *
   * If you leave this unset on a Subsquid-gated network, the processor will
   * log auth failures on every catch-up batch and never make progress.
   * Service operators should read their preferred env var name (e.g.
   * `SQD_KEY`) and pass it through explicitly.
   */
  apiKey?: string
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
      archive, apiKey, rpcUrl, watchAddress, event, addressTopicIndex,
      deployBlock = 0n, finalityConfirmation = 10,
    } = this.config

    // Subsquid gated the v2 archive endpoints behind API keys; running without
    // one against a gated network produces opaque 401s every catch-up batch
    // and the indexer silently stalls. Surface the situation loud and early
    // so operators see the cause in CloudWatch / kubectl logs before they
    // start hunting for "missing blocks" symptoms downstream (root not
    // publishing, members not whitelisting, etc.).
    if (!apiKey && !process.env.SQD_API_KEY) {
      console.warn(
        '[Subsquid] No API key configured (neither `apiKey` config field nor ' +
          '`SQD_API_KEY` env var). Subsquid v2 archive endpoints are gated; ' +
          'requests will return 401 and the processor will retry forever ' +
          'without making progress. Set an API key from https://app.subsquid.io.',
      )
    }

    const topicHash = toEventSelector(event)

    // Dynamic import — subsquid is an optional dependency
    const { EvmBatchProcessor } = await import('@subsquid/evm-processor')

    // `setGateway` accepts `string | GatewaySettings`. With an apiKey we MUST
    // use the object form; the string form has no place to inject auth and
    // the Subsquid SDK silently sends unauthenticated requests in that case.
    // Passing `apiKey: undefined` is safe — Subsquid's `GatewaySettings.apiKey`
    // is optional and the SDK falls back to `SQD_API_KEY` from the env when
    // unset.
    const processor = new EvmBatchProcessor()
      .setGateway({ url: archive, apiKey })
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
