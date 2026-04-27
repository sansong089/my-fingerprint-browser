<template>
  <div class="h-full flex">
    <!-- GroupSidebar (左侧) -->
    <GroupSidebar />

    <!-- 主区域 -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- P0: 工具栏 -->
      <div class="p-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索环境名称或标签..."
          class="flex-1 max-w-xs h-9 px-3 text-sm rounded-lg border-slate-300 bg-white focus:border-blue-500 focus:ring-blue-500/20"
        />
        <select v-model="statusFilter" class="h-9 px-2 text-sm rounded-lg border-slate-300 bg-white">
          <option value="">全部状态</option>
          <option value="running">运行中</option>
          <option value="stopped">已停止</option>
        </select>
        <div class="flex-1"></div>
        <button @click="openBatchCreate" class="btn-outline text-xs">批量创建</button>
        <button @click="showImportExport = true" class="btn-outline text-xs">导入/导出</button>
        <button @click="openCreateDialog" class="btn-primary text-xs">新建环境</button>
      </div>

      <!-- P1: 表格操作栏 -->
      <div class="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <div class="min-w-[190px]">
          <div class="text-sm font-medium" :class="selectionCount > 0 ? 'text-slate-700' : 'text-slate-400'">
            {{ selectionSummary }}
          </div>
          <div v-if="selectionCount > 0" class="mt-0.5 text-[11px] text-slate-400">
            运行中 {{ selectedRunningCount }} · 已停止 {{ selectedStoppedCount }}
          </div>
        </div>

        <div class="action-group">
          <button
            @click="batchLaunch"
            :disabled="!canLaunchSelected"
            class="action-btn action-btn-start"
            :title="canLaunchSelected ? `启动 ${selectedStoppedCount} 个已停止环境` : '请选择已停止环境'"
          >
            启动
          </button>
          <button
            @click="batchClose"
            :disabled="!canStopSelected"
            class="action-btn action-btn-stop"
            :title="canStopSelected ? `关闭 ${selectedRunningCount} 个运行中环境` : '请选择运行中的环境'"
          >
            关闭
          </button>
        </div>

        <div class="action-group">
          <button
            @click="arrangeSelectedWindows"
            :disabled="!canOperateWindows"
            class="action-btn action-btn-arrange"
            :title="canOperateWindows ? '排列选中的运行中窗口' : '请选择运行中的环境'"
          >
            窗口排列
          </button>
          <button
            @click="maximizeSelectedWindows"
            :disabled="!canOperateWindows"
            class="action-btn action-btn-maximize"
            :title="canOperateWindows ? '最大化选中的运行中窗口' : '请选择运行中的环境'"
          >
            最大化
          </button>
          <button
            @click="minimizeSelectedWindows"
            :disabled="!canOperateWindows"
            class="action-btn action-btn-minimize"
            :title="canOperateWindows ? '最小化选中的运行中窗口' : '请选择运行中的环境'"
          >
            最小化
          </button>
          <button
            @click="startSyncMode"
            :disabled="!canStartSync"
            class="action-btn action-btn-sync"
            :title="canStartSync ? '排列窗口并开始同步' : '至少选择 2 个运行中的环境才能同步'"
          >
            窗口同步
          </button>
        </div>

        <div class="flex-1"></div>

        <div class="action-group action-group-danger">
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
      <div class="flex-1 overflow-auto p-4">
        <table v-if="filteredEnvironments.length > 0" class="w-full text-sm" role="grid">
          <thead>
            <tr class="sticky top-0 z-10 bg-slate-50">
              <th class="h-10 w-10 text-center pl-3">
                <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              </th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">颜色</th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">名称</th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">状态</th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">代理</th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">最后使用</th>
              <th class="h-10 text-center px-3 font-medium text-[12px] uppercase tracking-wide text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="env in filteredEnvironments"
              :key="env.id"
              class="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-150 cursor-pointer"
              :class="{ 'bg-blue-50 border-l-2 border-l-blue-500': isSelected(env.id) }"
            >
              <td class="py-2.5 pl-3 text-center"><input type="checkbox" :checked="isSelected(env.id)" @change="toggleSelection(env.id)" /></td>
              <td class="py-2.5 px-3 text-center">
                <span class="inline-block w-4 h-4 rounded-full" :style="{ backgroundColor: env.color }"></span>
              </td>
              <td class="py-2.5 px-3 font-medium text-slate-800 text-center">{{ env.name }}</td>
              <td class="py-2.5 px-3 text-center">
                <span class="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  :class="statusBadgeClass(env.status)"
                >{{ statusLabel(env.status) }}</span>
              </td>
              <td class="py-2.5 px-3 text-slate-500 text-xs text-center">{{ proxyLabel(env) }}</td>
              <td class="py-2.5 px-3 text-slate-400 text-xs text-center">{{ formatTime(env.lastUsed) }}</td>
              <td class="py-2.5 px-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button v-if="env.status === 'stopped'" @click.stop="launchEnv(env.id)"
                    class="px-2 py-1 text-xs hover:bg-emerald-100 rounded text-emerald-600 font-medium" title="启动">启动</button>
                  <template v-else>
                    <button @click.stop="minimizeEnv(env.id)"
                      class="px-2 py-1 text-xs hover:bg-blue-100 rounded text-blue-600 font-medium" title="最小化">最小化</button>
                    <button @click.stop="maximizeEnv(env.id)"
                      class="px-2 py-1 text-xs hover:bg-purple-100 rounded text-purple-600 font-medium" title="最大化">最大化</button>
                    <button @click.stop="closeEnv(env.id)"
                      class="px-2 py-1 text-xs hover:bg-red-100 rounded text-red-600 font-medium" title="关闭">关闭</button>
                  </template>
                  <button @click.stop="editEnv(env)"
                    class="px-2 py-1 text-xs hover:bg-blue-100 rounded text-blue-600 font-medium" title="编辑">编辑</button>
                  <button @click.stop="openCookieManager(env)"
                    class="px-2 py-1 text-xs hover:bg-amber-100 rounded text-amber-600 font-medium" title="Cookie管理">Cookie</button>
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
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import type { Environment } from '@/types'
import GroupSidebar from '@/components/layout/GroupSidebar.vue'
import EnvironmentEditor from '@/components/EnvironmentEditor.vue'
import ImportExportDialog from '@/components/ImportExportDialog.vue'
import CookieManager from '@/components/CookieManager.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { toast } from '@/utils/toast'

