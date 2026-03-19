/**
 * REST Provider
 *
 * Delegates ASP member storage to a backend REST API.
 * Use for production ASP services.
 *
 * Expected API endpoints:
 *   GET    /members           → { members: string[] }
 *   POST   /members           → { identity: string } → 201
 *   DELETE /members/:identity  → 204
 *   GET    /root              → { root: string }
 *   GET    /proof/:identity   → MerkleProof
 */

import type { IASPProvider, MerkleProof } from '../core/types.js'
import { DEFAULT_TREE_DEPTH } from '../core/tree.js'

export interface RESTProviderConfig {
  /** Base URL of the ASP backend API */
  baseUrl: string
  /** Optional API key for authentication */
  apiKey?: string
  /** Merkle tree depth (default: 20) */
  treeDepth?: number
  /** Custom fetch implementation (default: global fetch) */
  fetch?: typeof fetch
}

export class RESTProvider implements IASPProvider {
  readonly name = 'REST API'
  readonly treeDepth: number
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly fetchFn: typeof fetch

  constructor(config: RESTProviderConfig) {
    this.treeDepth = config.treeDepth ?? DEFAULT_TREE_DEPTH
    this.baseUrl = config.baseUrl.replace(/\/$/, '') // strip trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    }
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async addMember(identity: bigint): Promise<void> {
    if (identity === 0n) throw new Error('Identity cannot be zero')
    const res = await this.fetchFn(`${this.baseUrl}/members`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ identity: identity.toString() }),
    })
    if (!res.ok) throw new Error(`Failed to add member: ${res.status} ${res.statusText}`)
  }

  async removeMember(identity: bigint): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/members/${identity}`, {
      method: 'DELETE',
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to remove member: ${res.status} ${res.statusText}`)
  }

  async getMembers(): Promise<bigint[]> {
    const res = await this.fetchFn(`${this.baseUrl}/members`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to get members: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as { members: string[] }
    return data.members.map(s => BigInt(s))
  }

  async hasMember(identity: bigint): Promise<boolean> {
    const members = await this.getMembers()
    return members.includes(identity)
  }

  async getRoot(): Promise<bigint> {
    const res = await this.fetchFn(`${this.baseUrl}/root`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to get root: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as { root: string }
    return BigInt(data.root)
  }

  async getMerkleProof(identity: bigint): Promise<MerkleProof> {
    const res = await this.fetchFn(`${this.baseUrl}/proof/${identity}`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to get proof: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as {
      pathElements: string[]
      pathIndices: number[]
      leafIndex: number
      root: string
    }
    return {
      pathElements: data.pathElements.map(s => BigInt(s)),
      pathIndices: data.pathIndices,
      leafIndex: data.leafIndex,
      root: BigInt(data.root),
    }
  }
}
