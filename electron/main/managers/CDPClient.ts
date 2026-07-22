/**
 * CDP Client — Chrome DevTools Protocol 交互层
 *
 * 基于 chrome-remote-interface 封装，提供统一的 CDP 连接管理。
 * ScriptManager / SyncController 共用此模块。
 */

class CDPClient {
  private client: any = null
  private readonly port: number
  private connected = false

  constructor(port: number) {
    this.port = port
  }

  /** 连接到指定 CDP 端口的 Chrome 实例 */
  async connect(): Promise<void> {
    try {
      // 动态导入 chrome-remote-interface（可选依赖）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const criModule = require('chrome-remote-interface')
      this.client = await criModule({ port: this.port, local: true })
      this.connected = true
      console.log(`[CDPClient] Connected to port ${this.port}`)
    } catch (error) {
      console.error(`[CDPClient] Failed to connect to port ${this.port}:`, error)
      this.connected = false
      throw error
    }
  }

  /** 发送 CDP 命令 */
  async send(method: string, params?: object): Promise<any> {
    if (!this.connected || !this.client) {
      throw new Error(`[CDPClient] Not connected (port ${this.port})`)
    }
    return this.client.send(method, params)
  }

  /** 监听 CDP 事件 */
  async on(event: string, callback: (...args: any[]) => void): Promise<void> {
    if (!this.client) return
    this.client.on(event, callback)
  }

  /** 关闭连接并释放资源 */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close()
        console.log(`[CDPClient] Disconnected from port ${this.port}`)
      } catch { /* ignore close errors */ }
      this.client = null
    }
    this.connected = false
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.connected
  }

  // ========== 便捷方法 ==========

  /** 执行 JavaScript 表达式 */
  async evaluate(expression: string): Promise<any> {
    const result = await this.send('Runtime.evaluate', { expression })
    return result.result?.value ?? null
  }
}

export default CDPClient
