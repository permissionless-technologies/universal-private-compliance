'use client'

/**
 * React hook for checking ASP membership status.
 *
 * Queries the ASP service's /status/:address endpoint (public, rate-limited)
 * and the global /status endpoint for aggregate stats.
 *
 * Usage:
 *   const { status, memberCount, refresh } = useASPMembership({
 *     serviceUrl: 'https://asp-whitelist.upd.io',
 *   })
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import type { ASPAddressStatus } from '../asp/api-schema.js'

export type ASPMembershipStatus =
  | 'loading'
  | 'whitelisted'
  | 'pending'
  | 'blocked'
  | 'not-whitelisted'
  | 'no-service'
  | 'error'

export interface UseASPMembershipConfig {
  /** ASP service base URL (e.g., 'https://asp-whitelist.upd.io') */
  serviceUrl: string | undefined
}

export interface UseASPMembershipReturn {
  /** Current membership status */
  status: ASPMembershipStatus
  /** Total whitelisted member count (from global /status) */
  memberCount: number | null
  /** Error message (if status === 'error') */
  error: string | null
  /** Refresh the status */
  refresh: () => Promise<void>
}

function mapAddressStatus(aspStatus: ASPAddressStatus): ASPMembershipStatus {
  switch (aspStatus) {
    case 'whitelisted': return 'whitelisted'
    case 'pending': return 'pending'
    case 'blocked': return 'blocked'
    case 'unknown': return 'not-whitelisted'
  }
}

export function useASPMembership(config: UseASPMembershipConfig): UseASPMembershipReturn {
  const { serviceUrl } = config
  const { address } = useAccount()

  const [status, setStatus] = useState<ASPMembershipStatus>('loading')
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!serviceUrl) {
      setStatus('no-service')
      return
    }

    if (!address) {
      setStatus('loading')
      return
    }

    try {
      setStatus('loading')
      setError(null)

      // Per-address status (public, rate-limited)
      const statusRes = await fetch(`${serviceUrl}/status/${address}`)

      if (statusRes.ok) {
        const data = await statusRes.json() as { status: ASPAddressStatus }
        setStatus(mapAddressStatus(data.status))
      } else if (statusRes.status === 429) {
        setStatus('error')
        setError('Rate limit exceeded — try again shortly')
      } else {
        setStatus('error')
        setError(`ASP returned ${statusRes.status}`)
      }

      // Global stats (non-critical)
      try {
        const globalRes = await fetch(`${serviceUrl}/status`)
        if (globalRes.ok) {
          const data = await globalRes.json()
          setMemberCount(data.memberCount ?? null)
        }
      } catch {
        // Non-critical
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to reach ASP service')
    }
  }, [serviceUrl, address])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { status, memberCount, error, refresh }
}
