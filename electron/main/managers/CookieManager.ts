/**
 * CookieManager — 通过 CDP 操作浏览器 Cookie
 *
 * 依赖 CDPClient 连接运行中的 Chrome 实例。
 * 所有操作需要 Chrome 进程在线（status === 'running'）。
 */
import CDPClient from './CDPClient'
import type { CookieData } from './CDPClient'

class CookieManager {
  private clients: Map<string, CDPClient> = new Map()

  /** 获取（或创建缓存）CDPClient 连接 */
  private getClient(cdpPort: number): CDPClient | null {
    const key = String(cdpPort)
    if (this.clients.has(key)) {
      const client = this.clients.get(key)!
      if (client.isConnected) return client
      this.clients.delete(key) // 已断开，清理
    }

    const client = new CDPClient(cdpPort)
    return client
  }

  /**
   * 获取指定环境的所有 Cookie
   * @param cdpPort 环境 CDP 端口
   * @returns Cookie 数组
   */
  async getAllCookies(cdpPort: number): Promise<CookieData[]> {
    const client = this.getClient(cdpPort)
    if (!client) throw new Error(`Cannot connect to CDP port ${cdpPort}`)

    try {
      await client.connect()
      const cookies = await client.getAllCookies()
      return cookies
    } finally {
      // 连接不长期保持，用完即关
      try { await client.close() } catch { /* ignore */ }
      this.clients.delete(String(cdpPort))
    }
  }

  /**
   * 设置单个 Cookie
   */
  async setCookie(cdpPort: number, cookie: CookieData): Promise<boolean> {
    const client = this.getClient(cdpPort)
    if (!client) throw new Error(`Cannot connect to CDP port ${cdpPort}`)

    try {
      await client.connect()
      return await client.setCookie(cookie)
    } finally {
      try { await client.close() } catch { /* ignore */ }
      this.clients.delete(String(cdpPort))
    }
  }

  /**
   * 批量导入 Cookie（从 EditThisCookie JSON 格式）
   */
  async importCookies(cdpPort: number, cookies: CookieData[]): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    const client = this.getClient(cdpPort)
    if (!client) throw new Error(`Cannot connect to CDP port ${cdpPort}`)

    try {
      await client.connect()
      for (const cookie of cookies) {
        try {
          await client.setCookie(cookie)
          success++
        } catch (e) {
          console.error(`[CookieManager] Failed to set cookie ${cookie.name}:`, e)
          failed++
        }
      }
    } finally {
      try { await client.close() } catch { /* ignore */ }
      this.clients.delete(String(cdpPort))
    }

    return { success, failed }
  }

  /**
   * 导出所有 Cookie 为可序列化格式
   */
  async exportCookies(cdpPort: number): Promise<CookieData[]> {
    return this.getAllCookies(cdpPort)
  }

  /**
   * 删除单个 Cookie（通过设置为过期）
   */
  async deleteCookie(cdpPort: number, cookieName: string, cookieDomain: string): Promise<boolean> {
    const client = this.getClient(cdpPort)
    if (!client) throw new Error(`Cannot connect to CDP port ${cdpPort}`)

    try {
      await client.connect()
      // Network.deleteCookies 需要 name + domain
      await client.send('Network.deleteCookies', { name: cookieName, domain: cookieDomain })
      return true
    } finally {
      try { await client.close() } catch { /* ignore */ }
      this.clients.delete(String(cdpPort))
    }
  }
}

export const cookieManager = new CookieManager()
export default CookieManager
