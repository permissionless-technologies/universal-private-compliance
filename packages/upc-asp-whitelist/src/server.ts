/**
 * API Server
 *
 * Simple Express server exposing the ASP state:
 *
 *   GET /root          → current Merkle root
 *   GET /proof/:addr   → membership proof for an address
 *   GET /members       → all whitelisted addresses
 *   GET /status        → sync status (catching up, member count, etc.)
 */

import express from 'express'
import { type Address, isAddress } from 'viem'
import type { ASPManager } from './asp-manager.js'

export function createServer(manager: ASPManager, port: number) {
  const app = express()

  app.get('/root', async (_req, res) => {
    try {
      const root = await manager.provider.getRoot()
      res.json({ root: root.toString() })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/proof/:address', async (req, res) => {
    const addr = req.params.address
    if (!addr || !isAddress(addr)) {
      res.status(400).json({ error: 'Invalid address' })
      return
    }

    if (!manager.isWhitelisted(addr as Address)) {
      res.status(404).json({ error: 'Address not whitelisted' })
      return
    }

    try {
      const proof = await manager.getProof(addr as Address)
      res.json({
        root: proof.root.toString(),
        pathElements: proof.pathElements.map(e => e.toString()),
        pathIndices: proof.pathIndices,
      })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/members', (_req, res) => {
    res.json({ members: manager.getWhitelistedAddresses() })
  })

  app.get('/status', (_req, res) => {
    res.json(manager.getStatus())
  })

  app.listen(port, () => {
    console.log(`ASP API server listening on http://localhost:${port}`)
    console.log(`  GET /root          → current Merkle root`)
    console.log(`  GET /proof/:addr   → membership proof`)
    console.log(`  GET /members       → all whitelisted addresses`)
    console.log(`  GET /status        → sync status`)
  })

  return app
}
