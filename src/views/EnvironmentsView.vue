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
        <button @click="openCreateDialog" class="btn-primary text-xs">新建环境</button>
        <button @click="openBatchCreate" class="btn-outline text-xs">批量创建</button>
        <button @click="showBookmarkImport = true" class="btn-outline text-xs">导入收藏夹</button>
        <button @click="showImportExport = true" class="btn-outline text-xs">导入/导出</button>
      </div>

      <!-- 筛选和批量操作栏 -->
      <div class="space-y-3 mb-3">
        <!-- 第一行：搜索栏 -->
        <div class="flex items-center gap-3">
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索环境名称或标签..."
              class="env-filter-input pr-9"
            />
            <button class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
              <Search class="w-4 h-4" />
            </button>
          </div>
          <select v-model="statusFilter" class="env-filter-select">
            <option value="">全部状态</option>
            <option value="running">运行中</option>
            <option value="stopped">已停止</option>
          </select>
          <div class="flex-1"></div>
        </div>

        <!-- 第二行：操作按钮 -->
        <div class="flex items-center gap-2">
          <div class="toolbar-split" @click.stop>
            <button
              @click="batchLaunch"
              :disabled="!canLaunchSelected"
              class="action-btn action-btn-start"
              :title="canLaunchSelected ? `启动 ${selectedStoppedCount} 个已停止环境` : '请选择已停止环境'"
            >
              启动
            </button>
            <button
              @click="toggleToolbarLaunchMenu"
              :disabled="!canLaunchSelected"
              class="toolbar-split__toggle toolbar-split__toggle--start"
              :class="{ 'toolbar-split__toggle--open': activeMenuKey === 'toolbar-launch' }"
              title="更多启动方式"
              aria-label="更多启动方式"
            >
              <span class="toolbar-split__caret"></span>
            </button>
            <div v-if="activeMenuKey === 'toolbar-launch'" class="row-menu row-menu--compact">
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
            </div>
          </div>
          <button
            @click="batchClose"
            :disabled="!canStopSelected"
            class="action-btn action-btn-stop"
            :title="canStopSelected ? `关闭 ${selectedRunningCount} 个运行中环境` : '请选择运行中的环境'"
          >
            关闭
          </button>
          <div class="toolbar-split" @click.stop>
            <button
              @click="batchCreateDesktopShortcuts('standard')"
              :disabled="!canCreateShortcutSelected"
              class="action-btn action-btn-shortcut"
              :title="canCreateShortcutSelected ? `为 ${selectionCount} 个已选环境创建普通启动快捷方式` : '请选择环境'"
            >
              创建桌面快捷方式
            </button>
            <button
              @click="toggleToolbarShortcutMenu"
              :disabled="!canCreateShortcutSelected"
              class="toolbar-split__toggle"
              :class="{ 'toolbar-split__toggle--open': activeMenuKey === 'toolbar-shortcut' }"
              title="更多快捷方式选项"
              aria-label="更多快捷方式选项"
            >
              <span class="toolbar-split__caret"></span>
            </button>
            <div v-if="activeMenuKey === 'toolbar-shortcut'" class="row-menu">
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
            </div>
          </div>
          <div class="flex-1"></div>
          <button
            @click="batchDelete"
            :disabled="!canDeleteSelected"
            class="action-btn action-btn-delete"
            :title="canDeleteSelected ? `删除 ${selectionCount} 个环境` : '请选择要删除的环境'"
          >
            删除
          </button>
        </div>
      </div>

      <!-- P2: 表格 -->
      <div>
        <table v-if="filteredEnvironments.length > 0" class="w-full text-sm bg-white rounded-lg border border-slate-200" role="grid">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200">
              <th class="h-10 w-10 text-center px-3">
                <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              </th>
              <th class="h-10 w-14 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">编号</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">颜色</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">名称</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">状态</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">代理</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">最后使用</th>
              <th class="h-10 text-center px-4 font-medium text-[12px] uppercase tracking-wide text-slate-500 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(env, index) in paginatedEnvironments"
              :key="env.id"
              class="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              :class="{ 'bg-blue-50/60': isSelected(env.id) }"
            >
              <td class="py-2.5 px-3 text-center"><input type="checkbox" :checked="isSelected(env.id)" @change="toggleSelection(env.id)" /></td>
              <td class="py-2.5 px-4 text-center text-xs font-medium text-slate-500">{{ rowNumber(index) }}</td>
              <td class="py-2.5 px-4 text-center">
                <span class="inline-block w-4 h-4 rounded-full" :style="{ backgroundColor: env.color }"></span>
              </td>
              <td class="py-2.5 px-4 font-medium text-slate-700 text-center">{{ env.name }}</td>
              <td class="py-2.5 px-4 text-center">
                <span class="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  :class="statusBadgeClass(env.status)"
                >{{ statusLabel(env.status) }}</span>
              </td>
              <td class="py-2.5 px-4 text-slate-500 text-xs text-center">{{ proxyLabel(env) }}</td>
              <td class="py-2.5 px-4 text-slate-400 text-xs text-center">{{ formatTime(env.lastUsed) }}</td>
              <td class="py-2.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1">
                  <template v-if="env.status === 'running'">
                    <button @click.stop="minimizeEnv(env.id)"
                      class="ghost-btn" title="最小化">最小化</button>
                    <button @click.stop="maximizeEnv(env.id)"
                      class="ghost-btn" title="最大化">最大化</button>
                    <button @click.stop="closeEnv(env.id)"
                      class="ghost-btn" title="关闭">关闭</button>
                  </template>
                  <template v-else>
                    <div class="row-split" @click.stop>
                      <button
                        @click.stop="launchEnv(env.id)"
                        class="row-split__main row-split__main--start"
                        title="普通启动"
                      >
                        启动
                      </button>
                      <button
                        @click.stop="toggleLaunchMenu(env.id)"
                        class="row-split__toggle row-split__toggle--start"
                        :class="{ 'row-split__toggle--open': activeMenuKey === `launch:${env.id}` }"
                        title="更多启动方式"
                        aria-label="更多启动方式"
                      >
                        <span class="row-split__caret"></span>
                      </button>
                      <div v-if="activeMenuKey === `launch:${env.id}`" class="row-menu row-menu--compact">
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
                      </div>
                    </div>
                    <div class="row-split" @click.stop>
                      <button
                        @click.stop="createDesktopShortcut(env.id, 'standard')"
                        class="row-split__main row-split__main--shortcut"
                        title="创建桌面快捷方式"
                      >
                        创建桌面快捷方式
                      </button>
                      <button
                        @click.stop="toggleShortcutMenu(env.id)"
                        class="row-split__toggle row-split__toggle--shortcut"
                        :class="{ 'row-split__toggle--open': activeMenuKey === `shortcut:${env.id}` }"
                        title="更多快捷方式选项"
                        aria-label="更多快捷方式选项"
                      >
                        <span class="row-split__caret"></span>
                      </button>
                      <div v-if="activeMenuKey === `shortcut:${env.id}`" class="row-menu">
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
                    </div>
                  </div>
                    <button @click.stop="editEnv(env)"
                      class="ghost-btn" title="编辑">编辑</button>
                    <button @click.stop="openCookieManager(env)"
                      class="ghost-btn" title="Cookie管理">Cookie</button>
                    <button @click.stop="deleteEnv(env)"
                      class="ghost-btn" title="删除">删除</button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty State -->
        <div v-else class="flex flex-col items-center justify-center py-16 text-slate-400">
          <p>暂无环境</p>
          <button @click="openCreateDialog" class="mt-3 btn-primary text-xs">创建第一个环境</button>
        </div>
      </div>
      <PaginationBar
        v-if="filteredEnvironments.length > 0"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="filteredEnvironments.length"
        class="mt-3 rounded-lg border border-slate-200"
      />
    </div>

    <!-- EnvironmentEditor 弹窗（单建 + 编辑 + 批量创建统一） -->
    <EnvironmentEditor
      v-if="showEditor"
      :environment="editingEnvironment"
      :count="batchCreateCount"
      @close="closeEditor"
      @save="saveEnvironment"
    />

    <!-- ImportExportDialog 弹窗 -->
    <ImportExportDialog v-if="showImportExport" @close="showImportExport = false" @imported="onImported" />

    <!-- BookmarkImportDialog 弹窗 -->
    <BookmarkImportDialog
      v-if="showBookmarkImport"
      :initial-selected-ids="selectedIds"
      @close="showBookmarkImport = false"
      @imported="onBookmarksImported"
    />

    <!-- CookieManager 弹窗 -->
    <CookieManager
      v-if="showCookieManager && cookieEnv"
      :envId="cookieEnv.id"
      :environmentName="cookieEnv.name"
      :isRunning="cookieEnv.status === 'running'"
      @close="showCookieManager = false; cookieEnv = null"
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
import type { Environment } from '@/types'
import GroupSidebar from '@/components/layout/GroupSidebar.vue'
import EnvironmentEditor from '@/components/EnvironmentEditor.vue'
import ImportExportDialog from '@/components/ImportExportDialog.vue'
import BookmarkImportDialog from '@/components/BookmarkImportDialog.vue'
import CookieManager from '@/components/CookieManager.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { toast } from '@/utils/toast'
import { Search } from 'lucide-vue-next'

