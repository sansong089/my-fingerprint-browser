import type { ProxyGroup } from '@/types'
import { getRandomEnvColor } from '@/constants/colors'

interface ProxyGroupsState {
  list: ProxyGroup[]
  loading: boolean
}

const state: ProxyGroupsState = {
  list: [],
  loading: false,
}

export default {
  namespaced: true,

  state,

  getters: {
    getById: (state) => (id: string): ProxyGroup | undefined =>
      state.list.find(g => g.id === id),

    sortedByOrder(state): ProxyGroup[] {
      return [...state.list].sort((a, b) => a.order - b.order)
    },
  },

  mutations: {
    SET_LIST(state, list: ProxyGroup[]) { state.list = list },
    ADD(state, group: ProxyGroup) { state.list.push(group) },
    UPDATE(state, group: ProxyGroup) {
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
      try {
        const groups = await window.electronAPI.invoke<ProxyGroup[]>('get-proxy-groups')
        if (groups?.length) { commit('SET_LIST', groups); return }
        commit('SET_LIST', [])
      } catch {
        commit('SET_LIST', [])
      }
    },

    async create({ commit }, data: { name: string; color?: string }) {
      const group: ProxyGroup = {
        id: `pgrp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        color: data.color || getRandomEnvColor(),
        order: state.list.length,
        createdAt: new Date().toISOString(),
      }

      const result = await window.electronAPI.invoke<ProxyGroup>('proxy-groups-create', group)
      commit('ADD', result || group)
      return result || group
    },

    async update({ commit }, data: Partial<ProxyGroup> & { id: string }) {
      await window.electronAPI.invoke('proxy-groups-update', data)
      const existing = state.list.find(g => g.id === data.id)
      if (existing) { commit('UPDATE', { ...existing, ...data }) }
    },

    async delete({ commit }, id: string) {
      await window.electronAPI.invoke('proxy-groups-delete', { id })
      commit('REMOVE', id)
    },

    reorder({ commit }, groups: ProxyGroup[]) {
      const updated = groups.map((g, i) => ({ ...g, order: i }))
      updated.forEach(g => commit('UPDATE', g))
    },
  },
}
