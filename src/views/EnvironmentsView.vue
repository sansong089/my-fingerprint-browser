<template>
  <div class="h-full flex">
    <!-- GroupSidebar (左侧) -->
    <GroupSidebar />

    <!-- 主区域 -->
    <div class="flex-1 p-6 overflow-y-auto min-w-0">
      <!-- 标题栏 -->
      <div class="flex items-center gap-3 mb-4">
        <h2 class="text-base font-semibold text-slate-800">环境管理</h2>
        <span class="text-xs text-slate-400">{{ filteredEnvironments.length }} 个环境</span>
        <div class="flex-1"></div>
        <button @click="openCreateDialog" :disabled="isEnvironmentOperationBusy" class="btn-primary text-xs">新建环境</button>
        <button @click="openBatchCreate" :disabled="isEnvironmentOperationBusy" class="btn-outline text-xs">批量创建</button>
        <button @click="openBrowserDataImport" :disabled="isEnvironmentOperationBusy" class="btn-outline text-xs">导入浏览器数据</button>
        <button @click="openImportExport" :disabled="isEnvironmentOperationBusy" class="btn-outline text-xs">导入/导出</button>
      </div>

      <!-- 筛选栏 -->
      <div class="flex items-center gap-3 mb-3">
        <div class="relative">
          <SearchIcon class="env-search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索环境名称或标签..."
            class="env-filter-input"
          />
        </div>
        <div class="env-filter-select-wrap">
          <select v-model="statusFilter" class="env-filter-select">
            <option value="">全部状态</option>
            <option value="running">运行中</option>
            <option value="stopped">已停止</option>
          </select>
          <ChevronDownIcon class="env-filter-select-icon" />
        </div>
        <div class="flex-1"></div>
      </div>

      <ListSurface
        :has-items="filteredEnvironments.length > 0"
        :row-menu-open="isRowMenuOpen"
      >
        <!-- 批量操作栏 -->
        <template #toolbar>
          <div class="flex items-center gap-2">
            <label class="select-all-control">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              <span>全选</span>
            </label>
            <SplitIconButton
              size="toolbar"
              variant="start"
              main-label="启动"
              toggle-title="更多启动方式"
              menu-class="row-menu--compact row-menu--toolbar"
              :disabled="!canLaunchSelected"
              :open="activeMenuKey === 'toolbar-launch'"
              @main-click="batchLaunch"
              @toggle-click="toggleToolbarLaunchMenu"
            >
              <template #main-icon>
                <PlayIcon />
              </template>
              <template #toggle-icon>
                <ChevronDownIcon />
              </template>
              <template #menu>
                <button
                  @click="batchLaunch"
                  class="row-menu__item"
                >
                  普通启动
                </button>
                <button
                  @click="batchDebugLaunch"
                  class="row-menu__item row-menu__item--debug"
                >
                  调试启动
                </button>
              </template>
            </SplitIconButton>
              <button
                @click="batchClose"
                :disabled="!canStopSelected"
                class="action-btn action-btn-stop"
                aria-label="关闭"
                :data-label="'关闭'"
              >
                <PowerIcon class="action-btn__icon" />
              </button>
            <SplitIconButton
              size="toolbar"
              variant="shortcut"
              main-label="创建桌面快捷方式"
              toggle-title="更多快捷方式选项"
              menu-class="row-menu--toolbar"
              :disabled="!canCreateShortcutSelected"
              :open="activeMenuKey === 'toolbar-shortcut'"
              @main-click="batchCreateDesktopShortcuts('standard')"
              @toggle-click="toggleToolbarShortcutMenu"
            >
              <template #main-icon>
                <MonitorUpIcon />
              </template>
              <template #toggle-icon>
                <ChevronDownIcon />
              </template>
              <template #menu>
                <button
                  @click="batchCreateDesktopShortcuts('standard')"
                  class="row-menu__item"
                >
                  创建普通启动快捷方式
                </button>
                <button
                  @click="batchCreateDesktopShortcuts('cdp')"
                  class="row-menu__item row-menu__item--debug"
                >
                  创建调试启动快捷方式
                </button>
              </template>
            </SplitIconButton>
            <div class="flex-1"></div>
            <button
              @click="batchDelete"
              :disabled="!canDeleteSelected"
              class="action-btn action-btn-delete"
              aria-label="删除"
              :data-label="'删除'"
            >
              <TrashIcon class="action-btn__icon" />
            </button>
          </div>
        </template>

        <!-- P2: 表格 -->
        <table class="w-full text-sm border-separate border-spacing-0" role="grid">
          <thead>
            <tr>
              <th class="list-table-head w-24 rounded-tl-lg">编号</th>
              <th class="list-table-head">名称</th>
              <th class="list-table-head">状态</th>
              <th class="list-table-head">代理</th>
              <th class="list-table-head rounded-tr-lg">最后使用</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(env, index) in paginatedEnvironments"
              :key="env.id"
              class="list-table-row transition-colors"
              :class="{
                'list-table-row--selected': isSelected(env.id),
                'list-table-row--actions-open': isRowActionMenuOpen(env.id),
              }"
            >
              <td class="py-2.5 px-4 text-center">
                <div class="flex items-center justify-center gap-3">
                  <input type="checkbox" :checked="isSelected(env.id)" @change="toggleSelection(env.id)" />
                  <span class="text-xs font-medium text-slate-500">{{ rowNumber(index) }}</span>
                </div>
              </td>
              <td class="py-2.5 px-4 text-slate-700 text-center">{{ env.name }}</td>
              <td class="py-2.5 px-4 text-center">
                <span class="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  :class="statusBadgeClass(env.status)"
                >{{ statusLabel(env.status) }}</span>
              </td>
              <td class="py-2.5 px-4 text-slate-500 text-xs text-center">{{ proxyLabel(env) }}</td>
              <td class="relative py-2.5 px-4 text-slate-400 text-xs text-center">
                <span>{{ formatTime(env.lastUsed) }}</span>
                <div class="floating-row-actions">
                  <template v-if="env.status === 'running'">
                    <button @click.stop="minimizeEnv(env.id)"
                      class="ghost-btn" aria-label="最小化" :data-label="'最小化'">
                      <MinimizeIcon class="row-action-icon" />
                    </button>
                    <button @click.stop="maximizeEnv(env.id)"
                      class="ghost-btn" aria-label="最大化" :data-label="'最大化'">
                      <MaximizeIcon class="row-action-icon" />
                    </button>
                    <button @click.stop="closeEnv(env.id)"
                      class="ghost-btn ghost-btn--stop" aria-label="关闭" :data-label="'关闭'">
                      <PowerIcon class="row-action-icon" />
                    </button>
                  </template>
                  <template v-else>
                    <SplitIconButton
                      size="row"
                      variant="start"
                      main-label="启动"
                      main-aria-label="普通启动"
                      toggle-title="更多启动方式"
                      menu-class="row-menu--compact"
                      :open="activeMenuKey === `launch:${env.id}`"
                      @main-click="launchEnv(env.id)"
                      @toggle-click="toggleLaunchMenu(env.id)"
                    >
                      <template #main-icon>
                        <PlayIcon />
                      </template>
                      <template #toggle-icon>
                        <ChevronDownIcon />
                      </template>
                      <template #menu>
                        <button
                          @click.stop="launchEnv(env.id)"
                          class="row-menu__item"
                        >
                          普通启动
                        </button>
                        <button
                          @click.stop="debugLaunchEnv(env.id)"
                          class="row-menu__item row-menu__item--debug"
                        >
                          调试启动
                        </button>
                      </template>
                    </SplitIconButton>
                    <SplitIconButton
                      size="row"
                      variant="shortcut"
                      main-label="创建桌面快捷方式"
                      toggle-title="更多快捷方式选项"
                      :open="activeMenuKey === `shortcut:${env.id}`"
                      @main-click="createDesktopShortcut(env.id, 'standard')"
                      @toggle-click="toggleShortcutMenu(env.id)"
                    >
                      <template #main-icon>
                        <MonitorUpIcon />
                      </template>
                      <template #toggle-icon>
                        <ChevronDownIcon />
                      </template>
                      <template #menu>
                        <button
                          @click.stop="createDesktopShortcut(env.id, 'standard')"
                          class="row-menu__item"
                        >
                          创建普通启动快捷方式
                        </button>
                        <button
                          @click.stop="createDesktopShortcut(env.id, 'cdp')"
                          class="row-menu__item row-menu__item--debug"
                        >
                          创建调试启动快捷方式
                        </button>
                      </template>
                    </SplitIconButton>
                    <button @click.stop="editEnv(env)"
                      class="ghost-btn" aria-label="编辑" :data-label="'编辑'">
                      <PencilIcon class="row-action-icon" />
                    </button>
                    <button @click.stop="deleteEnv(env)"
                      :disabled="isEnvironmentOperationBusy"
                      class="ghost-btn ghost-btn--danger" aria-label="删除" :data-label="'删除'">
                      <TrashIcon class="row-action-icon" />
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty State -->
        <template #empty>
          <p>暂无环境</p>
          <button @click="openCreateDialog" :disabled="isEnvironmentOperationBusy" class="mt-3 btn-primary text-xs">创建第一个环境</button>
        </template>
        <template #pagination>
          <PaginationBar
            v-if="filteredEnvironments.length > 0"
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="filteredEnvironments.length"
            @update:page-size="updatePageSize"
          />
        </template>
      </ListSurface>
    </div>

    <!-- EnvironmentEditor 弹窗（单建 + 编辑 + 批量创建统一） -->
    <EnvironmentEditor
      v-if="showEditor"
      :environment="editingEnvironment"
      :count="batchCreateCount"
      :saving="isCreatingEnvironments"
      @close="closeEditor"
      @save="saveEnvironment"
    />

    <div
      v-if="isEnvironmentOperationBusy"
      class="fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[1px] flex items-center justify-center cursor-default"
    >
      <div class="rounded-lg bg-white px-6 py-5 shadow-xl border border-slate-200 min-w-72 text-center">
        <div class="mx-auto mb-3 h-9 w-9 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin"></div>
        <p class="text-sm font-medium text-slate-700">{{ environmentOperationOverlayTitle }}</p>
        <template v-if="isImportingBrowserData">
          <p class="mt-1 text-xs text-slate-500">{{ browserDataImportProgressMessage }}</p>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-blue-500 transition-all duration-200"
              :style="{ width: `${browserDataImportProgressPercent}%` }"
            ></div>
          </div>
          <div class="mt-2 flex items-center justify-between gap-4 text-xs text-slate-500">
            <span>目标 {{ browserDataImportTargetCount }} 个环境</span>
            <span>{{ browserDataImportProgressPercent }}%</span>
          </div>
        </template>
        <template v-else-if="isImportExportingEnvironments">
          <p class="mt-1 text-xs text-slate-500">{{ importExportProgressMessage }}</p>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-blue-500 transition-all duration-200"
              :style="{ width: `${importExportProgressPercent}%` }"
            ></div>
          </div>
          <div class="mt-2 flex items-center justify-between gap-4 text-xs text-slate-500">
            <span>{{ importExportProgressMeta }}</span>
            <span>{{ importExportProgressPercent }}%</span>
          </div>
        </template>
        <p v-else class="mt-1 text-xs text-slate-500">已完成 {{ environmentOperationDoneCount }}/{{ environmentOperationTotalCount }}</p>
      </div>
    </div>

    <!-- ImportExportDialog 弹窗 -->
    <ImportExportDialog
      v-if="showImportExport"
      @close="showImportExport = false"
      @submit-export="startEnvironmentExport"
      @submit-import="startEnvironmentImport"
    />

    <!-- BrowserDataImportDialog 弹窗 -->
    <BrowserDataImportDialog
      v-if="showBrowserDataImport"
      :initial-selected-ids="selectedIds"
      :initial-result="browserDataImportResultState"
      @close="closeBrowserDataImport"
      @import="startBrowserDataImport"
    />

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="确认删除环境？"
      :message="deleteConfirmMessage"
      danger
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="confirmBatchDelete"
      @cancel="cancelBatchDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useStore } from 'vuex'
