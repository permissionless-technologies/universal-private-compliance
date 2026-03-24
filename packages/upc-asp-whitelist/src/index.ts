/**
 * @permissionless-technologies/upc-asp-whitelist
 *
 * Generic auto-whitelist ASP service with composable architecture:
 *
 *   - Event Source (IEventSource): where addresses come from
 *   - Membership Gate (IMembershipGate): who gets whitelisted
 *   - API Server: standard endpoints (/root, /proof/:addr, /members, /status)
 */

import type { Address } from 'viem'
import type { IEventSource } from '@permissionless-technologies/upc-sdk/asp'
import type { IMembershipGate } from '@permissionless-technologies/upc-sdk/asp'
import { ASPManager, type ASPManagerConfig } from './asp-manager.js'
import { createServer } from './server.js'

// Re-export for convenience
export type { ASPManagerConfig } from './asp-manager.js'
export { ASPManager } from './asp-manager.js'
export { createServer } from './server.js'

// Event sources
export { RpcEventSource, type RpcEventSourceConfig } from './event-sources/rpc.js'
export { SubsquidEventSource, type SubsquidEventSourceConfig } from './event-sources/subsquid.js'

// Gates
export { AllowAllGate } from './gates/allow-all.js'
export { SanctionsGate, type SanctionsGateConfig } from './gates/sanctions.js'

/**
 * Composable ASP service configuration.
 */
export interface ASPServiceConfig {
  /** RPC endpoint URL (for on-chain operations: register, publishRoot) */
  rpcUrl: string
  /** ASP Registry Hub contract address */
  registryAddress: `0x${string}`
  /** Private key for the ASP operator */
  operatorPrivateKey: `0x${string}`

  /** Event source — where candidate addresses come from */
  eventSource: IEventSource

  /** Membership gate — decides who gets whitelisted */
  gate: IMembershipGate

  /** ASP ID (if already registered; omit to auto-register) */
  aspId?: bigint
  /** ASP name (used when auto-registering) */
  aspName?: string
  /** API server port (default: 3001) */
  port?: number
  /** Chain ID (default: auto-detect) */
  chainId?: number
}

/**
 * Start an auto-whitelist ASP service.
 *
 * Wires together the event source, membership gate, and API server.
 *
 * @returns The ASPManager instance (for programmatic access)
 */
export async function startASPService(config: ASPServiceConfig): Promise<ASPManager> {
  const {
    rpcUrl,
    registryAddress,
    operatorPrivateKey,
    eventSource,
    gate,
    aspId,
    aspName,
    port = 3001,
    chainId,
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

  console.log(`\nEvent source: ${eventSource.getStatus().sourceName}`)
  console.log(`Membership gate: ${gate.name}`)

  // Wire: event source → gate → manager
  await eventSource.start(async (address: `0x${string}`) => {
    const approved = await gate.approve(address)
    if (!approved) {
      manager.markBlocked(address)
      return
    }

    const isNew = await manager.addAddress(address)
    if (isNew && !eventSource.getStatus().isCatchingUp) {
      console.log(`[Live] New address: ${address}`)
      manager.schedulePublish() // debounced — at most once per 30s
    }
  })

  // After RPC catch-up (start() resolves for RPC source), publish once
  if (!eventSource.getStatus().isCatchingUp) {
    manager.setCatchingUp(false)
    console.log(`Catch-up complete: ${manager.getWhitelistedAddresses().length} addresses`)
    await manager.publishRootIfChanged()
  }

  // For Subsquid (async catch-up), poll until done then publish once
  if (eventSource.getStatus().isCatchingUp) {
    const check = setInterval(async () => {
      if (!eventSource.getStatus().isCatchingUp) {
        manager.setCatchingUp(false)
        console.log(`Catch-up complete: ${manager.getWhitelistedAddresses().length} addresses`)
        await manager.publishRootIfChanged()
        clearInterval(check)
      }
    }, 5000)
  }

  console.log('Auto-whitelist ASP is running. Press Ctrl+C to stop.')
  return manager
}
