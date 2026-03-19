# Custom Providers

## The Provider Interface

All ASP member storage is handled through the `IASPProvider` interface. The SDK ships with three built-in providers, but you can implement your own for any storage backend.

```typescript
interface IASPProvider {
  // Member management
  addMember(identity: bigint): Promise<void>
  removeMember(identity: bigint): Promise<void>
  getMembers(): Promise<bigint[]>
  hasMember(identity: bigint): Promise<boolean>

  // Tree operations (computed from members)
  getRoot(): Promise<bigint>
  getMerkleProof(identity: bigint): Promise<MerkleProof>

  // Metadata
  readonly name: string
  readonly treeDepth: number
}
```

## Built-in Providers

### MemoryProvider

In-memory storage. Data is lost when the process exits. Use for tests and scripts.

```typescript
import { MemoryProvider } from '@permissionless-technologies/universal-private-compliance'

const provider = new MemoryProvider({ treeDepth: 20 })
```

### LocalStorageProvider

Browser `localStorage` storage. Data persists across page reloads. Use for browser demos.

```typescript
import { LocalStorageProvider } from '@permissionless-technologies/universal-private-compliance'

const provider = new LocalStorageProvider({
  chainId: 1,
  aspId: 1n,
  treeDepth: 20,
})
```

### RESTProvider

Delegates to a backend API. Use for production ASP services.

```typescript
import { RESTProvider } from '@permissionless-technologies/universal-private-compliance'

const provider = new RESTProvider({
  baseUrl: 'https://api.myasp.com',
  apiKey: 'sk_...',
  treeDepth: 20,
})
```

## Implementing a Custom Provider

```typescript
import type { IASPProvider, MerkleProof } from '@permissionless-technologies/universal-private-compliance'
import { MerkleTree } from '@permissionless-technologies/universal-private-compliance/core'

class PostgresProvider implements IASPProvider {
  readonly name = 'Postgres ASP'
  readonly treeDepth = 20

  constructor(private db: Database) {}

  async addMember(identity: bigint): Promise<void> {
    await this.db.query('INSERT INTO asp_members (identity) VALUES ($1)', [identity.toString()])
  }

  async removeMember(identity: bigint): Promise<void> {
    await this.db.query('DELETE FROM asp_members WHERE identity = $1', [identity.toString()])
  }

  async getMembers(): Promise<bigint[]> {
    const rows = await this.db.query('SELECT identity FROM asp_members ORDER BY id')
    return rows.map(r => BigInt(r.identity))
  }

  async hasMember(identity: bigint): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM asp_members WHERE identity = $1 LIMIT 1',
      [identity.toString()]
    )
    return result.length > 0
  }

  async getRoot(): Promise<bigint> {
    const members = await this.getMembers()
    if (members.length === 0) return 0n
    if (members.length === 1) return members[0]!
    const tree = new MerkleTree(this.treeDepth)
    for (const m of members) tree.insert(m)
    return tree.getRoot()
  }

  async getMerkleProof(identity: bigint): Promise<MerkleProof> {
    const members = await this.getMembers()
    const tree = new MerkleTree(this.treeDepth)
    for (const m of members) tree.insert(m)
    const index = tree.indexOf(identity)
    if (index === -1) throw new Error('Identity not found in tree')
    return tree.getProof(index)
  }
}
```

## Provider Guidelines

When implementing a custom provider:

1. **Thread safety** — `getRoot()` and `getMerkleProof()` must reflect the current member set. If members change between calls, the root and proofs must be consistent.
2. **Idempotency** — `addMember()` should be idempotent (adding an existing member is a no-op).
3. **Tree depth** — The `treeDepth` property must match the circuit depth (default: 20, supports ~1M members).
4. **Zero leaves** — Identity `0n` is not a valid member. Providers should reject it.
