import type { Group } from '@/types'
import { getRandomEnvColor } from '@/constants/colors'

interface GroupsState {
  list: Group[]
  loading: boolean
}

const state: GroupsState = {
  list: [],
  loading: false,
}

export default {
  namespaced: true,

  state,

  getters: {
    getById: (state) => (id: string): Group | undefined =>
      state.list.find(g => g.id === id),

    getNameById: (state) => (id: string | undefined): string => {
      if (!id) return ''
      return state.list.find(g => g.id === id)?.name || ''
    },

    sortedByOrder(state): Group[] {
      return [...state.list].sort((a, b) => a.order - b.order)
    },
  },

  mutations: {
    SET_LIST(state, list: Group[]) { state.list = list },
    ADD(state, group: Group) { state.list.push(group) },
    UPDATE(state, group: Group) {
      const idx = state.list.findIndex(g => g.id === group.id)
      if (idx !== -1) state.list[idx] = group
    },
    REMOVE(state, id: string) {
      state.list = state.list.filter(g => g.id !== id)
    },
    SET_LOADING(state, loading: boolean) { state.loading = loading },
  },

  actions: {
    async fetchAll({ commit }) {
      // groups 暂时从 storageService 读取（后续新增 IPC handler）
      try {
        const groups = await window.electronAPI.invoke<Group[]>('get-groups')
        if (groups?.length) { commit('SET_LIST', groups); return }
        commit('SET_LIST', [])
      } catch {
        // IPC 未注册，使用空列表
        commit('SET_LIST', [])
      }
    },

    async create({ commit }, data: { name: string; color?: string }) {
      const group: Group = {
        id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        color: data.color || getRandomEnvColor(),
        order: state.list.length,
        createdAt: new Date().toISOString(),
      }

      const result = await window.electronAPI.invoke<Group>('groups-create', group)
      commit('ADD', result || group)
      return result || group
    },

    async update({ commit }, data: Partial<Group> & { id: string }) {
      await window.electronAPI.invoke('groups-update', data)
      const existing = state.list.find(g => g.id === data.id)
      if (existing) { commit('UPDATE', { ...existing, ...data }) }
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('groups-delete', { id })
      commit('REMOVE', id)
    },

    /** 重排序 */
    reorder({ commit }, groups: Group[]) {
      const updated = groups.map((g, i) => ({ ...g, order: i }))
      updated.forEach(g => commit('UPDATE', g))
    },
  },
}
