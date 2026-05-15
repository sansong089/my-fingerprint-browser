// Environment Manager - manages browser environments
import { storageService, Environment, FingerprintConfig, ProxyConfig } from '../services/StorageService'
import { launchService, type EnvironmentRuntimeInfo } from '../services/LaunchService'
import { activityLogService } from './ActivityLogService'
import { eventBus } from './BrowserEventBus'
import { pluginCatalogService } from '../services/PluginCatalogService'
import { pluginInstallService } from '../services/PluginInstallService'

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
  }): Environment {
    const environments = storageService.getEnvironments()
    
    const env: Environment = {
      id: this.generateId(),
      name: data.name || `Environment ${environments.length + 1}`,
      fingerprint: data.fingerprint,
      proxy: data.proxy,
      userDataDir: this.generateUserDataDir(),
      cdpPort: this.getAvailableCDPPort(), // P0#2：主进程唯一分配端口
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

    const updated = { ...env, ...data, lastUsed: new Date().toISOString() }
    storageService.updateEnvironment(id, updated)
    return updated
  }

  // Delete environment
  deleteEnvironment(id: string): boolean {
    // 先关闭浏览器
    const env = this.getEnvironment(id)
    this.closeBrowser(id)
    if (env) {
      pluginInstallService.cleanupEnvironment(id, env.userDataDir)
    }
    storageService.deleteEnvironment(id)
    return true
  }

  // Launch browser
  async launchBrowser(id: string, launchMode: 'cdp' | 'standard' = 'cdp'): Promise<boolean> {
    const env = storageService.getEnvironments().find(e => e.id === id)
    if (!env) return false

    const proxy = env.proxy ? `${env.proxy.type}://${env.proxy.host}:${env.proxy.port}` : undefined
    // P1#8：代理认证参数
    const proxyAuth =
      env.proxy?.username && env.proxy.password
        ? `${env.proxy.username}:${env.proxy.password}`
        : undefined

    const pluginLaunchContext = pluginInstallService.getLaunchContextForEnvironment(env.id, env.userDataDir)

    const success = await launchService.launch(id, {
      userDataDir: env.userDataDir,
      cdpPort: env.cdpPort,
      fingerprint: env.fingerprint,
      proxy,
      managedExtensionDirs: pluginLaunchContext.extensionDirs,
      launchMode,
      ...(proxyAuth ? { proxyAuth } : {}),
    })

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
          ? `启动环境: ${env.name} | 模式: ${launchMode} | 命令: ${launchCommand}`
          : `启动环境: ${env.name} | 模式: ${launchMode}`,
      })
    }

    return success
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
    const usedPorts = new Set(environments.map(e => e.cdpPort))
    
    for (let port = 9222; port <= 9322; port++) {
      if (!usedPorts.has(port)) {
        return port
      }
    }
    
    return 9222 + environments.length
  }

  private generateColor(): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // ========== Batch Operations (P1#5) ==========

  /** 批量启动 */
  async batchLaunch(envIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const results = await Promise.allSettled(
      envIds.map(id => this.launchBrowser(id))
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
