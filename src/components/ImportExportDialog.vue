<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 class="text-base font-semibold text-slate-800">{{ mode === 'export' ? '导出环境' : '导入环境' }}</h3>
        <button @click="$emit('close')" class="p-1 hover:bg-slate-100 rounded text-slate-400">&times;</button>
      </div>

      <!-- Tab 切换 -->
      <div class="px-6 pt-3 flex gap-1 border-b border-slate-200">
        <button
          class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="mode === 'export' ? 'bg-white border-x border-t border-b-0 border-slate-200 -mb-px text-blue-600' : 'text-slate-500 hover:text-slate-700'"
          @click="mode = 'export'"
        >📤 导出</button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="mode === 'import' ? 'bg-white border-x border-t border-b-0 border-slate-200 -mb-px text-blue-600' : 'text-slate-500 hover:text-slate-700'"
          @click="mode = 'import'"
        >📥 导入</button>
      </div>

      <!-- 导出模式 -->
      <div v-if="mode === 'export'" class="p-6 space-y-4 overflow-y-auto" style="max-height: calc(85vh - 180px)">
        <!-- 选择要导出的环境 -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">选择要导出的环境</label>
          <div class="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
            <!-- 全选 -->
            <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
              <input type="checkbox" :checked="isAllExportSelected" @change="toggleExportSelectAll" />
              <span class="text-xs font-medium text-slate-600">全选 ({{ environments.length }})</span>
            </label>
            <div v-for="env in environments" :key="env.id"
              class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
            >
              <input type="checkbox" :value="env.id" v-model="selectedExportIds" />
              <span class="inline-block w-3 h-3 rounded-full mr-1 shrink-0" :style="{ backgroundColor: env.color || '#94a3b8' }"></span>
              <span class="text-xs text-slate-700 truncate">{{ env.name }}</span>
            </div>
          </div>
          <p class="mt-1 text-[11px] text-slate-400">已选择 {{ selectedExportIds.length }} 个</p>
        </div>

        <!-- 导出格式 -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">格式</label>
          <select v-model="exportFormat" class="input w-full text-sm">
            <option value="json">JSON（完整数据）</option>
            <option value="csv">CSV（表格）</option>
          </select>
        </div>

        <!-- 导出预览 -->
        <div v-if="selectedExportIds.length > 0" class="rounded-lg bg-slate-50 p-3 border border-slate-100">
          <p class="text-xs font-medium text-slate-500 mb-1.5">预览：</p>
          <pre class="text-[11px] text-slate-600 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">{{ exportPreview }}</pre>
        </div>
      </div>

      <!-- 导入模式 -->
      <div v-if="mode === 'import'" class="p-6 space-y-4 overflow-y-auto" style="max-height: calc(85vh - 180px)">
        <!-- 文件上传区域 -->
        <div
          class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
          :class="isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
        >
          <input ref="fileInputRef" type="file" accept=".json,.csv" class="hidden" @change="handleFileSelect" />
          <p class="text-sm text-slate-600">拖拽文件到此处，或点击选择文件</p>
          <p class="mt-1 text-[11px] text-slate-400">支持 .json 和 .csv 格式，最大 10MB</p>
        </div>

        <!-- 导入结果/错误 -->
        <div v-if="importError" class="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p class="text-xs text-red-600">⚠️ {{ importError }}</p>
        </div>

        <div v-if="parsedImportData.length > 0" class="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p class="text-xs text-emerald-700 font-medium mb-1">✅ 解析成功：{{ parsedImportData.length }} 条记录</p>
          <ul class="text-[11px] text-emerald-600 space-y-0.5 max-h-28 overflow-y-auto list-disc pl-4">
            <li v-for="(item, i) in parsedImportData.slice(0, 20)" :key="i">{{ item.name || '(未命名)' }}{{ i >= 19 ? ` ... (共 ${parsedImportData.length} 条)` : '' }}</li>
          </ul>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
        <button @click="$emit('close')" class="btn btn-secondary text-sm">取消</button>
        <button
          v-if="mode === 'export'"
          @click="doExport"
          :disabled="selectedExportIds.length === 0"
          class="btn btn-primary text-sm"
        >
          导出 {{ selectedExportIds.length }} 个
        </button>
        <button
          v-if="mode === 'import'"
          @click="doImport"
          :disabled="parsedImportData.length === 0"
          class="btn btn-primary text-sm"
        >
          导入 {{ parsedImportData.length }} 个环境
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
  (e: 'imported', count: number): void
}>()

// ---- 状态 ----
const mode = ref<'export' | 'import'>('export')
const selectedExportIds = ref<string[]>([])
const exportFormat = ref<'json' | 'csv'>('json')

// 导入状态
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const importError = ref('')
const parsedImportData = ref<any[]>([])

onMounted(() => {
  if (!environments.value.length) store.dispatch('environments/fetchAll')
})

const environments = computed(() => (store.state.environments as any)?.list || [])

const isAllExportSelected = computed(
  () => environments.value.length > 0 && selectedExportIds.value.length === environments.value.length
)

function toggleExportSelectAll() {
  if (isAllExportSelected.value) selectedExportIds.value = []
  else selectedExportIds.value = environments.value.map((e: any) => e.id)
}

