/**
 * Sepolia Entry Point (Subsquid)
 *
 * Uses Subsquid's EvmBatchProcessor for efficient historical catch-up
 * without hammering the RPC. Ideal for long-running deployments on testnets.
 *
 * The processor syncs historical Transfer(from=0x0) events in batches,
 * then switches to real-time mode. Much faster and cheaper than
 * sequential getLogs for chains with months of history.
 *
 * Usage:
 *   cp env.example .env
 *   # Edit .env with Sepolia addresses
 *   npm run dev:sepolia
 */

import { EvmBatchProcessor } from '@subsquid/evm-processor'
import { type Address, getAddress } from 'viem'
import { ASPManager } from './asp-manager.js'
import { createServer } from './server.js'

const RPC_URL = process.env.RPC_URL ?? 'https://rpc.sepolia.org'
const REGISTRY_ADDRESS = process.env.ASP_REGISTRY_ADDRESS as Address
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address
const OPERATOR_KEY = (process.env.OPERATOR_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`
const ASP_ID = process.env.ASP_ID ? BigInt(process.env.ASP_ID) : undefined
const PORT = parseInt(process.env.PORT ?? '3001')
const ARCHIVE = process.env.SUBSQUID_ARCHIVE ?? 'https://v2.archive.subsquid.io/network/ethereum-sepolia'

// ERC20 Transfer event topic0
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
// Zero address as topic1 = mint
const ZERO_ADDRESS_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000'

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
    chainId: 11155111,
  })

  // Register ASP
  await manager.initialize()

  // Start API server
  createServer(manager, PORT)

  // Set up Subsquid processor
  const processor = new EvmBatchProcessor()
    .setGateway(ARCHIVE)
    .setRpcEndpoint(RPC_URL)
    .setFinalityConfirmation(10)
    .addLog({
      address: [TOKEN_ADDRESS.toLowerCase()],
      topic0: [TRANSFER_TOPIC],
      topic1: [ZERO_ADDRESS_TOPIC], // from = 0x0 (mints only)
    })
    .setFields({
      log: { topics: true, data: true },
    })

  console.log(`\nStarting Subsquid processor for ${TOKEN_ADDRESS} on Sepolia...`)

  // Process batches
  processor.run(
    // No database store needed — we use in-memory MemoryProvider
    { storeFactory: undefined as any },
    async (ctx: any) => {
      const mintAddresses: Address[] = []

      for (const block of ctx.blocks) {
        for (const log of block.logs) {
          // topic2 = 'to' address (padded to 32 bytes)
          if (log.topics[2]) {
            const to = getAddress('0x' + log.topics[2].slice(26)) as Address
            mintAddresses.push(to)
          }
        }
      }

      if (mintAddresses.length > 0) {
        const added = await manager.addAddresses(mintAddresses)
        if (added > 0) {
          const lastBlock = ctx.blocks[ctx.blocks.length - 1]?.header?.height ?? '?'
          console.log(`Block ${lastBlock}: +${added} new minters (${manager.getWhitelistedAddresses().length} total)`)
        }
      }

      // Check if we've caught up to the chain head
      if (ctx.isHead) {
        if (manager.getStatus().isCatchingUp) {
          manager.setCatchingUp(false)
          console.log(`\nHistorical catch-up complete: ${manager.getWhitelistedAddresses().length} unique minters`)
        }
        // Publish root on every head block batch
        await manager.publishRootIfChanged()
      }
    }
  )
}

main().catch(console.error)
