/**
 * EIP-712 Signature Verification Middleware
 *
 * Protects endpoints so only the address owner can access their data.
 * Expects query params: ?sig=0x...&timestamp=1234567890
 */

import type { Request, Response, NextFunction } from 'express'
import { verifyTypedData, isAddress, getAddress } from 'viem'
import {
  ASP_EIP712_DOMAIN,
  ASP_EIP712_TYPES,
  ASP_SIGNATURE_MAX_AGE_SECONDS,
} from '@permissionless-technologies/upc-sdk/asp'

export function requireSignature() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const address = req.params.address
    if (!address || !isAddress(address)) {
      res.status(400).json({ error: 'Invalid address' })
      return
    }

    const sig = req.query.sig as string | undefined
    const timestampStr = req.query.timestamp as string | undefined

    if (!sig || !timestampStr) {
      res.status(401).json({ error: 'Missing sig or timestamp query params' })
      return
    }

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) {
      res.status(400).json({ error: 'Invalid timestamp' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const age = now - timestamp
    if (age < 0 || age > ASP_SIGNATURE_MAX_AGE_SECONDS) {
      res.status(401).json({ error: 'Signature expired or timestamp in the future' })
      return
    }

    try {
      const checksummed = getAddress(address)
      const valid = await verifyTypedData({
        address: checksummed,
        domain: ASP_EIP712_DOMAIN,
        types: ASP_EIP712_TYPES,
        primaryType: 'ASPRequest',
        message: {
          address: checksummed,
          timestamp: BigInt(timestamp),
        },
        signature: sig as `0x${string}`,
      })

      if (!valid) {
        res.status(403).json({ error: 'Invalid signature' })
        return
      }
    } catch {
      res.status(403).json({ error: 'Signature verification failed' })
      return
    }

    next()
  }
}
