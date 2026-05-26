// Environment Manager - manages browser environments
import { storageService, Environment, FingerprintConfig, ProxyConfig } from '../services/StorageService'
import { launchService, type EnvironmentRuntimeInfo } from '../services/LaunchService'
import { activityLogService } from './ActivityLogService'
import { eventBus } from './BrowserEventBus'
import { pluginCatalogService } from '../services/PluginCatalogService'
import { pluginInstallService } from '../services/PluginInstallService'
import { geoLocaleService, type GeoLocaleResult } from '../services/GeoLocaleService'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

class EnvironmentManager {
  constructor() {
    eventBus.on('browser-event', (event) => {
      this.handleBrowserEvent(event)
    })
  }

  resetRunningStatuses(): void {
    const environments = storageService.getEnvironments()

    for (const env of environments) {
      if (env.status === 'running') {
        this.updateEnvironment(env.id, { status: 'stopped' })
      }
    }
  }

  // Get all environments
  getEnvironments(): Environment[] {
    return storageService.getEnvironments()
  }

  // Create new environment
  createEnvironment(data: {
    name: string
    fingerprint: FingerprintConfig
    proxy?: ProxyConfig
    tags?: string[]
    color?: string
    groupId?: string
    cdpPort?: number
  }): Environment {
    const environments = storageService.getEnvironments()
    
    const env: Environment = {
      id: this.generateId(),
      name: data.name || `Environment ${environments.length + 1}`,
      fingerprint: data.fingerprint,
      proxy: data.proxy,
      userDataDir: this.generateUserDataDir(),
      cdpPort: this.resolveCDPPort(data.cdpPort), // 未配置时由主进程分配
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      tags: data.tags || [],
      color: data.color || this.generateColor(),
      status: 'stopped',
      groupId: data.groupId,
    }

    storageService.addEnvironment(env)
    pluginCatalogService.inheritPluginsForEnvironment(env.id)

    // 记录操作日志
    activityLogService.log({ envId: env.id, action: 'create', details: `创建环境: ${env.name}` })

    return env
  }

  // Update environment
  updateEnvironment(id: string, data: Partial<Environment>): Environment | null {
    const environments = storageService.getEnvironments()
    const env = environments.find(e => e.id === id)
    
    if (!env) return null

    const nextData = { ...data }
    if (data.cdpPort !== undefined) {
      nextData.cdpPort = this.resolveCDPPort(data.cdpPort)
    }
    const updated = { ...env, ...nextData, lastUsed: new Date().toISOString() }
    storageService.updateEnvironment(id, updated)
    return updated
  }

  // Delete environment
  deleteEnvironment(id: string): boolean {
    // 先关闭浏览器
    const env = this.getEnvironment(id)
    this.closeBrowser(id)
    if (env) {
      this.cleanupDesktopShortcuts(env)
      pluginInstallService.cleanupEnvironment(id, env.userDataDir)
    }
    storageService.deleteEnvironment(id)
    return true
  }

  // Launch browser
  async launchBrowser(id: string, launchMode: 'cdp' | 'standard' = 'standard'): Promise<boolean> {
    const env = storageService.getEnvironments().find(e => e.id === id)
    if (!env) return false

    const launchConfig = await this.buildLaunchOptionsForEnvironment(env, launchMode)
    const success = await launchService.launch(id, launchConfig.options)

    if (success) {
      this.updateEnvironment(id, { status: 'running', launchedAt: new Date().toISOString() })
      eventBus.emit('browser-event', {
        type: 'launched',
        envId: id,
        pid: launchService.getPid(id),
        cdpPort: launchMode === 'cdp' ? env.cdpPort : undefined,
        launchMode,
      })
      const launchCommand = launchService.getLaunchCommand(id)
      activityLogService.log({
        envId: id,
        action: 'launch',
        details: launchCommand
          ? `启动环境: ${env.name} | 模式: ${launchMode}${this.formatGeoLocaleLog(launchConfig.geoLocale)} | 命令: ${launchCommand}`
          : `启动环境: ${env.name} | 模式: ${launchMode}${this.formatGeoLocaleLog(launchConfig.geoLocale)}`,
      })
    }

    return success
  }

