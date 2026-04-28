import { BrowserWindow } from 'electron'
import { pluginInstallService } from './PluginInstallService'

interface CurrentStoreDetail {
  storeUrl: string
  pluginId: string
  title?: string
}

class PluginStoreWindowService {
  private window: BrowserWindow | null = null
  private currentDetail: CurrentStoreDetail | null = null

  openStore(): { ok: true; storeUrl: string } {
    const storeUrl = this.currentDetail?.storeUrl || 'https://chromewebstore.google.com/'

    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      this.window.loadURL(storeUrl)
      return { ok: true, storeUrl }
    }

    this.window = new BrowserWindow({
      width: 1280,
      height: 900,
      autoHideMenuBar: true,
      title: 'Plugin Store',
      webPreferences: {
        contextIsolation: true,
        sandbox: false,
      },
    })

    this.window.on('closed', () => {
      this.window = null
    })

    const syncCurrentDetail = (url: string, title?: string) => {
      const pluginId = this.extractPluginId(url)
      if (!pluginId) return
      this.currentDetail = { storeUrl: url, pluginId, title }
    }

    this.window.webContents.on('did-navigate', (_event, url) => {
      syncCurrentDetail(url, this.window?.getTitle())
    })
    this.window.webContents.on('did-navigate-in-page', (_event, url) => {
      syncCurrentDetail(url, this.window?.getTitle())
    })
    this.window.webContents.on('page-title-updated', () => {
      if (this.window?.webContents.getURL()) {
        syncCurrentDetail(this.window.webContents.getURL(), this.window.getTitle())
      }
    })

    this.window.loadURL(storeUrl)
    return { ok: true, storeUrl }
  }

  getCurrentDetail(): CurrentStoreDetail | null {
    return this.currentDetail
  }

  installCurrentDetail() {
    if (!this.currentDetail) {
      throw new Error('No Chrome Web Store detail page is active')
    }

    return pluginInstallService.installFromStore({
      storeUrl: this.currentDetail.storeUrl,
      name: this.currentDetail.title,
    })
  }

  private extractPluginId(url: string): string | null {
    const match = url.match(/\/detail\/[^/]+\/([a-z]{32})(?:[/?#]|$)/i)
    return match?.[1]?.toLowerCase() || null
  }
}

export const pluginStoreWindowService = new PluginStoreWindowService()
