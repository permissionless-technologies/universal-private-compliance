'use client'

/**
 * React hook for fetching STARK-side ASP membership proofs.
 *
 * Parallel to `useASPProof` (BLS side). The two are intentionally
 * separate hooks because the proof shapes differ — the STARK side
 * uses an always-hash, fixed-depth tree (AlwaysHashMerkleTree) and
 * its proof carries leaf, leafIndex, and depth fields the BLS proof
 * doesn't.
 *
 * Usage:
 *   const { fetchProof, proof, isLoading, error } = useStarkASPProof({
 *     serviceUrl: 'https://asp-whitelist.upd.io',
 *     aspId: 4n,
 *   })
 *   const p = await fetchProof('0x5AD2...053E')
 *   // p: { aspId, root, leaf, leafIndex, depth, pathElements, pathIndices }
 *
 * Like useASPProof, the /stark-proof endpoint is public (rate-limited).
 * Any wallet may need a proof for an address it doesn't control —
 * received notes preserve the original depositor's origin, and the
 * STARK transfer/withdraw circuits bind to the origin's ASP membership,
 * not the spender's.
 */

import { useState, useCallback } from 'react'
import { getAddress } from 'viem'
import { fetchStarkASPProof } from '../asp/fetch-helpers.js'

export interface StarkASPProofData {
  /** ASP ID (on-chain identifier) */
  aspId: bigint
  /** STARK tree root */
  root: bigint
  /** Leaf value (M31-encoded address) */
  leaf: bigint
  /** Index of the leaf in insertion order */
  leafIndex: number
  /** Tree depth (fixed across every proof in this tree) */
  depth: number
  /** Sibling at each level; length === depth */
  pathElements: bigint[]
  /** Side bit at each level (0 or 1); length === depth */
  pathIndices: number[]
}

export interface UseStarkASPProofConfig {
  /** ASP service base URL */
  serviceUrl: string | undefined
  /** ASP ID (on-chain identifier) */
  aspId: bigint | undefined
}

export interface UseStarkASPProofReturn {
  /** Fetch the STARK proof for a given address */
  fetchProof: (addressOverride?: string) => Promise<StarkASPProofData | null>
  /** Last fetched proof */
  proof: StarkASPProofData | null
  /** Whether currently fetching */
  isLoading: boolean
  /** Error from last fetch */
  error: string | null
}

export function useStarkASPProof(config: UseStarkASPProofConfig): UseStarkASPProofReturn {
  const { serviceUrl, aspId } = config

  const [proof, setProof] = useState<StarkASPProofData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProof = useCallback(async (
    addressOverride?: string
  ): Promise<StarkASPProofData | null> => {
    if (!serviceUrl || !addressOverride || aspId === undefined) {
      setError('No ASP service configured or no address provided')
      return null
    }

    try {
      setIsLoading(true)
      setError(null)

      const checksummed = getAddress(addressOverride)
      const fetched = await fetchStarkASPProof(serviceUrl, checksummed)

      if (fetched === null) {
        setError('Address not whitelisted in ASP')
        setProof(null)
        return null
      }

      const proofData: StarkASPProofData = { aspId, ...fetched }
      setProof(proofData)
      return proofData
    } catch (err) {
      // The helper's error message tags the URL + status, so consumers
      // can distinguish 429 (rate-limit) from 5xx without parsing the
      // status separately. Surface it verbatim.
      const msg = err instanceof Error ? err.message : 'Failed to fetch STARK proof'
      setError(msg)
      setProof(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [serviceUrl, aspId])

  return { fetchProof, proof, isLoading, error }
}
