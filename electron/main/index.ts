import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'

// Services and Managers
import { storageService } from './services/StorageService'
import { launchService } from './services/LaunchService'
import { environmentManager } from './managers/EnvironmentManager'
import { syncController } from './controllers/SyncController'
import { eventBus } from './managers/BrowserEventBus'
import { validate as validateIPC } from './managers/IPCValidator'
import { activityLogService } from './managers/ActivityLogService'
import { cookieManager } from './managers/CookieManager'
import { scriptManager } from './managers/ScriptManager'
import { windowManager } from './managers/WindowManager'
import { syncExtensionService } from './services/SyncExtensionService'
import { pluginCatalogService } from './services/PluginCatalogService'
import { pluginInstallService } from './services/PluginInstallService'
import { pluginStoreWindowService } from './services/PluginStoreWindowService'

// Global references
let mainWindow: BrowserWindow | null = null
let floatingToolbarWindow: BrowserWindow | null = null
let suppressFloatingToolbarClose = false
const FLOATING_TOOLBAR_WIDTH = 590
const FLOATING_TOOLBAR_HEIGHT = 50
const preload = join(__dirname, '../preload/index.js')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const runtimeLogDir = join(process.cwd(), 'output', 'logs')
const runtimeLogFile = join(runtimeLogDir, 'main-runtime.log')

syncExtensionService.setSyncStateProvider(() => syncController.getState())

eventBus.on('browser-event', (event) => {
  if (event?.type === 'launched' || event?.type === 'closed' || event?.type === 'crashed') {
    setTimeout(() => refreshFloatingToolbarVisibility(), 50)
  }
})

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function runtimeLog(message: string, extra?: unknown) {
  try {
    mkdirSync(runtimeLogDir, { recursive: true })
    appendFileSync(
      runtimeLogFile,
      `[${new Date().toISOString()}] ${message}${extra !== undefined ? ` ${safeStringify(extra)}` : ''}\n`,
      'utf8'
    )
  } catch {
    // ignore runtime log failures
  }
}

function getRunningEnvironments() {
  return storageService.getEnvironments().filter(env => env.status === 'running')
}

function getRunningEnvIds(): string[] {
  return getRunningEnvironments().map(env => env.id)
}

