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
  lang: 'en-US',
  followIpGeo: false,
})

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
      const fp = data.fingerprint || defaultFingerprint()

      // 清理指纹数据为可序列化格式
      const cleanFingerprint: FingerprintConfig = {
        seed: fp.seed,
        platform: fp.platform,
        platformVersion: fp.platformVersion || '',
        brand: fp.brand || 'Chrome',
        brandVersion: fp.brandVersion || '',
        hardwareConcurrency: fp.hardwareConcurrency || 4,
        timezone: fp.timezone || 'Asia/Shanghai',
        lang: fp.lang || 'en-US',
        followIpGeo: !!fp.followIpGeo,
        disabledSpoofing: fp.disabledSpoofing || [],
      }

      let cleanProxy: ProxyConfig | undefined
      if (data.proxy && data.proxy.host && data.proxy.port) {
        cleanProxy = {
          type: data.proxy.type,
          host: data.proxy.host,
          port: data.proxy.port,
          username: data.proxy.username || '',
          password: data.proxy.password || '',
        }
      }

      const environmentData = {
        id: envId,
        name: data.name || `Environment ${state.list.length + 1}`,
        fingerprint: cleanFingerprint,
        proxy: cleanProxy,
        userDataDir: `profiles/${envId}`,
        // cdpPort 由主进程 EnvironmentManager 分配（P0#2）
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
      await window.electronAPI.invoke('update-environment', environment.id, environment)
      commit('UPDATE', { ...environment, lastUsed: new Date().toISOString() })
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('delete-environment', id)
      commit('REMOVE', id)
      // 同步清除 ui 模块中的选中状态
      commit('ui/DESELECT_ENV', id, { root: true })
    },

    async launch({ commit, dispatch }, envId: string) {
      commit('SET_LOADING_KEY', { key: `launch-${envId}`, value: true })

      try {
        const result = await window.electronAPI.invoke<boolean>('launch-browser', envId)
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
