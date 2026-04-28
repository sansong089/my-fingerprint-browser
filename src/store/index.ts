import { createStore } from 'vuex'

// Types — 统一从 @/types 导出（向后兼容，组件可直接从 store/index 导入类型）
export type { Environment, FingerprintConfig, ProxyConfig, Settings, Group, ProxyGroup, Proxy, ProfileTemplate, Script, ScriptStep, ActivityLog, CookieData, WindowPosition, MonitorInfo, WindowInfo, PluginRecord, EnvironmentPluginTarget, PluginBackendProofRecord, PluginListItem, PluginInstallPayload } from '@/types'

// Vuex Modules
import ui from './modules/ui'
import settings from './modules/settings'
import environments from './modules/environments'
import groups from './modules/groups'
import proxyGroups from './modules/proxyGroups'
import proxies from './modules/proxies'
import scripts from './modules/scripts'
import logs from './modules/logs'
import sync from './modules/sync'
import plugins from './modules/plugins'

// ========================
// Store 聚合（7 modules + helpers）
// ========================

export default createStore({
  // 7 个独立 state 模块
  modules: {
    ui,
    settings,
    environments,
    groups,
    proxyGroups,
    proxies,
    scripts,
    logs,
    sync,
    plugins,
  },

  // 全局 loading/error 管理
  state: () => ({
    globalLoading: false,
    globalError: null as string | null,
  }),

  getters: {},
})