import type { Environment, FingerprintConfig } from '@/types'
import GroupSidebar from '@/components/layout/GroupSidebar.vue'
import EnvironmentEditor from '@/components/EnvironmentEditor.vue'
import ImportExportDialog from '@/components/ImportExportDialog.vue'
import BrowserDataImportDialog from '@/components/BrowserDataImportDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import ListSurface from '@/components/common/ListSurface.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import SplitIconButton from '@/components/common/SplitIconButton.vue'
import { toast } from '@/utils/toast'
import {
  ChevronDownIcon,
  MinusIcon as MinimizeIcon,
  MonitorUpIcon,
  PencilIcon,
  PlayIcon,
  PowerIcon,
  SearchIcon,
  SquareIcon as MaximizeIcon,
  Trash2Icon as TrashIcon,
} from 'lucide-vue-next'

const store = useStore()
type EnvironmentCreateDraft = Partial<Environment> & { __randomFingerprint?: boolean }
type EnvironmentStatus = Environment['status']
type LaunchMode = 'standard' | 'cdp'
type BrowserDataImportProgressPhase = 'preparing' | 'bookmarks' | 'cookies' | 'finalizing' | 'done' | 'failed'
type ImportExportOperationMode = 'import' | 'export'
type ImportExportProgressPhase = 'processing' | 'done' | 'failed'

