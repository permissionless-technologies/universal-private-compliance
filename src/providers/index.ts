/**
 * Providers module — pluggable storage backends for ASP member data
 */

export { MemoryProvider } from './memory.js'
export type { MemoryProviderConfig } from './memory.js'

export { LocalStorageProvider, storePersonalASPId, loadPersonalASPId } from './localStorage.js'
export type { LocalStorageProviderConfig } from './localStorage.js'

export { RESTProvider } from './rest.js'
export type { RESTProviderConfig } from './rest.js'

// Re-export interface from core
export type { IASPProvider } from '../core/types.js'