const store = useStore()
const searchQuery = ref('')
const statusFilter = ref('')
const showEditor = ref(false)
const editingEnvironment = ref<Environment | null>(null)
const batchCreateCount = ref(1)
const showImportExport = ref(false)
const showBookmarkImport = ref(false)
const showCookieManager = ref(false)
const cookieEnv = ref<Environment | null>(null)
const showDeleteConfirm = ref(false)
const deletingEnv = ref<Environment | null>(null)
const currentPage = ref(1)
const activeMenuKey = ref<string | null>(null)

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
  window.addEventListener('click', handleWindowClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
})

// --- Data ---
const environments = computed(() => (store.state.environments as any)?.list || [])
const settings = computed(() => (store.state.settings as any)?.data || {})
const currentGroupId = computed(() => (store.state.ui as any)?.currentGroupId)
const pageSize = computed({
  get: () => normalizePageSize(settings.value.environmentPageSize),
  set: (nextSize: number) => {
    currentPage.value = 1
    void store.dispatch('settings/save', { environmentPageSize: normalizePageSize(nextSize) })
  },
})
const selectedIds = computed<string[]>(() => (store.state.ui as any)?.selectedEnvIds || [])
const selectionCount = computed(() => selectedIds.value.length)
const selectedEnvironments = computed(() =>
  environments.value.filter((e: any) => selectedIds.value.includes(e.id))
)
const selectedRunning = computed(() =>
  selectedEnvironments.value.filter((e: any) => e.status === 'running')
)
const selectedStopped = computed(() =>
  selectedEnvironments.value.filter((e: any) => e.status === 'stopped')
)
const selectedRunningCount = computed(() => selectedRunning.value.length)
const selectedStoppedCount = computed(() => selectedStopped.value.length)
const canCreateShortcutSelected = computed(() => selectionCount.value > 0)
const canLaunchSelected = computed(() => selectedStoppedCount.value > 0)
const canStopSelected = computed(() => selectedRunningCount.value > 0)
const canDeleteSelected = computed(() => selectionCount.value > 0)
const selectionSummary = computed(() => {
  if (selectionCount.value === 0) return '未选择环境'
  return `已选择 ${selectionCount.value} 个环境`
})
const allSelected = computed(
  () => paginatedEnvironments.value.length > 0 && paginatedEnvironments.value.every((e: any) => selectedIds.value.includes(e.id))
)
const deleteConfirmMessage = computed(() => {
  if (deletingEnv.value) {
    return `确认删除环境「${deletingEnv.value.name}」？此操作不可恢复。`
  }
  return `确认删除选中的 ${selectedIds.value.length} 个环境？此操作不可恢复。`
})