interface EnvironmentSettings {
  environmentPageSize?: number
}

interface UiState {
  currentGroupId?: string | null
  selectedEnvIds?: string[]
}

interface BrowserDataImportRequest {
  sourceType: 'chrome' | 'edge'
  sourceProfileName?: string
  envIds: string[]
  dataTypes: string[]
}

interface BrowserDataImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  cookieCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

interface BrowserDataImportProgress {
  taskId: string
  phase: BrowserDataImportProgressPhase
  percent: number
  message: string
  completedSteps: number
  totalSteps: number
}

interface ImportExportOperationPayload {
  taskId: string
  mode: ImportExportOperationMode
  total: number
}

interface EnvironmentExportRequest {
  envIds: string[]
  cookiePassword?: string
}

interface EnvironmentImportRequest {
  cookiePassword?: string
}

interface ImportExportProgress {
  taskId: string
  mode: ImportExportOperationMode
  phase: ImportExportProgressPhase
  percent: number
  message: string
  completedSteps: number
  totalSteps: number
}

interface EnvironmentImportResult {
  environments: Array<{ id: string; name: string; renamed?: boolean }>
  plugins: Array<{ id: string; name: string; skipped: boolean }>
}

type BrowserDataImportResultStatus = 'success' | 'partial' | 'failed'

interface BrowserDataImportResultState {
  status: BrowserDataImportResultStatus
  title: string
  message: string
  result: BrowserDataImportResult | null
  failures: Array<{ envId: string; reason: string }>
}

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [0, 10, 20, 50, 100] as const

const searchQuery = ref('')
const statusFilter = ref('')
const showEditor = ref(false)
const editingEnvironment = ref<Environment | null>(null)
const batchCreateCount = ref(1)
const isCreatingEnvironments = ref(false)
const creatingEnvironmentCount = ref(0)
const createdEnvironmentCount = ref(0)
const isDeletingEnvironments = ref(false)
const deletingEnvironmentCount = ref(0)
const deletedEnvironmentCount = ref(0)
const isImportingBrowserData = ref(false)
const browserDataImportTaskId = ref('')
const browserDataImportTargetCount = ref(0)
const browserDataImportProgress = ref<BrowserDataImportProgress | null>(null)
const browserDataImportResultState = ref<BrowserDataImportResultState | null>(null)
const isImportExportingEnvironments = ref(false)
const importExportTaskId = ref('')
const importExportMode = ref<ImportExportOperationMode>('export')
const importExportTargetCount = ref(0)
const importExportProgress = ref<ImportExportProgress | null>(null)
const showImportExport = ref(false)
const showBrowserDataImport = ref(false)
const showDeleteConfirm = ref(false)
const deletingEnv = ref<Environment | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)
const activeMenuKey = ref<string | null>(null)
const isRowMenuOpen = computed(() => {
  const key = activeMenuKey.value
  return key?.startsWith('launch:') === true || key?.startsWith('shortcut:') === true
})
let browserDataImportProgressHandler: ((...args: unknown[]) => void) | null = null
let importExportProgressHandler: ((...args: unknown[]) => void) | null = null

function closeInlineMenu() {
  activeMenuKey.value = null
}

function handleWindowClick() {
  closeInlineMenu()
}

onMounted(() => {
  store.dispatch('settings/fetch')
  store.dispatch('environments/fetchAll')
  store.dispatch('groups/fetchAll')
  browserDataImportProgressHandler = window.electronAPI.onAppEvent('browser-data-import-progress', handleBrowserDataImportProgress)
  importExportProgressHandler = window.electronAPI.onAppEvent('environment-import-export-progress', handleImportExportProgress)
  window.addEventListener('click', handleWindowClick)
})

onBeforeUnmount(() => {
  if (browserDataImportProgressHandler) {
    window.electronAPI.offAppEvent('browser-data-import-progress', browserDataImportProgressHandler)
    browserDataImportProgressHandler = null
  }
  if (importExportProgressHandler) {
    window.electronAPI.offAppEvent('environment-import-export-progress', importExportProgressHandler)
    importExportProgressHandler = null
  }
  window.removeEventListener('click', handleWindowClick)
})

