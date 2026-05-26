<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-xl w-full max-w-3xl max-h-[88vh] overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-slate-800">导入收藏夹</h3>
          <p class="mt-0.5 text-xs text-slate-500">从 Chrome 或 Edge 导入到已停止的环境</p>
        </div>
        <button @click="$emit('close')" class="p-1 hover:bg-slate-100 rounded text-slate-400">&times;</button>
      </div>

      <div class="p-6 space-y-5 overflow-y-auto" style="max-height: calc(88vh - 144px)">
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

          <select v-model="selectedCandidatePath" class="input w-full text-sm" @change="applyCandidatePath">
            <option value="">选择检测到的 Profile</option>
            <option
              v-for="candidate in filteredCandidates"
              :key="candidate.id"
              :value="candidate.filePath"
            >
              {{ candidate.label }}
            </option>
          </select>

          <div class="flex items-center gap-2">
            <div class="selected-path">
              {{ sourcePath || '未选择 Bookmarks 文件' }}
            </div>
            <button type="button" class="btn btn-secondary text-sm" @click="selectFile">选择 Bookmarks 文件</button>
            <button type="button" class="btn btn-secondary text-sm" :disabled="!sourcePath" @click="preview">查看内容</button>
          </div>
          <p class="text-[11px] text-slate-400">选择 Chrome 或 Edge Profile 下名为 Bookmarks 的文件；自动检测到的 Profile 可直接使用。</p>
        </section>

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

        <section v-if="previewData" class="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <div class="flex items-center gap-4 text-xs text-slate-600">
            <span>文件夹：<strong class="text-slate-800">{{ previewData.folderCount }}</strong></span>
            <span>链接：<strong class="text-slate-800">{{ previewData.urlCount }}</strong></span>
          </div>
          <ul class="mt-3 space-y-1 max-h-32 overflow-y-auto">
            <li v-for="item in previewData.sample" :key="`${item.name}-${item.url}`" class="text-[11px] text-slate-500 truncate">
              <span class="font-medium text-slate-700">{{ item.name }}</span>
              <span class="mx-1 text-slate-300">|</span>
              {{ item.url }}
            </li>
          </ul>
        </section>

        <div v-if="errorMessage" class="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p class="text-xs text-red-600">{{ errorMessage }}</p>
        </div>

        <div v-if="resultMessage" class="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p class="text-xs text-emerald-700">{{ resultMessage }}</p>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
        <button @click="$emit('close')" class="btn btn-secondary text-sm">取消</button>
        <button
          @click="importBookmarks"
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
import { toast } from '@/utils/toast'

type BookmarkSourceType = 'chrome' | 'edge'

interface BookmarkSourceCandidate {
  id: string
  type: BookmarkSourceType
  label: string
  profileName: string
  filePath: string
  exists: boolean
}

interface BookmarkPreview {
  sourceType: BookmarkSourceType
  sourcePath: string
  folderCount: number
  urlCount: number
  sample: Array<{ name: string; url: string }>
}

interface BookmarkImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

const props = defineProps<{
  initialSelectedIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
}>()

const store = useStore()
const sourceType = ref<BookmarkSourceType>('chrome')
const sourcePath = ref('')
const selectedCandidatePath = ref('')
const candidates = ref<BookmarkSourceCandidate[]>([])
const selectedTargetIds = ref<string[]>([])
const previewData = ref<BookmarkPreview | null>(null)
const errorMessage = ref('')
const resultMessage = ref('')
const isBusy = ref(false)

const environments = computed<Environment[]>(() => (store.state.environments as any)?.list || [])
const stoppedEnvironments = computed(() => environments.value.filter(env => env.status === 'stopped'))
const runningSelectedCount = computed(() =>
  environments.value.filter(env => props.initialSelectedIds?.includes(env.id) && env.status !== 'stopped').length
)
const filteredCandidates = computed(() => candidates.value.filter(candidate => candidate.type === sourceType.value))
const isAllTargetsSelected = computed(
  () => stoppedEnvironments.value.length > 0 && stoppedEnvironments.value.every(env => selectedTargetIds.value.includes(env.id))
)
const canImport = computed(() => !!sourcePath.value && selectedTargetIds.value.length > 0)

onMounted(async () => {
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
  selectedCandidatePath.value = ''
  sourcePath.value = ''
  clearPreview()
  applyFirstCandidate()
})

async function detectSources() {
  try {
    candidates.value = await window.electronAPI.invoke<BookmarkSourceCandidate[]>('bookmarks-detect-sources')
    applyFirstCandidate()
  } catch (error: any) {
    errorMessage.value = error.message || '检测浏览器收藏夹失败'
  }
}

function setSourceType(nextType: BookmarkSourceType) {
  sourceType.value = nextType
}

function applyFirstCandidate() {
  const first = filteredCandidates.value[0]
  if (!first) return
  selectedCandidatePath.value = first.filePath
  sourcePath.value = first.filePath
  clearPreview()
}

function applyCandidatePath() {
  sourcePath.value = selectedCandidatePath.value
  clearPreview()
}

async function selectFile() {
  try {
    const filePath = await window.electronAPI.invoke<string | null>('bookmarks-select-file', { sourceType: sourceType.value })
    if (!filePath) return
    sourcePath.value = filePath
    selectedCandidatePath.value = ''
    clearPreview()
  } catch (error: any) {
    errorMessage.value = error.message || '选择文件失败'
  }
}

async function preview() {
  errorMessage.value = ''
  resultMessage.value = ''
  previewData.value = null
  if (!sourcePath.value) {
    errorMessage.value = '请选择 Bookmarks 文件'
    return
  }

  try {
    previewData.value = await window.electronAPI.invoke<BookmarkPreview>('bookmarks-preview-import', {
      sourceType: sourceType.value,
      sourcePath: sourcePath.value,
    })
  } catch (error: any) {
    errorMessage.value = error.message || '预览失败'
  }
}

async function importBookmarks() {
  if (!canImport.value) return
  isBusy.value = true
  errorMessage.value = ''
  resultMessage.value = ''

  try {
    const result = await window.electronAPI.invoke<BookmarkImportResult>('bookmarks-import', {
      sourceType: sourceType.value,
      sourcePath: sourcePath.value,
      envIds: [...selectedTargetIds.value],
    })
    resultMessage.value = `已导入到 ${result.importedEnvironments}/${result.totalEnvironments} 个环境，链接 ${result.urlCount} 个`
    if (result.failed.length > 0 || result.skippedRunning.length > 0) {
      errorMessage.value = `部分环境未导入：运行中 ${result.skippedRunning.length} 个，失败 ${result.failed.length} 个`
    }
    toast.success(resultMessage.value)
    emit('imported', result.importedEnvironments)
  } catch (error: any) {
    errorMessage.value = error.message || '导入失败'
  } finally {
    isBusy.value = false
  }
}

function toggleAllTargets() {
  if (isAllTargetsSelected.value) selectedTargetIds.value = []
  else selectedTargetIds.value = stoppedEnvironments.value.map(env => env.id)
}

function clearPreview() {
  previewData.value = null
  resultMessage.value = ''
  errorMessage.value = ''
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
.selected-path {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  line-height: 34px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
