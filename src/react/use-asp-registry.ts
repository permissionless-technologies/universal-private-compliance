'use client'

/**
 * React hook for querying the ASP Registry
 *
 * Fetches all registered ASPs from the on-chain registry.
 */

import { useState, useEffect } from 'react'
import { type Address, type PublicClient } from 'viem'
import { ASP_REGISTRY_HUB_ABI } from '../contracts/abi/ASPRegistryHub.js'
import type { ASPInfo } from '../core/types.js'

export interface UseASPRegistryConfig {
  /** ASP Registry Hub contract address */
  registryAddress: Address
  /** viem PublicClient for reading chain data */
  publicClient: PublicClient | undefined
}

export interface UseASPRegistryReturn {
  /** All registered ASPs */
  asps: ASPInfo[]
  /** Whether loading */
  isLoading: boolean
  /** Error from last fetch */
  error: Error | null
  /** Refresh the list */
  refresh: () => Promise<void>
}

export function useASPRegistry(config: UseASPRegistryConfig): UseASPRegistryReturn {
  const { registryAddress, publicClient } = config
  const [asps, setAsps] = useState<ASPInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchASPs = async () => {
    if (!publicClient || !registryAddress) {
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const nextASPId = await publicClient.readContract({
        address: registryAddress,
        abi: ASP_REGISTRY_HUB_ABI,
        functionName: 'nextASPId',
      }) as bigint

      const count = Number(nextASPId)
      if (count <= 1) {
        setAsps([])
        setIsLoading(false)
        return
      }

      const results: ASPInfo[] = []
      for (let i = 1; i < count; i++) {
        const data = await publicClient.readContract({
          address: registryAddress,
          abi: ASP_REGISTRY_HUB_ABI,
          functionName: 'getASP',
          args: [BigInt(i)],
        }) as { id: bigint; operator: Address; name: string; currentRoot: bigint; lastUpdated: bigint }

        if (data.operator !== '0x0000000000000000000000000000000000000000') {
          results.push({
            id: data.id,
            operator: data.operator,
            name: data.name,
            currentRoot: data.currentRoot,
            lastUpdated: data.lastUpdated,
          })
        }
      }
      setAsps(results)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchASPs()
  }, [publicClient, registryAddress])

  return { asps, isLoading, error, refresh: fetchASPs }
}