// --- Data ---
const environments = computed<Environment[]>(() => (store.state.environments as { list?: Environment[] })?.list ?? [])
const settings = computed<EnvironmentSettings>(() => (store.state.settings as { data?: EnvironmentSettings })?.data ?? {})
const uiState = computed<UiState>(() => store.state.ui as UiState)
const currentGroupId = computed(() => uiState.value.currentGroupId)
const selectedIds = computed<string[]>(() => uiState.value.selectedEnvIds ?? [])
const selectedIdSet = computed(() => new Set(selectedIds.value))
const selectionCount = computed(() => selectedIds.value.length)
const selectedEnvironments = computed(() =>
  environments.value.filter((env) => selectedIdSet.value.has(env.id))
)
const selectedRunning = computed(() =>
  selectedEnvironments.value.filter((env) => env.status === 'running')
)
const selectedStopped = computed(() =>
  selectedEnvironments.value.filter((env) => env.status === 'stopped')
)
const selectedRunningCount = computed(() => selectedRunning.value.length)
const selectedStoppedCount = computed(() => selectedStopped.value.length)
const isEnvironmentOperationBusy = computed(() =>
  isCreatingEnvironments.value ||
  isDeletingEnvironments.value ||
  isImportingBrowserData.value ||
  isImportExportingEnvironments.value
)
const canCreateShortcutSelected = computed(() => selectionCount.value > 0 && !isEnvironmentOperationBusy.value)
const canLaunchSelected = computed(() => selectedStoppedCount.value > 0 && !isEnvironmentOperationBusy.value)
const canStopSelected = computed(() => selectedRunningCount.value > 0 && !isEnvironmentOperationBusy.value)
const canDeleteSelected = computed(() => selectionCount.value > 0 && !isEnvironmentOperationBusy.value)
const environmentOperationOverlayTitle = computed(() => {
  if (isImportExportingEnvironments.value) {
    return importExportMode.value === 'export'
      ? '正在导出环境...'
      : '正在导入环境...'
  }
  if (isImportingBrowserData.value) {
    return '正在导入浏览器数据...'
  }
  if (isDeletingEnvironments.value) {
    return deletingEnvironmentCount.value > 1
      ? `正在删除 ${deletingEnvironmentCount.value} 个环境...`
      : '正在删除环境...'
  }
  if (editingEnvironment.value) {
    return '正在保存环境...'
  }
  return creatingEnvironmentCount.value > 1
    ? `正在创建 ${creatingEnvironmentCount.value} 个环境...`
    : '正在创建环境...'
})
const environmentOperationDoneCount = computed(() =>
  isDeletingEnvironments.value ? deletedEnvironmentCount.value : createdEnvironmentCount.value
)
const environmentOperationTotalCount = computed(() =>
  isDeletingEnvironments.value ? deletingEnvironmentCount.value : creatingEnvironmentCount.value
)
const browserDataImportProgressPercent = computed(() => {
  const percent = browserDataImportProgress.value?.percent ?? (isImportingBrowserData.value ? 3 : 0)
  return Math.min(100, Math.max(0, Math.round(percent)))
})
const browserDataImportProgressMessage = computed(() => browserDataImportProgress.value?.message || '正在准备导入...')
const importExportProgressPercent = computed(() => {
  const percent = importExportProgress.value?.percent ?? (isImportExportingEnvironments.value ? 3 : 0)
  return Math.min(100, Math.max(0, Math.round(percent)))
})
const importExportProgressMessage = computed(() =>
  importExportProgress.value?.message ||
  (importExportMode.value === 'export' ? '正在准备导出...' : '正在准备导入...')
)
const importExportProgressMeta = computed(() => {
  if (importExportMode.value === 'export') {
    return `目标 ${importExportTargetCount.value} 个环境`
  }
  return '正在处理 ZIP 文件'
})
const allSelected = computed(
  () => paginatedEnvironments.value.length > 0 && paginatedEnvironments.value.every((env) => selectedIdSet.value.has(env.id))
)
const deleteConfirmMessage = computed(() => {
  if (deletingEnv.value) {
    return `确认删除环境「${deletingEnv.value.name}」？此操作不可恢复。`
  }
  return `确认删除选中的 ${selectedIds.value.length} 个环境？此操作不可恢复。`
})

const filteredEnvironments = computed(() => {
  let result: Environment[] = environments.value
  const groupId = currentGroupId.value

  // 分组筛选
  if (groupId !== undefined && groupId !== null && groupId !== '') {
    result = result.filter((env) => env.groupId === groupId)
  } else if (groupId === '') {
    // "未分组"
    result = result.filter((env) => !env.groupId || env.groupId === '')
  }

  // 状态筛选
  if (isEnvironmentStatus(statusFilter.value)) {
    result = result.filter((env) => env.status === statusFilter.value)
  }

  // 搜索筛选
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter((env) =>
      env.name.toLowerCase().includes(q) ||
      (env.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
    )
  }

  return result
})
const totalPages = computed(() => {
  if (pageSize.value === 0) return 1
  return Math.max(1, Math.ceil(filteredEnvironments.value.length / pageSize.value))
})
const paginatedEnvironments = computed(() => {
  if (pageSize.value === 0) return filteredEnvironments.value
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEnvironments.value.slice(start, start + pageSize.value)
})

watch([searchQuery, statusFilter, currentGroupId], () => {
  currentPage.value = 1
})

watch(
  () => settings.value.environmentPageSize,
  (nextSize) => {
    pageSize.value = normalizePageSize(nextSize)
  },
  { immediate: true }
)

watch([totalPages, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
}, { immediate: true })

// --- Actions ---
function isSelected(id: string): boolean { return selectedIdSet.value.has(id) }
function toggleSelection(id: string): void { store.commit('ui/TOGGLE_ENV_SELECTION', id) }
function toggleAll(): void {
  if (allSelected.value) paginatedEnvironments.value.forEach((env) => store.commit('ui/DESELECT_ENV', env.id))
  else paginatedEnvironments.value.forEach((env) => store.commit('ui/SELECT_ENV', env.id))
}