const store = useStore()
const searchQuery = ref('')
const statusFilter = ref('')
const showEditor = ref(false)
const editingEnvironment = ref<Environment | null>(null)
const batchCreateCount = ref(1)
const showImportExport = ref(false)
const showCookieManager = ref(false)
const cookieEnv = ref<Environment | null>(null)
const showDeleteConfirm = ref(false)

onMounted(() => {
  store.dispatch('environments/fetchAll')
  store.dispatch('groups/fetchAll')
})

// --- Data ---
const environments = computed(() => (store.state.environments as any)?.list || [])
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
const canLaunchSelected = computed(() => selectedStoppedCount.value > 0)
const canStopSelected = computed(() => selectedRunningCount.value > 0)
const canOperateWindows = computed(() => selectedRunningCount.value > 0)
const canStartSync = computed(() => selectedRunningCount.value >= 2)
const canDeleteSelected = computed(() => selectionCount.value > 0)
const selectionSummary = computed(() => {
  if (selectionCount.value === 0) return '未选择环境'
  return `已选择 ${selectionCount.value} 个环境`
})
const allSelected = computed(
  () => filteredEnvironments.value.length > 0 && filteredEnvironments.value.every((e: any) => selectedIds.value.includes(e.id))
)
const deleteConfirmMessage = computed(() =>
  `确认删除选中的 ${selectedIds.value.length} 个环境？此操作不可恢复。`
)

