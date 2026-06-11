# 导入浏览器数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"导入收藏夹"功能扩展为"导入浏览器数据"，支持同时导入收藏夹和 Cookie，用户通过复选框选择数据类型。

**Architecture:** 新建 `BrowserProfileImportService` 作为上层编排，调用已有的 `BookmarkImportService`（收藏夹）和 `CookieFileService`（Cookie 读写）。UI 侧新建 `BrowserDataImportDialog.vue` 替代原 `BookmarkImportDialog.vue`，在来源区域嵌入复选框。

**Tech Stack:** Vue 3 + Vuex, TypeScript, Electron IPC, better-sqlite3, Windows DPAPI (via PowerShell)

**Spec:** `docs/superpowers/specs/2026-06-05-browser-data-import-design.md`

---

## 文件变更总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `electron/main/services/BrowserProfileImportService.ts` | 新建 | 上层编排：检测源、预览、导入（收藏夹+Cookie） |
| `electron/main/index.ts` | 修改 | 新增 3 个 `browser-data-*` IPC handler |
| `src/components/BrowserDataImportDialog.vue` | 新建 | UI 对话框：来源选择、复选框、目标环境、预览 |
| `src/views/EnvironmentsView.vue` | 修改 | 按钮文案、import 新组件 |

---

### Task 1: BrowserProfileImportService

**Files:**
- Create: `electron/main/services/BrowserProfileImportService.ts`
- Read (reference): `electron/main/services/BookmarkImportService.ts`
- Read (reference): `electron/main/services/CookieFileService.ts`
- Read (reference): `electron/main/services/StorageService.ts`

- [ ] **Step 1: 创建 BrowserProfileImportService.ts 骨架**

创建文件 `electron/main/services/BrowserProfileImportService.ts`，导入依赖并定义接口：

```typescript
import { dirname } from 'path'
import { bookmarkImportService, type BookmarkImportResult, type BookmarkSourceType, type BookmarkSourceCandidate, type BookmarkPreview } from './BookmarkImportService'
import { cookieFileService, type CookieData } from './CookieFileService'
import { storageService } from './StorageService'
import { launchService } from './LaunchService'
import { activityLogService } from '../managers/ActivityLogService'

export type BrowserDataSourceType = BookmarkSourceType

export interface BrowserDataImportParams {
  sourceType: BrowserDataSourceType
  sourcePath: string
  envIds: string[]
  dataTypes: ('bookmarks' | 'cookies')[]
}

export interface BrowserDataImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  cookieCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

class BrowserProfileImportService {
  detectSources(): BrowserSourceCandidate[] {
    // 复用 BookmarkImportService 的检测逻辑
  }

  preview(sourceType: BrowserDataSourceType, sourcePath: string): BookmarkPreview {
    // 复用 BookmarkImportService 的预览逻辑
  }

  importData(params: BrowserDataImportParams): BrowserDataImportResult {
    // 上层编排入口
  }

  private importBookmarks(sourceType: BrowserDataSourceType, sourcePath: string, envIds: string[]): BookmarkImportResult {
    // 委托给 BookmarkImportService
  }

  private importCookies(profileDir: string, envIds: string[]): { cookieCount: number; failed: Array<{ envId: string; reason: string }> } {
    // 读源 Cookie → 写入目标环境
  }
}

export const browserProfileImportService = new BrowserProfileImportService()
export default BrowserProfileImportService
```

- [ ] **Step 2: 实现 detectSources 和 preview**

这两个方法直接委托给 `bookmarkImportService`：

```typescript
detectSources(): BookmarkSourceCandidate[] {
  return bookmarkImportService.detectSources()
}

preview(sourceType: BrowserDataSourceType, sourcePath: string): BookmarkPreview {
  return bookmarkImportService.preview(sourceType, sourcePath)
}
```

- [ ] **Step 3: 实现 importBookmarks**

委托给 `bookmarkImportService.importToEnvironments()`：

```typescript
private importBookmarks(
  sourceType: BrowserDataSourceType,
  sourcePath: string,
  envIds: string[]
): BookmarkImportResult {
  return bookmarkImportService.importToEnvironments({
    sourceType,
    sourcePath,
    envIds,
  })
}
```

- [ ] **Step 4: 实现 importCookies**

从 `sourcePath` 推导 `profileDir`，调用 `CookieFileService` 读源 Cookie、写入目标环境：

