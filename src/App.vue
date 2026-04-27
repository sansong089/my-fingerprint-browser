<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <!-- 顶部工具栏 (48px) -->
    <AppHeader />

    <!-- 主布局: Sidebar + router-view -->
    <div class="flex flex-1 min-h-0">
      <!-- 全局侧边栏 (200px / 60px) -->
      <Sidebar :collapsed="sidebarCollapsed" />

      <!-- 内容区 -->
      <main class="flex-1 min-w-0 overflow-hidden">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" class="h-full" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 底部状态栏 (32px) -->
    <StatusBar />

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from 'vuex'
import AppHeader from '@/components/layout/AppHeader.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import Toast from '@/components/common/Toast.vue'
import { registerToast, unregisterToast } from '@/utils/toast'

const store = useStore()
const sidebarCollapsed = computed(() => (store.state.ui as any)?.sidebarCollapsed ?? false)
let browserEventHandler: ((...args: unknown[]) => void) | null = null
const toastRef = ref<any>(null)

onMounted(() => {
  if (toastRef.value) registerToast(toastRef.value)
  store.dispatch('sync/fetchState')
  browserEventHandler = window.electronAPI.onAppEvent('browser-event', (payload) => {
    store.dispatch('environments/handleBrowserEvent', payload)
    if ((payload as any)?.type === 'sync-event') {
      store.dispatch('sync/handleSyncEvent', payload)
    }
  })
})

onUnmounted(() => {
  if (toastRef.value) unregisterToast(toastRef.value)
  if (browserEventHandler) {
    window.electronAPI.offAppEvent('browser-event', browserEventHandler)
    browserEventHandler = null
  }
})
</script>

<style>
/* 页面切换动画 */
.page-enter-active { transition: opacity 0.2s ease-out, transform 0.2s ease-out; }
.page-leave-active { transition: opacity 0.15s ease-in, transform 0.15s ease-in; }
.page-enter-from { opacity: 0; transform: translateY(4px); }
.page-leave-to { opacity: 0; }

/* 全局滚动条样式 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
