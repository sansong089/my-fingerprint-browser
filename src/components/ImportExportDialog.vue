<template>
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    @mousedown.self="$emit('close')"
  >
    <div class="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
      <!-- ========== Header ========== -->
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <h3 class="text-base font-semibold text-slate-800">{{ titleText }}</h3>
        <button
          @click="$emit('close')"
          aria-label="关闭"
          class="p-1 hover:bg-slate-100 rounded text-slate-400 text-xl leading-none"
        >&times;</button>
      </div>

      <!-- ========== Tabs (only on initial views) ========== -->
      <div
        v-if="showTabs"
        class="px-6 pt-3 flex gap-1 border-b border-slate-200 shrink-0"
      >
        <button
          class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="mode === 'export'
            ? 'bg-white border-x border-t border-b-0 border-slate-200 -mb-px text-blue-600'
            : 'text-slate-500 hover:text-slate-700'"
          @click="switchToExport"
        >📤 导出</button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="mode === 'import'
            ? 'bg-white border-x border-t border-b-0 border-slate-200 -mb-px text-blue-600'
            : 'text-slate-500 hover:text-slate-700'"
          @click="switchToImport"
        >📥 导入</button>
      </div>

      <!-- ========== Unified error banner ========== -->
      <div v-if="currentError" class="px-6 pt-4 shrink-0">
        <div class="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p class="text-xs text-red-600">⚠️ {{ currentError }}</p>
        </div>
      </div>

      <!-- ========== Body (mutually exclusive via v-else-if chain) ========== -->
      <div class="flex-1 overflow-y-auto">
        <!-- ----- Export: step 1 (env selection) ----- -->
        <div v-if="view === 'export-select'" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">选择要导出的环境</label>
            <div class="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
              <label
                class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="isAllExportSelected"
                  @change="toggleExportSelectAll"
                />
                <span class="text-xs font-medium text-slate-600">
                  全选 ({{ environments.length }})
                </span>
              </label>
              <label
                v-for="env in environments"
                :key="env.id"
                class="flex items-center gap-2 px-2 py-1.5 rounded"
                :class="env.status === 'running'
                  ? 'opacity-50 cursor-not-allowed bg-slate-50'
                  : 'hover:bg-slate-50 cursor-pointer'"
              >
                <input
                  type="checkbox"
                  :value="env.id"
                  :disabled="env.status === 'running'"
                  v-model="selectedExportIds"
                />
                <span
                  class="inline-block w-3 h-3 rounded-full mr-1 shrink-0"
                  :style="{ backgroundColor: env.color || '#94a3b8' }"
                ></span>
                <span class="text-xs text-slate-700 truncate flex-1">{{ env.name }}</span>
                <span
                  v-if="env.status === 'running'"
                  class="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0"
                >运行中</span>
              </label>
            </div>
            <p class="mt-1 text-[11px] text-slate-400">
              已选择 {{ selectedExportIds.length }} 个（运行中的环境无法导出）
            </p>
          </div>

          <div class="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <p class="text-xs text-blue-700 font-medium mb-1">📦 导出内容</p>
            <ul class="text-[11px] text-blue-600 space-y-0.5 list-disc pl-4">
              <li>环境配置（指纹、代理、标签等）</li>
              <li>浏览器数据（书签、历史、设置等）</li>
              <li>关联的插件</li>
              <li>Cookie（可选密码加密）</li>
            </ul>
          </div>
        </div>

        <!-- ----- Export: step 2 (password) ----- -->
        <div v-else-if="view === 'export-password'" class="p-6 space-y-4">
          <div class="flex flex-col items-center text-center mb-2">
            <div class="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <svg class="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.558.425l-1.892 1.892a.75.75 0 00-.278.555v.954a.75.75 0 01-.75.75h-.954a.75.75 0 01-.53-.22l-1.892-1.892a.75.75 0 00-.557-.278H5.25a.75.75 0 01-.75-.75v-1.5a.75.75 0 01.22-.53l4.723-4.723a.75.75 0 00.425-1.558A6 6 0 0118.75 8.25z" />
              </svg>
            </div>
            <p class="text-sm text-slate-500 max-w-xs">
              设置密码来加密 Cookie 数据，导入时需要输入相同密码才能恢复
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Cookie 密码</label>
            <input
              v-model="cookiePassword"
              type="password"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 focus:outline-none"
              placeholder="设置密码以加密 Cookie 数据"
            />
            <p class="mt-1 text-[11px] text-slate-400">留空则不导出 Cookie</p>
          </div>
        </div>

        <!-- ----- Export: success ----- -->
        <div
          v-else-if="view === 'export-success'"
          class="p-8 flex flex-col items-center justify-center text-center min-h-[360px]"
        >
          <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-slate-800 mb-1">导出成功</h3>
          <p class="text-sm text-slate-500 mb-6">环境已成功导出到文件</p>

          <div class="w-full max-w-sm bg-slate-50 rounded-lg px-4 py-3 mb-6">
            <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>文件位置</span>
            </div>
            <p class="text-xs text-slate-700 break-all text-left select-all">{{ exportResult!.path }}</p>
          </div>

          <div class="flex items-center gap-1 text-xs text-slate-400">
            <span>{{ selectedExportIds.length }} 个环境</span>
            <span>·</span>
            <span>{{ cookiePassword ? '已加密 Cookie' : '未包含 Cookie' }}</span>
          </div>
        </div>

        <!-- ----- Import: form ----- -->
        <div v-else-if="view === 'import-form'" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Cookie 密码</label>
            <input
              v-model="cookiePassword"
              type="password"
              class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 focus:outline-none"
              placeholder="如果导出时设置了密码，请输入相同密码"
            />
            <p class="mt-1 text-[11px] text-slate-400">如果导出时未设置密码，可留空</p>
          </div>

          <div class="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <p class="text-xs text-blue-700 font-medium mb-1">📦 导入说明</p>
            <ul class="text-[11px] text-blue-600 space-y-0.5 list-disc pl-4">
              <li>选择之前导出的 ZIP 文件</li>
              <li>环境名称重复时会自动重命名</li>
              <li>已存在的插件会跳过</li>
              <li>如果导出时设置了密码，需要输入相同密码才能恢复 Cookie</li>
            </ul>
          </div>
        </div>

        <!-- ----- Import: success ----- -->
        <div v-else-if="view === 'import-success'" class="p-8 min-h-[360px]">
          <div class="flex flex-col items-center text-center mb-6">
            <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-slate-800 mb-1">导入成功</h3>
            <p class="text-sm text-slate-500">已成功导入以下内容</p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <span>环境 ({{ importResult!.environments.length }})</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="env in importResult!.environments"
                :key="env.id"
                class="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-md text-xs text-blue-700"
              >
                <span
                  class="w-2 h-2 rounded-full"
                  :class="env.renamed ? 'bg-amber-400' : 'bg-blue-400'"
                ></span>
                {{ env.name }}
                <span v-if="env.renamed" class="text-[10px] text-amber-500 ml-0.5">(已重命名)</span>
              </span>
            </div>
          </div>

          <div v-if="importResult!.plugins.length > 0" class="mt-5 space-y-2">
            <div class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <span>插件 ({{ importResult!.plugins.filter(p => !p.skipped).length }} 个新装)</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="plugin in importResult!.plugins"
                :key="plugin.id"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs"
                :class="plugin.skipped
                  ? 'bg-slate-50 border border-slate-200 text-slate-400'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-700'"
              >
                <svg v-if="plugin.skipped" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
                <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {{ plugin.name }}
                <span v-if="plugin.skipped" class="text-[10px] ml-0.5">已存在，跳过</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== Footer (mutually exclusive via v-else-if chain) ========== -->
      <div class="px-6 py-4 border-t border-slate-200 flex justify-center gap-2 shrink-0">
        <template v-if="view === 'export-select'">
          <button @click="closeDialog" class="btn btn-secondary text-sm">取消</button>
          <button
            @click="goToPasswordStep"
            :disabled="selectedExportIds.length === 0"
            class="btn btn-primary text-sm"
          >导出</button>
        </template>

        <template v-else-if="view === 'export-password'">
          <button @click="goToSelectStep" class="btn btn-secondary text-sm">返回</button>
          <button
            @click="doExport"
            :disabled="exporting"
            class="btn btn-primary text-sm"
          >{{ exporting ? '导出中...' : '开始导出' }}</button>
        </template>

        <template v-else-if="view === 'export-success' || view === 'import-success'">
          <button @click="resetState" class="btn btn-secondary text-sm">返回</button>
          <button @click="closeDialog" class="btn btn-primary text-sm">关闭</button>
        </template>

        <template v-else-if="view === 'import-form'">
          <button @click="closeDialog" class="btn btn-secondary text-sm">取消</button>
          <button
            @click="doImport"
            :disabled="importing"
            class="btn btn-primary text-sm"
          >{{ importing ? '导入中...' : '选择 ZIP 文件导入' }}</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'

