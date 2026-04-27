<template>
  <header class="h-12 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 z-10">
    <div class="flex items-center gap-3">
      <!-- 品牌区 -->
      <button
        @click="$router.push('/')"
        class="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          />
          </svg>
        </div>
        <h1 class="text-base font-semibold text-slate-800">FPB</h1>
      </button>
    </div>

    <div class="flex-1"></div>

    <div class="flex items-center gap-2">
      <div v-if="syncActive" class="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-md">
        <span class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
        <span class="text-xs text-blue-700 font-medium">同步中</span>
        <button @click="stopSync" class="ml-1 text-xs text-blue-600 hover:text-blue-800">
          停止
        </button>
      </div>

      <button
        @click="$router.push('/settings')"
        class="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        title="设置"
      >
        <svg class="w-[18px] h-[18px] text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()
const syncActive = computed(() => (store.state.sync as any)?.active ?? false)

const stopSync = async () => {
  await store.dispatch('sync/stop')
}
</script>
