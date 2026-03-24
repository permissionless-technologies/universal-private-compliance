/**
 * Simple In-Memory Rate Limiter
 *
 * Limits requests per IP to prevent brute-force enumeration.
 * No external dependencies — a Map with periodic cleanup.
 */

import type { Request, Response, NextFunction } from 'express'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export interface RateLimitConfig {
  /** Max requests per window (default: 20) */
  maxRequests?: number
  /** Window size in seconds (default: 60) */
  windowSeconds?: number
}

export function rateLimit(config: RateLimitConfig = {}) {
  const { maxRequests = 20, windowSeconds = 60 } = config
  const entries = new Map<string, RateLimitEntry>()

  // Cleanup stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key)
    }
  }, 5 * 60 * 1000).unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()

    let entry = entries.get(ip)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 }
      entries.set(ip, entry)
    }

    entry.count++

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'Rate limit exceeded' })
      return
    }

    next()
  }
}
