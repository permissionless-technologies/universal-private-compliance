/**
 * API Server
 *
 * Express server exposing the ASP state:
 *
 *   GET /root              → current Merkle root (public)
 *   GET /proof/:address    → membership proof (rate-limited, public)
 *   GET /status            → global sync status (public)
 *   GET /status/:address   → per-address compliance status (public, rate-limited)
 *   GET /health            → health check (public)
 *
 * The proof endpoint is public because Merkle proofs are not secret — they prove
 * membership in a publicly-committed tree. Callers need proofs for addresses they
 * don't control (e.g., withdrawing a note whose origin is a different wallet).
 * Rate limiting prevents enumeration of the full member set.
 */

import express from 'express'
import { type Address, isAddress, getAddress } from 'viem'
import type { ASPManager } from './asp-manager.js'
import { rateLimit } from './middleware/rate-limit.js'

export function createServer(manager: ASPManager, port: number) {
  const app = express()

  // CORS — allow all origins (read-only API)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })

  // Public: current Merkle root
  app.get('/root', async (_req, res) => {
    try {
      const root = await manager.provider.getRoot()
      res.json({ root: root.toString() })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // Public + rate-limited: membership proof
  // Proofs are public data (Merkle siblings from a publicly-committed root).
  // Any wallet may need a proof for a note's origin address during withdrawal.
  app.get('/proof/:address', rateLimit({ maxRequests: 30, windowSeconds: 60 }), async (req, res) => {
    const addr = req.params.address
    if (!addr || !isAddress(addr)) {
      res.status(400).json({ error: 'Invalid address' })
      return
    }

    const checksummed = getAddress(addr) as Address

    if (!manager.isWhitelisted(checksummed)) {
      res.status(404).json({ error: 'Address not whitelisted' })
      return
    }

    try {
      const proof = await manager.getProof(checksummed)
      res.json({
        root: proof.root.toString(),
        pathElements: proof.pathElements.map(e => e.toString()),
        pathIndices: proof.pathIndices,
      })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // Public + rate-limited: per-address compliance status
  app.get('/status/:address', rateLimit({ maxRequests: 20, windowSeconds: 60 }), (req, res) => {
    const addr = req.params.address
    if (!addr || !isAddress(addr)) {
      res.status(400).json({ error: 'Invalid address' })
      return
    }

    const checksummed = getAddress(addr)
    res.json({
      address: checksummed,
      status: manager.getAddressStatus(checksummed as Address),
    })
  })

  // Public: global sync status
  app.get('/status', (_req, res) => {
    res.json(manager.getStatus())
  })

  // Health check for load balancers
  app.get('/health', (_req, res) => {
    res.sendStatus(200)
  })

  app.listen(port, () => {
    console.log(`ASP API server listening on http://localhost:${port}`)
    console.log(`  GET /root              → current Merkle root`)
    console.log(`  GET /proof/:addr       → membership proof (rate-limited)`)
    console.log(`  GET /status            → global sync status`)
    console.log(`  GET /status/:addr      → per-address status (rate-limited)`)
  })

  return app
}
