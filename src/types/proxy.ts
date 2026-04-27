/**
 * 代理类型定义
 */

export interface Proxy {
  id: string
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
  groupId?: string
  status: 'unchecked' | 'available' | 'unavailable'
  lastCheck?: string
  createdAt: string
}
