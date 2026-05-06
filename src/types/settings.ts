/**
 * 设置类型定义
 */

export interface Settings {
  browserPath: string
  defaultPlatform: 'windows' | 'linux' | 'macos'
  defaultTimezone: string
  defaultLang: string
  autoStart: boolean
  minimizeToTray: boolean
  syncDelay: number
  environmentPageSize: number
  proxyPageSize: number
}
