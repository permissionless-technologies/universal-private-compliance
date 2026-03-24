'use client'

/**
 * React hook for fetching ASP membership proofs.
 *
 * The /proof/:address endpoint is EIP-712 gated — only the address owner
 * can fetch their proof. This hook handles signing and caching automatically.
 *
 * Usage:
 *   const { fetchProof, proof, isLoading } = useASPProof({
 *     serviceUrl: 'https://asp-whitelist.upd.io',
 *     aspId: 4n,
 *   })
 */

import { useState, useCallback } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import { getAddress } from 'viem'
import {
  buildASPSignatureMessage,
  getCachedSignature,
  cacheSignature,
  appendSignatureParams,
} from '../asp/signature.js'

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
  /** Fetch the proof (triggers wallet signature if needed) */
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
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()

  const [proof, setProof] = useState<ASPProofData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProof = useCallback(async (addressOverride?: string): Promise<ASPProofData | null> => {
    const targetAddress = addressOverride ?? address

    if (!serviceUrl || !targetAddress || aspId === undefined) {
      setError('No ASP service configured or no wallet connected')
      return null
    }

    try {
      setIsLoading(true)
      setError(null)

      const checksummed = getAddress(targetAddress)

      // Check signature cache
      let sig: `0x${string}`
      let timestamp: number

      const cached = getCachedSignature(checksummed)
      if (cached) {
        sig = cached.sig
        timestamp = cached.timestamp
      } else {
        // Sign EIP-712 message
        const msg = buildASPSignatureMessage(checksummed)
        timestamp = msg.timestamp
        sig = await signTypedDataAsync({
          domain: msg.domain,
          types: msg.types,
          primaryType: msg.primaryType,
          message: msg.message,
        })
        cacheSignature(checksummed, sig, timestamp)
      }

      // Fetch proof with signature
      const url = appendSignatureParams(
        `${serviceUrl}/proof/${checksummed}`,
        sig,
        timestamp,
      )
      const res = await fetch(url)

      if (!res.ok) {
        if (res.status === 404) {
          setError('Address not whitelisted in ASP')
        } else if (res.status === 401 || res.status === 403) {
          setError('Signature verification failed')
        } else {
          setError(`ASP returned ${res.status}`)
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
      // User rejected signature
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Signature request was rejected')
      } else {
        setError(msg)
      }
      setProof(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [serviceUrl, aspId, address, signTypedDataAsync])

  return { fetchProof, proof, isLoading, error }
}