async function launchEnvironment(id: string, launchMode: LaunchMode) {
  closeInlineMenu()
  try {
    await store.dispatch('environments/launch', { envId: id, launchMode })
  } catch (error) {
    console.error('[launchEnvironment] error:', error)
    toast.error(readErrorMessage(error, '启动环境失败'))
  }
}
async function launchEnv(id: string) {
  await launchEnvironment(id, 'standard')
}
async function debugLaunchEnv(id: string) {
  await launchEnvironment(id, 'cdp')
}
async function closeEnv(id: string) {
  try {
    await store.dispatch('environments/close', id)
  } catch (error) {
    console.error('[closeEnv] error:', error)
    toast.error(readErrorMessage(error, '关闭环境失败'))
  }
}
async function minimizeEnv(id: string) {
  try {
    await window.electronAPI.invoke('windows-minimize', { envIds: [id] })
  } catch (e) {
    console.error('[minimizeEnv] error:', e)
    toast.error(readErrorMessage(e, '最小化窗口失败'))
  }
}
async function maximizeEnv(id: string) {
  try {
    await window.electronAPI.invoke('windows-maximize', { envIds: [id] })
  } catch (e) {
    console.error('[maximizeEnv] error:', e)
    toast.error(readErrorMessage(e, '最大化窗口失败'))
  }
}
function editEnv(env: Environment) {
  closeInlineMenu()
  editingEnvironment.value = env
  showEditor.value = true
}
async function deleteEnv(env: Environment) {
  if (isEnvironmentOperationBusy.value) return
  if (env.status === 'running') {
    toast.error('请先关闭环境再删除')
    return
  }
  deletingEnv.value = env
  showDeleteConfirm.value = true
}
function toggleLaunchMenu(id: string) {
  const key = `launch:${id}`
  activeMenuKey.value = activeMenuKey.value === key ? null : key
}

function toggleShortcutMenu(id: string) {
  const key = `shortcut:${id}`
  activeMenuKey.value = activeMenuKey.value === key ? null : key
}

function toggleToolbarShortcutMenu() {
  const key = 'toolbar-shortcut'
  activeMenuKey.value = activeMenuKey.value === key ? null : key
}

function toggleToolbarLaunchMenu() {
  const key = 'toolbar-launch'
  activeMenuKey.value = activeMenuKey.value === key ? null : key
}

function isRowActionMenuOpen(id: string) {
  return activeMenuKey.value === `launch:${id}` || activeMenuKey.value === `shortcut:${id}`
}

async function createDesktopShortcut(id: string, launchMode: LaunchMode = 'standard') {
  try {
    closeInlineMenu()
    const shortcutPath = await window.electronAPI.invoke<string>('create-desktop-shortcut', {
      envId: id,
      launchMode,
    })
    toast.success(`已创建桌面快捷方式：${shortcutPath}`)
  } catch (error) {
    console.error('[createDesktopShortcut] error:', error)
    toast.error(readErrorMessage(error, '创建桌面快捷方式失败'))
  }
}

async function batchCreateDesktopShortcuts(launchMode: LaunchMode = 'standard') {
  const ids = [...selectedIds.value]
  if (ids.length === 0 || isEnvironmentOperationBusy.value) return

  let completedCount = 0
  try {
    closeInlineMenu()
    for (const id of ids) {
      await window.electronAPI.invoke<string>('create-desktop-shortcut', {
        envId: id,
        launchMode,
      })
      completedCount += 1
    }
    toast.success(`已为 ${completedCount} 个环境创建桌面快捷方式`)
  } catch (error) {
    console.error('[batchCreateDesktopShortcuts] error:', error)
    toast.error(completedCount > 0
      ? `已创建 ${completedCount}/${ids.length} 个快捷方式，${readErrorMessage(error, '剩余快捷方式创建失败')}`
      : readErrorMessage(error, '批量创建桌面快捷方式失败')
    )
  }
}
function openBatchCreate() {
  if (isEnvironmentOperationBusy.value) return
  editingEnvironment.value = null
  batchCreateCount.value = 5  // 默认批量 5 个
  showEditor.value = true
}
function openCreateDialog() {
  if (isEnvironmentOperationBusy.value) return
  editingEnvironment.value = null
  batchCreateCount.value = 1
  showEditor.value = true
}

function openBrowserDataImport() {
  if (isEnvironmentOperationBusy.value) return
  browserDataImportResultState.value = null
  showBrowserDataImport.value = true
}

function closeBrowserDataImport() {
  showBrowserDataImport.value = false
  browserDataImportResultState.value = null
}

function closeEditor() { showEditor.value = false; editingEnvironment.value = null; batchCreateCount.value = 1 }
async function saveEnvironment(data: Partial<Environment> | Array<Partial<Environment>>) {
  if (isEnvironmentOperationBusy.value) return

  const isBatchCreate = Array.isArray(data)
  const total = isBatchCreate ? data.length : 1
  const editing = editingEnvironment.value
  if (total === 0) {
    toast.error('没有可创建的环境')
    return
  }

  if (isBatchCreate) closeEditor()
  isCreatingEnvironments.value = true
  creatingEnvironmentCount.value = total
  createdEnvironmentCount.value = 0

  try {
    if (isBatchCreate) {
      for (const env of data) {
        await store.dispatch('environments/create', await prepareEnvironmentCreateDraft(env as EnvironmentCreateDraft))
        createdEnvironmentCount.value += 1
      }
      toast.success(`已创建 ${createdEnvironmentCount.value} 个环境`)
    } else if (editing) {
      await store.dispatch('environments/update', { ...editing, ...data })
      createdEnvironmentCount.value = 1
      toast.success('环境已保存')
      closeEditor()
    } else {
      await store.dispatch('environments/create', data)
      createdEnvironmentCount.value = 1
      toast.success('已创建 1 个环境')
      closeEditor()
    }
  } catch (error) {
    console.error('[saveEnvironment] error:', error)
    toast.error(readErrorMessage(error, '环境保存失败'))
  } finally {
    isCreatingEnvironments.value = false
    creatingEnvironmentCount.value = 0
    createdEnvironmentCount.value = 0
  }
}

async function prepareEnvironmentCreateDraft(env: EnvironmentCreateDraft): Promise<Partial<Environment>> {
  const { __randomFingerprint, ...draft } = env
  if (!__randomFingerprint) return draft

  try {
    const generated = await window.electronAPI.invoke<{
      platform: string
      brand: string
      hardwareConcurrency: number
      platformVersion: string
      brandVersion: string
    }>('generate-fingerprint')

    const fingerprint: FingerprintConfig = {
      ...(draft.fingerprint as FingerprintConfig),
      platform: generated.platform as FingerprintConfig['platform'],
      brand: generated.brand as FingerprintConfig['brand'],
      hardwareConcurrency: Math.max(4, generated.hardwareConcurrency),
      platformVersion: generated.platformVersion,
      brandVersion: generated.brandVersion,
    }
    return { ...draft, fingerprint }
  } catch (error) {
    console.warn('[prepareEnvironmentCreateDraft] generateFingerprint failed, using form values:', error)
    return draft
  }
}

