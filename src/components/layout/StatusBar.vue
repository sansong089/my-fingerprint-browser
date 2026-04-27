<template>
  <footer class="h-8 bg-slate-100 border-t border-slate-200 flex items-center px-4 text-[12px] shrink-0">
    <!-- 左区：运行计数 -->
    <div class="flex items-center gap-1.5">
      <span class="text-slate-500">运行中:</span>
      <span class="font-semibold text-emerald-600">{{ runningCount }}</span>
      <span class="text-slate-400">/</span>
      <span class="text-slate-500">{{ totalCount }}</span>
    </div>

    <div class="flex-1"></div>

    <!-- 中区：最近操作摘要 -->
    <div class="text-slate-400 truncate max-w-[300px] hidden md:block" v-if="lastAction">
      {{ lastAction }}
    </div>

    <div class="flex-1"></div>

    <!-- 右区：版本号 -->
    <span class="text-slate-400 font-mono">v2.0</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

const runningCount = computed(() => {
  const envs = store.state.environments?.list || []
  return envs.filter((e: any) => e.status === 'running').length
})

const totalCount = computed(() => (store.state.environments?.list || []).length)
const lastAction = computed(() => '')
</script>
