/**
 * 环境相关类型定义
 * 权威源：electron/main/services/StorageService.ts
 */

export interface FingerprintConfig {
  seed: number
  platform: 'windows' | 'linux' | 'macos'
  platformVersion?: string
  brand?: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  brandVersion?: string
  hardwareConcurrency?: number
  timezone?: string
  lang?: string
  followIpGeo?: boolean
  disabledSpoofing?: string[]
}

export interface ProxyConfig {
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

/** v2.0 新增字段：groupId, templateId, cdpPort(主进程分配), launchedAt */
export interface Environment {
  id: string
  name: string
  fingerprint: FingerprintConfig
  proxy?: ProxyConfig
  userDataDir: string
  cdpPort: number
  createdAt: string
  lastUsed: string
  tags: string[]
  color: string
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  url?: string
  groupId?: string
  templateId?: string
  launchedAt?: string
}
