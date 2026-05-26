import type { Environment, FingerprintConfig, ProxyConfig } from '@/types'
import { getRandomEnvColor } from '@/constants/colors'

// Default fingerprint generator
const defaultFingerprint = (): FingerprintConfig => ({
  seed: Math.floor(Math.random() * 1000000),
  platform: 'windows',
  platformVersion: '10.0.19045',
  brand: 'Chrome',
  brandVersion: '120.0.6099.71',
  hardwareConcurrency: 4,
  timezone: 'Asia/Shanghai',
  lang: 'zh-CN',
  followIpGeo: false,
})

function sanitizeFingerprint(input?: Partial<FingerprintConfig>): FingerprintConfig {
  const fp = input || {}
  return {
    seed: typeof fp.seed === 'number' ? fp.seed : Math.floor(Math.random() * 1000000),
    platform: fp.platform || 'windows',
    platformVersion: fp.platformVersion || '',
    brand: fp.brand || 'Chrome',
    brandVersion: fp.brandVersion || '',
    hardwareConcurrency: fp.hardwareConcurrency || 4,
    timezone: fp.timezone || 'Asia/Shanghai',
    lang: fp.lang || 'en-US',
    followIpGeo: !!fp.followIpGeo,
    disabledSpoofing: Array.isArray(fp.disabledSpoofing)
      ? fp.disabledSpoofing.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function sanitizeProxy(input?: Partial<ProxyConfig>): ProxyConfig | undefined {
  if (!input?.host || !input.port) return undefined
  return {
    type: input.type || 'http',
    host: input.host,
    port: input.port,
    username: input.username || '',
    password: input.password || '',
  }
}

function sanitizeEnvironmentPayload(input: Partial<Environment>): Partial<Environment> {
  const payload: Partial<Environment> = {
    ...('id' in input ? { id: input.id } : {}),
    ...('name' in input ? { name: input.name || '' } : {}),
    ...('desktopShortcuts' in input ? {
      desktopShortcuts: {
        ...(input.desktopShortcuts?.standard ? { standard: input.desktopShortcuts.standard } : {}),
        ...(input.desktopShortcuts?.cdp ? { cdp: input.desktopShortcuts.cdp } : {}),
      },
    } : {}),
    ...('userDataDir' in input ? { userDataDir: input.userDataDir || '' } : {}),
    ...('createdAt' in input ? { createdAt: input.createdAt || '' } : {}),
    ...('lastUsed' in input ? { lastUsed: input.lastUsed || '' } : {}),
    ...('status' in input ? { status: input.status } : {}),
    ...('url' in input ? { url: input.url } : {}),
    ...('groupId' in input ? { groupId: input.groupId || undefined } : {}),
    ...('templateId' in input ? { templateId: input.templateId || undefined } : {}),
    ...('launchedAt' in input ? { launchedAt: input.launchedAt } : {}),
    ...('cdpPort' in input ? { cdpPort: input.cdpPort ?? undefined } : {}),
    ...('tags' in input ? { tags: Array.isArray(input.tags) ? [...input.tags] : [] } : {}),
    ...('color' in input ? { color: input.color || getRandomEnvColor() } : {}),
  }

  if ('fingerprint' in input) {
    payload.fingerprint = sanitizeFingerprint(input.fingerprint)
  }

  if ('proxy' in input) {
    payload.proxy = sanitizeProxy(input.proxy)
  }

  return payload
}

export interface EnvironmentsState {
  list: Environment[]
  loading: boolean
  error: string | null
  loadingKeys: Record<string, boolean>
}

const state: EnvironmentsState = {
  list: [],
  loading: false,
  error: null,
  loadingKeys: {},
}

export default {
  namespaced: true,

  state,

  getters: {
    /** 运行中的环境 */
    runningEnvironments(state): Environment[] {
      return state.list.filter(env => env.status === 'running')
    },

    runningCount(state, getters): number { return (getters.runningEnvironments as Environment[]).length },
    stoppedEnvironments(state): Environment[] { return state.list.filter(env => env.status === 'stopped') },
    totalCount(state): number { return state.list.length },

    getById: (state) => (id: string): Environment | undefined =>
      state.list.find(e => e.id === id),

    getByGroup: (state) => (groupId: string | undefined): Environment[] => {
      if (!groupId) return state.list
      return state.list.filter(e => e.groupId === groupId)
    },

    /** 获取未分组的环境 */
    ungrouped(state, _getters, rootState: any): Environment[] {
      const groupIds = new Set(
        ((rootState.groups as any)?.list || []).map((g: any) => g.id)
      )
      return state.list.filter(
        e => !e.groupId || !groupIds.has(e.groupId)
      )
    },
  },

  mutations: {
    SET_LIST(state, list: Environment[]) { state.list = list },
    ADD(state, env: Environment) { state.list.push(env) },
    UPDATE(state, env: Environment) {
      const idx = state.list.findIndex(e => e.id === env.id)
      if (idx !== -1) state.list[idx] = env
    },
    REMOVE(state, id: string) {
      state.list = state.list.filter(e => e.id !== id)
    },
    SET_LOADING(state, loading: boolean) { state.loading = loading },
    SET_LOADING_KEY(state, { key, value }: { key: string; value: boolean }) {
      state.loadingKeys[key] = value
    },
    SET_ERROR(state, error: string | null) { state.error = error },
    UPDATE_STATUS(state, { id, status }: { id: string; status: Environment['status'] }) {
      const env = state.list.find(e => e.id === id)
      if (env) env.status = status
    },
    UPDATE_RUNTIME(state, { id, status, launchedAt }: { id: string; status: Environment['status']; launchedAt?: string }) {
      const env = state.list.find(e => e.id === id)
      if (!env) return
      env.status = status
      env.launchedAt = launchedAt
      env.lastUsed = new Date().toISOString()
    },
  },

  actions: {
    async fetchAll({ commit }) {
      commit('SET_LOADING', true)
      try {
        const environments = await window.electronAPI.invoke<Environment[]>('get-environments')
        commit('SET_LIST', environments || [])
      } catch (error: any) {
        commit('SET_ERROR', error.message)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async create({ commit }, data: Partial<Environment>) {
      const envId = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const cleanFingerprint = sanitizeFingerprint(data.fingerprint || defaultFingerprint())
      const cleanProxy = sanitizeProxy(data.proxy)

      const environmentData = {
        id: envId,
        name: data.name || `Environment ${state.list.length + 1}`,
        fingerprint: cleanFingerprint,
        proxy: cleanProxy,
        userDataDir: `profiles/${envId}`,
        cdpPort: data.cdpPort,
        tags: data.tags || [],
        color: data.color || getRandomEnvColor(),
        groupId: data.groupId,
        templateId: data.templateId,
      }

      const result = await window.electronAPI.invoke<Environment>('create-environment', environmentData)
      const createdEnv: Environment = { ...environmentData, ...result, status: 'stopped' }
      commit('ADD', createdEnv)
      return createdEnv
    },

    async update({ commit }, environment: Environment) {
      const cleanEnvironment = sanitizeEnvironmentPayload(environment) as Environment
      await window.electronAPI.invoke('update-environment', cleanEnvironment.id, cleanEnvironment)
      commit('UPDATE', { ...cleanEnvironment, lastUsed: new Date().toISOString() })
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('delete-environment', id)
      commit('REMOVE', id)
      // 同步清除 ui 模块中的选中状态
      commit('ui/DESELECT_ENV', id, { root: true })
    },

    async launch({ commit, dispatch }, payload: string | { envId: string; launchMode?: 'standard' | 'cdp' }) {
      const envId = typeof payload === 'string' ? payload : payload.envId
      const launchMode = typeof payload === 'string' ? 'standard' : payload.launchMode || 'standard'
      commit('SET_LOADING_KEY', { key: `launch-${envId}`, value: true })

      try {
        const result = await window.electronAPI.invoke<boolean>('launch-browser', { envId, launchMode })
        if (result) {
          commit('UPDATE_STATUS', { id: envId, status: 'running' })
        }
        return result
      } catch (error: any) {
        commit('SET_ERROR', error.message)
        throw error
      } finally {
        commit('SET_LOADING_KEY', { key: `launch-${envId}`, value: false })
      }
    },

    async close({ commit }, envId: string) {
      commit('SET_LOADING_KEY', { key: `close-${envId}`, value: true })
      try {
        const result = await window.electronAPI.invoke<boolean>('close-browser', envId)
        if (result) {
          commit('UPDATE_STATUS', { id: envId, status: 'stopped' })
        }
        return result
      } catch (error: any) {
        commit('SET_ERROR', error.message)
        throw error
      } finally {
        commit('SET_LOADING_KEY', { key: `close-${envId}`, value: false })
      }
    },

    handleBrowserEvent({ commit, state }, payload: any) {
      const envId = payload?.envId
      const type = payload?.type
      if (!envId || !type) return

      const env = state.list.find(e => e.id === envId)
      if (!env) return

      if (type === 'closed' || type === 'crashed') {
        commit('UPDATE_RUNTIME', { id: envId, status: 'stopped' })
        return
      }

      if (type === 'launched') {
        commit('UPDATE_RUNTIME', {
          id: envId,
          status: 'running',
          launchedAt: env.launchedAt || new Date().toISOString(),
        })
      }
    },

    clearError({ commit }) { commit('SET_ERROR', null) },
  },
}