function buildFloatingToolbarHtml(runningCount: number, syncActive: boolean) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        html,
        body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent;
        }
        body {
          font-family: "Segoe UI", system-ui, sans-serif;
          color: white;
          display: flex;
        }
        .toolbar {
          width: 100%;
          height: 100%;
          padding: 10px 12px;
          display: flex;
          gap: 8px;
          align-items: center;
          box-sizing: border-box;
          background: rgba(15, 23, 42, 0.96);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 12px;
          overflow: hidden;
          -webkit-app-region: drag;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.8);
          flex: none;
        }
        .meta {
          flex: 1;
          min-width: 0;
        }
        .title {
          font-size: 12px;
          color: #bae6fd;
          margin-bottom: 4px;
        }
        .desc {
          font-size: 11px;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 6px;
          -webkit-app-region: no-drag;
        }
        button {
          border: 0;
          border-radius: 8px;
          color: white;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        button:hover { filter: brightness(1.08); }
        .neutral { background: #475569; }
        .min { background: #0284c7; }
        .max { background: #6d28d9; }
        .sync { background: ${syncActive ? '#f97316' : '#2563eb'}; }
        .danger { background: #dc2626; }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div class="dot"></div>
        <div class="meta">
          <div class="title">${syncActive ? '窗口同步中' : '实例运行中'}</div>
          <div class="desc">运行实例 ${runningCount} 个${syncActive ? ' · 可停止同步但保留工具栏' : ''}</div>
        </div>
        <div class="actions">
          <button class="sync" id="toggle-sync">${syncActive ? '停止同步' : '启动同步'}</button>
          <button class="neutral" id="arrange">排列窗口</button>
          <button class="min" id="minimize">最小化</button>
          <button class="max" id="maximize">最大化</button>
          <button class="danger" id="close-all">关闭</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron')
        document.getElementById('toggle-sync').addEventListener('click', () => ipcRenderer.invoke('floating-toolbar-toggle-sync'))
        document.getElementById('arrange').addEventListener('click', () => ipcRenderer.invoke('floating-toolbar-arrange'))
        document.getElementById('minimize').addEventListener('click', () => ipcRenderer.invoke('floating-toolbar-minimize'))
        document.getElementById('maximize').addEventListener('click', () => ipcRenderer.invoke('floating-toolbar-maximize'))
        document.getElementById('close-all').addEventListener('click', () => ipcRenderer.invoke('floating-toolbar-close-all'))
      </script>
    </body>
  </html>`
}

function closeFloatingToolbarWindow() {
  if (!floatingToolbarWindow || floatingToolbarWindow.isDestroyed()) {
    floatingToolbarWindow = null
    return
  }

  suppressFloatingToolbarClose = true
  floatingToolbarWindow.close()
  floatingToolbarWindow = null
}

function refreshFloatingToolbarVisibility() {
  const runningCount = getRunningEnvironments().length
  if (runningCount === 0) {
    if (syncController.isActive()) {
      syncController.stop()
    }
    closeFloatingToolbarWindow()
    return
  }

  openFloatingToolbarWindow()
}

function openFloatingToolbarWindow() {
  const runningCount = getRunningEnvironments().length
  if (runningCount === 0) return

  const html = buildFloatingToolbarHtml(runningCount, syncController.isActive())

  if (floatingToolbarWindow && !floatingToolbarWindow.isDestroyed()) {
    floatingToolbarWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return
  }

  floatingToolbarWindow = new BrowserWindow({
    width: FLOATING_TOOLBAR_WIDTH,
    height: FLOATING_TOOLBAR_HEIGHT,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  })

  floatingToolbarWindow.setAlwaysOnTop(true, 'screen-saver')
  floatingToolbarWindow.setVisibleOnAllWorkspaces(true)
  floatingToolbarWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  positionFloatingToolbarWindow()

  floatingToolbarWindow.on('closed', () => {
    const shouldStopSync = !suppressFloatingToolbarClose && syncController.isActive()
    suppressFloatingToolbarClose = false
    floatingToolbarWindow = null
    if (shouldStopSync) {
      syncController.stop()
    }
  })
}

function positionFloatingToolbarWindow() {
  if (!floatingToolbarWindow || floatingToolbarWindow.isDestroyed()) return

  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const [width] = floatingToolbarWindow.getSize()
  const x = area.x + Math.max(0, Math.floor((area.width - width) / 2))
  const y = area.y + 8
  floatingToolbarWindow.setPosition(x, y, false)
}

async function invokeWindowActionForRunningEnvs(channel: 'windows-arrange' | 'windows-maximize' | 'windows-minimize') {
  const envIds = getRunningEnvIds()
  if (envIds.length === 0) return false

  if (channel === 'windows-arrange') {
    const targetWindows: Array<{ hwnd: number, title: string }> = []

    for (const envId of envIds) {
      const pid = launchService.getPid(envId)
      if (!pid) continue
      const windows = windowManager.findWindowByPid(pid)
      for (const win of windows) {
        targetWindows.push({ hwnd: win.hwnd, title: win.title })
      }
    }

    if (targetWindows.length === 0) return false

    const monitors = windowManager.getMonitors()
    const primaryMonitor = monitors.find((m: any) => m.isPrimary) || monitors[0]
    const area = primaryMonitor?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }

    const count = targetWindows.length
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)

    for (const win of targetWindows) {
      windowManager.focusWindow(win.hwnd)
    }

    setTimeout(() => {
      for (let idx = 0; idx < count; idx++) {
        const win = targetWindows[idx]
        const row = Math.floor(idx / cols)
        const col = idx % cols
        const w = Math.floor(area.width / cols)
        const h = Math.floor(area.height / rows)
        windowManager.setWindowPosition(win.hwnd, {
          x: area.x + col * w,
          y: area.y + row * h,
          width: w - 10,
          height: h - 10,
        })
      }
      floatingToolbarWindow?.moveTop()
      floatingToolbarWindow?.setAlwaysOnTop(true, 'screen-saver')
    }, 100)

    floatingToolbarWindow?.moveTop()
    floatingToolbarWindow?.setAlwaysOnTop(true, 'screen-saver')
    return true
  }

  const command = channel === 'windows-maximize' ? 'maximize' : 'minimize'
  let changed = false
  for (const envId of envIds) {
    const pid = launchService.getPid(envId)
    if (!pid) continue
    const windows = windowManager.findWindowByPid(pid)
    for (const win of windows) {
      changed = windowManager.showWindow(win.hwnd, command) || changed
    }
  }

  floatingToolbarWindow?.moveTop()
  return changed
}

function createWindow() {
  runtimeLog('createWindow:start')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  })

  // 初始化事件总线（P1#6 修复：Chrome 退出通知）
  eventBus.init(mainWindow)
  runtimeLog('createWindow:eventBusInitialized')

  // Load app
  if (isDev) {
    runtimeLog('createWindow:loadDevUrl', 'http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    runtimeLog('createWindow:loadFile', join(__dirname, '../../dist/index.html'))
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    runtimeLog('mainWindow:ready-to-show')
    mainWindow?.show()
  })

  // 最大化时自动排列所有运行中的浏览器窗口
  mainWindow.on('maximize', () => {
    console.log('[maximize] Event triggered')
    const runningEnvs = storageService.getEnvironments().filter((e: any) => e.status === 'running')
    console.log(`[maximize] Running envs: ${runningEnvs.length}`, runningEnvs.map((e: any) => ({ id: e.id, name: e.name })))

    if (runningEnvs.length === 0) {
      console.log('[maximize] No running environments, skip')
      return
    }

    console.log(`[maximize] Native module loaded: ${windowManager.isNativeLoaded}`)

    const targetWindows: Array<{ hwnd: number, title: string }> = []
    for (const env of runningEnvs) {
      const pid = launchService.getPid(env.id)
      console.log(`[maximize] env=${env.name} pid=${pid}`)
      if (!pid) continue
      const windows = windowManager.findWindowByPid(pid)
      console.log(`[maximize] windows for pid ${pid}:`, windows)
      for (const win of windows) {
        targetWindows.push({ hwnd: win.hwnd, title: win.title })
      }
    }

    console.log(`[maximize] Total target windows: ${targetWindows.length}`)
    if (targetWindows.length === 0) {
      console.warn('[maximize] No windows found! Check if native module is loaded.')
      return
    }

    const monitors = windowManager.getMonitors()
    console.log(`[maximize] Monitors:`, monitors.length)
    const primaryMonitor = monitors.find((m: any) => m.isPrimary) || monitors[0]
    const area = primaryMonitor?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }

    const count = targetWindows.length
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)

    // 第一步：先将所有窗口带到前台
    for (const win of targetWindows) {
      console.log(`[maximize] Focus window:`, win)
      windowManager.focusWindow(win.hwnd)
    }

    // 第二步：延迟一段时间后再排列窗口
    setTimeout(() => {
      for (let idx = 0; idx < count; idx++) {
        const win = targetWindows[idx]
        const row = Math.floor(idx / cols)
        const col = idx % cols
        const w = Math.floor(area.width / cols)
        const h = Math.floor(area.height / rows)
        const pos = { x: area.x + col * w, y: area.y + row * h, width: w - 10, height: h - 10 }
        console.log(`[maximize] Arrange window #${idx}:`, win, '→', pos)
        windowManager.setWindowPosition(win.hwnd, pos)
      }
    }, 100)
  })

  mainWindow.on('closed', () => {
    runtimeLog('mainWindow:closed')
    mainWindow = null
  })
}

