'use client'

/**
 * React hook for managing an ASP tree
 *
 * Wraps a provider with React state management.
 * Handles adding/removing members and publishing roots.
 */

import { useState, useCallback, useEffect } from 'react'
import type { IASPProvider } from '../core/types.js'
import { ASP_REGISTRY_HUB_ABI } from '../contracts/abi/ASPRegistryHub.js'

export interface UseASPTreeManagerConfig {
  /** Provider instance for member storage */
  provider: IASPProvider
  /** ASP Registry Hub address (for publishing roots) */
  registryAddress?: `0x${string}`
  /** ASP ID (for publishing roots) */
  aspId?: bigint
}

export interface UseASPTreeManagerReturn {
  /** Current members */
  members: bigint[]
  /** Current root */
  root: bigint
  /** Whether loading */
  isLoading: boolean
  /** Add a member */
  addMember: (identity: bigint) => Promise<void>
  /** Remove a member */
  removeMember: (identity: bigint) => Promise<void>
  /** Publish root on-chain */
  publishRoot: (walletClient: any) => Promise<`0x${string}`>
  /** Refresh state from provider */
  refresh: () => Promise<void>
}

export function useASPTreeManager(config: UseASPTreeManagerConfig): UseASPTreeManagerReturn {
  const { provider, registryAddress, aspId } = config

  const [members, setMembers] = useState<bigint[]>([])
  const [root, setRoot] = useState<bigint>(0n)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [m, r] = await Promise.all([
        provider.getMembers(),
        provider.getRoot(),
      ])
      setMembers(m)
      setRoot(r)
    } finally {
      setIsLoading(false)
    }
  }, [provider])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addMember = useCallback(async (identity: bigint) => {
    await provider.addMember(identity)
    await refresh()
  }, [provider, refresh])

  const removeMember = useCallback(async (identity: bigint) => {
    await provider.removeMember(identity)
    await refresh()
  }, [provider, refresh])

  const publishRoot = useCallback(async (walletClient: any): Promise<`0x${string}`> => {
    if (!registryAddress || !aspId) {
      throw new Error('registryAddress and aspId required to publish root')
    }

    const currentRoot = await provider.getRoot()

    const hash = await walletClient.writeContract({
      address: registryAddress,
      abi: ASP_REGISTRY_HUB_ABI,
      functionName: 'updateRoot',
      args: [aspId, currentRoot],
    })

    return hash as `0x${string}`
  }, [provider, registryAddress, aspId])

  return {
    members,
    root,
    isLoading,
    addMember,
    removeMember,
    publishRoot,
    refresh,
  }
}