```typescript
private importCookies(
  profileDir: string,
  envIds: string[]
): { cookieCount: number; failed: Array<{ envId: string; reason: string }> } {
  const result = { cookieCount: 0, failed: [] as Array<{ envId: string; reason: string }> }

  // 读取源浏览器 Cookie
  let sourceCookies: CookieData[] = []
  try {
    sourceCookies = cookieFileService.readCookiesFromFile(profileDir)
  } catch (error) {
    // 源 Cookie 读取失败，跳过整个 Cookie 导入
    console.warn('[BrowserProfileImportService] Failed to read source cookies:', error)
    return result
  }

  if (sourceCookies.length === 0) {
    return result
  }

  // 写入每个目标环境
  const environments = storageService.getEnvironments()
  for (const envId of envIds) {
    const env = environments.find(e => e.id === envId)
    if (!env) {
      result.failed.push({ envId, reason: '环境不存在' })
      continue
    }

    if (env.status === 'running' || launchService.isRunning(env.id)) {
      continue // 由 importData 统一处理 skippedRunning
    }

    try {
      const writeResult = cookieFileService.writeCookiesToFile(env.userDataDir, sourceCookies)
      result.cookieCount += writeResult.success
      if (writeResult.failed > 0) {
        result.failed.push({ envId, reason: `Cookie 写入失败 ${writeResult.failed} 个` })
      }
    } catch (error) {
      result.failed.push({
        envId,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
```

- [ ] **Step 5: 实现 importData 主方法**

编排收藏夹和 Cookie 导入，合并结果：

```typescript
importData(params: BrowserDataImportParams): BrowserDataImportResult {
  if (!Array.isArray(params.envIds) || params.envIds.length === 0) {
    throw new Error('请选择要导入数据的环境')
  }
  if (!Array.isArray(params.dataTypes) || params.dataTypes.length === 0) {
    throw new Error('请选择要导入的数据类型')
  }

  const profileDir = dirname(params.sourcePath)
  const environments = storageService.getEnvironments()
  const targetEnvs = environments.filter(env => params.envIds.includes(env.id))

  // 分离运行中和已停止的环境
  const skippedRunning: string[] = []
  const activeEnvIds: string[] = []
  for (const envId of params.envIds) {
    const env = targetEnvs.find(e => e.id === envId)
    if (!env) continue
    if (env.status === 'running' || launchService.isRunning(env.id)) {
      skippedRunning.push(envId)
    } else {
      activeEnvIds.push(envId)
    }
  }

  const result: BrowserDataImportResult = {
    importedEnvironments: 0,
    totalEnvironments: params.envIds.length,
    folderCount: 0,
    urlCount: 0,
    cookieCount: 0,
    skippedRunning,
    failed: [],
  }

  if (activeEnvIds.length === 0) {
    return result
  }

  // 导入收藏夹
  if (params.dataTypes.includes('bookmarks')) {
    try {
      const bookmarkResult = this.importBookmarks(params.sourceType, params.sourcePath, activeEnvIds)
      result.importedEnvironments = bookmarkResult.importedEnvironments
      result.folderCount = bookmarkResult.folderCount
      result.urlCount = bookmarkResult.urlCount
      result.failed.push(...bookmarkResult.failed)
    } catch (error) {
      result.failed.push({
        envId: 'bookmarks',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // 导入 Cookie
  if (params.dataTypes.includes('cookies')) {
    try {
      const cookieResult = this.importCookies(profileDir, activeEnvIds)
      result.cookieCount = cookieResult.cookieCount
      result.failed.push(...cookieResult.failed)
      // 如果没有导入收藏夹，用 cookie 结果更新 importedEnvironments
      if (!params.dataTypes.includes('bookmarks')) {
        result.importedEnvironments = activeEnvIds.length - cookieResult.failed.length
      }
    } catch (error) {
      result.failed.push({
        envId: 'cookies',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // 记录活动日志
  const parts: string[] = []
  if (params.dataTypes.includes('bookmarks')) parts.push(`收藏夹 ${result.urlCount} 链接`)
  if (params.dataTypes.includes('cookies')) parts.push(`Cookie ${result.cookieCount} 个`)
  activityLogService.log({
    envId: 'system',
    action: 'import',
    details: `导入浏览器数据到 ${result.importedEnvironments}/${params.envIds.length} 个环境 | ${parts.join(' | ')} | 来源: ${params.sourceType}`,
  })

  return result
}
```

- [ ] **Step 6: 检查 TypeScript 编译**

运行 `npx vue-tsc --noEmit` 确认无类型错误。

- [ ] **Step 7: 提交**

```bash
git add electron/main/services/BrowserProfileImportService.ts
git commit -m "feat: add BrowserProfileImportService for bookmark + cookie import"
```

---

### Task 2: IPC Handlers

**Files:**
- Modify: `electron/main/index.ts:1663-1696`（收藏夹导入 IPC 区域）

- [ ] **Step 1: 导入 BrowserProfileImportService**

在 `electron/main/index.ts` 顶部的 import 区域，在 `bookmarkImportService` 导入之后添加：

