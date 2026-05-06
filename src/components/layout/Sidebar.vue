<template>
  <aside
    class="bg-slate-800 text-slate-100 flex flex-col shrink-0 transition-all duration-250 ease-in-out"
    :class="collapsed ? 'w-[60px]' : 'w-[200px]'"
  >
    <!-- 品牌区 -->
    <div class="h-14 flex items-center justify-center shrink-0">
      <span v-if="!collapsed" class="text-sm font-semibold">FPB</span>
      <svg v-else class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
      </svg>
    </div>

    <!-- 导航项 -->
    <nav class="flex-1 px-2 py-1 space-y-0.5">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 h-10 px-3 rounded-lg transition-colors group relative text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        :class="[
          collapsed ? 'justify-center' : '',
          isItemActive(item) ? 'bg-blue-500/10 !text-white' : '',
        ]"
        :title="collapsed ? item.label : undefined"
      >
        <component :is="item.icon" class="w-[20px] h-[20px] shrink-0" />
        <span v-if="!collapsed" class="text-[13px] font-medium">{{ item.label }}</span>
        <!-- 活跃指示：左边条 -->
        <span
          v-if="isItemActive(item) && !collapsed"
          class="absolute left-0 w-[3px] h-6 bg-blue-500 rounded-r"
        ></span>
      </router-link>
    </nav>

    <!-- 底部指纹纹理线 -->
    <div class="h-[2px] mx-3 mb-2 rounded-full"
      style="background: linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4)"
    ></div>

    <!-- 折叠按钮 -->
    <button
      @click="store.commit('ui/TOGGLE_SIDEBAR')"
      class="mx-auto mb-2 p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
      :title="collapsed ? '展开侧边栏' : '折叠侧边栏'"
    >
      <svg
        class="w-4 h-4 text-slate-400 transition-transform duration-250"
        :class="{ 'rotate-180': collapsed }"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
      </svg>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import {
  LayoutDashboard,
  Monitor,
  Globe,
  Code,
  Settings as SettingsIcon,
} from 'lucide-vue-next'

const store = useStore()
const route = useRoute()

interface NavItem {
  path: string
  label: string
  icon: any
  /** 额外激活前缀，匹配该前缀的路径也会高亮此项 */
  activePrefix?: string
}

const navItems: NavItem[] = [
  { path: '/', label: '概览', icon: LayoutDashboard },
  { path: '/environments', label: '环境', icon: Monitor },
  { path: '/proxies', label: '代理', icon: Globe },
  { path: '/plugins', label: '插件', icon: Code, activePrefix: '/plugins' },
  { path: '/scripts', label: '脚本', icon: Code },
  { path: '/settings', label: '设置', icon: SettingsIcon },
]

function isItemActive(item: NavItem): boolean {
  if (item.activePrefix) {
    return route.path === item.path || route.path.startsWith(item.activePrefix + '/')
  }
  return route.path === item.path
}

defineProps<{
  collapsed: boolean
}>()
</script>

