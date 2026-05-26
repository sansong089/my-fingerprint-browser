/**
 * IPC 请求/响应类型定义
 * 替代 preload 中的 Promise<any>，提供类型安全
 */

// --- Environment IPC ---
export interface CreateEnvironmentParams {
  name: string
  fingerprint: import('./environment').FingerprintConfig
  proxy?: import('./environment').ProxyConfig
  tags?: string[]
  color?: string
  groupId?: string
  cdpPort?: number
}

export interface UpdateEnvironmentParams extends Partial<CreateEnvironmentParams> {
  id: string
}

// --- Group IPC ---
export interface GroupCreateParams {
  name: string
  color?: string
}

export interface GroupUpdateParams {
  id: string
  name?: string
  color?: string
  order?: number
}

// --- Proxy IPC ---
export interface ProxyCreateParams {
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

// --- Batch IPC ---
export interface BatchLaunchParams {
  envIds: string[]
}

export interface BatchCloseParams {
  envIds: string[]
}

// --- Import/Export IPC ---
export interface ImportEnvironmentsParams {
  filePath: string
  format: 'json' | 'csv'
}

export interface ExportEnvironmentsParams {
  envIds: string[]
  format: 'json' | 'csv'
}

// --- Cookie IPC ---
export interface CookieGetParams {
  envId: string
}

export interface CookieSetParams {
  envId: string
  cookies: import('./cookie').CookieData[]
}

// --- Sync IPC ---
export interface SyncStartParams {
  envIds: string[]
}

// --- Activity Log IPC ---
export interface ActivityLogQueryParams {
  envId?: string
  limit?: number
}

// --- Window Management IPC ---
export interface WindowsArrangeParams {
  mode: 'grid' | 'cascade'
  envIds?: string[]
  envMonitorMap?: Record<string, string>
}

// --- Plugin IPC ---
export interface PluginInstallParams {
  storeUrl: string
  name?: string
  iconUrl?: string
  description?: string
}

export interface PluginActionParams {
  pluginId: string
}
