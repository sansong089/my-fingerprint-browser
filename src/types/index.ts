/**
 * 统一类型定义入口
 * 权威源：electron/main/services/StorageService.ts
 *
 * 所有前端代码应从此文件导入类型，禁止在组件中重新定义数据模型。
 * preload 类型仅限 Window.electronAPI 方法签名，不在此管理。
 */

// Core types
export type { FingerprintConfig, ProxyConfig, Environment } from './environment'
export type { Group } from './group'
export type { ProxyGroup } from './proxyGroup'
export type { Proxy } from './proxy'
export type { Settings } from './settings'

// Feature types
export type { ProfileTemplate } from './template'
export type { Script, ScriptStep } from './script'
export type { ActivityLog } from './log'
export type { CookieData } from './cookie'

// Infrastructure types
export type { WindowPosition, MonitorInfo, WindowInfo } from './window'

// IPC types
export type {
  CreateEnvironmentParams,
  UpdateEnvironmentParams,
  GroupCreateParams,
  GroupUpdateParams,
  ProxyCreateParams,
  BatchLaunchParams,
  BatchCloseParams,
  ImportEnvironmentsParams,
  ExportEnvironmentsParams,
  CookieGetParams,
  CookieSetParams,
  SyncStartParams,
  ActivityLogQueryParams,
  WindowsArrangeParams,
} from './ipc'