// ---- 导出预览 ----
const exportPreview = computed(() => {
  const toExport = environments.value.filter((e: any) => selectedExportIds.value.includes(e.id))
  if (exportFormat.value === 'csv') {
    // CSV 表头 + 数据行
    const header = 'name,fingerprint_seed,platform,brand,proxy_type,proxy_host,proxy_port,tags,color,groupId'
    const rows = toExport.map((e: any) =>
      [e.name,
        e.fingerprint?.seed || '',
        e.fingerprint?.platform || '',
        e.fingerprint?.brand || '',
        e.proxy?.type || '',
        e.proxy?.host || '',
        e.proxy?.port || '',
        (e.tags || []).join(';'),
        e.color || '',
        e.groupId || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    )
    return [header, ...rows].join('\n')
  }
  return JSON.stringify(toExport.map((e: any) => ({
    name: e.name,
    fingerprint: e.fingerprint,
    proxy: e.proxy,
    tags: e.tags,
    color: e.color,
    groupId: e.groupId,
  })), null, 2).slice(0, 3000) + (toExport.length > 5 ? '\n...' : '')
})

/** 执行导出 — 触发下载 */
async function doExport() {
  if (selectedExportIds.value.length === 0) return

  try {
    const toExport = environments.value.filter((e: any) => selectedExportIds.value.includes(e.id))

    let content: string
    const filename = `environments_${new Date().toISOString().slice(0, 10)}`
    if (exportFormat.value === 'csv') {
      content = exportPreview.value
      downloadFile(content, `${filename}.csv`, 'text/csv')
    } else {
      content = JSON.stringify(toExport.map((e: any) => ({
        name: e.name, fingerprint: e.fingerprint, proxy: e.proxy,
        tags: e.tags, color: e.color, groupId: e.groupId,
      })), null, 2)
      downloadFile(content, `${filename}.json`, 'application/json')
    }

    store.dispatch('logs/add', {
      action: 'export',
      details: `导出 ${toExport.length} 个环境 (${exportFormat.value})`,
    })
  } catch (e: any) {
    importError.value = '导出失败: ' + (e.message || String(e))
  }
}

/** 执行导入 */
async function doImport() {
  if (parsedImportData.value.length === 0) return

  try {
    const result = await window.electronAPI.invoke<{ imported: number; total: number }>('import-environments', {
      environments: parsedImportData.value,
      format: currentImportFormat.value as 'json' | 'csv',
    })

    emit('imported', result.imported)

    store.dispatch('environments/fetchAll')
    store.dispatch('logs/add', {
      action: 'import',
      details: `导入 ${result.imported}/${result.total} 个环境`,
    })
  } catch (e: any) {
    importError.value = '导入失败: ' + (e.message || String(e))
  }
}

// ---- 文件处理 ----
let currentImportFormat = ref<'json' | 'csv'>('json')

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) await processFile(input.files[0])
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) await processFile(file)
}

async function processFile(file: File) {
  importError.value = ''
  parsedImportData.value = []

  // 大小限制 10MB
  if (file.size > 10 * 1024 * 1024) {
    importError.value = '文件过大，最大支持 10MB'
    return
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'json' && ext !== 'csv') {
    importError.value = '不支持的文件格式，请使用 .json 或 .csv'
    return
  }
  currentImportFormat.value = ext as 'json' | 'csv'

  try {
    const text = await file.text()
    if (ext === 'json') {
      const data = JSON.parse(text)
      const arr = Array.isArray(data) ? data : data.environments || []
      // 沙箱校验前端预检
      parsedImportData.value = sanitizeImport(arr)
    } else {
      // CSV 解析
      parsedImportData.value = parseCSV(text)
    }
  } catch (e: any) {
    importError.value = '解析失败: ' + (e.message || String(e))
  }
}

/** 沙箱校验：字段截断、危险键清理、数量上限 */
function sanitizeImport(items: any[]): any[] {
  return items.slice(0, 500).map(item => ({
    name: String(item.name || '').slice(0, 100),
    fingerprint: typeof item.fingerprint === 'object' && item.fingerprint ? stripDangerousKeys(item.fingerprint) : {},
    proxy: typeof item.proxy === 'object' && item.proxy ? stripDangerousKeys(item.proxy) : undefined,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 20).map(String).filter(Boolean) : [],
    color: typeof item.color === 'string' ? item.color.slice(0, 30) : undefined,
    groupId: typeof item.groupId === 'string' ? item.groupId.slice(0, 64) : undefined,
  })).filter(item => item.name.trim())
}

/**
 * 移除原型链污染键（__proto__、constructor、prototype）
 * 以及非字符串/数字类型的值
 */
function stripDangerousKeys(obj: Record<string, any>): Record<string, any> {
  const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype']
  const result: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.includes(key)) continue
    const val = obj[key]
    if (val == null) continue
    if (typeof val === 'string') result[key] = val.slice(0, 500)
    else if (typeof val === 'number' && Number.isFinite(val)) result[key] = val
    else if (typeof val === 'boolean') result[key] = val
    else if (typeof val === 'object' && !Array.isArray(val)) result[key] = stripDangerousKeys(val)
    // 忽略数组、函数、symbol 等
  }
  return result
}

/** 简单 CSV 解析器（处理双引号转义） */
function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []  // 至少需要表头 + 数据

  const headers = parseCSVLine(lines[0])
  const results: any[] = []

  for (let i = 1; i < Math.min(lines.length, 501); i++) {
    const values = parseCSVLine(lines[i])
    const row: Record<string, any> = {}
    for (let j = 0; j < headers.length && j < values.length; j++) {
      row[headers[j]] = values[j]
    }
    if (row.name) results.push(sanitizeImport([row])[0])  // 复用 sanitize 做清理
  }

  return results
}

/** 解析一行 CSV，支持双引号包裹和双引号转义 "" */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(current.trim()); current = '' }
      else current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

/** 浏览器端触发文件下载 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
