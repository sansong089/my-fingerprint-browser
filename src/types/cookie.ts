/**
 * Cookie 类型定义
 */

export interface CookieData {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
  expires?: number
}