const filteredEnvironments = computed(() => {
  let result = environments.value
  const groupId = currentGroupId.value

  // 分组筛选
  if (groupId !== undefined && groupId !== null && groupId !== '') {
    result = result.filter((e: any) => e.groupId === groupId)
  } else if (groupId === '') {
    // "未分组"
    result = result.filter((e: any) => !e.groupId || e.groupId === '')
  }

  // 状态筛选
  if (statusFilter.value) result = result.filter((e: any) => e.status === statusFilter.value)

  // 搜索筛选
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((e: any) =>
      e.name.toLowerCase().includes(q) ||
      (e.tags || []).some((t: string) => t.toLowerCase().includes(q))
    )
  }

  return result
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredEnvironments.value.length / pageSize.value)))
const paginatedEnvironments = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEnvironments.value.slice(start, start + pageSize.value)
})

watch([searchQuery, statusFilter, currentGroupId], () => {
  currentPage.value = 1
})

watch([totalPages, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
}, { immediate: true })

// --- Actions ---
function isSelected(id: string): boolean { return selectedIds.value.includes(id) }
function toggleSelection(id: string): void { store.commit('ui/TOGGLE_ENV_SELECTION', id) }
function toggleAll(): void {
  if (allSelected.value) paginatedEnvironments.value.forEach((e: any) => store.commit('ui/DESELECT_ENV', e.id))
  else paginatedEnvironments.value.forEach((e: any) => store.commit('ui/SELECT_ENV', e.id))
}

