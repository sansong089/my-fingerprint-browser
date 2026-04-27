import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

// 懒加载视图
const OverviewView = () => import('@/views/OverviewView.vue')
const EnvironmentsView = () => import('@/views/EnvironmentsView.vue')
const ProxiesView = () => import('@/views/ProxiesView.vue')
const ScriptsView = () => import('@/views/ScriptsView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'Overview', component: OverviewView },
  { path: '/environments', name: 'Environments', component: EnvironmentsView },
  { path: '/proxies', name: 'Proxies', component: ProxiesView },
  { path: '/scripts', name: 'Scripts', component: ScriptsView },
  { path: '/settings', name: 'Settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
