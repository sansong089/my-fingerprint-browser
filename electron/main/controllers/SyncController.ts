/**
 * SyncController — 基于 Win32 原生 hook 的窗口同步控制器
 */
import { eventBus } from '../managers/BrowserEventBus'
import { launchService } from '../services/LaunchService'
import { windowManager } from '../managers/WindowManager'
import { syncExtensionService } from '../services/SyncExtensionService'

export interface SyncOptions {
  envIds: string[]
}

export interface SyncState {
  active: boolean
  envIds: string[]
  mainEnvId: string | null
  mirrorEnvIds: string[]
  mainHwnd: number | null
  mirrorHwnds: number[]
  startedAt: string | null
}

class SyncController {
  private state: SyncState = {
    active: false,
    envIds: [],
    mainEnvId: null,
    mirrorEnvIds: [],
    mainHwnd: null,
    mirrorHwnds: [],
    startedAt: null,
  }

  async start(_options: SyncOptions): Promise<boolean> {
    const envIds = Array.from(new Set((_options.envIds || []).filter(Boolean)))
    if (envIds.length < 2) {
      console.warn('[SyncController] At least two environments are required for sync')
      return false
    }

    this.stop()

    const participants = this.resolveParticipants(envIds)
    if (participants.length < 2) {
      console.warn('[SyncController] Not enough browser windows to start sync')
      return false
    }

    const hwnds = participants.map(item => item.hwnd)

    for (const hwnd of hwnds) {
      windowManager.showWindow(hwnd, 'restore')
    }

    const arranged = windowManager.arrangeWindows(hwnds, this.calculateGridPositions(hwnds.length))
    if (!arranged) {
      console.warn('[SyncController] Failed to arrange windows before sync')
      return false
    }

    await new Promise(resolve => setTimeout(resolve, 150))

    const main = participants[0]
    const mirrors = participants.slice(1)
    const started = windowManager.startWindowSync(main.hwnd, mirrors.map(item => item.hwnd))
    if (!started) {
      console.warn('[SyncController] Native window sync failed to start')
      return false
    }

    this.state = {
      active: true,
      envIds: participants.map(item => item.envId),
      mainEnvId: main.envId,
      mirrorEnvIds: mirrors.map(item => item.envId),
      mainHwnd: main.hwnd,
      mirrorHwnds: mirrors.map(item => item.hwnd),
      startedAt: new Date().toISOString(),
    }
    syncExtensionService.resetQueues()

    eventBus.emit('browser-event', {
      type: 'sync-event',
      data: { action: 'started', state: this.getState() },
    })

    return true
  }

  stop(): void {
    if (windowManager.getWindowSyncState?.().active) {
      try {
        windowManager.stopWindowSync()
      } catch (error) {
        console.warn('[SyncController] Failed to stop native sync cleanly:', error)
      }
    }

    if (!this.state.active) {
      this.resetState()
      return
    }

    this.resetState()
    syncExtensionService.resetQueues()
    eventBus.emit('browser-event', {
      type: 'sync-event',
      data: { action: 'stopped' },
    })
  }

  isActive(): boolean {
    return this.state.active
  }

  getState(): SyncState {
    return { ...this.state, envIds: [...this.state.envIds], mirrorEnvIds: [...this.state.mirrorEnvIds], mirrorHwnds: [...this.state.mirrorHwnds] }
  }

  private resetState(): void {
    this.state = {
      active: false,
      envIds: [],
      mainEnvId: null,
      mirrorEnvIds: [],
      mainHwnd: null,
      mirrorHwnds: [],
      startedAt: null,
    }
  }

  private resolveParticipants(envIds: string[]): Array<{ envId: string; hwnd: number }> {
    const participants: Array<{ envId: string; hwnd: number }> = []

    for (const envId of envIds) {
      const pid = launchService.getPid(envId)
      if (!pid) continue

      const windows = (windowManager.findWindowByPid(pid) || []).filter((item: any) => item?.hwnd)
      const visibleWindow = windows.find((item: any) => item.isVisible) || windows[0]
      if (!visibleWindow) continue

      participants.push({ envId, hwnd: visibleWindow.hwnd })
    }

    return participants
  }

  private calculateGridPositions(count: number): Array<{ x: number; y: number; width: number; height: number }> {
    const monitors = windowManager.getMonitors()
    const primaryMonitor = monitors.find((monitor: any) => monitor.isPrimary) || monitors[0]
    const area = primaryMonitor?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellWidth = Math.floor(area.width / cols)
    const cellHeight = Math.floor(area.height / rows)

    return Array.from({ length: count }, (_, idx) => {
      const row = Math.floor(idx / cols)
      const col = idx % cols
      return {
        x: area.x + col * cellWidth,
        y: area.y + row * cellHeight,
        width: cellWidth - 10,
        height: cellHeight - 10,
      }
    })
  }
}

export const syncController = new SyncController()
export default SyncController
