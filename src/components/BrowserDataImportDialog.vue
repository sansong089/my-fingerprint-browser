<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @mousedown.self="requestClose">
    <div class="relative bg-white rounded-xl w-full max-w-3xl max-h-[88vh] overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-slate-800">导入浏览器数据</h3>
        </div>
        <button
          @click="requestClose"
          :disabled="isBusy"
          class="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          &times;
        </button>
      </div>

      <div v-if="!resultState" class="p-6 space-y-5 overflow-y-auto" style="max-height: calc(88vh - 144px)">
        <!-- 来源 -->
        <section class="space-y-2">
          <label class="block text-sm font-medium text-slate-700">来源</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="source-btn"
              :class="{ 'source-btn--active': sourceType === 'chrome' }"
              @click="setSourceType('chrome')"
            >
              Chrome
            </button>
            <button
              type="button"
              class="source-btn"
              :class="{ 'source-btn--active': sourceType === 'edge' }"
              @click="setSourceType('edge')"
            >
              Edge
            </button>
          </div>

          <select v-model="selectedCandidateId" class="input w-full text-sm" @change="clearPreview">
            <option value="">选择检测到的 Profile</option>
            <option
              v-for="candidate in filteredCandidates"
              :key="candidate.id"
              :value="candidate.id"
            >
              {{ candidate.label }}
            </option>
          </select>

          <p class="text-[11px] text-slate-400">选择 Chrome 或 Edge Profile；后端会自动读取该 Profile 的收藏夹和 Cookie。</p>

          <!-- 数据类型复选框 -->
          <div class="flex items-center gap-5 pt-1">
            <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" v-model="importBookmarks" class="accent-blue-500" />
              导入收藏夹
            </label>
            <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" v-model="importCookies" class="accent-blue-500" />
              导入 Cookie
            </label>
          </div>
        </section>

        <!-- 目标环境 -->
        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-slate-700">目标环境</label>
            <span class="text-xs text-slate-400">已选择 {{ selectedTargetIds.length }} / {{ stoppedEnvironments.length }}</span>
          </div>
          <div class="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
            <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
              <input type="checkbox" :checked="isAllTargetsSelected" @change="toggleAllTargets" />
              <span class="text-xs font-medium text-slate-600">全选已停止环境</span>
            </label>
            <label
              v-for="env in stoppedEnvironments"
              :key="env.id"
              class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
            >
              <input type="checkbox" :value="env.id" v-model="selectedTargetIds" />
              <span class="inline-block w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: env.color || '#94a3b8' }"></span>
              <span class="text-xs text-slate-700 truncate">{{ env.name }}</span>
            </label>
            <div v-if="stoppedEnvironments.length === 0" class="px-2 py-4 text-center text-xs text-slate-400">
              没有可导入的已停止环境
            </div>
          </div>
          <p v-if="runningSelectedCount > 0" class="text-[11px] text-amber-600">
            已忽略 {{ runningSelectedCount }} 个运行中环境；请关闭后再导入。
          </p>
        </section>

        <div v-if="errorMessage" class="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p class="text-xs text-red-600">{{ errorMessage }}</p>
        </div>
      </div>

      <div v-else class="p-6 overflow-y-auto" style="max-height: calc(88vh - 144px)">
        <section
          class="rounded-lg border p-5"
          :class="{
            'bg-emerald-50 border-emerald-100': resultState.status === 'success',
            'bg-amber-50 border-amber-100': resultState.status === 'partial',
            'bg-red-50 border-red-100': resultState.status === 'failed',
          }"
        >
          <h4
            class="text-base font-semibold"
            :class="{
              'text-emerald-800': resultState.status === 'success',
              'text-amber-800': resultState.status === 'partial',
              'text-red-800': resultState.status === 'failed',
            }"
          >
            {{ resultState.title }}
          </h4>
          <p
            class="mt-2 text-sm"
            :class="{
              'text-emerald-700': resultState.status === 'success',
              'text-amber-700': resultState.status === 'partial',
              'text-red-700': resultState.status === 'failed',
            }"
          >
            {{ resultState.message }}
          </p>
        </section>

        <section v-if="resultState.result" class="mt-5 grid grid-cols-3 gap-3">
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs text-slate-500">环境</p>
            <p class="mt-1 text-lg font-semibold text-slate-800">
              {{ resultState.result.importedEnvironments }} / {{ resultState.result.totalEnvironments }}
            </p>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs text-slate-500">收藏夹链接</p>
            <p class="mt-1 text-lg font-semibold text-slate-800">{{ resultState.result.urlCount }}</p>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs text-slate-500">Cookie</p>
            <p class="mt-1 text-lg font-semibold text-slate-800">{{ resultState.result.cookieCount }}</p>
          </div>
        </section>

        <section v-if="resultState.failures.length > 0" class="mt-5 rounded-lg border border-slate-200">
          <div class="px-4 py-3 border-b border-slate-200">
            <h4 class="text-sm font-semibold text-slate-800">失败明细</h4>
          </div>
          <ul class="divide-y divide-slate-100">
            <li v-for="item in resultState.failures" :key="`${item.envId}-${item.reason}`" class="px-4 py-3">
              <p class="text-xs font-medium text-slate-700">{{ formatFailureEnv(item.envId) }}</p>
              <p class="mt-1 text-xs text-red-600">{{ item.reason }}</p>
            </li>
          </ul>
        </section>
      </div>

      <div
        class="px-6 py-4 border-t border-slate-200 flex justify-center gap-2"
      >
        <button v-if="resultState" @click="resetResult" class="btn btn-secondary text-sm">重新导入</button>
        <button @click="requestClose" :disabled="isBusy" class="btn btn-secondary text-sm">{{ resultState ? '关闭' : '取消' }}</button>
        <button
          v-if="!resultState"
          @click="importData"
          :disabled="!canImport || isBusy"
          class="btn btn-primary text-sm"
        >
          {{ isBusy ? '导入中...' : `导入到 ${selectedTargetIds.length} 个环境` }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import type { Environment } from '@/types'

type DataSourceType = 'chrome' | 'edge'
type ImportResultStatus = 'success' | 'partial' | 'failed'

interface SourceCandidate {
  id: string
  type: DataSourceType
  label: string
  profileName: string
  hasBookmarks: boolean
  hasCookies: boolean
}

interface ImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  cookieCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

interface ImportResultState {
  status: ImportResultStatus
  title: string
  message: string
  result: ImportResult | null
  failures: Array<{ envId: string; reason: string }>
}

interface BrowserDataImportRequest {
  sourceType: DataSourceType
  sourceProfileName?: string
  envIds: string[]
  dataTypes: string[]
}

const props = defineProps<{
  initialSelectedIds?: string[]
  initialResult?: ImportResultState | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
  (e: 'import', request: BrowserDataImportRequest): void
}>()

const store = useStore()
const sourceType = ref<DataSourceType>('chrome')
const selectedCandidateId = ref('')
const candidates = ref<SourceCandidate[]>([])
const selectedTargetIds = ref<string[]>([])
const errorMessage = ref('')
const resultState = ref<ImportResultState | null>(null)
const isBusy = ref(false)
const importBookmarks = ref(true)
const importCookies = ref(true)

const environments = computed<Environment[]>(() => (store.state.environments as any)?.list || [])
const stoppedEnvironments = computed(() => environments.value.filter(env => env.status === 'stopped'))
const runningSelectedCount = computed(() =>
  environments.value.filter(env => props.initialSelectedIds?.includes(env.id) && env.status !== 'stopped').length
)
const filteredCandidates = computed(() => candidates.value.filter(candidate => candidate.type === sourceType.value))
const selectedCandidate = computed(() => candidates.value.find(candidate => candidate.id === selectedCandidateId.value) || null)
const isAllTargetsSelected = computed(
  () => stoppedEnvironments.value.length > 0 && stoppedEnvironments.value.every(env => selectedTargetIds.value.includes(env.id))
)
const canImport = computed(() => !!selectedCandidate.value && selectedTargetIds.value.length > 0 && (importBookmarks.value || importCookies.value))

function requestClose() {
  if (isBusy.value) return
  emit('close')
}

onMounted(async () => {
  if (props.initialResult) {
    resultState.value = props.initialResult
  }
  if (!environments.value.length) await store.dispatch('environments/fetchAll')
  selectedTargetIds.value = stoppedEnvironments.value
    .filter(env => props.initialSelectedIds?.includes(env.id))
    .map(env => env.id)
  if (selectedTargetIds.value.length === 0 && stoppedEnvironments.value.length === 1) {
    selectedTargetIds.value = [stoppedEnvironments.value[0].id]
  }
  await detectSources()
})

watch(sourceType, () => {
  selectedCandidateId.value = ''
  clearPreview()
  applyFirstCandidate()
})

watch(() => props.initialResult, (nextResult) => {
  resultState.value = nextResult || null
})

async function detectSources() {
  try {
    candidates.value = await window.electronAPI.invoke<SourceCandidate[]>('browser-data-detect-sources')
    applyFirstCandidate()
  } catch (error: any) {
    errorMessage.value = error.message || '检测浏览器失败'
  }
}

function setSourceType(nextType: DataSourceType) {
  sourceType.value = nextType
}

function applyFirstCandidate() {
  const first = filteredCandidates.value[0]
  if (!first) return
  selectedCandidateId.value = first.id
  clearPreview()
}

async function importData() {
  if (!canImport.value || isBusy.value) return
  errorMessage.value = ''
  resultState.value = null

  const dataTypes: string[] = []
  if (importBookmarks.value) dataTypes.push('bookmarks')
  if (importCookies.value) dataTypes.push('cookies')

  emit('import', {
    sourceType: sourceType.value,
    sourceProfileName: selectedCandidate.value?.profileName,
    envIds: [...selectedTargetIds.value],
    dataTypes,
  })
}

function toggleAllTargets() {
  if (isAllTargetsSelected.value) selectedTargetIds.value = []
  else selectedTargetIds.value = stoppedEnvironments.value.map(env => env.id)
}

function clearPreview() {
  errorMessage.value = ''
}

function resetResult() {
  resultState.value = null
  clearPreview()
}

function buildResultFailures(result: ImportResult) {
  const failures = [...result.failed]
  for (const envId of result.skippedRunning) {
    failures.push({ envId, reason: '环境正在运行，请关闭后再导入' })
  }
  return failures
}

function formatFailureEnv(envId: string) {
  if (envId === 'source' || envId === 'cookies' || envId === 'bookmarks') return '来源数据'
  return environments.value.find(env => env.id === envId)?.name || envId
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  const message = (error as any)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
</script>

<style scoped>
.input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.source-btn {
  height: 38px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.source-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.source-btn--active {
  background: #eff6ff;
  border-color: #60a5fa;
  color: #1d4ed8;
}
.btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
  white-space: nowrap;
}
.btn-primary {
  background: #3b82f6;
  color: white;
}
.btn-primary:hover {
  background: #2563eb;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-secondary:hover:not(:disabled) {
  background: #f9fafb;
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
