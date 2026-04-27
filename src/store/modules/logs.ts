import type { ActivityLog } from '@/types'

interface LogsState {
  list: ActivityLog[]
  loading: boolean
}

const state: LogsState = {
  list: [],
  loading: false,
}

export default {
  namespaced: true,

  state,

  getters: {
    recent(state, _getters, _rootState): ActivityLog[] {
      return state.list.slice(0, 20)
    },
    byEnvId: (state) => (envId: string): ActivityLog[] =>
      state.list.filter(l => l.envId === envId),
  },

  mutations: {
    SET_LIST(state, list: ActivityLog[]) { state.list = list },
    PREPEND_LOG(state, log: ActivityLog) { state.list.unshift(log) },
    SET_LOADING(state, v: boolean) { state.loading = v },
  },

  actions: {
    /** 从主进程获取日志（只读展示，写入由主进程完成） */
    async fetchByEnvId({ commit }, envId: string) {
      commit('SET_LOADING', true)
      try {
        const logs = await window.electronAPI.invoke<ActivityLog[]>('activity-logs', { envId, limit: 100 })
        commit('SET_LIST', logs || [])
      } catch (error: any) { console.error('[logs] fetch error:', error) }
      finally { commit('SET_LOADING', false) }
    },

    async fetchRecent({ commit }) {
      try {
        const logs = await window.electronAPI.invoke<ActivityLog[]>('activity-logs', { limit: 50 })
        commit('SET_LIST', logs || [])
      } catch { /* 静默失败 */ }
    },

    /** 追加一条本地日志（用于实时推送） */
    appendLocal({ commit }, log: ActivityLog) {
      commit('PREPEND_LOG', log)
    },
  },
}