function openImportExport() {
  if (isEnvironmentOperationBusy.value) return
  showImportExport.value = true
}

function beginImportExportOperation(payload: ImportExportOperationPayload) {
  showImportExport.value = false
  importExportTaskId.value = payload.taskId
  importExportMode.value = payload.mode
  importExportTargetCount.value = payload.total
  importExportProgress.value = {
    taskId: payload.taskId,
    mode: payload.mode,
    phase: 'processing',
    percent: 0,
    message: payload.mode === 'export' ? '正在准备导出...' : '正在准备导入...',
    completedSteps: 0,
    totalSteps: 2,
  }
  isImportExportingEnvironments.value = true
}

function finishImportExportOperation(taskId: string) {
  if (!importExportTaskId.value || taskId !== importExportTaskId.value) return
  isImportExportingEnvironments.value = false
  importExportTaskId.value = ''
  importExportTargetCount.value = 0
  importExportProgress.value = null
}

async function startEnvironmentExport(request: EnvironmentExportRequest) {
  if (isEnvironmentOperationBusy.value || request.envIds.length === 0) return

  let filePath = ''
  try {
    filePath = await window.electronAPI.invoke<string>('select-export-environments-path')
  } catch (error) {
    if (!isImportExportCanceled(error)) {
      console.error('[startEnvironmentExport] select path error:', error)
      toast.error(readErrorMessage(error, '选择导出位置失败'))
    }
    return
  }

  const taskId = `environment-export-${Date.now()}-${Math.random().toString(36).slice(2)}`
  beginImportExportOperation({ taskId, mode: 'export', total: request.envIds.length })

  try {
    await window.electronAPI.invoke<{ success: boolean; path: string }>('export-environments', {
      envIds: request.envIds,
      cookiePassword: request.cookiePassword,
      taskId,
      filePath,
    })
    store.dispatch('logs/add', {
      action: 'export',
      details: `导出 ${request.envIds.length} 个环境`,
    })
    toast.success(`已导出 ${request.envIds.length} 个环境`)
  } catch (error) {
    if (!isImportExportCanceled(error)) {
      console.error('[startEnvironmentExport] error:', error)
      toast.error(readErrorMessage(error, '导出环境失败'))
    }
  } finally {
    finishImportExportOperation(taskId)
  }
}

async function startEnvironmentImport(request: EnvironmentImportRequest) {
  if (isEnvironmentOperationBusy.value) return

  let filePath = ''
  try {
    filePath = await window.electronAPI.invoke<string>('select-import-environments-file')
  } catch (error) {
    if (!isImportExportCanceled(error)) {
      console.error('[startEnvironmentImport] select file error:', error)
      toast.error(readErrorMessage(error, '选择导入文件失败'))
    }
    return
  }

  const taskId = `environment-import-${Date.now()}-${Math.random().toString(36).slice(2)}`
  beginImportExportOperation({ taskId, mode: 'import', total: 1 })

  try {
    const result = await window.electronAPI.invoke<EnvironmentImportResult>('import-environments', {
      cookiePassword: request.cookiePassword,
      taskId,
      filePath,
    })
    await store.dispatch('environments/fetchAll')
    store.dispatch('logs/add', {
      action: 'import',
      details: `导入 ${result.environments.length} 个环境，${result.plugins.filter((plugin) => !plugin.skipped).length} 个插件`,
    })
    toast.success(buildEnvironmentImportSuccessMessage(result))
  } catch (error) {
    if (!isImportExportCanceled(error)) {
      console.error('[startEnvironmentImport] error:', error)
      toast.error(readErrorMessage(error, '导入环境失败'))
    }
  } finally {
    finishImportExportOperation(taskId)
  }
}

async function startBrowserDataImport(request: BrowserDataImportRequest) {
  if (isEnvironmentOperationBusy.value) return
  if (request.envIds.length === 0) {
    toast.error('请选择要导入的环境')
    return
  }
  if (request.dataTypes.length === 0) {
    toast.error('请选择要导入的数据类型')
    return
  }

  showBrowserDataImport.value = false
  browserDataImportResultState.value = null
  browserDataImportTaskId.value = `browser-data-import-${Date.now()}-${Math.random().toString(36).slice(2)}`
  browserDataImportTargetCount.value = request.envIds.length
  browserDataImportProgress.value = {
    taskId: browserDataImportTaskId.value,
    phase: 'preparing',
    percent: 0,
    message: '正在准备导入...',
    completedSteps: 0,
    totalSteps: 1,
  }
  isImportingBrowserData.value = true

  try {
    const result = await window.electronAPI.invoke<BrowserDataImportResult>('browser-data-import', {
      ...request,
      importTaskId: browserDataImportTaskId.value,
    })
    await store.dispatch('environments/fetchAll')

    if (isBrowserDataImportFullySuccessful(result)) {
      toast.success(buildBrowserDataImportSuccessMessage(result, request))
    } else {
      browserDataImportResultState.value = buildBrowserDataImportResultState(result, request)
    }
  } catch (error) {
    console.error('[startBrowserDataImport] error:', error)
    const message = readBrowserDataImportError(error)
    browserDataImportResultState.value = {
      status: 'failed',
      title: '导入失败',
      message,
      result: null,
      failures: [{ envId: 'source', reason: message }],
    }
  } finally {
    isImportingBrowserData.value = false
    browserDataImportTaskId.value = ''
    browserDataImportTargetCount.value = 0
    browserDataImportProgress.value = null
    if (browserDataImportResultState.value) {
      showBrowserDataImport.value = true
    }
  }
}

function isBrowserDataImportFullySuccessful(result: BrowserDataImportResult): boolean {
  return (
    result.failed.length === 0 &&
    result.skippedRunning.length === 0 &&
    result.importedEnvironments === result.totalEnvironments
  )
}

