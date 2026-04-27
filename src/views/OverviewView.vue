<template>
  <div class="h-full p-6 overflow-y-auto">
    <!-- P0: 运行状态横条 -->
    <section class="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <div class="flex items-center gap-8">
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">运行中环境</p>
          <p class="text-[28px] font-bold text-emerald-600 leading-none">{{ runningCount }}</p>
        </div>
        <div class="w-px h-10 bg-slate-200"></div>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">总环境数</p>
          <p class="text-[28px] font-bold text-slate-800 leading-none">{{ totalCount }}</p>
        </div>
        <div class="w-px h-10 bg-slate-200"></div>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">同步状态</p>
          <p class="text-base font-semibold" :class="syncActive ? 'text-blue-600' : 'text-slate-500'">
            {{ syncActive ? '已启用' : '未启用' }}
          </p>
        </div>
      </div>
    </section>

    <!-- P1: 快速操作 -->
    <section class="mb-6">
      <h2 class="text-sm font-semibold text-slate-700 mb-3">快速操作</h2>
      <div class="flex gap-3">
        <button @click="$router.push('/environments')" class="btn-outline">
          管理环境
        </button>
        <button @click="quickLaunchAll" :disabled="runningCount === stoppedCount" class="btn-outline">
          全部启动
        </button>
        <button @click="closeAllRunning" :disabled="runningCount === 0" class="btn-outline-danger">
          全部关闭
        </button>
      </div>
    </section>

    <!-- P1/P2: 最近使用环境 -->
    <section v-if="recentEnvironments.length > 0">
      <h2 class="text-sm font-semibold text-slate-700 mb-3">最近使用</h2>
      <div class="space-y-2">
        <div
          v-for="env in recentEnvironments.slice(0, 5)"
          :key="env.id"
          class="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
          @click="$router.push('/environments')"
        >
          <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: env.color }"></div>
          <span class="text-sm font-medium text-slate-700 flex-1">{{ env.name }}</span>
          <span
            class="text-[11px] px-2 py-0.5 rounded-full"
            :class="env.status === 'running' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'"
          >{{ env.status === 'running' ? '运行中' : '已停止' }}</span>
        </div>
      </div>
    </section>

    <!-- Empty State -->
    <section v-if="totalCount === 0" class="flex flex-col items-center justify-center py-16">
      <svg class="w-16 h-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
      </svg>
      <p class="text-slate-500 font-medium mb-2">还没有任何环境</p>
      <p class="text-slate-400 text-sm mb-4">创建第一个指纹浏览器环境开始使用</p>
      <button @click="$router.push('/environments')" class="btn-primary">创建环境</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()
const environments = computed(() => store.state.environments?.list || [])
const runningCount = computed(() => environments.value.filter((e: any) => e.status === 'running').length)
const totalCount = computed(() => environments.value.length)
const stoppedCount = computed(() => environments.value.filter((e: any) => e.status !== 'running').length)
const syncActive = computed(() => (store.state.sync as any)?.active ?? false)

const recentEnvironments = computed(() =>
  [...environments.value]
    .sort((a: any, b: any) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
)

const quickLaunchAll = async () => {
  const stopped = environments.value.filter((e: any) => e.status !== 'running')
  for (const env of stopped) {
    await store.dispatch('environments/launch', env.id)
  }
}

const closeAllRunning = async () => {
  await window.electronAPI.closeAll()
  await store.dispatch('environments/fetchAll')
}
</script>
