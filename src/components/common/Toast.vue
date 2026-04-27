<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <transition-group name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto w-[360px] max-w-[90vw] px-4 py-3 rounded-lg shadow-lg text-sm text-white flex items-center gap-3"
          :class="typeClass(t.type)"
        >
          <span class="flex-1">{{ t.message }}</span>
          <button @click="remove(t.id)" class="shrink-0 opacity-70 hover:opacity-100 transition-opacity">&times;</button>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

let nextId = 0
const toasts = reactive<ToastItem[]>([])

function show(message: string, type: ToastType = 'info', duration = 3000) {
  const id = ++nextId
  toasts.push({ id, message, type })
  if (duration > 0) setTimeout(() => remove(id), duration)
}

function remove(id: number) {
  const idx = toasts.findIndex(t => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

function typeClass(type: ToastType): string {
  return {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
  }[type] ?? 'bg-slate-600'
}

defineExpose({ show, success: (m: string) => show(m, 'success'), error: (m: string) => show(m, 'error'), warning: (m: string) => show(m, 'warning'), info: (m: string) => show(m, 'info') })
</script>

<style scoped>
.toast-enter-active { transition: all 0.25s ease-out; }
.toast-leave-active { transition: all 0.15s ease-in; }
.toast-enter-from { transform: translateX(100%); opacity: 0; }
.toast-leave-to { transform: translateX(100%); opacity: 0; }
</style>