  private async buildLaunchOptionsForEnvironment(
    env: Environment,
    launchMode: 'cdp' | 'standard' = 'standard'
  ) {
    const proxy = env.proxy ? `${env.proxy.type}://${env.proxy.host}:${env.proxy.port}` : undefined
    const pluginLaunchContext = pluginInstallService.getLaunchContextForEnvironment(env.id, env.userDataDir)
    const geoLocale = env.fingerprint.followIpGeo
      ? await this.resolveGeoLocaleForLaunch(env)
      : null
    const launchFingerprint = geoLocale
      ? { ...env.fingerprint, timezone: geoLocale.timezone, lang: geoLocale.lang }
      : env.fingerprint

    return {
      launchMode,
      geoLocale,
      options: {
        userDataDir: env.userDataDir,
        cdpPort: env.cdpPort,
        fingerprint: launchFingerprint,
        proxy,
        managedExtensionDirs: pluginLaunchContext.extensionDirs,
        launchMode,
      },
    }
  }

  async createDesktopShortcut(id: string, launchMode: 'cdp' | 'standard' = 'standard'): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('当前仅支持 Windows 桌面快捷方式')
    }

    const env = this.getEnvironment(id)
    if (!env) {
      throw new Error(`Environment ${id} not found`)
    }

    const launchConfig = await this.buildLaunchOptionsForEnvironment(env, launchMode)
    const launchSpec = launchService.createLaunchSpec(launchConfig.options)
    if (!launchSpec) {
      throw new Error('无法生成启动命令，请先检查浏览器路径配置')
    }

    const desktopDir = app.getPath('desktop')
    const shortcutName = this.sanitizeShortcutFileName(
      launchMode === 'cdp' ? `${env.name} 调试启动 ${env.cdpPort}.lnk` : `${env.name}.lnk`
    )
    const shortcutPath = join(desktopDir, shortcutName)
    this.writeWindowsShortcut({
      shortcutPath,
      targetPath: launchSpec.browserPath,
      argumentsText: launchSpec.args.join(' '),
      workingDirectory: app.getPath('home'),
      description: launchMode === 'cdp'
        ? `${env.name} 调试启动快捷方式`
        : `${env.name} 启动快捷方式`,
      iconLocation: launchSpec.browserPath,
    })

    this.updateEnvironment(id, {
      desktopShortcuts: {
        ...(env.desktopShortcuts || {}),
        [launchMode]: shortcutPath,
      },
    })

    activityLogService.log({
      envId: id,
      action: 'launch',
      details: `创建桌面快捷方式: ${env.name} | 模式: ${launchMode} | 路径: ${shortcutPath} | 命令: ${launchSpec.command}`,
    })

    return shortcutPath
  }

  private sanitizeShortcutFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'environment-shortcut.lnk'
  }

  private cleanupDesktopShortcuts(env: Environment): void {
    if (process.platform !== 'win32') {
      return
    }

    const shortcutPaths = new Set<string>()

    if (env.desktopShortcuts?.standard) {
      shortcutPaths.add(env.desktopShortcuts.standard)
    }
    if (env.desktopShortcuts?.cdp) {
      shortcutPaths.add(env.desktopShortcuts.cdp)
    }

    const removedPaths: string[] = []
    for (const shortcutPath of shortcutPaths) {
      if (!existsSync(shortcutPath)) {
        continue
      }
      unlinkSync(shortcutPath)
      removedPaths.push(shortcutPath)
    }

    if (removedPaths.length > 0) {
      activityLogService.log({
        envId: env.id,
        action: 'delete',
        details: `删除环境时清理桌面快捷方式: ${removedPaths.join(' | ')}`,
      })
    }
  }

  private writeWindowsShortcut(options: {
    shortcutPath: string
    targetPath: string
    argumentsText: string
    workingDirectory: string
    description: string
    iconLocation: string
  }): void {
    const scriptDir = mkdtempSync(join(tmpdir(), 'fingerprint-shortcut-'))
    const scriptPath = join(scriptDir, 'create-shortcut.ps1')

    const escapeSingleQuoted = (value: string) => value.replace(/'/g, "''")
    const script = [
      '$ErrorActionPreference = "Stop"',
      `$shortcutPath = '${escapeSingleQuoted(options.shortcutPath)}'`,
      `$targetPath = '${escapeSingleQuoted(options.targetPath)}'`,
      `$argumentsText = '${escapeSingleQuoted(options.argumentsText)}'`,
      `$workingDirectory = '${escapeSingleQuoted(options.workingDirectory)}'`,
      `$description = '${escapeSingleQuoted(options.description)}'`,
      `$iconLocation = '${escapeSingleQuoted(options.iconLocation)}'`,
      '$wsh = New-Object -ComObject WScript.Shell',
      '$shortcut = $wsh.CreateShortcut($shortcutPath)',
      '$shortcut.TargetPath = $targetPath',
      '$shortcut.Arguments = $argumentsText',
      '$shortcut.WorkingDirectory = $workingDirectory',
      '$shortcut.Description = $description',
      '$shortcut.IconLocation = $iconLocation',
      '$shortcut.Save()',
    ].join('\r\n')

    writeFileSync(scriptPath, script, 'utf8')

    try {
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { encoding: 'utf8', windowsHide: true }
      )

      if (result.status !== 0) {
        const stderr = (result.stderr || '').trim()
        const stdout = (result.stdout || '').trim()
        throw new Error(stderr || stdout || 'PowerShell returned a non-zero exit code')
      }
    } finally {
      rmSync(scriptDir, { recursive: true, force: true })
    }
  }

  private async resolveGeoLocaleForLaunch(env: Environment): Promise<GeoLocaleResult> {
    const settings = storageService.getSettings()
    return geoLocaleService.resolveForLaunch(env.proxy, {
      timezone: settings.defaultTimezone || env.fingerprint.timezone || 'Asia/Shanghai',
      lang: settings.defaultLang || env.fingerprint.lang || 'zh-CN',
    })
  }

  private formatGeoLocaleLog(result: GeoLocaleResult | null): string {
    if (!result) return ''
    if (result.source === 'fallback') {
      return ` | IP归属地: 解析失败，使用默认 ${result.timezone}/${result.lang}`
    }
    const location = result.countryName || result.countryCode || result.ip || 'unknown'
    return ` | IP归属地: ${location} ${result.timezone}/${result.lang}`
  }

  // Close browser
  closeBrowser(id: string): boolean {
    const env = storageService.getEnvironments().find(e => e.id === id)
    const success = launchService.close(id)
    if (success) {
      this.updateEnvironment(id, { status: 'stopped', launchedAt: undefined })
      activityLogService.log({ envId: id, action: 'close', details: `关闭环境: ${env?.name || id}` })
    }
    return success
  }

  // Close all running browsers
  closeAllBrowsers(): boolean {
    const environments = storageService.getEnvironments()

    launchService.closeAll()

    for (const env of environments) {
      if (env.status === 'running') {
        this.updateEnvironment(env.id, { status: 'stopped' })
      }
    }

    return true
  }

  // Get environment by ID
  getEnvironment(id: string): Environment | undefined {
    return storageService.getEnvironments().find(e => e.id === id)
  }

  getEnvironmentRuntime(id: string): EnvironmentRuntimeInfo | null {
    const env = this.getEnvironment(id)
    if (!env) return null
    return launchService.getRuntimeInfo(id, env.cdpPort)
  }

  getEnvironmentView(id: string): (Environment & { runtime: EnvironmentRuntimeInfo; launchedAt?: string }) | null {
    const env = this.getEnvironment(id)
    if (!env) return null

    const runtime = launchService.getRuntimeInfo(id, env.cdpPort)
    return {
      ...env,
      runtime: {
        ...runtime,
        cdpPort: runtime.launchMode === 'cdp' ? runtime.cdpPort : null,
      },
    }
  }

  getEnvironmentViews(): Array<Environment & { runtime: EnvironmentRuntimeInfo; launchedAt?: string }> {
    return this.getEnvironments()
      .map(env => this.getEnvironmentView(env.id))
      .filter((env): env is Environment & { runtime: EnvironmentRuntimeInfo; launchedAt?: string } => !!env)
  }

  getRunningEnvironmentViews(): Array<Environment & { runtime: EnvironmentRuntimeInfo; launchedAt?: string }> {
    return this.getEnvironmentViews().filter(env => env.runtime.isRunning)
  }

  // Migrate environment (change userDataDir)
  async migrateEnvironment(id: string, newUserDataDir: string): Promise<boolean> {
    const env = storageService.getEnvironments().find(e => e.id === id)
    if (!env || env.status === 'running') return false

    // 关闭旧浏览器并复制数据
    this.updateEnvironment(id, { userDataDir: newUserDataDir })
    return true
  }

  private handleBrowserEvent(event: { type?: string; envId?: string } | undefined): void {
    const envId = event?.envId
    const type = event?.type

    if (!envId || (type !== 'closed' && type !== 'crashed')) {
      return
    }

    const env = storageService.getEnvironments().find(e => e.id === envId)
    if (!env || env.status === 'stopped') {
      return
    }

    this.updateEnvironment(envId, { status: 'stopped', launchedAt: undefined })

    const details = type === 'crashed'
      ? `浏览器异常退出: ${env.name}`
      : `浏览器已关闭: ${env.name}`
    activityLogService.log({ envId, action: 'close', details })
  }

  private generateId(): string {
    return `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateUserDataDir(): string {
    const baseDir = process.env.APPDATA || process.env.HOME || '.'
    return `${baseDir}/fingerprint-browser/profiles/${Date.now()}`
  }

  private getAvailableCDPPort(): number {
    const environments = storageService.getEnvironments()
    const usedPorts = new Set(environments.map(e => e.cdpPort).filter(Boolean))
    
    for (let port = 9222; port <= 9322; port++) {
      if (!usedPorts.has(port)) {
        return port
      }
    }
    
    return 9222 + environments.length
  }

  private resolveCDPPort(port?: number): number {
    if (Number.isInteger(port) && port! >= 1024 && port! <= 65535) {
      return port!
    }
    return this.getAvailableCDPPort()
  }

  private generateColor(): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // ========== Batch Operations (P1#5) ==========

  /** 批量启动 */
  async batchLaunch(envIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const results = await Promise.allSettled(
      envIds.map(id => this.launchBrowser(id, 'standard'))
    )
    const success: string[] = []
    const failed: string[] = []

    envIds.forEach((id, i) => {
      if (results[i].status === 'fulfilled' && results[i].value) success.push(id)
      else failed.push(id)
    })

    activityLogService.log({ envId: 'system', action: 'launch', details: `批量启动 ${success.length} 个环境, 失败 ${failed.length}` })
    return { success, failed }
  }

  /** 批量关闭 */
  async batchClose(envIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const results = envIds.map(id => this.closeBrowser(id))
    const success = results.filter(r => r).map((_, i) => envIds[i]!)
    const failed = results.filter(r => !r).map((_, i) => envIds[i]!)

    activityLogService.log({ envId: 'system', action: 'close', details: `批量关闭 ${success.length} 个环境` })
    return { success, failed }
  }

  /** 批量删除 */
  batchDelete(envIds: string[]): void {
    for (const id of envIds) {
      this.deleteEnvironment(id)
    }
    activityLogService.log({ envId: 'system', action: 'delete', details: `批量删除 ${envIds.length} 个环境` })
  }
}

export const environmentManager = new EnvironmentManager()
export default EnvironmentManager
