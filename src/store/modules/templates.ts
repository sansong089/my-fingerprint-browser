import type { ProfileTemplate } from '@/types'

interface TemplatesState {
  list: ProfileTemplate[]
  loading: boolean
}

const state: TemplatesState = {
  list: [],
  loading: false,
}

export default {
  namespaced: true,

  state,

  getters: {
    getById: (state) => (id: string): ProfileTemplate | undefined =>
      state.list.find(t => t.id === id),
  },

  mutations: {
    SET_LIST(state, list: ProfileTemplate[]) { state.list = list },
    ADD(state, template: ProfileTemplate) { state.list.push(template) },
    UPDATE(state, template: ProfileTemplate) {
      const idx = state.list.findIndex(t => t.id === template.id)
      if (idx !== -1) state.list[idx] = template
    },
    REMOVE(state, id: string) { state.list = state.list.filter(t => t.id !== id) },
    SET_LOADING(state, v: boolean) { state.loading = v },
  },

  actions: {
    async fetchAll({ commit }) {
      try {
        const templates = await window.electronAPI.invoke<ProfileTemplate[]>('get-templates')
        commit('SET_LIST', templates || [])
      } catch { commit('SET_LIST', []) }
    },

    async create({ commit }, data: Omit<ProfileTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
      const now = new Date().toISOString()
      const template = { ...data, id: `tpl_${Date.now()}`, createdAt: now, updatedAt: now }
      const result = await window.electronAPI.invoke<ProfileTemplate>('templates-create', template)
      commit('ADD', result || template)
      return result || template
    },

    async update({ commit }, data: Partial<ProfileTemplate> & { id: string }) {
      await window.electronAPI.invoke('templates-update', { ...data, updatedAt: new Date().toISOString() })
      const existing = state.list.find(t => t.id === data.id)
      if (existing) commit('UPDATE', { ...existing, ...data })
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('templates-delete', { id })
      commit('REMOVE', id)
    },

    /** 从模板创建新环境（返回环境初始数据） */
    applyToNew(_context, templateId: string): Omit<any, 'id'> | null {
      const template = state.list.find(t => t.id === templateId)
      if (!template) return null
      // 返回模板的 fingerprintConfig 副本（非引用）
      return {
        name: `${template.name} - 副本`,
        fingerprint: JSON.parse(JSON.stringify(template.fingerprintConfig)),
        color: undefined,
      }
    },
  },
}
