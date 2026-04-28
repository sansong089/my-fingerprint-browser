<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- 顶部工具栏 -->
    <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
      <div>
        <h2 class="text-base font-semibold text-slate-800">插件管理</h2>
        <p class="text-xs text-slate-500 mt-0.5">管理已安装到应用的 Chrome 扩展插件。</p>
      </div>
      <router-link
        to="/plugins/store"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
        </svg>
        插件商店
      </router-link>
    </div>

    <!-- 主体内容：可滚动区 -->
    <div class="flex-1 overflow-y-auto px-6 py-5">

      <!-- 空状态 -->
      <div v-if="plugins.length === 0" class="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
        <div class="w-16 h-16 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
        </div>
        <p class="text-sm font-medium text-slate-700 mb-1">还没有安装任何插件</p>
        <p class="text-xs text-slate-500 mb-4">点击右上角「插件商店」浏览并安装 Chrome 扩展。</p>
        <router-link
          to="/plugins/store"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          前往插件商店
        </router-link>
      </div>

      <!-- 网格列表 -->
      <div v-else>
        <p class="text-xs text-slate-500 mb-4">共 {{ plugins.length }} 个已安装插件</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="plugin in plugins"
            :key="plugin.id"
            class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
          >
            <!-- 图标 + 名称 -->
            <div class="flex items-start gap-3">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
                <img v-if="plugin.iconUrl" :src="plugin.iconUrl" class="w-10 h-10 object-cover" alt="" />
                <svg v-else class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-800 truncate leading-snug">{{ plugin.name }}</p>
                <p class="text-[11px] text-slate-400 truncate mt-0.5">v{{ plugin.version }}</p>
              </div>
            </div>

            <!-- 描述 -->
            <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed flex-1">
              {{ plugin.description || '暂无描述。' }}
            </p>

            <!-- 统计指标 -->
            <div class="grid grid-cols-3 gap-1.5 text-[11px]">
              <div class="metric-chip">
                <span class="text-slate-400">目标</span>
                <strong class="text-slate-700">{{ plugin.targetedEnvCount }}</strong>
              </div>
              <div class="metric-chip">
                <span class="text-slate-400">已装</span>
                <strong class="text-slate-700">{{ plugin.installedEnvCount }}</strong>
              </div>
              <div class="metric-chip" :class="plugin.missingEnvCount > 0 ? 'metric-chip-warn' : ''">
                <span>缺失</span>
                <strong>{{ plugin.missingEnvCount }}</strong>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex gap-2 pt-1">
              <button
                class="flex-1 text-xs py-1.5 px-2 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                :disabled="plugin.missingEnvCount === 0"
                :class="plugin.missingEnvCount === 0 ? 'opacity-40 cursor-not-allowed' : ''"
                @click="reinstallMissing(plugin.id)"
              >
                补装缺失
              </button>
              <button
                class="flex-1 text-xs py-1.5 px-2 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                @click="confirmUninstall(plugin)"
              >
                卸载
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 卸载确认弹窗 -->
    <Teleport to="body">
      <div
        v-if="uninstallTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="uninstallTarget = null"
      >
        <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
          <div class="flex items-start gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800">卸载插件</p>
              <p class="text-xs text-slate-500 mt-1">
                确认从应用移除 <span class="font-medium text-slate-700">{{ uninstallTarget.name }}</span>？此操作会从所有环境目标列表中移除该插件。
              </p>
            </div>
          </div>
          <div class="flex gap-2 justify-end">
            <button
              class="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              @click="uninstallTarget = null"
            >
              取消
            </button>
            <button
              class="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              @click="doUninstall"
            >
              确认卸载
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { toast } from '@/utils/toast'
import type { PluginListItem } from '@/types'

const store = useStore()
const plugins = computed<PluginListItem[]>(() => (store.state.plugins as any)?.list || [])
const uninstallTarget = ref<PluginListItem | null>(null)

onMounted(async () => {
  await store.dispatch('plugins/fetchAll')
})

function confirmUninstall(plugin: PluginListItem) {
  uninstallTarget.value = plugin
}

async function doUninstall() {
  if (!uninstallTarget.value) return
  const target = uninstallTarget.value
  uninstallTarget.value = null
  try {
    await store.dispatch('plugins/uninstall', target.id)
    toast.success(`「${target.name}」已从所有环境目标列表中移除。`)
  } catch (e: any) {
    toast.error(e.message || '卸载失败。')
  }
}

async function reinstallMissing(pluginId: string) {
  try {
    await store.dispatch('plugins/reinstallMissing', pluginId)
    toast.success('已触发缺失环境补装。')
  } catch (e: any) {
    toast.error(e.message || '补装触发失败。')
  }
}
</script>

<style scoped>
.metric-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 6px;
}
.metric-chip span { color: #94a3b8; font-size: 10px; }
.metric-chip strong { color: #1e293b; font-weight: 600; }
.metric-chip-warn {
  background: #fff7ed;
  border-color: #fed7aa;
}
.metric-chip-warn span { color: #c2410c; }
.metric-chip-warn strong { color: #9a3412; }

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
