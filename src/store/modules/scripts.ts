import type { Script } from '@/types'

interface ScriptsState {
  list: Script[]
  loading: boolean
  recordingState: 'idle' | 'recording' | 'playing'
}

const state: ScriptsState = {
  list: [],
  loading: false,
  recordingState: 'idle',
}

export default {
  namespaced: true,

  state,

  getters: {
    getById: (state) => (id: string): Script | undefined =>
      state.list.find(s => s.id === id),
    isRecording(state): boolean { return state.recordingState === 'recording' },
  },

  mutations: {
    SET_LIST(state, list: Script[]) { state.list = list },
    ADD(state, script: Script) { state.list.push(script) },
    UPDATE(state, script: Script) {
      const idx = state.list.findIndex(s => s.id === script.id)
      if (idx !== -1) state.list[idx] = script
    },
    REMOVE(state, id: string) { state.list = state.list.filter(s => s.id !== id) },
    SET_LOADING(state, v: boolean) { state.loading = v },
    SET_RECORDING_STATE(state, v: ScriptsState['recordingState']) { state.recordingState = v },
  },

  actions: {
    async fetchAll({ commit }) {
      try {
        const scripts = await window.electronAPI.invoke<Script[]>('get-scripts')
        commit('SET_LIST', scripts || [])
      } catch { commit('SET_LIST', []) }
    },

    async create({ commit }, data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) {
      const now = new Date().toISOString()
      const script = { ...data, id: `script_${Date.now()}`, createdAt: now, updatedAt: now }
      const result = await window.electronAPI.invoke<Script>('scripts-create', script)
      commit('ADD', result || script)
      return result || script
    },

    async update({ commit }, data: Partial<Script> & { id: string }) {
      await window.electronAPI.invoke('scripts-update', { ...data, updatedAt: new Date().toISOString() })
      const existing = state.list.find(s => s.id === data.id)
      if (existing) commit('UPDATE', { ...existing, ...data })
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('scripts-delete', { id })
      commit('REMOVE', id)
    },

    /** 开始录制 */
    async startRecord({ commit }) {
      await window.electronAPI.invoke('start-record')
      commit('SET_RECORDING_STATE', 'recording')
    },

    /** 停止录制 */
    async stopRecord({ commit }) {
      const result = await window.electronAPI.invoke<Script>('stop-record')
      if (result) commit('ADD', result)
      commit('SET_RECORDING_STATE', 'idle')
      return result
    },

    /** 运行脚本 */
    async run(_context, { scriptId, envId }: { scriptId: string; envId: string }) {
      return await window.electronAPI.invoke<{ success: boolean; error?: string }>('run-script', { scriptId, envId })
    },
  },
}
