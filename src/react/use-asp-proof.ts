'use client'

/**
 * React hook for fetching ASP membership proofs.
 *
 * The /proof/:address endpoint is public (rate-limited). Any wallet can
 * fetch a proof for any whitelisted address — this is required because
 * the note's origin may differ from the connected wallet (e.g., received
 * notes preserve the original depositor's origin).
 *
 * Usage:
 *   const { fetchProof, proof, isLoading } = useASPProof({
 *     serviceUrl: 'https://asp-whitelist.upd.io',
 *     aspId: 4n,
 *   })
 */

import { useState, useCallback } from 'react'
import { getAddress } from 'viem'

export interface ASPProofData {
  /** ASP ID (on-chain identifier) */
  aspId: bigint
  /** Merkle root */
  root: bigint
  /** Path elements (siblings) */
  pathElements: bigint[]
  /** Path indices */
  pathIndices: number[]
}

export interface UseASPProofConfig {
  /** ASP service base URL */
  serviceUrl: string | undefined
  /** ASP ID (on-chain identifier) */
  aspId: bigint | undefined
}

export interface UseASPProofReturn {
  /** Fetch the proof for a given address */
  fetchProof: (addressOverride?: string) => Promise<ASPProofData | null>
  /** Last fetched proof */
  proof: ASPProofData | null
  /** Whether currently fetching */
  isLoading: boolean
  /** Error from last fetch */
  error: string | null
}

export function useASPProof(config: UseASPProofConfig): UseASPProofReturn {
  const { serviceUrl, aspId } = config

  const [proof, setProof] = useState<ASPProofData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProof = useCallback(async (addressOverride?: string): Promise<ASPProofData | null> => {
    if (!serviceUrl || !addressOverride || aspId === undefined) {
      setError('No ASP service configured or no address provided')
      return null
    }

    try {
      setIsLoading(true)
      setError(null)

      const checksummed = getAddress(addressOverride)

      // Public endpoint — no signature needed, just fetch
      const res = await fetch(`${serviceUrl}/proof/${checksummed}`)

      if (!res.ok) {
        if (res.status === 404) {
          setError('Address not whitelisted in ASP')
        } else if (res.status === 429) {
          setError('Rate limit exceeded — try again in a moment')
        } else {
          const body = await res.json().catch(() => ({}))
          setError(body.error || `ASP returned ${res.status}`)
        }
        setProof(null)
        return null
      }

      const data = await res.json() as {
        root: string
        pathElements: string[]
        pathIndices: number[]
      }

      const proofData: ASPProofData = {
        aspId,
        root: BigInt(data.root),
        pathElements: data.pathElements.map((e: string) => BigInt(e)),
        pathIndices: data.pathIndices,
      }

      setProof(proofData)
      return proofData
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch proof'
      setError(msg)
      setProof(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [serviceUrl, aspId])

  return { fetchProof, proof, isLoading, error }
}
