import type { PluginBackendProofRecord, PluginInstallPayload, PluginListItem } from '@/types'

interface PluginsState {
  list: PluginListItem[]
  backendProof: PluginBackendProofRecord | null
  loading: boolean
  error: string | null
  currentStoreDetail: { storeUrl: string; pluginId: string; title?: string } | null
}

const state: PluginsState = {
  list: [],
  backendProof: null,
  loading: false,
  error: null,
  currentStoreDetail: null,
}

export default {
  namespaced: true,

  state,

  getters: {
    totalCount(state): number { return state.list.length },
    getById: (state) => (id: string): PluginListItem | undefined => state.list.find(plugin => plugin.id === id),
  },

  mutations: {
    SET_LIST(state, list: PluginListItem[]) { state.list = list },
    SET_LOADING(state, value: boolean) { state.loading = value },
    SET_ERROR(state, value: string | null) { state.error = value },
    SET_BACKEND_PROOF(state, value: PluginBackendProofRecord | null) { state.backendProof = value },
    SET_CURRENT_DETAIL(state, value: { storeUrl: string; pluginId: string; title?: string } | null) {
      state.currentStoreDetail = value
    },
  },

  actions: {
    async fetchAll({ commit }) {
      commit('SET_LOADING', true)
      try {
        const plugins = await window.electronAPI.invoke<PluginListItem[]>('plugins-list')
        commit('SET_LIST', plugins || [])
      } catch (error: any) {
        commit('SET_ERROR', error.message || 'Failed to load plugins')
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async fetchBackendProof({ commit }) {
      try {
        const proof = await window.electronAPI.invoke<PluginBackendProofRecord>('plugins-backend-proof')
        commit('SET_BACKEND_PROOF', proof || null)
        return proof
      } catch (error: any) {
        commit('SET_ERROR', error.message || 'Failed to load backend proof')
        throw error
      }
    },

    async openStore({ dispatch }) {
      await window.electronAPI.invoke('plugins-open-store')
      await dispatch('refreshCurrentStoreDetail')
    },

    async refreshCurrentStoreDetail({ commit }) {
      const detail = await window.electronAPI.invoke<{ storeUrl: string; pluginId: string; title?: string } | null>('plugins-current-store-detail')
      commit('SET_CURRENT_DETAIL', detail || null)
      return detail
    },

    async installCurrentStore({ dispatch }) {
      await window.electronAPI.invoke('plugins-install-current-store')
      await dispatch('fetchAll')
      await dispatch('refreshCurrentStoreDetail')
    },

    async install({ dispatch }, payload: PluginInstallPayload) {
      await window.electronAPI.invoke('plugins-install', payload)
      await dispatch('fetchAll')
    },

    async uninstall({ dispatch }, pluginId: string) {
      await window.electronAPI.invoke('plugins-uninstall', { pluginId })
      await dispatch('fetchAll')
    },

    async reinstallMissing({ dispatch }, pluginId: string) {
      await window.electronAPI.invoke('plugins-reinstall-missing', { pluginId })
      await dispatch('fetchAll')
    },
  },
}
