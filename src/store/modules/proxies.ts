import type { Proxy } from '@/types'

interface ProxiesState {
  list: Proxy[]
  loading: boolean
  testingId: string | null
}

const state: ProxiesState = {
  list: [],
  loading: false,
  testingId: null,
}

export default {
  namespaced: true,

  state,

  getters: {
    availableList(state): Proxy[] { return state.list.filter(p => p.status !== 'unavailable') },
    byType: (state) => (type: Proxy['type']): Proxy[] =>
      state.list.filter(p => p.type === type),
    getById: (state) => (id: string): Proxy | undefined =>
      state.list.find(p => p.id === id),
  },

  mutations: {
    SET_LIST(state, list: Proxy[]) { state.list = list },
    ADD(state, proxy: Proxy) { state.list.push(proxy) },
    UPDATE(state, proxy: Proxy) {
      const idx = state.list.findIndex(p => p.id === proxy.id)
      if (idx !== -1) state.list.splice(idx, 1, proxy)
    },
    REMOVE(state, id: string) { state.list = state.list.filter(p => p.id !== id) },
    SET_LOADING(state, v: boolean) { state.loading = v },
    SET_TESTING_ID(state, id: string | null) { state.testingId = id },
    UPDATE_STATUS(state, { id, status }: { id: string; status: Proxy['status'] }) {
      const proxy = state.list.find(p => p.id === id)
      if (proxy) { proxy.status = status; proxy.lastCheck = new Date().toISOString() }
    },
  },

  actions: {
    async fetchAll({ commit }) {
      try {
        const proxies = await window.electronAPI.invoke<Proxy[]>('get-proxies')
        commit('SET_LIST', proxies || [])
      } catch { commit('SET_LIST', []) }
    },

    async create({ commit }, data: Omit<Proxy, 'id' | 'status' | 'lastCheck' | 'createdAt'>) {
      const proxy = {
        ...data,
        id: `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'unchecked',
        createdAt: new Date().toISOString(),
      }
      const result = await window.electronAPI.invoke<Proxy>('proxies-create', proxy)
      commit('ADD', result || proxy)
      return result || proxy
    },

    async update({ commit, state }, data: Partial<Proxy> & { id: string }) {
      await window.electronAPI.invoke('proxies-update', data)
      const existing = (state as ProxiesState).list.find(p => p.id === data.id)
      if (existing) commit('UPDATE', { ...existing, ...data })
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('proxies-delete', { id })
      commit('REMOVE', id)
    },

    /** 测试代理连通性 */
    async testConnection({ commit }, id: string) {
      commit('SET_TESTING_ID', id)
      try {
        const result = await window.electronAPI.invoke<{ status: 'available' | 'unavailable'; latency?: number }>('proxy-test', { id })
        commit('UPDATE_STATUS', { id, status: result.status })
        return result
      } catch (error: any) {
        commit('UPDATE_STATUS', { id, status: 'unavailable' })
        throw error
      } finally {
        commit('SET_TESTING_ID', null)
      }
    },
  },
}
