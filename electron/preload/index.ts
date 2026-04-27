import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload 脚本
 * 暴露安全 API 给渲染进程（contextIsolation + nodeIntegration: false）
 *
 * 类型说明：
 * - 数据模型类型由 src/types/ 统一管理，此处仅定义方法签名
 * - invoke<T>() 泛型提供返回值类型安全
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口操作
  getMainWindow: () => ipcRenderer.invoke('get-main-window'),

  // 环境管理
  getEnvironments: () => ipcRenderer.invoke('get-environments'),
  createEnvironment: (data: any) => ipcRenderer.invoke('create-environment', data),
  updateEnvironment: (id: string, data: any) => ipcRenderer.invoke('update-environment', id, data),
  deleteEnvironment: (id: string) => ipcRenderer.invoke('delete-environment', id),

  // 浏览器操作
  launchBrowser: (envId: string) => ipcRenderer.invoke('launch-browser', envId),
  closeBrowser: (envId: string) => ipcRenderer.invoke('close-browser', envId),
  getBrowserStatus: (envId: string) => ipcRenderer.invoke('get-browser-status', envId),

  // 同步操作
  startSync: (envIds: string[]) =>
    ipcRenderer.invoke('start-sync', { envIds }),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  getSyncState: () => ipcRenderer.invoke('get-sync-state'),

  // 窗口管理
  closeAll: () => ipcRenderer.invoke('close-all'),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

  /**
   * 通用 IPC invoke 方法（新增通道时无需修改 preload）
   * @example await window.electronAPI.invoke<ReturnType>('channel-name', params)
   */
  invoke: <T>(channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  /** 主进程→渲染进程事件推送（BrowserEventBus） */
  onAppEvent: (channel: string, callback: (data: any) => void) => {
    const handler = (_e: any, ch: string, data: any) => { if (ch === channel) callback(data) }
    ipcRenderer.on('app-event', handler)
    return handler // 用于 offAppEvent 取消订阅
  },
  offAppEvent: (channel: string, handler: (...args: any[]) => void) => {
    ipcRenderer.removeListener('app-event', handler as any)
  },

  // [保留兼容] 旧事件接口
  onBrowserEvent: (callback: (event: string, data: any) => void) => {
    ipcRenderer.on('browser-event', (_, event, data) => callback(event, data))
  },

  // 平台信息
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})

/** Window.electronAPI 完整类型声明 */
declare global {
  interface Window {
    electronAPI: {
      getMainWindow: () => Promise<unknown>
      getEnvironments: <T = any[]>() => Promise<T>
      createEnvironment: (data: unknown) => Promise<unknown>
      updateEnvironment: (id: string, data: unknown) => Promise<unknown>
      deleteEnvironment: (id: string) => Promise<boolean>
      launchBrowser: (envId: string) => Promise<boolean>
      closeBrowser: (envId: string) => Promise<boolean>
      getBrowserStatus: (envId: string) => Promise<unknown>
      startSync: (envIds: string[]) => Promise<boolean>
      stopSync: () => Promise<boolean>
      getSyncState: () => Promise<unknown>
      closeAll: () => Promise<boolean>
      getSettings: () => Promise<unknown>
      saveSettings: (settings: unknown) => Promise<boolean>
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
      onAppEvent: (channel: string, callback: (data: unknown) => void) => (...args: unknown[]) => void
      offAppEvent: (channel: string, handler: (...args: unknown[]) => void) => void
      onBrowserEvent: (callback: (event: string, data: unknown) => void) => void
      platform: string
      versions: { node: string; chrome: string; electron: string }
    }
  }
}
