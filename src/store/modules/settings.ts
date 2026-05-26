import type { Settings } from '@/types'

const defaultSettings: Settings = {
  browserPath: '',
  defaultPlatform: 'windows',
  defaultTimezone: 'Asia/Shanghai',
  defaultLang: 'en-US',
  autoStart: false,
  minimizeToTray: false,
  syncDelay: 50,
  environmentPageSize: 10,
  proxyPageSize: 10,
  floatingToolbarDock: {
    edge: 'top',
    offset: -1,
    collapsed: false,
  },
}

export default {
  namespaced: true,

  state: () => ({
    data: { ...defaultSettings },
    loading: false,
    error: null as string | null,
  }),

  getters: {
    all(state): Settings { return state.data },
    browserPath(state): string { return state.data.browserPath },
  },

  mutations: {
    SET_SETTINGS(state, settings: Settings) { state.data = settings },
    SET_LOADING(state, loading: boolean) { state.loading = loading },
    SET_ERROR(state, error: string | null) { state.error = error },
  },

  actions: {
    async fetch({ commit }) {
      try {
        const settings = await window.electronAPI.invoke<Settings>('get-settings')
        commit('SET_SETTINGS', { ...defaultSettings, ...(settings || {}) })
      } catch (error: any) {
        commit('SET_ERROR', error.message)
      }
    },

    async save({ commit, state }, partial?: Partial<Settings>) {
      commit('SET_LOADING', true)
      try {
        const merged = { ...state.data, ...partial }
        await window.electronAPI.invoke('save-settings', merged)
        commit('SET_SETTINGS', merged)
      } catch (error: any) {
        commit('SET_ERROR', error.message)
        throw error
      } finally {
        commit('SET_LOADING', false)
      }
    },

    reset({ commit }) { commit('SET_SETTINGS', { ...defaultSettings }) },
  },
}
