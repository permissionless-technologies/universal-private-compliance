/**
 * IEventSource — "Where do addresses come from?"
 *
 * An event source watches on-chain events (or any other source)
 * and produces candidate addresses for whitelisting.
 *
 * Built-in implementations:
 *   - RpcEventSource (viem getLogs + watchEvent)
 *   - SubsquidEventSource (Subsquid archive + RPC)
 *
 * Custom implementations could include:
 *   - WebhookEventSource (receives POST webhooks)
 *   - GraphQLEventSource (GraphQL subscriptions)
 *   - ManualEventSource (admin adds addresses via API)
 */

/**
 * Sync status of an event source.
 */
export interface EventSourceStatus {
  /** Whether still catching up on historical events */
  isCatchingUp: boolean
  /** Last processed block number (if applicable) */
  lastBlock?: bigint
  /** Human-readable source type name */
  sourceName: string
}

/**
 * Interface for event sources that produce candidate addresses.
 *
 * Implementations handle both historical catch-up and live watching.
 * The ASP service calls start() once and receives addresses via the callback.
 */
export interface IEventSource {
  /**
   * Start watching for events.
   * Calls onAddress() for each discovered candidate address.
   * Must handle historical catch-up before switching to live mode.
   *
   * @param onAddress - Callback invoked with each discovered address.
   *                    The callback returns a Promise so the source can
   *                    apply backpressure if the consumer is slow.
   */
  start(onAddress: (address: `0x${string}`) => Promise<void>): Promise<void>

  /**
   * Stop watching for events.
   * Should clean up any resources (subscriptions, connections).
   */
  stop(): void

  /**
   * Get the current sync status.
   */
  getStatus(): EventSourceStatus
}