function buildBrowserDataImportSuccessMessage(
  result: BrowserDataImportResult,
  request: BrowserDataImportRequest,
): string {
  const parts = buildBrowserDataImportSummaryParts(result, request)
  return `已导入到 ${result.importedEnvironments} 个环境${parts.length > 0 ? `，${parts.join('，')}` : ''}`
}

function buildBrowserDataImportResultState(
  result: BrowserDataImportResult,
  request: BrowserDataImportRequest,
): BrowserDataImportResultState {
  const failures = buildBrowserDataImportFailures(result)
  const failedCount = failures.length
  const parts = buildBrowserDataImportSummaryParts(result, request)
  const summary = parts.length > 0 ? `，${parts.join('，')}` : ''

  if (result.importedEnvironments === 0 && failedCount > 0) {
    return {
      status: 'failed',
      title: '导入失败',
      message: `未成功导入环境${summary}，失败 ${failedCount} 项`,
      result,
      failures,
    }
  }

  if (failedCount > 0) {
    return {
      status: 'partial',
      title: '部分导入完成',
      message: `已导入到 ${result.importedEnvironments}/${result.totalEnvironments} 个环境${summary}，失败 ${failedCount} 项`,
      result,
      failures,
    }
  }

  return {
    status: 'success',
    title: '导入完成',
    message: `已导入到 ${result.importedEnvironments} 个环境${summary}`,
    result,
    failures,
  }
}

function buildBrowserDataImportSummaryParts(
  result: BrowserDataImportResult,
  request: BrowserDataImportRequest,
): string[] {
  const parts: string[] = []
  if (request.dataTypes.includes('bookmarks')) parts.push(`链接 ${result.urlCount} 个`)
  if (request.dataTypes.includes('cookies')) parts.push(`Cookie ${result.cookieCount} 个`)
  return parts
}

function buildBrowserDataImportFailures(result: BrowserDataImportResult): Array<{ envId: string; reason: string }> {
  const failures = [...result.failed]
  for (const envId of result.skippedRunning) {
    failures.push({ envId, reason: '环境正在运行，请关闭后再导入' })
  }
  return failures
}

function handleBrowserDataImportProgress(data: unknown) {
  if (!isBrowserDataImportProgress(data)) return
  if (!browserDataImportTaskId.value || data.taskId !== browserDataImportTaskId.value) return
  browserDataImportProgress.value = data
}

function handleImportExportProgress(data: unknown) {
  if (!isImportExportProgress(data)) return
  if (!importExportTaskId.value || data.taskId !== importExportTaskId.value) return
  importExportProgress.value = data
}

function isBrowserDataImportProgress(data: unknown): data is BrowserDataImportProgress {
  if (!data || typeof data !== 'object') return false
  const progress = data as Partial<BrowserDataImportProgress>
  return (
    typeof progress.taskId === 'string' &&
    typeof progress.phase === 'string' &&
    typeof progress.percent === 'number' &&
    typeof progress.message === 'string' &&
    typeof progress.completedSteps === 'number' &&
    typeof progress.totalSteps === 'number'
  )
}

function isImportExportProgress(data: unknown): data is ImportExportProgress {
  if (!data || typeof data !== 'object') return false
  const progress = data as Partial<ImportExportProgress>
  return (
    typeof progress.taskId === 'string' &&
    (progress.mode === 'import' || progress.mode === 'export') &&
    typeof progress.phase === 'string' &&
    typeof progress.percent === 'number' &&
    typeof progress.message === 'string' &&
    typeof progress.completedSteps === 'number' &&
    typeof progress.totalSteps === 'number'
  )
}

function readBrowserDataImportError(error: unknown) {
  return readErrorMessage(error, '导入浏览器数据失败')
}

function isImportExportCanceled(error: unknown): boolean {
  const message = readErrorMessage(error, '')
  return message === 'Export cancelled' || message === 'Import cancelled'
}

function buildEnvironmentImportSuccessMessage(result: EnvironmentImportResult): string {
  const installedPluginCount = result.plugins.filter((plugin) => !plugin.skipped).length
  const parts = [`已导入 ${result.environments.length} 个环境`]
  if (installedPluginCount > 0) {
    parts.push(`新增 ${installedPluginCount} 个插件`)
  }
  return parts.join('，')
}

async function batchLaunch() {
  await launchSelectedEnvironments('standard')
}

async function batchDebugLaunch() {
  await launchSelectedEnvironments('cdp')
}

async function launchSelectedEnvironments(launchMode: LaunchMode) {
  const toLaunch = selectedStopped.value
  const alreadyRunning = selectedRunning.value

  if (toLaunch.length === 0 || isEnvironmentOperationBusy.value) return

  try {
    closeInlineMenu()
    for (const env of toLaunch) {
      await store.dispatch('environments/launch', { envId: env.id, launchMode })
    }

    arrangeLaunchedWindows(toLaunch, alreadyRunning)
  } catch (error) {
    console.error('[launchSelectedEnvironments] error:', error)
    toast.error(readErrorMessage(error, '批量启动环境失败'))
  }
}

function arrangeLaunchedWindows(toLaunch: Environment[], alreadyRunning: Environment[]) {
  // 批量启动完成后自动排列窗口（包括本次启动的 + 原本已运行的）
  setTimeout(async () => {
    try {
      const runningIds = [
        ...toLaunch.map((env) => env.id),
        ...alreadyRunning.map((env) => env.id)
      ]
      await window.electronAPI.invoke('windows-arrange', { envIds: runningIds })
    } catch (e) {
      console.warn('[batchLaunch] arrange failed:', e)
    }
  }, 500)
}
async function batchClose() {
  const toClose = selectedRunning.value
  if (toClose.length === 0 || isEnvironmentOperationBusy.value) return

  try {
    closeInlineMenu()
    for (const env of toClose) await store.dispatch('environments/close', env.id)
  } catch (error) {
    console.error('[batchClose] error:', error)
    toast.error(readErrorMessage(error, '批量关闭环境失败'))
  }
}
async function batchDelete() {
  if (selectedIds.value.length === 0 || isEnvironmentOperationBusy.value) return
  showDeleteConfirm.value = true
}

function cancelBatchDelete() {
  showDeleteConfirm.value = false
  deletingEnv.value = null
}

