import type { InjectionKey } from 'vuex'

export interface UiState {
  sidebarCollapsed: boolean
  currentGroupId: string | null
  searchQuery: string
  selectedEnvIds: string[]
}

const state: UiState = {
  sidebarCollapsed: false,
  currentGroupId: null,
  searchQuery: '',
  selectedEnvIds: [],
}

export default {
  namespaced: true,
  state,

  getters: {
    hasSelection(state): boolean { return state.selectedEnvIds.length > 0 },
    selectionCount(state): number { return state.selectedEnvIds.length },
  },

  mutations: {
    TOGGLE_SIDEBAR(state) { state.sidebarCollapsed = !state.sidebarCollapsed },
    SET_SIDEBAR(state, collapsed: boolean) { state.sidebarCollapsed = collapsed },
    SET_CURRENT_GROUP(state, groupId: string | null) { state.currentGroupId = groupId },
    SET_SEARCH_QUERY(state, query: string) { state.searchQuery = query },
    SELECT_ENV(state, id: string) {
      if (!state.selectedEnvIds.includes(id)) state.selectedEnvIds.push(id)
    },
    DESELECT_ENV(state, id: string) {
      const idx = state.selectedEnvIds.indexOf(id)
      if (idx !== -1) state.selectedEnvIds.splice(idx, 1)
    },
    TOGGLE_ENV_SELECTION(state, id: string) {
      const idx = state.selectedEnvIds.indexOf(id)
      if (idx === -1) state.selectedEnvIds.push(id)
      else state.selectedEnvIds.splice(idx, 1)
    },
    CLEAR_SELECTION(state) { state.selectedEnvIds = [] },
    SET_SELECTED_ENV_IDS(state, ids: string[]) { state.selectedEnvIds = ids },
  },

  actions: {
    toggleSidebar({ commit }) { commit('TOGGLE_SIDEBAR') },
    setCurrentGroup({ commit }, groupId: string | null) { commit('SET_CURRENT_GROUP', groupId) },
    selectEnv({ commit }, id: string) { commit('SELECT_ENV', id) },
    toggleEnvSelection({ commit }, id: string) { commit('TOGGLE_ENV_SELECTION', id) },
    clearSelection({ commit }) { commit('CLEAR_SELECTION') },
  },
}
