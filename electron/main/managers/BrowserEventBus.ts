/**
 * BrowserEventBus — 主进程→渲染进程事件推送总线
 *
 * 统一管理 Chrome 崩溃/退出/同步事件/录制步骤的实时推送。
 * 通过 mainWindow.webContents.send('app-event', channel, data) 推送到渲染进程。
 */
import { BrowserWindow } from 'electron'

type EventHandler = (data: any) => void

class BrowserEventBus {
  private mainWindow: BrowserWindow | null = null
  private listeners: Map<string, Set<EventHandler>> = new Map()

  /** 初始化（在 createWindow 后调用） */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    console.log('[BrowserEventBus] Initialized')
  }

  /** 发送事件到渲染进程 + 本地广播 */
  emit(channel: string, data?: any): void {
    // 推送到渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('app-event', channel, data)
    }
    // 同时广播给本地监听者
    this.broadcast(channel, data)
  }

  /** 本地订阅（主进程内模块间通信） */
  on(channel: string, handler: EventHandler): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(handler)

    // 返回取消订阅函数
    return () => this.off(channel, handler)
  }

  /** 取消本地订阅 */
  off(channel: string, handler: EventHandler): void {
    this.listeners.get(channel)?.delete(handler)
  }

  /** 广播给所有本地监听者 */
  broadcast(channel: string, data?: any): void {
    const handlers = this.listeners.get(channel)
    if (handlers) {
      handlers.forEach(handler => {
        try { handler(data) } catch (e) { console.error('[BrowserEventBus] Handler error:', e) }
      })
    }
  }
}

export const eventBus = new BrowserEventBus()
export default BrowserEventBus
