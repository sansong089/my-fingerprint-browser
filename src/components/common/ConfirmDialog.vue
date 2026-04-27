<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center" @click.self="onCancel">
      <div class="bg-white rounded-xl shadow-xl w-[400px] max-w-[90vw] overflow-hidden animate-scale-in">
        <!-- 标题栏 -->
        <div class="px-6 py-4 border-b border-slate-200">
          <h3 class="text-base font-semibold text-slate-800">{{ title }}</h3>
        </div>

        <!-- 内容区 -->
        <div class="px-6 py-5 text-sm text-slate-600 leading-relaxed">
          <slot>{{ message }}</slot>
        </div>

        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50/50">
          <button @click="onCancel" class="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
            {{ cancelText }}
          </button>
          <button
            @click="onConfirm"
            :class="
              danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
            "
            class="px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors"
          >{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>(), {
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const visible = ref(true)

function open() { visible.value = true }
function close() { visible.value = false }

function onConfirm() { close(); emit('confirm') }
function onCancel() { close(); emit('cancel') }

defineExpose({ open, close })
</script>

<style scoped>
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-scale-in { animation: scaleIn 0.2s ease-out; }
</style>