const filteredEnvironments = computed(() => {
  let result = environments.value
  const groupId = (store.state.ui as any)?.currentGroupId

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

// --- Actions ---
function isSelected(id: string): boolean { return selectedIds.value.includes(id) }
function toggleSelection(id: string): void { store.commit('ui/TOGGLE_ENV_SELECTION', id) }
function toggleAll(): void {
  if (allSelected.value) store.commit('ui/CLEAR_SELECTION')
  else filteredEnvironments.value.forEach((e: any) => store.commit('ui/SELECT_ENV', e.id))
}

async function launchEnv(id: string) {
  await store.dispatch('environments/launch', id)
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
  editingEnvironment.value = env
  showEditor.value = true
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
  cookieEnv.value = env
  showCookieManager.value = true
}

/** 导入完成回调 */
async function onImported(count: number) {
  showImportExport.value = false
  // 刷新环境列表（import-environments IPC 已写入存储）
  await store.dispatch('environments/fetchAll')
}
async function batchLaunch() {
  const toLaunch = selectedStopped.value
  const alreadyRunning = selectedRunning.value

  if (toLaunch.length === 0) {
    return
  }

  for (const env of toLaunch) await store.dispatch('environments/launch', env.id)

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
async function startSyncMode() {
  const runningIds = selectedRunning.value.map((e: any) => e.id)

  if (runningIds.length < 2) {
    toast.warning('至少选择 2 个运行中的浏览器环境才能开始同步')
    return
  }

  try {
    const success = await window.electronAPI.startSync(runningIds)
    if (success) toast.success('已开始同步，窗口已自动排列')
    else toast.error('开始同步失败，请确认浏览器窗口已正常启动')
  } catch (error: any) {
    toast.error(`开始同步失败: ${error?.message || '未知错误'}`)
  }
}
async function arrangeSelectedWindows() {
  const runningIds = selectedRunning.value.map((e: any) => e.id)
  if (runningIds.length === 0) return
  try {
    await window.electronAPI.invoke('windows-arrange', { envIds: runningIds })
  } catch (e) {
    console.error('[arrangeSelectedWindows] error:', e)
  }
}
async function maximizeSelectedWindows() {
  const runningIds = selectedRunning.value.map((e: any) => e.id)
  if (runningIds.length === 0) return
  try {
    await window.electronAPI.invoke('windows-maximize', { envIds: runningIds })
  } catch (e) {
    console.error('[maximizeSelectedWindows] error:', e)
  }
}
async function minimizeSelectedWindows() {
  const runningIds = selectedRunning.value.map((e: any) => e.id)
  if (runningIds.length === 0) return
  try {
    await window.electronAPI.invoke('windows-minimize', { envIds: runningIds })
  } catch (e) {
    console.error('[minimizeSelectedWindows] error:', e)
  }
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
}

async function confirmBatchDelete() {
  const ids = [...selectedIds.value]
  cancelBatchDelete()
  if (ids.length === 0) return
  for (const id of ids) await store.dispatch('environments/delete', id)
}

// --- Helpers ---
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
.btn-primary { padding: 6px 14px; font-size: 13px; font-weight: 500; background-color: #3b82f6; color: white; border-radius: 6px; border: none; cursor: pointer; }
.btn-primary:hover { background-color: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { padding: 6px 14px; font-size: 13px; font-weight: 500; background-color: white; color: #374151; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer; }
.btn-outline:hover { background-color: #f9fafb; }
.btn-outline-danger { padding: 6px 14px; font-size: 13px; font-weight: 500; background-color: white; color: #ef4444; border-radius: 6px; border: 1px solid #fecaca; cursor: pointer; }
.btn-outline-danger:hover { background-color: #fef2f2; }
.action-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.action-group-danger {
  background: #fff7f7;
  border-color: #fecaca;
}
.action-btn {
  height: 30px;
  padding: 0 13px;
  border: 0;
  border-radius: 9px;
  color: white;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease, filter 120ms ease;
}
.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
}
.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  filter: grayscale(0.35);
  box-shadow: none;
}
.action-btn-start { background: linear-gradient(135deg, #10b981, #059669); }
.action-btn-stop { background: linear-gradient(135deg, #f97316, #ea580c); }
.action-btn-arrange { background: linear-gradient(135deg, #64748b, #334155); }
.action-btn-maximize { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
.action-btn-minimize { background: linear-gradient(135deg, #06b6d4, #0284c7); }
.action-btn-sync { background: linear-gradient(135deg, #2563eb, #0f766e); }
.action-btn-delete { background: linear-gradient(135deg, #ef4444, #b91c1c); }
</style>