async function confirmBatchDelete() {
  if (isEnvironmentOperationBusy.value) return

  // 单个删除
  if (deletingEnv.value) {
    const env = deletingEnv.value
    cancelBatchDelete()
    await deleteEnvironmentsWithOverlay([env.id])
    return
  }
  // 批量删除
  const ids = [...selectedIds.value]
  cancelBatchDelete()
  if (ids.length === 0) return
  await deleteEnvironmentsWithOverlay(ids)
}

async function deleteEnvironmentsWithOverlay(ids: string[]) {
  if (ids.length === 0 || isDeletingEnvironments.value) return

  isDeletingEnvironments.value = true
  deletingEnvironmentCount.value = ids.length
  deletedEnvironmentCount.value = 0

  try {
    for (const id of ids) {
      await store.dispatch('environments/delete', id)
      deletedEnvironmentCount.value += 1
    }
    toast.success(`已删除 ${deletedEnvironmentCount.value} 个环境`)
  } catch (error) {
    console.error('[deleteEnvironmentsWithOverlay] error:', error)
    toast.error(readErrorMessage(error, '删除环境失败'))
  } finally {
    isDeletingEnvironments.value = false
    deletingEnvironmentCount.value = 0
    deletedEnvironmentCount.value = 0
  }
}

// --- Helpers ---
function normalizePageSize(value: unknown): number {
  const size = Number(value)
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE
}
function updatePageSize(nextSize: number): void {
  const normalizedSize = normalizePageSize(nextSize)
  if (pageSize.value === normalizedSize) return
  pageSize.value = normalizedSize
  currentPage.value = 1
  void store.dispatch('settings/save', { environmentPageSize: normalizedSize })
}
function rowNumber(index: number): number {
  return (currentPage.value - 1) * pageSize.value + index + 1
}
function statusBadgeClass(status: EnvironmentStatus) {
  return {
    running: 'bg-emerald-50 text-emerald-700',
    stopped: 'bg-slate-100 text-slate-600',
    starting: 'bg-blue-50 text-blue-700',
    stopping: 'bg-amber-50 text-amber-700',
    error: 'bg-red-50 text-red-700',
  }[status] ?? 'bg-slate-100 text-slate-600'
}
function statusLabel(status: EnvironmentStatus) { return { running: '运行中', stopped: '已停止', starting: '启动中', stopping: '停止中', error: '异常' }[status] ?? status }
function proxyLabel(env: Environment): string {
  if (!env.proxy?.host) return '-'
  return `${env.proxy.host}:${env.proxy.port}`
}
function formatTime(t?: string): string { if (!t) return '-'; return new Date(t).toLocaleString() }

function isEnvironmentStatus(value: string): value is EnvironmentStatus {
  return ['stopped', 'starting', 'running', 'stopping', 'error'].includes(value)
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}
</script>

<style scoped>
.env-filter-input,
.env-filter-select {
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  font-size: 13px;
  background: white;
}
.env-filter-input {
  width: 320px;
  max-width: 32vw;
  padding: 0 12px 0 36px;
}
.env-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 15px;
  height: 15px;
  color: #94a3b8;
  pointer-events: none;
  transform: translateY(-50%);
}
.env-filter-select-wrap {
  position: relative;
  display: inline-flex;
}
.env-filter-select {
  width: 104px;
  padding: 0 32px 0 12px;
  appearance: none;
}
.env-filter-select-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  width: 14px;
  height: 14px;
  color: #111827;
  pointer-events: none;
  transform: translateY(-50%);
}
.env-filter-input:focus,
.env-filter-select:focus { border-color: #cbd5e1; box-shadow: 0 0 0 2px rgba(148, 163, 184, .18); }
.select-all-control {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  color: #111827;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.select-all-control:hover {
  background: #f2f2f2;
  color: #0f172a;
}
.btn-primary { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: #3b82f6; color: white; border-radius: 6px; border: 0; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
.btn-primary:hover { background-color: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: white; color: #374151; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
.btn-outline:hover { background-color: #f9fafb; border-color: #cbd5e1; color: #1f2937; }
.btn-outline-danger { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: white; color: #ef4444; border-radius: 6px; border: 1px solid #fecaca; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
.btn-outline-danger:hover { background-color: #fef2f2; border-color: #fca5a5; }
.action-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  min-width: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #111827;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, filter 120ms ease;
  overflow: visible;
}
.action-btn:hover:not(:disabled),
.action-btn--open {
  background: #f2f2f2;
  color: #000000;
}
.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(1);
}
.action-btn-stop,
.action-btn-delete {
  background: transparent;
  color: #111827;
}
.action-btn-stop:hover:not(:disabled),
.action-btn-delete:hover:not(:disabled),
.action-btn--open {
  background: #f2f2f2;
  color: #000000;
}
.action-btn-delete:hover:not(:disabled) {
  background: #f2f2f2;
  color: #ef4444;
}
.action-btn-stop:hover:not(:disabled) {
  background: #f2f2f2;
  color: #ef4444;
}
.action-btn__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: currentColor;
}
.action-btn::after {
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
.action-btn:hover:not(:disabled)::after,
.action-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
.ghost-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  color: #111827;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}
.ghost-btn:hover { background: #f2f2f2; color: #000000; }
.ghost-btn--stop:hover { background: #f2f2f2; color: #ef4444; }
.ghost-btn--danger { color: #111827; }
.ghost-btn--danger:hover { background: #f2f2f2; color: #ef4444; }
.ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.floating-row-actions .ghost-btn::after {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  top: calc(100% + 6px);
  left: 50%;
  z-index: 140;
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
.floating-row-actions .ghost-btn:hover::after,
.floating-row-actions .ghost-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
.row-action-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: currentColor;
}
.floating-row-actions {
  position: absolute;
  right: 14px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: var(--env-row-bg);
  box-shadow: none;
  z-index: 120;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateY(2px);
  transition: transform 120ms ease;
}
.list-surface:not(.list-surface--row-menu-open) .list-table-row:hover .floating-row-actions,
.list-table-row--actions-open .floating-row-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%);
  background: var(--env-row-bg);
}
</style>
