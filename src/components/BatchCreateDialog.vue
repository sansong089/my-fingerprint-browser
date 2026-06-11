<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-xl w-full max-w-md max-h-[85vh] overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 class="text-base font-semibold text-slate-800">从模板批量创建</h3>
        <button @click="$emit('close')" class="p-1 hover:bg-slate-100 rounded text-slate-400">&times;</button>
      </div>

      <div class="p-6 space-y-4 overflow-y-auto" style="max-height: calc(85vh - 130px)">
        <!-- 选择模板 -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">选择模板</label>
          <select v-model="selectedTemplateId" class="input w-full text-sm">
            <option value="">-- 请选择模板 --</option>
            <option v-for="t in templatesList" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <p v-if="selectedTemplate" class="mt-1 text-[11px] text-slate-400">{{ selectedTemplate.description || '无描述' }}</p>
        </div>

        <!-- 批量数量 -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">创建数量</label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="count"
              type="number"
              min="1"
              max="100"
              class="input text-sm w-28"
            />
            <span class="text-xs text-slate-500">个环境（1~100）</span>
          </div>
        </div>

        <!-- 命名前缀（可选） -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">命名前缀</label>
          <input
            v-model="namePrefix"
            type="text"
            class="input w-full text-sm"
            placeholder="留空则使用模板名称"
          />
        </div>

        <!-- 分组分配（可选） -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">分配到分组</label>
          <select v-model="targetGroupId" class="input w-full text-sm">
            <option value="">不分配</option>
            <option v-for="g in groupsList" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>

        <!-- 预览 -->
        <div v-if="previewNames.length > 0" class="rounded-lg bg-slate-50 p-3 border border-slate-100">
          <p class="text-xs font-medium text-slate-500 mb-2">预览：</p>
          <div class="max-h-32 overflow-y-auto space-y-0.5">
            <p v-for="(name, i) in previewNames" :key="i" class="text-xs text-slate-600 font-mono">{{ i + 1 }}. {{ name }}</p>
          </div>
          <p v-if="previewNames.length > 10" class="text-[11px] text-slate-400 mt-1">... 仅显示前 {{ Math.min(previewNames.length, 20) }} 条</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-200 flex justify-center gap-2">
        <button @click="$emit('close')" class="btn btn-secondary text-sm">取消</button>
        <button
          @click="confirmCreate"
          :disabled="!canCreate"
          class="btn btn-primary text-sm"
        >
          创建 {{ count }} 个环境
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', environments: Array<{ name: string; fingerprint?: any; color?: string; groupId?: string }>): void
}>()

const selectedTemplateId = ref('')
const count = ref(5)
const namePrefix = ref('')
const targetGroupId = ref('')

onMounted(() => {
  if (templatesList.value.length === 0) store.dispatch('templates/fetchAll')
  if (groupsList.value.length === 0) store.dispatch('groups/fetchAll')
})

// ---- 数据源 ----
const templatesList = computed(() => (store.state.templates as any)?.list || [])
const groupsList = computed(() => (store.state.groups as any)?.list || [])

const selectedTemplate = computed(() =>
  templatesList.value.find((t: any) => t.id === selectedTemplateId.value)
)

// 预览名称列表
const previewNames = computed(() => {
  if (!selectedTemplate.value && !namePrefix.value.trim()) return []
  const baseName = namePrefix.value.trim() || selectedTemplate.value?.name || '环境'
  const result: string[] = []
  for (let i = 1; i <= Math.min(count.value, 20); i++) {
    result.push(`${baseName}_${i}`)
  }
  return result
})

const canCreate = computed(() =>
  selectedTemplateId.value !== '' &&
  count.value >= 1 &&
  count.value <= 100
)

async function confirmCreate() {
  if (!canCreate.value || !selectedTemplate.value) return

  const baseName = namePrefix.value.trim() || selectedTemplate.value?.name || '环境'
  const environments: Array<{ name: string; fingerprint?: any; color?: string | undefined; groupId?: string | undefined }> = []

  for (let i = 1; i <= count.value; i++) {
    // 每个环境使用不同的 seed 以保证指纹不同
    const fingerprint: any = JSON.parse(JSON.stringify(selectedTemplate.value.fingerprintConfig))
    if (fingerprint.seed) {
      fingerprint.seed = fingerprint.seed + Math.floor(Math.random() * 9999)
    }

    environments.push({
      name: `${baseName}_${i}`,
      fingerprint,
      color: undefined, // 让 EnvironmentManager 自动分配
      groupId: targetGroupId.value || undefined,
    })
  }

  emit('created', environments as any)
}
</script>

<style scoped>
.input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  font-size: 13px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}
.input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}
.btn-primary {
  background: #3b82f6; color: white;
}
.btn-primary:hover { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: white; color: #374151; border: 1px solid #d1d5db;
}
.btn-secondary:hover { background: #f9fafb; }
</style>
