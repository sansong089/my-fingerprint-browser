<template>
  <div class="flex items-center gap-3 rounded-b-md border-t border-slate-100 bg-white px-4 py-4 text-xs text-slate-500">
    <span class="min-w-[150px]">{{ rangeText }}</span>
    <div class="flex-1"></div>
    <label class="flex items-center gap-2">
      <span>每页</span>
      <span class="page-size-select-wrap">
        <select
          :value="pageSize"
          class="page-size-select"
          @change="emitPageSize"
        >
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ pageSizeLabel(size) }}</option>
        </select>
        <ChevronDownIcon class="page-size-select__icon" />
      </span>
    </label>
    <div class="flex items-center gap-0.5">
      <button class="page-btn" :disabled="currentPage <= 1" aria-label="首页" :data-label="'首页'" @click="goToPage(1)">
        <SkipBackIcon class="page-btn__icon" />
      </button>
      <button class="page-btn" :disabled="currentPage <= 1" aria-label="上一页" :data-label="'上一页'" @click="goToPage(currentPage - 1)">
        <ChevronLeftIcon class="page-btn__icon" />
      </button>
      <span class="px-2 text-slate-600">{{ currentPage }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="currentPage >= totalPages" aria-label="下一页" :data-label="'下一页'" @click="goToPage(currentPage + 1)">
        <ChevronRightIcon class="page-btn__icon" />
      </button>
      <button class="page-btn" :disabled="currentPage >= totalPages" aria-label="末页" :data-label="'末页'" @click="goToPage(totalPages)">
        <SkipForwardIcon class="page-btn__icon" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  total: number
  currentPage: number
  pageSize: number
  pageSizeOptions?: number[]
}>(), {
  pageSizeOptions: () => [10, 20, 50, 100, 0],
})

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [pageSize: number]
}>()

const effectivePageSize = computed(() => props.pageSize === 0 ? Math.max(1, props.total) : props.pageSize)
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / effectivePageSize.value)))
const rangeStart = computed(() => props.total === 0 ? 0 : (props.currentPage - 1) * effectivePageSize.value + 1)
const rangeEnd = computed(() => Math.min(props.total, props.currentPage * effectivePageSize.value))
const rangeText = computed(() => props.total === 0 ? '共 0 条' : `${rangeStart.value}-${rangeEnd.value} / 共 ${props.total} 条`)

function goToPage(page: number) {
  emit('update:currentPage', Math.min(Math.max(page, 1), totalPages.value))
}

function emitPageSize(event: Event) {
  const nextSize = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(nextSize)) emit('update:pageSize', nextSize)
}

function pageSizeLabel(size: number): string {
  return size === 0 ? '全部' : String(size)
}
</script>

<style scoped>
.page-size-select-wrap {
  position: relative;
  display: inline-flex;
}
.page-size-select {
  width: 68px;
  height: 32px;
  padding: 0 28px 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  appearance: none;
  background: #fff;
  color: #334155;
  font-size: 12px;
  outline: none;
}
.page-size-select:focus {
  border-color: #cbd5e1;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.18);
}
.page-size-select__icon {
  position: absolute;
  right: 10px;
  top: 50%;
  width: 14px;
  height: 14px;
  color: #111827;
  pointer-events: none;
  transform: translateY(-50%);
}
.page-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  width: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #111827;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  overflow: visible;
}
.page-btn__icon {
  width: 14px;
  height: 14px;
  color: currentColor;
}
.page-btn:hover:not(:disabled) {
  background: #f2f2f2;
  color: #000000;
}
.page-btn::after {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  top: calc(100% + 6px);
  left: 50%;
  z-index: 20;
  padding: 0 6px;
  border-radius: 4px;
  background: #0f172a;
  color: #fff;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -2px);
  transition: opacity 120ms ease, transform 120ms ease;
  content: attr(data-label);
}
.page-btn:hover:not(:disabled)::after,
.page-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
.page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