// ---- Types ----
type Mode = 'export' | 'import'
type ExportStep = 1 | 2
type View = 'export-select' | 'export-password' | 'export-success' | 'import-form' | 'import-success'

interface ImportResult {
  environments: { id: string; name: string; renamed?: boolean }[]
  plugins: { id: string; name: string; skipped: boolean }[]
}

// ---- Setup ----
const store = useStore()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit-export', payload: { envIds: string[]; cookiePassword?: string }): void
  (e: 'submit-import', payload: { cookiePassword?: string }): void
}>()

// ---- State ----
const mode = ref<Mode>('export')
const exportStep = ref<ExportStep>(1)
const selectedExportIds = ref<string[]>([])
const cookiePassword = ref('')
const exporting = ref(false)
const importing = ref(false)
const exportError = ref('')
const importError = ref('')
const exportResult = ref<{ path: string } | null>(null)
const importResult = ref<ImportResult | null>(null)

// ---- Computed views (single source of truth) ----
const view = computed<View>(() => {
  if (mode.value === 'export') {
    if (exportResult.value) return 'export-success'
    if (exportStep.value === 2) return 'export-password'
    return 'export-select'
  }
  return importResult.value ? 'import-success' : 'import-form'
})

const showTabs = computed(() => view.value === 'export-select' || view.value === 'import-form')
const currentError = computed(() => exportError.value || importError.value)