// Initialize app
app.whenReady().then(() => {
  runtimeLog('app:whenReady')
  environmentManager.resetRunningStatuses()
  createWindow()

  app.on('activate', () => {
    runtimeLog('app:activate')
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  runtimeLog('app:window-all-closed')
  environmentManager.closeAllBrowsers()
  if (process.platform !== 'darwin') {
    runtimeLog('app:quit')
    app.quit()
  }
})

app.on('before-quit', () => {
  runtimeLog('app:before-quit')
})

app.on('render-process-gone', (_event, webContents, details) => {
  runtimeLog('app:render-process-gone', { webContentsId: webContents.id, details })
})

app.on('child-process-gone', (_event, details) => {
  runtimeLog('app:child-process-gone', details)
})

process.on('uncaughtException', (error) => {
  runtimeLog('process:uncaughtException', { message: error.message, stack: error.stack })
})

process.on('unhandledRejection', (reason) => {
  runtimeLog('process:unhandledRejection', reason)
})

// ==================== IPC Handlers ====================

// --- Environment management ---
ipcMain.handle('get-environments', () => {
  return storageService.getEnvironments()
})

ipcMain.handle('create-environment', (_, data) => {
  const validation = validateIPC('create-environment', data)
  if (!validation.success) throw new Error(validation.error)
  return environmentManager.createEnvironment(validation.data)
})

ipcMain.handle('update-environment', (_, id, data) => {
  const validation = validateIPC('update-environment', { id, ...data })
  if (!validation.success) throw new Error(validation.error)
  return environmentManager.updateEnvironment(id, validation.data)
})

ipcMain.handle('delete-environment', (_, id) => {
  const validation = validateIPC('delete-environment', { id })
  if (!validation.success) throw new Error(validation.error)
  return environmentManager.deleteEnvironment(id)
})

// --- Browser operations ---
ipcMain.handle('launch-browser', async (_, envId) => {
  const validation = validateIPC('launch-browser', { envId })
  if (!validation.success) throw new Error(validation.error)
  const launched = await environmentManager.launchBrowser(envId)
  refreshFloatingToolbarVisibility()
  return launched
})

ipcMain.handle('close-browser', (_, envId) => {
  const validation = validateIPC('close-browser', { envId })
  if (!validation.success) throw new Error(validation.error)
  const closed = environmentManager.closeBrowser(envId)
  refreshFloatingToolbarVisibility()
  return closed
})

ipcMain.handle('get-browser-status', (_, envId) => {
  return launchService.isRunning(envId)
})

// --- Sync operations ---
ipcMain.handle('start-sync', async (_, params) => {
  runtimeLog('ipc:start-sync', params)
  const validation = validateIPC('start-sync', params)
  if (!validation.success) throw new Error(validation.error)
  const started = await syncController.start(validation.data)

  if (started) {
    refreshFloatingToolbarVisibility()
  } else {
    refreshFloatingToolbarVisibility()
  }

  return started
})

ipcMain.handle('stop-sync', () => {
  runtimeLog('ipc:stop-sync')
  syncController.stop()
  refreshFloatingToolbarVisibility()
  return true
})

ipcMain.handle('get-sync-state', () => {
  return syncController.getState()
})

ipcMain.handle('close-all', () => {
  const closed = environmentManager.closeAllBrowsers()
  closeFloatingToolbarWindow()
  return closed
})

ipcMain.handle('floating-toolbar-arrange', async () => {
  return invokeWindowActionForRunningEnvs('windows-arrange')
})

ipcMain.handle('floating-toolbar-maximize', async () => {
  return invokeWindowActionForRunningEnvs('windows-maximize')
})

ipcMain.handle('floating-toolbar-minimize', async () => {
  return invokeWindowActionForRunningEnvs('windows-minimize')
})

ipcMain.handle('floating-toolbar-toggle-sync', async () => {
  if (syncController.isActive()) {
    syncController.stop()
    refreshFloatingToolbarVisibility()
    return true
  }

  const envIds = getRunningEnvIds()
  if (envIds.length < 2) {
    refreshFloatingToolbarVisibility()
    return false
  }

  const started = await syncController.start({ envIds })
  refreshFloatingToolbarVisibility()
  return started
})

ipcMain.handle('floating-toolbar-close-all', () => {
  if (syncController.isActive()) {
    syncController.stop()
  }
  const closed = environmentManager.closeAllBrowsers()
  closeFloatingToolbarWindow()
  return closed
})

// --- Settings ---
ipcMain.handle('get-settings', () => {
  return storageService.getSettings()
})

ipcMain.handle('save-settings', (_, settings) => {
  const validation = validateIPC('save-settings', settings)
  if (!validation.success) throw new Error(validation.error)
  storageService.saveSettings(settings)
  return true
})

// --- Plugin management ---
ipcMain.handle('plugins-list', () => {
  return pluginCatalogService.buildPluginListItems({
    suppressedByEnv: pluginInstallService.getSuppressedByEnvironment(),
  })
})

ipcMain.handle('plugins-backend-proof', () => {
  return pluginInstallService.ensureBackendProof()
})

ipcMain.handle('plugins-open-store', () => {
  return pluginStoreWindowService.openStore()
})

ipcMain.handle('plugins-current-store-detail', () => {
  return pluginStoreWindowService.getCurrentDetail()
})

ipcMain.handle('plugins-install-current-store', () => {
  return pluginStoreWindowService.installCurrentDetail()
})

ipcMain.handle('plugins-install', (_, payload) => {
  const validation = validateIPC('plugins-install', payload)
  if (!validation.success) throw new Error(validation.error)
  return pluginInstallService.installFromStore(validation.data)
})

ipcMain.handle('plugins-uninstall', (_, payload) => {
  const validation = validateIPC('plugins-uninstall', payload)
  if (!validation.success) throw new Error(validation.error)
  pluginInstallService.uninstallFromApp(validation.data.pluginId)
  return true
})

ipcMain.handle('plugins-reinstall-missing', (_, payload) => {
  const validation = validateIPC('plugins-reinstall-missing', payload)
  if (!validation.success) throw new Error(validation.error)
  pluginInstallService.reinstallMissingOnly(validation.data.pluginId)
  return true
})

// --- Get main window ---
ipcMain.handle('get-main-window', () => {
  return mainWindow
})

// ==================== Groups（接入 StorageService）====================
ipcMain.handle('get-groups', () => {
  return storageService.getGroups()
})

ipcMain.handle('groups-create', (_, data) => {
  const validation = validateIPC('groups-create', data)
  if (!validation.success) throw new Error(validation.error)
  const group = {
    id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: data.name,
    color: data.color || '#3b82f6',
    order: storageService.getGroups().length,
    createdAt: new Date().toISOString(),
  }
  storageService.addGroup(group)
  activityLogService.log({ envId: 'system', action: 'create', details: `创建分组: ${group.name}` })
  return group
})

ipcMain.handle('groups-update', (_, data) => {
  const validation = validateIPC('groups-update', data)
  if (!validation.success) throw new Error(validation.error)
  storageService.updateGroup(data.id, data)
  return true
})

ipcMain.handle('groups-delete', (_, data) => {
  storageService.deleteGroup(data.id)
  return true
})

// ==================== ProxyGroups（代理分组独立）====================
ipcMain.handle('get-proxy-groups', () => {
  return storageService.getProxyGroups()
})

ipcMain.handle('proxy-groups-create', (_, data) => {
  const validation = validateIPC('proxy-groups-create', data)
  if (!validation.success) throw new Error(validation.error)
  const group: any = {
    id: `pgrp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: data.name,
    color: data.color || '#3b82f6',
    order: storageService.getProxyGroups().length,
    createdAt: new Date().toISOString(),
  }
  storageService.addProxyGroup(group)
  activityLogService.log({ envId: 'system', action: 'create', details: `创建代理分组: ${group.name}` })
  return group
})

ipcMain.handle('proxy-groups-update', (_, data) => {
  const validation = validateIPC('proxy-groups-update', data)
  if (!validation.success) throw new Error(validation.error)
  storageService.updateProxyGroup(data.id, data)
  activityLogService.log({ envId: 'system', action: 'update', details: `更新代理分组: ${data.name || data.id}` })
  return true
})

ipcMain.handle('proxy-groups-delete', (_, data) => {
  const validation = validateIPC('proxy-groups-delete', data)
  if (!validation.success) throw new Error(validation.error)
  storageService.deleteProxyGroup(data.id)
  activityLogService.log({ envId: 'system', action: 'delete', details: `删除代理分组: ${data.id}` })
  return true
})

// ==================== Proxies（接入 StorageService）====================
ipcMain.handle('get-proxies', () => {
  return storageService.getProxies()
})

ipcMain.handle('proxies-create', (_, data) => {
  const validation = validateIPC('proxies-create', data)
  if (!validation.success) throw new Error(validation.error)
  const proxy: any = {
    status: 'unchecked' as const,
    createdAt: new Date().toISOString(),
    ...data,
    // 优先使用前端传入的 id，避免主进程重复生成导致 id 不一致
    id: data.id || `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }
  // groupId 为空字符串时清除（表示不分组）
  if (proxy.groupId === '') delete proxy.groupId
  storageService.addProxy(proxy)
  return proxy
})

ipcMain.handle('proxies-update', (_, data) => {
  const validation = validateIPC('proxies-update', data)
  if (!validation.success) throw new Error(validation.error)
  storageService.updateProxy(data.id, data)
  return true
})

ipcMain.handle('proxies-delete', (_, data) => {
  const validation = validateIPC('proxies-delete', data)
  if (!validation.success) throw new Error(validation.error)
  storageService.deleteProxy(data.id)
  return true
})

/** 代理连通性检测 */
ipcMain.handle('proxy-test', async (_, params) => {
  const proxyId = params?.id
  if (!proxyId) throw new Error('Missing proxy id')

  const proxies = storageService.getProxies()
  const proxy = proxies.find(p => p.id === proxyId)
  if (!proxy) throw new Error(`Proxy ${proxyId} not found`)

  // 尝试通过代理建立 TCP 连接来检测可用性
  try {
    const net = require('net') as typeof import('net')
    const socket = new net.Socket()
    const timeout = new Promise<{ status: string; latency: number }>((resolve) => {
      const start = Date.now()
      const timer = setTimeout(() => {
        socket.destroy()
        resolve({ status: 'unavailable', latency: -1 })
      }, 5000)

      socket.on('connect', () => {
        clearTimeout(timer)
        const latency = Date.now() - start
        socket.destroy()
        resolve({ status: 'available', latency })
      })

      socket.on('error', () => {
        clearTimeout(timer)
        resolve({ status: 'unavailable', latency: -1 })
      })
    })

    // 根据代理类型连接
    const port = proxy.port
    const host = proxy.host
    socket.connect(port, host)

    const result = await timeout

    // 更新代理状态
    storageService.updateProxy(proxyId, {
      status: result.status as any,
      lastCheck: new Date().toISOString(),
    })

    eventBus.emit('proxy-tested', { proxyId, ...result })
    return result
  } catch (error: any) {
    console.error('[ProxyTest] Error:', error)
    storageService.updateProxy(proxyId, {
      status: 'unavailable',
      lastCheck: new Date().toISOString(),
    })
    return { status: 'unavailable' as const, latency: -1 }
  }
})

// ==================== Templates（接入 StorageService）====================
ipcMain.handle('get-templates', () => {
  return storageService.getTemplates()
})

ipcMain.handle('templates-create', (_, data) => {
  const now = new Date().toISOString()
  const template = {
    ...data,
    id: `tpl_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  }
  storageService.addTemplate(template)
  return template
})

ipcMain.handle('templates-update', (_, data) => {
  storageService.updateTemplate(data.id, { ...data, updatedAt: new Date().toISOString() })
  return true
})

ipcMain.handle('templates-delete', (_, data) => {
  storageService.deleteTemplate(data.id)
  return true
})

// ==================== Scripts（接入 ScriptManager）====================
ipcMain.handle('get-scripts', () => {
  return scriptManager.getAll()
})

ipcMain.handle('scripts-create', (_, data) => {
  const result = scriptManager.create(data)
  activityLogService.log({ envId: 'system', action: 'create', details: `创建脚本: ${result.name}` })
  return result
})

ipcMain.handle('scripts-update', (_, data) => {
  scriptManager.update(data.id, data)
  return true
})

ipcMain.handle('scripts-delete', (_, data) => {
  scriptManager.delete(data.id)
  return true
})

/** 开始录制 */
ipcMain.handle('start-record', async (_) => {
  // 获取第一个运行中的环境的 CDP 端口
  const envs = storageService.getEnvironments().filter(e => e.status === 'running')
  if (envs.length === 0) throw new Error('No running browser to record')

  const targetEnv = envs[0]
  const success = await scriptManager.startRecord(targetEnv.id, targetEnv.cdpPort)
  return success
})

/** 停止录制 */
ipcMain.handle('stop-record', async (_) => {
  const script = await scriptManager.stopRecord()
  return script || { id: '', name: '', steps: [], createdAt: '', updatedAt: '' }
})

/** 运行脚本 */
ipcMain.handle('run-script', async (_, params) => {
  const { scriptId, envId } = params || {}
  if (!scriptId || !envId) throw new Error('Missing scriptId or envId')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment not running or no CDP port')
  if (env.status !== 'running') throw new Error('Environment is not running')

  return scriptManager.playScript(scriptId, envId, env.cdpPort)
})

// ==================== Cookie 管理（CookieManager + CDP）====================

/** 获取环境 Cookie */
ipcMain.handle('cookie-get', async (_, params) => {
  const envId = params?.envId
  if (!envId) throw new Error('Missing envId')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')
  if (env.status !== 'running') throw new Error('Browser is not running')

  return cookieManager.getAllCookies(env.cdpPort)
})

/** 设置 Cookie */
ipcMain.handle('cookie-set', async (_, params) => {
  const { envId, cookies } = params || {}
  if (!envId) throw new Error('Missing envId')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')
  if (env.status !== 'running') throw new Error('Browser is not running')

  if (Array.isArray(cookies)) {
    return cookieManager.importCookies(env.cdpPort, cookies)
  }
  return cookieManager.setCookie(env.cdpPort, cookies)
})

/** 导入 Cookie */
ipcMain.handle('cookie-import', async (_, params) => {
  const { envId, cookies } = params || {}
  if (!envId || !Array.isArray(cookies)) throw new Error('Invalid params')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')

  const result = await cookieManager.importCookies(env.cdpPort, cookies)
  activityLogService.log({ envId, action: 'cookie_import', details: `导入 ${result.success} 个 Cookie` })
  return result
})

/** 导出 Cookie */
ipcMain.handle('cookie-export', async (_, params) => {
  const { envId } = params || {}
  if (!envId) throw new Error('Missing envId')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')

  const cookies = await cookieManager.exportCookies(env.cdpPort)
  activityLogService.log({ envId, action: 'cookie_export', details: `导出 ${cookies.length} 个 Cookie` })
  return cookies
})

/** 删除单个 Cookie */
ipcMain.handle('cookie-delete', async (_, params) => {
  const { envId, name, domain } = params || {}
  if (!envId || !name) throw new Error('Missing envId or cookie name')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')
  if (env.status !== 'running') throw new Error('Browser is not running')

  return cookieManager.deleteCookie(env.cdpPort, name, domain || '')
})

/** 清空所有 Cookie */
ipcMain.handle('cookie-clear', async (_, params) => {
  const { envId } = params || {}
  if (!envId) throw new Error('Missing envId')

  const env = storageService.getEnvironments().find(e => e.id === envId)
  if (!env?.cdpPort) throw new Error('Environment has no CDP port')
  if (env.status !== 'running') throw new Error('Browser is not running')

  const cookies = await cookieManager.getAllCookies(env.cdpPort)
  let deleted = 0
  for (const c of cookies) {
    try {
      await cookieManager.deleteCookie(env.cdpPort, c.name, c.domain || '')
      deleted++
    } catch { /* ignore individual errors */ }
  }
  activityLogService.log({ envId, action: 'cookie_clear', details: `清空 ${deleted} 个 Cookie` })
  return { deleted }
})

// ==================== 窗口管理（WindowManager）====================
ipcMain.handle('windows-maximize', async (_, params) => {
  const { envIds } = params || {}
  if (!Array.isArray(envIds)) throw new Error('Missing envIds')

  for (const envId of envIds) {
    const pid = launchService.getPid(envId)
    if (!pid) continue
    const windows = windowManager.findWindowByPid(pid)
    for (const win of windows) {
      windowManager.showWindow(win.hwnd, 'maximize')
    }
  }
  return true
})

ipcMain.handle('windows-minimize', async (_, params) => {
  const { envIds } = params || {}
  if (!Array.isArray(envIds)) throw new Error('Missing envIds')

  for (const envId of envIds) {
    const pid = launchService.getPid(envId)
    if (!pid) continue
    const windows = windowManager.findWindowByPid(pid)
    for (const win of windows) {
      windowManager.showWindow(win.hwnd, 'minimize')
    }
  }
  return true
})

ipcMain.handle('windows-restore', async (_, params) => {
  const { envIds } = params || {}
  if (!Array.isArray(envIds)) throw new Error('Missing envIds')

  for (const envId of envIds) {
    const pid = launchService.getPid(envId)
    if (!pid) continue
    const windows = windowManager.findWindowByPid(pid)
    for (const win of windows) {
      windowManager.showWindow(win.hwnd, 'restore')
    }
  }
  return true
})

ipcMain.handle('windows-arrange', async (_, params) => {
  runtimeLog('ipc:windows-arrange:start', params)
  const { mode, envIds } = params || {}

  if (!Array.isArray(envIds) || envIds.length === 0) {
    console.warn('[windows-arrange] Missing or empty envIds')
    runtimeLog('ipc:windows-arrange:skip-empty')
    return false
  }

  // 精确模式：基于启动时记录的 PID 查找窗口（与 maximize/minimize 保持一致）
  const targetWindows: Array<{ hwnd: number, title: string }> = []

  for (const envId of envIds) {
    const pid = launchService.getPid(envId)
    if (!pid) {
      console.warn(`[windows-arrange] No PID found for envId: ${envId}`)
      continue
    }
    const windows = windowManager.findWindowByPid(pid)
    console.log(`[windows-arrange] envId=${envId} pid=${pid} → ${windows.length} window(s)`)
    for (const win of windows) {
      targetWindows.push({ hwnd: win.hwnd, title: win.title })
    }
  }

  console.log(`[windows-arrange] Total ${targetWindows.length} window(s) to arrange`)
  runtimeLog('ipc:windows-arrange:target-windows', { count: targetWindows.length })

  if (targetWindows.length === 0) {
    console.warn('[windows-arrange] No windows found to arrange')
    runtimeLog('ipc:windows-arrange:no-target-windows')
    return false
  }

  const monitors = windowManager.getMonitors()
  const primaryMonitor = monitors.find((m: any) => m.isPrimary) || monitors[0]
  const area = primaryMonitor?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }

  const count = targetWindows.length
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)

  // 第一步：先将所有窗口带到前台
  for (const win of targetWindows) {
    console.log(`[windows-arrange] Focus:`, win)
    windowManager.focusWindow(win.hwnd)
  }

  // 第二步：延迟一段时间后再排列窗口
  setTimeout(() => {
    for (let idx = 0; idx < count; idx++) {
      const win = targetWindows[idx]
      const row = Math.floor(idx / cols)
      const col = idx % cols
      const w = Math.floor(area.width / cols)
      const h = Math.floor(area.height / rows)

      const pos = {
        x: area.x + col * w,
        y: area.y + row * h,
        width: w - 10,
        height: h - 10,
      }
      console.log(`[windows-arrange] #${idx} hwnd=${win.hwnd} title="${win.title}" pos=`, pos)
      windowManager.setWindowPosition(win.hwnd, pos)
    }
    runtimeLog('ipc:windows-arrange:done', { count, mode: mode || 'grid' })
  }, 100)

  return true
})