async function launchEnv(id: string) {
  closeInlineMenu()
  await store.dispatch('environments/launch', { envId: id, launchMode: 'standard' })
}
async function debugLaunchEnv(id: string) {
  closeInlineMenu()
  await store.dispatch('environments/launch', { envId: id, launchMode: 'cdp' })
}
async function closeEnv(id: string) {
  await store.dispatch('environments/close', id)
}
async function minimizeEnv(id: string) {
  try {
    await window.electronAPI.invoke('windows-minimize', { envIds: [id] })
  } catch (e) {
    console.error('[minimizeEnv] error:', e)
  }
}
async function maximizeEnv(id: string) {
  try {
    await window.electronAPI.invoke('windows-maximize', { envIds: [id] })
  } catch (e) {
    console.error('[maximizeEnv] error:', e)
  }
}
function editEnv(env: any) {
  closeInlineMenu()
  editingEnvironment.value = env
  showEditor.value = true
}
async function deleteEnv(env: any) {
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

async function createDesktopShortcut(id: string, launchMode: 'standard' | 'cdp' = 'standard') {
  try {
    closeInlineMenu()
    const shortcutPath = await window.electronAPI.invoke<string>('create-desktop-shortcut', {
      envId: id,
      launchMode,
    })
    toast.success(`已创建桌面快捷方式：${shortcutPath}`)
  } catch (error) {
    console.error('[createDesktopShortcut] error:', error)
    toast.error(error instanceof Error ? error.message : '创建桌面快捷方式失败')
  }
}

async function batchCreateDesktopShortcuts(launchMode: 'standard' | 'cdp' = 'standard') {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return

  try {
    closeInlineMenu()
    for (const id of ids) {
      await window.electronAPI.invoke<string>('create-desktop-shortcut', {
        envId: id,
        launchMode,
      })
    }
    toast.success(`已为 ${ids.length} 个环境创建桌面快捷方式`)
  } catch (error) {
    console.error('[batchCreateDesktopShortcuts] error:', error)
    toast.error(error instanceof Error ? error.message : '批量创建桌面快捷方式失败')
  }
}
function openBatchCreate() {
  editingEnvironment.value = null
  batchCreateCount.value = 5  // 默认批量 5 个
  showEditor.value = true
}
function openCreateDialog() {
  editingEnvironment.value = null
  batchCreateCount.value = 1
  showEditor.value = true
}
function closeEditor() { showEditor.value = false; editingEnvironment.value = null; batchCreateCount.value = 1 }
async function saveEnvironment(data: Partial<Environment> | Array<Partial<Environment>>) {
  if (Array.isArray(data)) {
    // 批量创建
    for (const env of data) await store.dispatch('environments/create', env)
  } else if (editingEnvironment.value) {
    await store.dispatch('environments/update', { ...editingEnvironment.value, ...data })
  } else {
    await store.dispatch('environments/create', data)
  }
  closeEditor()
}

function openCookieManager(env: any) {
  closeInlineMenu()
  cookieEnv.value = env
  showCookieManager.value = true
}

/** 导入完成回调 */
async function onImported(count: number) {
  showImportExport.value = false
  // 刷新环境列表（import-environments IPC 已写入存储）
  await store.dispatch('environments/fetchAll')
}

async function onBookmarksImported(count: number) {
  if (count > 0) {
    showBookmarkImport.value = false
  }
  await store.dispatch('environments/fetchAll')
}
async function batchLaunch() {
  const toLaunch = selectedStopped.value
  const alreadyRunning = selectedRunning.value

  if (toLaunch.length === 0) {
    return
  }

  for (const env of toLaunch) await store.dispatch('environments/launch', { envId: env.id, launchMode: 'standard' })

  arrangeLaunchedWindows(toLaunch, alreadyRunning)
}

async function batchDebugLaunch() {
  const toLaunch = selectedStopped.value
  const alreadyRunning = selectedRunning.value

  if (toLaunch.length === 0) {
    return
  }

  for (const env of toLaunch) await store.dispatch('environments/launch', { envId: env.id, launchMode: 'cdp' })

  arrangeLaunchedWindows(toLaunch, alreadyRunning)
}

function arrangeLaunchedWindows(toLaunch: Environment[], alreadyRunning: Environment[]) {
  // 批量启动完成后自动排列窗口（包括本次启动的 + 原本已运行的）
  setTimeout(async () => {
    try {
      const runningIds = [
        ...toLaunch.map((e: any) => e.id),
        ...alreadyRunning.map((e: any) => e.id)
      ]
      await window.electronAPI.invoke('windows-arrange', { envIds: runningIds })
    } catch (e) {
      console.warn('[batchLaunch] arrange failed:', e)
    }
  }, 500)
}
async function batchClose() {
  const toClose = selectedRunning.value
  if (toClose.length === 0) return
  for (const env of toClose) await store.dispatch('environments/close', env.id)
}
async function batchDelete() {
  if (selectedIds.value.length === 0) return
  showDeleteConfirm.value = true
}

function cancelBatchDelete() {
  showDeleteConfirm.value = false
  deletingEnv.value = null
}

async function confirmBatchDelete() {
  // 单个删除
  if (deletingEnv.value) {
    const env = deletingEnv.value
    cancelBatchDelete()
    await store.dispatch('environments/delete', env.id)
    return
  }
  // 批量删除
  const ids = [...selectedIds.value]
  cancelBatchDelete()
  if (ids.length === 0) return
  for (const id of ids) await store.dispatch('environments/delete', id)
}

// --- Helpers ---
function normalizePageSize(value: unknown): number {
  const size = Number(value)
  return [10, 20, 50, 100].includes(size) ? size : 10
}
function rowNumber(index: number): number {
  return (currentPage.value - 1) * pageSize.value + index + 1
}
function statusBadgeClass(status: string) {
  return {
    running: 'bg-emerald-50 text-emerald-700',
    stopped: 'bg-slate-100 text-slate-600',
    starting: 'bg-blue-50 text-blue-700',
    stopping: 'bg-amber-50 text-amber-700',
    error: 'bg-red-50 text-red-700',
  }[status] ?? 'bg-slate-100 text-slate-600'
}
function statusLabel(status: string) { return { running: '运行中', stopped: '已停止', starting: '启动中', stopping: '停止中', error: '异常' }[status] ?? status }
function proxyLabel(env: any): string {
  if (!env.proxy?.host) return '-'
  return `${env.proxy.host}:${env.proxy.port}`
}
function formatTime(t?: string): string { if (!t) return '-'; return new Date(t).toLocaleString() }
</script>

<style scoped>
.env-filter-input,
.env-filter-select {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  font-size: 13px;
  background: white;
}
.env-filter-input {
  width: 320px;
  max-width: 32vw;
}
.env-filter-select {
  width: 120px;
}
.env-filter-input:focus,
.env-filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.btn-primary { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: #3b82f6; color: white; border-radius: 6px; border: 0; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
.btn-primary:hover { background-color: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: white; color: #374151; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
.btn-outline:hover { background-color: #f9fafb; border-color: #cbd5e1; color: #1f2937; }
.btn-outline-danger { padding: 7px 16px; font-size: 13px; font-weight: 500; background-color: white; color: #ef4444; border-radius: 6px; border: 1px solid #fecaca; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease; }
.btn-outline-danger:hover { background-color: #fef2f2; border-color: #fca5a5; }
.action-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
}
.action-group-danger {
  background: transparent;
  border: 0;
}
.action-btn {
  height: 30px;
  padding: 0 13px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, filter 120ms ease;
}
.action-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1f2937;
}
.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  filter: grayscale(0.35);
}
.action-btn-start,
.action-btn-stop,
.action-btn-delete {
  background: #ffffff;
  border-color: #d1d5db;
  color: #374151;
}
.action-btn-start:hover:not(:disabled),
.action-btn-stop:hover:not(:disabled),
.action-btn-delete:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1f2937;
}
.action-btn-start {
  border-radius: 6px 0 0 6px;
}
.action-btn-shortcut {
  border-radius: 6px 0 0 6px;
}
.toolbar-split {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}
.toolbar-split__toggle {
  width: 28px;
  border: 1px solid #d1d5db;
  border-left: 0;
  border-radius: 0 6px 6px 0;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, filter 120ms ease;
}
.toolbar-split__toggle:hover:not(:disabled),
.toolbar-split__toggle--open {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1f2937;
}
.toolbar-split__toggle--start {
  border-color: #d1d5db;
}
.toolbar-split__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  filter: grayscale(0.35);
}
.toolbar-split__caret {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
}
.row-action-btn {
  height: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.row-action-btn:hover {
  background: #eef2f7;
  color: #0f172a;
}
.row-action-btn:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}
.row-action-btn--neutral {
  color: #64748b;
}
.row-action-btn--neutral:hover {
  background: #f1f5f9;
  color: #475569;
}
.row-action-btn--accent {
  color: #7c3aed;
}
.row-action-btn--accent:hover {
  background: #f5f3ff;
  color: #6d28d9;
}
.row-action-btn--danger {
  color: #ef4444;
}
.row-action-btn--danger:hover {
  background: #fef2f2;
  color: #dc2626;
}
.row-action-btn--info {
  color: #3b82f6;
}
.row-action-btn--info:hover {
  background: #eff6ff;
  color: #2563eb;
}
.row-action-btn--warm {
  color: #f59e0b;
}
.row-action-btn--warm:hover {
  background: #fffbeb;
  color: #d97706;
}
.ghost-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}
.ghost-btn:hover { background: #eff6ff; color: #2563eb; }
.ghost-btn-danger { color: #ef4444; }
.ghost-btn-danger:hover { background: #fef2f2; }
.ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.row-split {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  overflow: visible;
}
.row-split__main,
.row-split__toggle {
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.row-split__main {
  padding: 0 4px;
}
.row-split__toggle {
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.row-split__main:hover,
.row-split__toggle:hover,
.row-split__toggle--open {
  background: #eef2f7;
  color: #0f172a;
}
.row-split__main:focus-visible,
.row-split__toggle:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}
.row-split__main--start,
.row-split__toggle--start {
  color: #3b82f6;
}
.row-split__main--start:hover,
.row-split__toggle--start:hover,
.row-split__toggle--open.row-split__toggle--start {
  color: #2563eb;
  background: #eff6ff;
}
.row-split__main--shortcut,
.row-split__toggle--shortcut {
  color: #3b82f6;
}
.row-split__main--shortcut:hover,
.row-split__toggle--shortcut:hover,
.row-split__toggle--open.row-split__toggle--shortcut {
  color: #2563eb;
  background: #eff6ff;
}
.row-split__caret {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
}
.row-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 188px;
  padding: 4px;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  z-index: 30;
}
.row-menu--compact {
  min-width: 92px;
}
.row-menu__item {
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.row-menu__item:hover {
  background: #f8fafc;
  color: #1f2937;
}
.row-menu__item--debug:hover {
  background: #f8fafc;
  color: #1f2937;
}
</style>
