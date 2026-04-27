/**
 * 模板类型定义
 */

import type { FingerprintConfig } from './environment'

export interface ProfileTemplate {
  id: string
  name: string
  description?: string
  fingerprintConfig: FingerprintConfig
  proxyPreset?: {
    type: string
    host: string
    port: number
    username?: string
    password?: string
  }
  platform?: string
  groupId?: string
  createdAt: string
  updatedAt: string
}