ipcMain.handle('get-monitors', () => {
  return windowManager.getMonitors()
})

// ==================== 环境导入/导出 ====================
ipcMain.handle('export-environments', async (_, params) => {
  const { envIds } = params || {}
  if (!Array.isArray(envIds) || envIds.length === 0) throw new Error('Missing envIds')

  const allEnvs = storageService.getEnvironments()
  const toExport = allEnvs.filter(e => envIds.includes(e.id)).map(e => ({
    name: e.name,
    fingerprint: e.fingerprint,
    proxy: e.proxy,
    tags: e.tags,
    color: e.color,
    groupId: e.groupId,
  }))
  activityLogService.log({ envId: 'system', action: 'export', details: `导出 ${toExport.length} 个环境` })
  return toExport
})

ipcMain.handle('import-environments', async (_, params) => {
  const { environments: importedEnvs, format } = params || {}
  if (!Array.isArray(importedEnvs)) throw new Error('Invalid import data')
  if (importedEnvs.length > 500) throw new Error('Max 500 environments per import')
  if (importedEnvs.length === 0) throw new Error('No data to import')

  let created = 0
  for (const item of importedEnvs) {
    // 沙箱校验：字段长度限制 + 危险键清理
    const safeName = (item.name || '').toString().slice(0, 100)
    if (!safeName.trim()) continue

    const env = environmentManager.createEnvironment({
      name: safeName,
      fingerprint: item.fingerprint || {},
      proxy: item.proxy,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      color: item.color,
      groupId: item.groupId,
    })
    if (env) created++
  }

  activityLogService.log({ envId: 'system', action: 'import', details: `导入 ${created} 个环境 (${format || 'json'})` })
  return { imported: created, total: importedEnvs.length }
})

// ==================== Activity Logs ====================
ipcMain.handle('activity-logs', (_, params) => {
  const validation = validateIPC('activity-logs', params || {})
  if (!validation.success) throw new Error(validation.error)
  return activityLogService.query(params ? { envId: params.envId, limit: params.limit } : undefined)
})

// ==================== Batch Operations (P1#5) ====================
ipcMain.handle('batch-launch', async (_, params) => {
  const validation = validateIPC('batch-launch', params)
  if (!validation.success) throw new Error(validation.error)
  const result = await environmentManager.batchLaunch(params.envIds)
  refreshFloatingToolbarVisibility()
  return result
})

ipcMain.handle('batch-close', async (_, params) => {
  const validation = validateIPC('batch-close', params)
  if (!validation.success) throw new Error(validation.error)
  const result = await environmentManager.batchClose(params.envIds)
  refreshFloatingToolbarVisibility()
  return result
})

// ==================== App Lifecycle ====================
app.on('before-quit', () => {
  runtimeLog('app:before-quit:shutdown-activity-log')
  activityLogService.shutdown()
})

export { mainWindow }
