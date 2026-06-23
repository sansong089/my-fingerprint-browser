import { spawn, ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { storageService, Environment, FingerprintConfig } from './StorageService'
import { eventBus } from '../managers/BrowserEventBus'
import { syncExtensionService } from './SyncExtensionService'

const WINDOWS_SAFE_COMMAND_LINE_LENGTH = 28000
const CJK_FONT_FAMILIES: Record<string, Record<string, string>> = {
  Hans: { standard: 'Microsoft YaHei', serif: 'SimSun', sansserif: 'Microsoft YaHei', fixed: 'Microsoft YaHei UI' },
  Hant: { standard: 'Microsoft JhengHei', serif: 'PMingLiU', sansserif: 'Microsoft JhengHei', fixed: 'Microsoft JhengHei UI' },
  Jpan: { standard: 'Yu Gothic', serif: 'Yu Mincho', sansserif: 'Yu Gothic', fixed: 'MS Gothic' },
  Kore: { standard: 'Malgun Gothic', serif: 'Batang', sansserif: 'Malgun Gothic', fixed: 'Gulim' },
}

export interface LaunchOptions {
  userDataDir: string
  cdpPort: number
  fingerprint: FingerprintConfig
  proxy?: string
  url?: string
  syncExtensionDir?: string
  managedExtensionDirs?: string[]
  launchMode?: 'cdp' | 'standard'
}

export interface LaunchSpec {
  browserPath: string
  args: string[]
  command: string
}

export interface EnvironmentRuntimeInfo {
  isRunning: boolean
  launchMode: 'cdp' | 'standard' | null
  pid: number | null
  cdpPort: number | null
}

class LaunchService {
  private processes: Map<string, ChildProcess> = new Map()
  private lastLaunchCommands: Map<string, string> = new Map()
  private launchModes: Map<string, 'cdp' | 'standard'> = new Map()
  private browserPath: string = ''

  constructor() {
    this.detectBrowserPath()
  }

  // 检测浏览器路径
  private detectBrowserPath() {
    const settings = storageService.getSettings()
    
    // 如果用户指定了路径
    if (settings.browserPath && existsSync(settings.browserPath)) {
      this.browserPath = settings.browserPath
      return
    }

    // 自动检测常见浏览器路径
    const possiblePaths = this.getPossibleBrowserPaths()
    
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        this.browserPath = p
        console.log('Found browser:', p)
        return
      }
    }

    // 尝试使用系统默认浏览器
    if (process.platform === 'win32') {
      const winChromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
      for (const p of winChromePaths) {
        if (existsSync(p)) {
          this.browserPath = p
          console.log('Using system Chrome/Edge:', p)
          return
        }
      }
    }
    
    // 尝试 macOS
    if (process.platform === 'darwin') {
      const macPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      for (const p of macPaths) {
        if (existsSync(p)) {
          this.browserPath = p
          return
        }
      }
    }
  }

  private getPossibleBrowserPaths(): string[] {
    const appData = app.getPath('appData')
    const appPath = app.getAppPath()
    const embeddedBrowserPaths = [
      join(process.resourcesPath, 'fingerprint-chromium', 'chrome.exe'),
      join(appPath, 'vendor', 'fingerprint-chromium', 'chrome.exe'),
      join(process.cwd(), 'vendor', 'fingerprint-chromium', 'chrome.exe'),
    ]
    
    if (process.platform === 'win32') {
      return [
        ...embeddedBrowserPaths,
        join(appData, 'Local', 'fingerprint-chromium', 'chrome.exe'),
        join(appData, 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(appData, 'Programs', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(dirname(appPath), 'chromium', 'chrome.exe'),
      ]
    } else if (process.platform === 'darwin') {
      return [
        '/Applications/Fingerprint Chromium.app/Contents/MacOS/Fingerprint Chromium',
        join(appData, 'fingerprint-chromium', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ]
    } else {
      return [
        join(appData, 'fingerprint-chromium', 'chrome'),
        '/usr/bin/fingerprint-chromium',
      ]
    }
  }

  /** Read the bundled fingerprint-chromium version from vendor/.version */
  private getBundledBrandVersion(): string {
    try {
      const vendorDir = join(process.cwd(), 'vendor', 'fingerprint-chromium')
      const versionFile = join(vendorDir, '.version')
      if (existsSync(versionFile)) {
        return readFileSync(versionFile, 'utf-8').trim()
      }
      const appVendorDir = join(app.getAppPath(), 'vendor', 'fingerprint-chromium')
      const appVersionFile = join(appVendorDir, '.version')
      if (existsSync(appVersionFile)) {
        return readFileSync(appVersionFile, 'utf-8').trim()
      }
    } catch { }
    return ''
  }
  // 构建启动参数
  buildArgs(options: LaunchOptions): string[] {
    const args: string[] = []
    const fp = options.fingerprint
    const launchMode = options.launchMode || 'standard'

    // 基础参数
    args.push(`--user-data-dir=${options.userDataDir}`)
    if (launchMode === 'cdp') {
      args.push(`--remote-debugging-port=${options.cdpPort}`)
      // 安全：CDP 仅监听本地（P1 风险修复）
      args.push('--remote-debugging-address=127.0.0.1')
    }
    args.push(`--no-first-run`)
    args.push(`--no-default-browser-check`)
    
    // 指纹参数
    if (fp.seed) {
      args.push(`--fingerprint=${fp.seed}`)
    }
    if (fp.platform) {
      args.push(`--fingerprint-platform=${fp.platform}`)
    }
    if (fp.platformVersion) {
      args.push(`--fingerprint-platform-version=${fp.platformVersion}`)
    }
    if (fp.brand) {
      args.push(`--fingerprint-brand=${fp.brand}`)
    }
    const brandVersion = fp.brandVersion || this.getBundledBrandVersion()
    if (brandVersion) {
      args.push(`--fingerprint-brand-version=${brandVersion}`)
    }
    if (fp.hardwareConcurrency) {
      args.push(`--fingerprint-hardware-concurrency=${fp.hardwareConcurrency}`)
    }
    if (fp.timezone) {
      args.push(`--timezone=${fp.timezone}`)
    }
    if (fp.lang) {
      args.push(`--lang=${fp.lang}`)
      args.push(`--accept-lang=${fp.lang}`)
    }
    if (fp.disabledSpoofing?.length) {
      args.push(`--disable-spoofing=${fp.disabledSpoofing.join(',')}`)
    }
    
    // 代理
    if (options.proxy) {
      args.push(`--proxy-server=${options.proxy}`)
      args.push(`--disable-non-proxied-udp`)
    }

    // WebRTC
    args.push(`--disable-webrtc-foreground-indicator`)
    
    // 自动化检测
    args.push(`--disable-detection-forms`)
    args.push(`--avoid-edge-touches-activation`)

    const extensionDirs = [
      ...(options.syncExtensionDir ? [options.syncExtensionDir] : []),
      ...((options.managedExtensionDirs || []).filter(Boolean)),
    ]
    if (extensionDirs.length) {
      args.push(`--load-extension=${extensionDirs.join(',')}`)
    }
    
    // 默认URL
    if (options.url) {
      args.push(options.url)
    } else {
      args.push('--about')
    }

    return args
  }

  private ensureCJKProfilePreferences(userDataDir: string, lang?: string): void {
    if (!lang || !/^(zh|ja|ko)\b/i.test(lang)) {
      return
    }

    try {
      const defaultProfileDir = join(userDataDir, 'Default')
      const preferencesPath = join(defaultProfileDir, 'Preferences')
      mkdirSync(defaultProfileDir, { recursive: true })

      let preferences: any = {}
      if (existsSync(preferencesPath)) {
        const raw = readFileSync(preferencesPath, 'utf8').trim()
        if (raw) {
          preferences = JSON.parse(raw)
        }
      }

      const acceptLangs = ['zh-CN', 'zh', 'en-US', 'en']
      if (/^ja\b/i.test(lang)) acceptLangs.unshift('ja')
      if (/^ko\b/i.test(lang)) acceptLangs.unshift('ko')
      if (!acceptLangs.includes(lang)) acceptLangs.unshift(lang)

      preferences.intl = {
        ...(preferences.intl || {}),
        accept_languages: acceptLangs.join(','),
      }

      const webprefs = {
        ...(preferences.webkit?.webprefs || {}),
      }
      const fonts = {
        ...(webprefs.fonts || {}),
      }

      for (const [script, families] of Object.entries(CJK_FONT_FAMILIES)) {
        for (const [fontType, family] of Object.entries(families)) {
          fonts[fontType] = {
            ...(fonts[fontType] || {}),
            [script]: family,
          }
        }
      }

      preferences.webkit = {
        ...(preferences.webkit || {}),
        webprefs: {
          ...webprefs,
          fonts,
        },
      }

      writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8')
    } catch (error) {
      console.error('[LaunchService] Failed to write CJK profile preferences:', error)
    }
  }

  private quoteCommandPart(part: string): string {
    if (!part) return '""'
    if (!/[\s"]/.test(part)) return part
    return `"${part.replace(/"/g, '\\"')}"`
  }

  private formatCommand(command: string, args: string[]): string {
    return [command, ...args].map(part => this.quoteCommandPart(part)).join(' ')
  }

  private resolveBrowserPath(): string | null {
    const browserPath = this.browserPath
    if (!browserPath) {
      console.error('ERROR: Browser path not found. Configure a browser path in Settings.')
      return null
    }

    if (!existsSync(browserPath)) {
      console.error('ERROR: Browser not found at:', browserPath)
      console.log('Please configure correct browser path in Settings.')
      return null
    }

    return browserPath
  }

  createLaunchSpec(options: LaunchOptions): LaunchSpec | null {
    const browserPath = this.resolveBrowserPath()
    if (!browserPath) {
      return null
    }

    const args = this.buildArgs(options)
    const command = this.formatCommand(browserPath, args)

    if (process.platform === 'win32' && command.length > WINDOWS_SAFE_COMMAND_LINE_LENGTH) {
      console.error(
        `ERROR: Browser launch command is too long (${command.length} chars). ` +
        'Reduce enabled plugins or shorten the application data path.'
      )
      return null
    }

    return {
      browserPath,
      args,
      command,
    }
  }

  private waitForProcessStable(proc: ChildProcess, timeoutMs = 500): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false

      const finish = (result: boolean) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      const cleanup = () => {
        proc.removeListener('error', onError)
        proc.removeListener('exit', onExit)
      }

      const onError = () => finish(false)
      const onExit = () => finish(false)

      proc.once('error', onError)
      proc.once('exit', onExit)

      setTimeout(() => finish(true), timeoutMs)
    })
  }

  // 等待 CDP 就绪（轮询检测，替代原来的 setTimeout 1000ms 硬等）
  async waitForCDPReady(port: number, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`)
        if (res.ok) {
          console.log(`[LaunchService] CDP ready on port ${port}`)
          return true
        }
      } catch { /* not ready yet */ }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    console.error(`[LaunchService] CDP not ready on port ${port} after ${timeoutMs}ms`)
    return false
  }

  // 启动浏览器
  async launch(envId: string, options: LaunchOptions): Promise<boolean> {
    // 如果已经有进程在运行，先关闭
    if (this.processes.has(envId)) {
      this.close(envId)
    }

    let syncExtensionDir = ''
    try {
      syncExtensionDir = await syncExtensionService.prepareExtension(envId)
    } catch (error) {
      console.error('[LaunchService] Failed to prepare sync extension. Browser launch aborted:', error)
      return false
    }

    const launchMode = options.launchMode || 'standard'
    this.ensureCJKProfilePreferences(options.userDataDir, options.fingerprint.lang)
    const launchSpec = this.createLaunchSpec({ ...options, syncExtensionDir, launchMode })
    if (!launchSpec) {
      return false
    }

    const { browserPath, args: spawnArgs, command: launchCommand } = launchSpec
    this.lastLaunchCommands.set(envId, launchCommand)

    console.log('=== Browser Launch ===')
    console.log('Command:', launchCommand)
    console.log('====================')

    const proc = spawn(browserPath, spawnArgs, {
      detached: true,
      stdio: 'ignore'
    })

    proc.unref()
    
    proc.on('error', (err) => {
      console.error('Browser launch error:', err)
    })

    proc.on('exit', (code) => {
      console.log('Browser exited with code:', code)
      this.processes.delete(envId)
      this.lastLaunchCommands.delete(envId)
      this.launchModes.delete(envId)
      // P1#6 修复：通知渲染进程浏览器已退出
      eventBus.emit('browser-event', {
        type: 'closed',
        envId,
        code: code ?? undefined,
      })
    })

    // P1#6：异常崩溃时也通知
    proc.on('disconnect', () => {
      if (this.processes.has(envId)) {
        eventBus.emit('browser-event', { type: 'crashed', envId })
        this.processes.delete(envId)
      }
      this.lastLaunchCommands.delete(envId)
      this.launchModes.delete(envId)
    })

    let launchReady = false
    if (launchMode === 'cdp') {
      // 使用 CDP 端口轮询替代 setTimeout 1000ms 硬等（P0#3 修复）
      launchReady = await this.waitForCDPReady(options.cdpPort)
    } else {
      launchReady = await this.waitForProcessStable(proc)
    }

    if (launchReady) {
      this.processes.set(envId, proc)
      this.launchModes.set(envId, launchMode)
    }

    return launchReady
  }

  // 关闭浏览器
  close(envId: string): boolean {
    const proc = this.processes.get(envId)
    if (proc) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.pid!.toString(), '/f', '/t'])
        } else {
          proc.kill()
        }
        this.processes.delete(envId)
        this.lastLaunchCommands.delete(envId)
        this.launchModes.delete(envId)
        return true
      } catch (e) {
        console.error('Close browser error:', e)
      }
    }
    return false
  }

  // 关闭所有浏览器
  closeAll(): void {
    for (const envId of this.processes.keys()) {
      this.close(envId)
    }
  }

  // 检查浏览器是否在运行
  isRunning(envId: string): boolean {
    const proc = this.processes.get(envId)
    return !!proc && !proc.killed
  }

  // 获取CDP地址
  getCDPAddress(env: Environment): string {
    return `ws://127.0.0.1:${env.cdpPort}`
  }

  /** 获取进程 PID */
  getPid(envId: string): number | undefined {
    const proc = this.processes.get(envId)
    return proc?.pid
  }

  /** 获取最近一次启动命令 */
  getLaunchCommand(envId: string): string | undefined {
    return this.lastLaunchCommands.get(envId)
  }

  getLaunchMode(envId: string): 'cdp' | 'standard' | null {
    return this.launchModes.get(envId) || null
  }

  getRuntimeInfo(envId: string, cdpPort?: number): EnvironmentRuntimeInfo {
    const proc = this.processes.get(envId)
    const launchMode = this.getLaunchMode(envId)
    const isRunning = !!proc && !proc.killed

    return {
      isRunning,
      launchMode,
      pid: isRunning ? proc?.pid ?? null : null,
      cdpPort: isRunning && launchMode === 'cdp' ? cdpPort ?? null : null,
    }
  }

  getRunningEnvironmentIds(): string[] {
    return Array.from(this.processes.entries())
      .filter(([, proc]) => !!proc && !proc.killed)
      .map(([envId]) => envId)
  }
}

export const launchService = new LaunchService()
export default LaunchService
