import Store from 'electron-store'
import type { Group } from '../../../src/types/group'
import type { ProxyGroup } from '../../../src/types/proxyGroup'
import type { Proxy } from '../../../src/types/proxy'
import type { ProfileTemplate } from '../../../src/types/template'
import type { Script } from '../../../src/types/script'

export interface FingerprintConfig {
  seed: number
  platform: 'windows' | 'linux' | 'macos'
  platformVersion?: string
  brand?: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  brandVersion?: string
  hardwareConcurrency?: number
  timezone?: string
  lang?: string
  disabledSpoofing?: string[]
}

export interface ProxyConfig {
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

export interface Environment {
  id: string
  name: string
  fingerprint: FingerprintConfig
  proxy?: ProxyConfig
  userDataDir: string
  cdpPort: number
  createdAt: string
  lastUsed: string
  tags: string[]
  color: string
  status: 'stopped' | 'running' | 'error'
  url?: string
  groupId?: string
  templateId?: string
  launchedAt?: string
}

export interface Settings {
  browserPath: string
  defaultPlatform: 'windows' | 'linux' | 'macos'
  defaultTimezone: string
  defaultLang: string
  autoStart: boolean
  minimizeToTray: boolean
  syncDelay: number
}

export interface PluginRecord {
  id: string
  name: string
  storeUrl: string
  source: 'chrome-web-store'
  version: string
  iconUrl?: string
  description?: string
  artifactRelativePath: string
  inheritToNewEnvironments: boolean
  installedByAppAt: string
  updatedAt: string
  backend: 'launch-arg'
}

export interface EnvironmentPluginTarget {
  envId: string
  pluginId: string
  desiredState: 'installed' | 'removed'
  applyBackend?: 'launch-arg' | 'profile-external' | 'proven-other'
  lastAppliedVersion?: string
  lastMaterializedAt?: string
  lastError?: string
}

export interface PluginBackendProofRecord {
  backend: 'launch-arg'
  decision: 'approved'
  checkedAt: string
  rationale: string
  evidence: string[]
  constraints: string[]
  detectionMethod: string
  adrRelativePath: string
}

interface StoreSchema {
  environments: Environment[]
  settings: Settings
  groups: Group[]
  proxyGroups: ProxyGroup[]
  proxies: Proxy[]
  templates: ProfileTemplate[]
  scripts: Script[]
  plugins: PluginRecord[]
  pluginTargets: EnvironmentPluginTarget[]
  pluginBackendProof: PluginBackendProofRecord | null
}

const defaultSettings: Settings = {
  browserPath: '',
  defaultPlatform: 'windows',
  defaultTimezone: 'Asia/Shanghai',
  defaultLang: 'en-US',
  autoStart: false,
  minimizeToTray: false,
  syncDelay: 50
}

/**
 * StorageService — 统一持久化存储服务
 *
 * 使用 electron-store 持久化 6 类数据实体：
 * environments, settings, groups, proxies, templates, scripts
 *
 * 权威类型源：此文件定义主进程 interface，src/types/ 为前端镜像
 */
class StorageService {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'fingerprint-browser-data',
      defaults: {
        environments: [],
        settings: defaultSettings,
        groups: [],
        proxyGroups: [],
        proxies: [],
        templates: [],
        scripts: [],
        plugins: [],
        pluginTargets: [],
        pluginBackendProof: null,
      }
    })
    console.log('Storage file path:', this.store.path)
  }

  // ==================== Environments ====================

  getEnvironments(): Environment[] {
    return this.store.get('environments', [])
  }

  saveEnvironments(environments: Environment[]): void {
    this.store.set('environments', environments)
  }

  addEnvironment(env: Environment): void {
    const environments = this.getEnvironments()
    environments.push(env)
    this.saveEnvironments(environments)
  }

  updateEnvironment(id: string, data: Partial<Environment>): void {
    const environments = this.getEnvironments()
    const index = environments.findIndex(e => e.id === id)
    if (index !== -1) {
      environments[index] = { ...environments[index], ...data }
      this.saveEnvironments(environments)
    }
  }

  deleteEnvironment(id: string): void {
    this.saveEnvironments(this.getEnvironments().filter(e => e.id !== id))
  }

  // ==================== Plugins ====================

  getPlugins(): PluginRecord[] {
    return this.store.get('plugins', [])
  }

  savePlugins(plugins: PluginRecord[]): void {
    this.store.set('plugins', plugins)
  }

  addPlugin(plugin: PluginRecord): void {
    const plugins = this.getPlugins()
    plugins.push(plugin)
    this.savePlugins(plugins)
  }

  updatePlugin(id: string, data: Partial<PluginRecord>): void {
    const plugins = this.getPlugins()
    const index = plugins.findIndex(plugin => plugin.id === id)
    if (index !== -1) {
      plugins[index] = { ...plugins[index], ...data }
      this.savePlugins(plugins)
    }
  }

  deletePlugin(id: string): void {
    this.savePlugins(this.getPlugins().filter(plugin => plugin.id !== id))
  }

  getPluginTargets(): EnvironmentPluginTarget[] {
    return this.store.get('pluginTargets', [])
  }

  savePluginTargets(targets: EnvironmentPluginTarget[]): void {
    this.store.set('pluginTargets', targets)
  }

  upsertPluginTarget(target: EnvironmentPluginTarget): void {
    const targets = this.getPluginTargets()
    const index = targets.findIndex(item => item.envId === target.envId && item.pluginId === target.pluginId)
    if (index !== -1) {
      targets[index] = { ...targets[index], ...target }
    } else {
      targets.push(target)
    }
    this.savePluginTargets(targets)
  }

  deletePluginTargetsForPlugin(pluginId: string): void {
    this.savePluginTargets(this.getPluginTargets().filter(target => target.pluginId !== pluginId))
  }

  deletePluginTargetsForEnvironment(envId: string): void {
    this.savePluginTargets(this.getPluginTargets().filter(target => target.envId !== envId))
  }

  getPluginBackendProof(): PluginBackendProofRecord | null {
    return this.store.get('pluginBackendProof', null)
  }

  savePluginBackendProof(proof: PluginBackendProofRecord | null): void {
    this.store.set('pluginBackendProof', proof)
  }

  // ==================== Settings ====================

  getSettings(): Settings {
    return this.store.get('settings', defaultSettings)
  }

  saveSettings(settings: Settings): void {
    this.store.set('settings', settings)
  }

  // ==================== Groups ====================

  getGroups(): Group[] {
    return this.store.get('groups', [])
  }

  saveGroups(groups: Group[]): void {
    this.store.set('groups', groups)
  }

  addGroup(group: Group): void {
    const groups = this.getGroups()
    groups.push(group)
    this.saveGroups(groups)
  }

  updateGroup(id: string, data: Partial<Group>): void {
    const groups = this.getGroups()
    const index = groups.findIndex(g => g.id === id)
    if (index !== -1) {
      groups[index] = { ...groups[index], ...data }
      this.saveGroups(groups)
    }
  }

  deleteGroup(id: string): void {
    this.saveGroups(this.getGroups().filter(g => g.id !== id))
  }

  // ==================== ProxyGroups ====================

  getProxyGroups(): ProxyGroup[] {
    return this.store.get('proxyGroups', [])
  }

  saveProxyGroups(groups: ProxyGroup[]): void {
    this.store.set('proxyGroups', groups)
  }

  addProxyGroup(group: ProxyGroup): void {
    const groups = this.getProxyGroups()
    groups.push(group)
    this.saveProxyGroups(groups)
  }

  updateProxyGroup(id: string, data: Partial<ProxyGroup>): void {
    const groups = this.getProxyGroups()
    const index = groups.findIndex(g => g.id === id)
    if (index !== -1) {
      groups[index] = { ...groups[index], ...data }
      this.saveProxyGroups(groups)
    }
  }

  deleteProxyGroup(id: string): void {
    this.saveProxyGroups(this.getProxyGroups().filter(g => g.id !== id))
  }

  // ==================== Proxies ====================

  getProxies(): Proxy[] {
    return this.store.get('proxies', [])
  }

  saveProxies(proxies: Proxy[]): void {
    this.store.set('proxies', proxies)
  }

  addProxy(proxy: Proxy): void {
    const proxies = this.getProxies()
    proxies.push(proxy)
    this.saveProxies(proxies)
  }

  updateProxy(id: string, data: Partial<Proxy>): void {
    const proxies = this.getProxies()
    const index = proxies.findIndex(p => p.id === id)
    if (index !== -1) {
      const updated = { ...proxies[index], ...data }
      // groupId 为空字符串时显式清除分组字段
      if (data.groupId === '' || data.groupId === undefined) {
        delete updated.groupId
      }
      proxies[index] = updated
      this.saveProxies(proxies)
    }
  }

  deleteProxy(id: string): void {
    this.saveProxies(this.getProxies().filter(p => p.id !== id))
  }

  // ==================== Templates ====================

  getTemplates(): ProfileTemplate[] {
    return this.store.get('templates', [])
  }

  saveTemplates(templates: ProfileTemplate[]): void {
    this.store.set('templates', templates)
  }

  addTemplate(template: ProfileTemplate): void {
    const templates = this.getTemplates()
    templates.push(template)
    this.saveTemplates(templates)
  }

  updateTemplate(id: string, data: Partial<ProfileTemplate>): void {
    const templates = this.getTemplates()
    const index = templates.findIndex(t => t.id === id)
    if (index !== -1) {
      templates[index] = { ...templates[index], ...data }
      this.saveTemplates(templates)
    }
  }

  deleteTemplate(id: string): void {
    this.saveTemplates(this.getTemplates().filter(t => t.id !== id))
  }

  // ==================== Scripts ====================

  getScripts(): Script[] {
    return this.store.get('scripts', [])
  }

  saveScripts(scripts: Script[]): void {
    this.store.set('scripts', scripts)
  }

  addScript(script: Script): void {
    const scripts = this.getScripts()
    scripts.push(script)
    this.saveScripts(scripts)
  }

  updateScript(id: string, data: Partial<Script>): void {
    const scripts = this.getScripts()
    const index = scripts.findIndex(s => s.id === id)
    if (index !== -1) {
      scripts[index] = { ...scripts[index], ...data }
      this.saveScripts(scripts)
    }
  }

  deleteScript(id: string): void {
    this.saveScripts(this.getScripts().filter(s => s.id !== id))
  }
}

export const storageService = new StorageService()
export default StorageService
