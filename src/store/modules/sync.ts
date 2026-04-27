export interface SyncState {
  active: boolean
  envIds: string[]
  mainEnvId: string | null
  mirrorEnvIds: string[]
  startedAt: string | null
}

const state: SyncState = {
  active: false,
  envIds: [],
  mainEnvId: null,
  mirrorEnvIds: [],
  startedAt: null,
}

export default {
  namespaced: true,

  state,

  getters: {
    mirrorCount(state): number {
      return state.mirrorEnvIds.length
    },
  },

  mutations: {
    SET_STATE(state, payload: Partial<SyncState>) {
      state.active = !!payload.active
      state.envIds = payload.envIds ? [...payload.envIds] : []
      state.mainEnvId = payload.mainEnvId ?? null
      state.mirrorEnvIds = payload.mirrorEnvIds ? [...payload.mirrorEnvIds] : []
      state.startedAt = payload.startedAt ?? null
    },
    RESET(state) {
      state.active = false
      state.envIds = []
      state.mainEnvId = null
      state.mirrorEnvIds = []
      state.startedAt = null
    },
  },

  actions: {
    async fetchState({ commit }) {
      const payload = await window.electronAPI.getSyncState() as any
      commit('SET_STATE', payload || {})
      return payload
    },

    handleSyncEvent({ commit }, payload: any) {
      const action = payload?.data?.action
      if (action === 'started') {
        commit('SET_STATE', payload.data.state || {})
        return
      }

      if (action === 'stopped') {
        commit('RESET')
      }
    },

    async stop({ dispatch }) {
      await window.electronAPI.stopSync()
      await dispatch('fetchState')
    },
  },
}