const titleText = computed<string>(() => {
  switch (view.value) {
    case 'export-success': return '导出成功'
    case 'export-password': return '导出环境 - 设置 Cookie 密码'
    case 'export-select': return '导出环境'
    case 'import-success': return '导入成功'
    case 'import-form': return '导入环境'
  }
})

const environments = computed<any[]>(() => (store.state.environments as any)?.list || [])

const isAllExportSelected = computed(
  () => environments.value.length > 0
    && selectedExportIds.value.length
      === environments.value.filter((e: any) => e.status !== 'running').length
)

const selectableEnvs = computed<any[]>(() =>
  environments.value.filter((e: any) => e.status !== 'running')
)

// ---- State transitions ----
function resetState() {
  mode.value = 'export'
  exportStep.value = 1
  selectedExportIds.value = []
  cookiePassword.value = ''
  exporting.value = false
  importing.value = false
  exportError.value = ''
  importError.value = ''
  exportResult.value = null
  importResult.value = null
}

function switchToExport() {
  mode.value = 'export'
  exportError.value = ''
  importError.value = ''
  importResult.value = null
}

function switchToImport() {
  mode.value = 'import'
  exportError.value = ''
  importError.value = ''
  exportResult.value = null
  exportStep.value = 1
}

function goToPasswordStep() {
  if (selectedExportIds.value.length === 0) return
  exportStep.value = 2
  exportError.value = ''
}

function goToSelectStep() {
  exportStep.value = 1
  exportError.value = ''
}

// ---- Selection helpers ----
function toggleExportSelectAll() {
  if (isAllExportSelected.value) {
    selectedExportIds.value = []
  } else {
    selectedExportIds.value = selectableEnvs.value.map((e: any) => e.id)
  }
}

// ---- Actions ----
async function doExport() {
  if (selectedExportIds.value.length === 0) return

  exportError.value = ''
  emit('submit-export', {
    envIds: [...selectedExportIds.value],
    cookiePassword: cookiePassword.value ? String(cookiePassword.value) : undefined,
  })
  emit('close')
}

async function doImport() {
  importError.value = ''
  importResult.value = null
  emit('submit-import', {
    cookiePassword: cookiePassword.value || undefined,
  })
  emit('close')
}

function closeDialog() {
  emit('close')
}

onMounted(() => {
  if (!environments.value.length) store.dispatch('environments/fetchAll')
})
</script>

<style scoped>
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