```typescript
import { browserProfileImportService } from './services/BrowserProfileImportService'
```

- [ ] **Step 2: 添加 3 个新的 IPC handler**

在现有的 `// ==================== 收藏夹导入 ====================` 区块之后，添加新的区块：

```typescript
// ==================== 浏览器数据导入 ====================

ipcMain.handle('browser-data-detect-sources', () => {
  return browserProfileImportService.detectSources()
})

ipcMain.handle('browser-data-preview-import', (_, params: { sourceType: string; sourcePath: string }) => {
  if (!params?.sourceType || !params?.sourcePath) {
    throw new Error('缺少必要参数')
  }
  return browserProfileImportService.preview(params.sourceType as any, params.sourcePath)
})

ipcMain.handle('browser-data-import', (_, params: { sourceType: string; sourcePath: string; envIds: string[]; dataTypes: string[] }) => {
  if (!params?.sourceType || !params?.sourcePath || !Array.isArray(params?.envIds) || !Array.isArray(params?.dataTypes)) {
    throw new Error('缺少必要参数')
  }
  return browserProfileImportService.importData({
    sourceType: params.sourceType as any,
    sourcePath: params.sourcePath,
    envIds: params.envIds,
    dataTypes: params.dataTypes as any,
  })
})
```

- [ ] **Step 3: 检查 TypeScript 编译**

运行 `npx vue-tsc --noEmit` 确认无类型错误。

- [ ] **Step 4: 提交**

```bash
git add electron/main/index.ts
git commit -m "feat: add browser-data IPC handlers for bookmark + cookie import"
```

---

### Task 3: BrowserDataImportDialog 组件

**Files:**
- Create: `src/components/BrowserDataImportDialog.vue`
- Read (reference): `src/components/BookmarkImportDialog.vue`（基于此重写）

- [ ] **Step 1: 创建 BrowserDataImportDialog.vue**

基于 `BookmarkImportDialog.vue` 重写，主要变更：
- 标题改为"导入浏览器数据"
- 来源区域下方添加复选框
- 调用新的 IPC 通道
- 结果消息包含 Cookie 统计

完整模板和脚本：

```vue
<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-xl w-full max-w-3xl max-h-[88vh] overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-slate-800">导入浏览器数据</h3>
          <p class="mt-0.5 text-xs text-slate-500">从 Chrome 或 Edge 导入到已停止的环境</p>
        </div>
        <button @click="$emit('close')" class="p-1 hover:bg-slate-100 rounded text-slate-400">&times;</button>
      </div>

      <div class="p-6 space-y-5 overflow-y-auto" style="max-height: calc(88vh - 144px)">
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

        <!-- 收藏夹预览（仅在勾选收藏夹时显示） -->
        <section v-if="previewData && importBookmarks" class="rounded-lg bg-slate-50 border border-slate-200 p-4">
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

        <!-- 错误/结果消息 -->
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
import { toast } from '@/utils/toast'

type DataSourceType = 'chrome' | 'edge'

interface SourceCandidate {
  id: string
  type: DataSourceType
  label: string
  profileName: string
  filePath: string
  exists: boolean
}

interface BookmarkPreview {
  sourceType: DataSourceType
  sourcePath: string
  folderCount: number
  urlCount: number
  sample: Array<{ name: string; url: string }>
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

const props = defineProps<{
  initialSelectedIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
}>()

const store = useStore()
const sourceType = ref<DataSourceType>('chrome')
const sourcePath = ref('')
const selectedCandidatePath = ref('')
const candidates = ref<SourceCandidate[]>([])
const selectedTargetIds = ref<string[]>([])
const previewData = ref<BookmarkPreview | null>(null)
const errorMessage = ref('')
const resultMessage = ref('')
const isBusy = ref(false)
const importBookmarks = ref(true)
const importCookies = ref(true)

const environments = computed<Environment[]>(() => (store.state.environments as any)?.list || [])
const stoppedEnvironments = computed(() => environments.value.filter(env => env.status === 'stopped'))
const runningSelectedCount = computed(() =>
  environments.value.filter(env => props.initialSelectedIds?.includes(env.id) && env.status !== 'stopped').length
)
const filteredCandidates = computed(() => candidates.value.filter(candidate => candidate.type === sourceType.value))
const isAllTargetsSelected = computed(
  () => stoppedEnvironments.value.length > 0 && stoppedEnvironments.value.every(env => selectedTargetIds.value.includes(env.id))
)
const canImport = computed(() => !!sourcePath.value && selectedTargetIds.value.length > 0 && (importBookmarks.value || importCookies.value))

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
    previewData.value = await window.electronAPI.invoke<BookmarkPreview>('browser-data-preview-import', {
      sourceType: sourceType.value,
      sourcePath: sourcePath.value,
    })
  } catch (error: any) {
    errorMessage.value = error.message || '预览失败'
  }
}

async function importData() {
  if (!canImport.value) return
  isBusy.value = true
  errorMessage.value = ''
  resultMessage.value = ''

  const dataTypes: string[] = []
  if (importBookmarks.value) dataTypes.push('bookmarks')
  if (importCookies.value) dataTypes.push('cookies')

  try {
    const result = await window.electronAPI.invoke<ImportResult>('browser-data-import', {
      sourceType: sourceType.value,
      sourcePath: sourcePath.value,
      envIds: [...selectedTargetIds.value],
      dataTypes,
    })

    const parts: string[] = []
    if (importBookmarks.value) parts.push(`链接 ${result.urlCount} 个`)
    if (importCookies.value) parts.push(`Cookie ${result.cookieCount} 个`)
    resultMessage.value = `已导入到 ${result.importedEnvironments}/${result.totalEnvironments} 个环境，${parts.join('，')}`

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
/* 复用 BookmarkImportDialog 的样式 */
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
```

