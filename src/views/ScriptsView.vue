<template>
  <div class="h-full p-6 overflow-y-auto">
    <div class="flex items-center gap-3 mb-5">
      <h2 class="text-base font-semibold text-slate-800">自动化脚本</h2>
      <div v-if="recordingState === 'recording'" class="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 rounded-md">
        <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        <span class="text-xs text-red-600 font-medium">录制中</span>
      </div>
      <div class="flex-1"></div>
      <button @click="$router.push('/environments')" class="btn-outline text-xs">新建脚本</button>
      <button
        @click="toggleRecord"
        :class="recordingState === 'recording' ? 'btn-danger' : 'btn-primary'"
        class="text-xs"
      >{{ recordingState === 'recording' ? '停止录制' : '开始录制' }}</button>
    </div>

    <!-- 脚本卡片网格 -->
    <div v-if="scripts.length > 0" class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      <div v-for="script in scripts" :key="script.id"
        class="bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-300 transition-colors cursor-pointer"
        @click="showDetail = script"
      >
        <h3 class="font-medium text-sm text-slate-800 mb-1">{{ script.name }}</h3>
        <p class="text-xs text-slate-400 line-clamp-2">{{ script.description || '无描述' }}</p>
        <div class="mt-3 flex justify-between items-center text-[11px] text-slate-400">
          <span>{{ script.steps.length }} 步骤</span>
          <span>{{ new Date(script.updatedAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col items-center justify-center py-16 text-slate-400">
      <p>暂无脚本</p>
      <p class="text-sm mt-1">录制浏览器操作或手动创建自动化脚本</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useStore } from 'vuex'

const store = useStore()
onMounted(() => { store.dispatch('scripts/fetchAll') })
const scripts = computed(() => (store.state.scripts as any)?.list || [])
const recordingState = computed(() => (store.state.scripts as any)?.recordingState ?? 'idle')
const showDetail = ref<any>(null)

async function toggleRecord() {
  if (recordingState.value === 'recording') await store.dispatch('scripts/stopRecord')
  else await store.dispatch('scripts/startRecord')
}
</script>

<style scoped>.btn-primary { padding: 7px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
.btn-outline { padding: 7px 16px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; cursor: pointer; }
.btn-danger { padding: 7px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; }</style>
