<template>
  <div class="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
    <span class="min-w-[150px]">{{ rangeText }}</span>
    <div class="flex-1"></div>
    <label class="flex items-center gap-2">
      <span>每页</span>
      <select
        :value="pageSize"
        class="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
        @change="emitPageSize"
      >
        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
      </select>
    </label>
    <div class="flex items-center gap-1">
      <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(1)">首页</button>
      <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</button>
      <span class="px-2 text-slate-600">{{ currentPage }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">下一页</button>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="goToPage(totalPages)">末页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  total: number
  currentPage: number
  pageSize: number
  pageSizeOptions?: number[]
}>(), {
  pageSizeOptions: () => [10, 20, 50, 100],
})

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [pageSize: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeStart = computed(() => props.total === 0 ? 0 : (props.currentPage - 1) * props.pageSize + 1)
const rangeEnd = computed(() => Math.min(props.total, props.currentPage * props.pageSize))
const rangeText = computed(() => props.total === 0 ? '共 0 条' : `${rangeStart.value}-${rangeEnd.value} / 共 ${props.total} 条`)

function goToPage(page: number) {
  emit('update:currentPage', Math.min(Math.max(page, 1), totalPages.value))
}

function emitPageSize(event: Event) {
  const nextSize = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(nextSize)) emit('update:pageSize', nextSize)
}
</script>

<style scoped>
.page-btn {
  height: 30px;
  min-width: 42px;
  padding: 0 9px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
}
.page-btn:hover:not(:disabled) {
  background: #f8fafc;
  color: #1e293b;
}
.page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