- [ ] **Step 2: 检查 TypeScript 编译**

运行 `npx vue-tsc --noEmit` 确认无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/BrowserDataImportDialog.vue
git commit -m "feat: add BrowserDataImportDialog with bookmark + cookie checkboxes"
```

---

### Task 4: 更新 EnvironmentsView

**Files:**
- Modify: `src/views/EnvironmentsView.vue:15`（按钮文案）
- Modify: `src/views/EnvironmentsView.vue:280-286`（组件引用）
- Modify: `src/views/EnvironmentsView.vue:317`（import 语句）
- Modify: `src/views/EnvironmentsView.vue:332`（ref 变量名）

- [ ] **Step 1: 修改按钮文案**

在 `src/views/EnvironmentsView.vue` 第 15 行，将：

```html
<button @click="showBookmarkImport = true" class="btn-outline text-xs">导入收藏夹</button>
```

改为：

```html
<button @click="showBrowserDataImport = true" class="btn-outline text-xs">导入浏览器数据</button>
```

- [ ] **Step 2: 修改组件引用**

将模板中的 `BookmarkImportDialog` 引用（第 280-286 行）：

```html
<BookmarkImportDialog
  v-if="showBookmarkImport"
  :initial-selected-ids="selectedIds"
  @close="showBookmarkImport = false"
  @imported="onBookmarksImported"
/>
```

改为：

```html
<BrowserDataImportDialog
  v-if="showBrowserDataImport"
  :initial-selected-ids="selectedIds"
  @close="showBrowserDataImport = false"
  @imported="onBrowserDataImported"
/>
```

- [ ] **Step 3: 修改 import 语句**

将第 317 行：

```typescript
import BookmarkImportDialog from '@/components/BookmarkImportDialog.vue'
```

改为：

```typescript
import BrowserDataImportDialog from '@/components/BrowserDataImportDialog.vue'
```

- [ ] **Step 4: 修改 ref 变量和回调函数**

将第 332 行：

```typescript
const showBookmarkImport = ref(false)
```

改为：

```typescript
const showBrowserDataImport = ref(false)
```

将 `onBookmarksImported` 函数（第 576-581 行）改名为 `onBrowserDataImported`：

```typescript
async function onBrowserDataImported(count: number) {
  if (count > 0) {
    showBrowserDataImport.value = false
  }
  await store.dispatch('environments/fetchAll')
}
```

- [ ] **Step 5: 检查 TypeScript 编译**

运行 `npx vue-tsc --noEmit` 确认无类型错误。

- [ ] **Step 6: 提交**

```bash
git add src/views/EnvironmentsView.vue
git commit -m "feat: update EnvironmentsView to use BrowserDataImportDialog"
```

---

## 验证清单

完成所有任务后，手动验证：

- [ ] 标题显示"导入浏览器数据"
- [ ] 复选框默认全选"导入收藏夹"和"导入 Cookie"
- [ ] 取消勾选"导入收藏夹"后预览区域隐藏
- [ ] 取消勾选"导入 Cookie"后仍可正常导入收藏夹
- [ ] 两个都取消勾选时提交按钮禁用
- [ ] 选择 Chrome/Edge 来源后自动检测 Profile
- [ ] 导入收藏夹：目标环境 Bookmarks 文件正确写入
- [ ] 导入 Cookie：目标环境 Cookies SQLite 正确写入
- [ ] 结果消息显示链接数和 Cookie 数
- [ ] 运行中环境被正确跳过
- [ ] TypeScript 编译无错误：`npx vue-tsc --noEmit`
