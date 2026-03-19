'use client'

/**
 * React hook for managing an ASP (Association Set Provider)
 *
 * Handles ASP registration, status tracking, and membership checking.
 */

import { useState, useCallback, useEffect } from 'react'
import { type Address, type PublicClient } from 'viem'
import { ASP_REGISTRY_HUB_ABI } from '../contracts/abi/ASPRegistryHub.js'
import { loadPersonalASPId } from '../providers/localStorage.js'

export interface UseASPConfig {
  /** ASP Registry Hub contract address */
  registryAddress: Address
  /** viem PublicClient for reading chain data */
  publicClient: PublicClient
  /** User's wallet address */
  userAddress?: Address
}

export interface ASPStatus {
  /** ASP ID (0 if not registered) */
  aspId: bigint
  /** Current on-chain root */
  currentRoot: bigint
  /** Whether the ASP is registered */
  isRegistered: boolean
}

export interface UseASPReturn {
  /** Current ASP status */
  aspStatus: ASPStatus | null
  /** Whether loading initial state */
  isLoading: boolean
  /** Error from last operation */
  error: Error | null
  /** Get the ASP ID */
  getASPId: () => bigint | null
  /** Refresh ASP info from contract */
  refresh: () => Promise<void>
}

export function useASP(config: UseASPConfig): UseASPReturn {
  const { registryAddress, publicClient, userAddress } = config

  const [aspStatus, setAspStatus] = useState<ASPStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!userAddress || !publicClient) {
      setAspStatus(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const chainId = await publicClient.getChainId()
      const storedAspId = loadPersonalASPId(chainId, userAddress)

      if (storedAspId) {
        const aspData = await publicClient.readContract({
          address: registryAddress,
          abi: ASP_REGISTRY_HUB_ABI,
          functionName: 'getASP',
          args: [storedAspId],
        }) as { id: bigint; operator: Address; name: string; currentRoot: bigint; lastUpdated: bigint }

        if (aspData.operator.toLowerCase() === userAddress.toLowerCase()) {
          setAspStatus({
            aspId: storedAspId,
            currentRoot: aspData.currentRoot,
            isRegistered: true,
          })
          setIsLoading(false)
          return
        }
      }

      // No stored ASP or invalid
      setAspStatus({
        aspId: 0n,
        currentRoot: 0n,
        isRegistered: false,
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setAspStatus(null)
    } finally {
      setIsLoading(false)
    }
  }, [registryAddress, publicClient, userAddress])

  useEffect(() => {
    refresh()
  }, [refresh])

  const getASPId = useCallback((): bigint | null => {
    return aspStatus?.isRegistered ? aspStatus.aspId : null
  }, [aspStatus])

  return {
    aspStatus,
    isLoading,
    error,
    getASPId,
    refresh,
  }
}

/**
 * Store a newly registered ASP ID
 */
export { storePersonalASPId } from '../providers/localStorage.js'
