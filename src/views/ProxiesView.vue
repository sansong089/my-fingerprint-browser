<template>
  <div class="h-full flex">
    <!-- 代理分组侧边栏 -->
    <aside class="w-[200px] border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0">
      <div class="px-3 py-2.5 border-b border-slate-200">
        <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wider">代理分组</h3>
      </div>
      <div class="flex-1 overflow-y-auto py-1">
        <button
          @click="currentGroupId = null"
          class="w-full text-left px-4 py-2 text-sm transition-colors rounded-r-md mr-2"
          :class="currentGroupId === null ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
        >全部代理</button>
        <button
          @click="currentGroupId = ''"
          class="w-full text-left px-4 py-2 text-sm transition-colors rounded-r-md mr-2"
          :class="currentGroupId === '' ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
        >未分组</button>

        <!-- 自定义分组列表 -->
        <div
          v-for="group in sortedGroups"
          :key="group.id"
          class="group relative flex items-center gap-2 px-4 py-2 text-sm cursor-pointer rounded-r-md mr-2 transition-colors"
          :class="currentGroupId === group.id ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
          @click="currentGroupId = group.id"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: group.color }"></span>
          <span class="truncate flex-1">{{ group.name }}</span>

          <!-- 悬浮操作按钮 -->
          <div class="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              @click.stop="startEditGroup(group)"
              class="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
              title="编辑名称"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button
              @click.stop="deleteGroup(group.id)"
              class="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
              title="删除分组"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="p-2 border-t border-slate-200">
        <button
          @click="startCreateGroup"
          class="w-full px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors text-left"
        >+ 新建分组</button>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="flex-1 p-6 overflow-y-auto">
    <!-- 标题栏 -->
    <div class="flex items-center gap-3 mb-4">
      <h2 class="text-base font-semibold text-slate-800">代理池管理</h2>
      <span class="text-xs text-slate-400">{{ filteredProxies.length }} 个代理</span>
      <div class="flex-1"></div>
      <button @click="openCreate" class="btn-primary text-xs">+ 新增代理</button>
    </div>

    <!-- 批量操作栏 -->
    <div class="flex items-center gap-2 mb-3">
      <span v-if="selectedIds.length > 0" class="text-xs text-slate-500">已选 {{ selectedIds.length }} 个</span>
      <template v-if="selectedIds.length > 0">
        <button @click="batchTest" :disabled="batchTesting" class="tool-btn text-xs">
          {{ batchTesting ? '检测中...' : '批量检测' }}
        </button>
        <button @click="batchMoveGroup" class="tool-btn text-xs">移动分组</button>
        <button @click="batchDelete" class="tool-btn-danger text-xs">删除选中</button>
        <button @click="selectedIds = []" class="text-xs text-slate-400 hover:text-slate-600 px-1">取消选择</button>
      </template>
    </div>

    <!-- 代理表格 -->
    <table v-if="filteredProxies.length > 0" class="w-full text-sm bg-white rounded-lg border border-slate-200">
      <thead>
        <tr class="bg-slate-50 border-b border-slate-200">
          <th class="h-10 w-10 px-3 text-center">
            <input type="checkbox" :checked="allSelected" :indeterminate="isIndeterminate" @change="toggleAll" class="cursor-pointer" />
          </th>
          <th class="h-10 w-14 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">编号</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">名称</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">类型</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">地址</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">状态</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">使用数</th>
          <th class="h-10 px-4 text-center font-medium text-[12px] uppercase tracking-wide text-slate-500">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, index) in paginatedProxies" :key="p.id" class="border-b border-slate-100 hover:bg-slate-50 transition-colors"
          :class="{ 'bg-blue-50/60': selectedIds.includes(p.id) }">
          <td class="py-2.5 px-3 text-center">
            <input type="checkbox" :checked="selectedIds.includes(p.id)" @change="toggleSelect(p.id)" class="cursor-pointer" />
          </td>
          <td class="py-2.5 px-4 text-center text-xs font-medium text-slate-500">{{ rowNumber(index) }}</td>
          <td class="py-2.5 px-4 font-medium text-slate-700 text-center">{{ p.name }}</td>
          <td class="py-2.5 px-4 text-center">
            <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{{ p.type.toUpperCase() }}</span>
          </td>
          <td class="py-2.5 px-4 font-mono text-xs text-slate-600 text-center">{{ p.host }}:{{ p.port }}</td>
          <td class="py-2.5 px-4 text-center">
            <span class="text-[11px] px-2 py-0.5 rounded-full" :class="proxyStatusClass(p.status)">
              {{ proxyStatusLabel(p.status) }}
            </span>
          </td>
          <td class="py-2.5 px-4 text-center text-xs text-slate-500">{{ usageCount(p) }}</td>
          <td class="py-2.5 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
              <button @click="testProxy(p.id)" :disabled="testingId === p.id" class="ghost-btn text-xs">
                {{ testingId === p.id ? '检测中...' : '检测' }}
              </button>
              <button @click="edit(p)" class="ghost-btn text-xs">编辑</button>
              <button @click="copyProxy(p)" class="ghost-btn text-xs">复制</button>
              <button @click="deleteOne(p.id)" class="ghost-btn ghost-btn-danger text-xs">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="flex flex-col items-center justify-center py-16 text-slate-400">
      <p class="text-sm">{{ currentGroupId !== null && currentGroupId !== '' ? '该分组暂无代理' : '暂无代理配置' }}</p>
      <button @click="openCreate" class="mt-3 btn-primary text-xs">添加第一个代理</button>
    </div>

    <PaginationBar
      v-if="filteredProxies.length > 0"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="filteredProxies.length"
      class="mt-3 rounded-lg border border-slate-200"
    />

    <!-- 新建 / 编辑分组弹窗 -->
    <div v-if="showGroupDialog" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @mousedown.self="closeGroupDialog">
      <div class="bg-white rounded-lg shadow-xl w-[320px] p-4" @mousedown.stop>
        <h4 class="text-sm font-semibold mb-3">{{ editingGroupId ? '编辑分组' : '新建代理分组' }}</h4>
        <input
          v-model="groupDialogName"
          type="text"
          placeholder="分组名称"
          class="input w-full mb-3"
          @keyup.enter="saveGroupDialog"
          ref="groupDialogInput"
        />
        <div class="flex justify-end gap-2">
          <button @click="closeGroupDialog" class="btn-outline text-xs">取消</button>
          <button @click="saveGroupDialog" class="btn-primary text-xs">{{ editingGroupId ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>

    <!-- 移动到分组弹窗 -->
    <div v-if="showMoveGroup" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @mousedown.self="showMoveGroup = false">
      <div class="bg-white rounded-lg shadow-xl w-[320px] p-4">
        <h4 class="text-sm font-semibold mb-3">移动到分组</h4>
        <div class="space-y-1 mb-3 max-h-48 overflow-y-auto">
          <button @click="doMoveGroup('')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 rounded">不分组</button>
          <button
            v-for="group in sortedGroups"
            :key="group.id"
            @click="doMoveGroup(group.id)"
            class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 rounded flex items-center gap-2"
          >
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: group.color }"></span>
            {{ group.name }}
          </button>
        </div>
        <div class="flex justify-end">
          <button @click="showMoveGroup = false" class="btn-outline text-xs">取消</button>
        </div>
      </div>
    </div>
  </div>

    <!-- Proxy Editor -->
    <div v-if="showEditor" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @mousedown.self="showEditor = false">
      <div class="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 class="font-semibold text-base text-slate-800">{{ editingProxy ? '编辑代理' : '新建代理' }}</h3>
          <button @click="showEditor = false" class="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">名称</label>
            <input
              v-model="form.name"
              type="text"
              class="input w-full"
              :class="{ 'border-red-400 bg-red-50': fieldErrors.name }"
              placeholder="例如: 美国住宅IP"
              @blur="validateField('name')"
              @input="delete fieldErrors.name"
              autofocus
            />
            <p v-if="fieldErrors.name" class="mt-1 text-xs text-red-500">{{ fieldErrors.name }}</p>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">分组</label>
            <select v-model="form.groupId" class="input w-full">
              <option value="">不分组</option>
              <option v-for="g in sortedGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">类型</label>
              <select v-model="form.type" class="input w-full">
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">端口</label>
              <input v-model.number="form.port" type="number" class="input w-full" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">主机地址</label>
            <input
              v-model="form.host"
              type="text"
              class="input w-full"
              :class="{ 'border-red-400 bg-red-50': fieldErrors.host }"
              placeholder="127.0.0.1"
              @blur="validateField('host')"
              @input="delete fieldErrors.host"
            />
            <p v-if="fieldErrors.host" class="mt-1 text-xs text-red-500">{{ fieldErrors.host }}</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">用户名（可选）</label>
              <input v-model="form.username" type="text" class="input w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">密码（可选）</label>
              <input v-model="form.password" type="password" class="input w-full" />
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button @click="showEditor = false" class="btn-outline text-xs">取消</button>
          <button @click="saveProxy" class="btn-primary text-xs">保存</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showDeleteGroupConfirm"
      title="确认删除分组？"
      :message="deleteGroupConfirmMessage"
      danger
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="confirmDeleteGroup"
      @cancel="cancelDeleteGroup"
    />

    <ConfirmDialog
      v-if="showDeleteProxyConfirm"
      title="确认删除代理？"
      :message="deleteProxyConfirmMessage"
      danger
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="confirmDeleteProxy"
      @cancel="cancelDeleteProxy"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, nextTick, watch } from 'vue'
import { useStore } from 'vuex'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { toast } from '@/utils/toast'

const store = useStore()
const showEditor = ref(false)
const editingProxy = ref<any>(null)
const testingId = ref<string | null>(null)
const batchTesting = ref(false)
const selectedIds = ref<string[]>([])
const showMoveGroup = ref(false)
const showGroupDialog = ref(false)
const editingGroupId = ref<string | null>(null)   // null = 新建模式，非 null = 编辑模式
const groupDialogName = ref('')
const currentGroupId = ref<string | null>(null)
const groupDialogInput = ref<HTMLInputElement | null>(null)
const proxyNameInput = ref<HTMLInputElement | null>(null)
const showDeleteGroupConfirm = ref(false)
const pendingDeleteGroupId = ref<string | null>(null)
const pendingDeleteGroupName = ref('')
const showDeleteProxyConfirm = ref(false)
const pendingDeleteProxyIds = ref<string[]>([])
const pendingDeleteProxyName = ref('')
const currentPage = ref(1)

const form = reactive({
  name: '',
  type: 'http' as 'http' | 'https' | 'socks5',
  host: '',
  port: 8080,
  username: '',
  password: '',
  groupId: ''
})

const fieldErrors = reactive<Record<string, string>>({})

function validateField(field: 'name' | 'host') {
  if (field === 'name' && !form.name.trim()) {
    fieldErrors.name = '请输入代理名称'
  } else {
    delete fieldErrors.name
  }
  if (field === 'host' && !form.host.trim()) {
    fieldErrors.host = '请输入主机地址'
  } else {
    delete fieldErrors.host
  }
}

function validateAll(): boolean {
  validateField('name')
  validateField('host')
  return Object.keys(fieldErrors).length === 0
}

onMounted(() => {
  store.dispatch('settings/fetch')
  store.dispatch('proxies/fetchAll')
  store.dispatch('environments/fetchAll')
  store.dispatch('proxyGroups/fetchAll')
})

const proxies = computed(() => (store.state.proxies as any)?.list || [])
const environments = computed(() => (store.state.environments as any)?.list || [])
const settings = computed(() => (store.state.settings as any)?.data || {})
const pageSize = computed({
  get: () => normalizePageSize(settings.value.proxyPageSize),
  set: (nextSize: number) => {
    currentPage.value = 1
    void store.dispatch('settings/save', { proxyPageSize: normalizePageSize(nextSize) })
  },
})
const sortedGroups = computed(() => (store.state.proxyGroups as any)?.list?.slice().sort((a: any, b: any) => a.order - b.order) || [])

const filteredProxies = computed(() => {
  if (currentGroupId.value === null) return proxies.value
  if (currentGroupId.value === '') return proxies.value.filter((p: any) => !p.groupId || p.groupId === '')
  return proxies.value.filter((p: any) => p.groupId === currentGroupId.value)
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredProxies.value.length / pageSize.value)))
const paginatedProxies = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProxies.value.slice(start, start + pageSize.value)
})

const allSelected = computed(() =>
  paginatedProxies.value.length > 0 && paginatedProxies.value.every((p: any) => selectedIds.value.includes(p.id))
)
const isIndeterminate = computed(() =>
  paginatedProxies.value.some((p: any) => selectedIds.value.includes(p.id)) && !allSelected.value
)
const deleteGroupConfirmMessage = computed(() =>
  pendingDeleteGroupName.value
    ? `删除后将无法恢复。“${pendingDeleteGroupName.value}” 当前为空分组，确认继续删除吗？`
    : '删除后将无法恢复，确认继续删除这个空分组吗？'
)
const deleteProxyConfirmMessage = computed(() => {
  if (pendingDeleteProxyIds.value.length > 1) {
    return `确认删除选中的 ${pendingDeleteProxyIds.value.length} 个代理？删除后将无法恢复。`
  }
  return pendingDeleteProxyName.value
    ? `确认删除代理“${pendingDeleteProxyName.value}”？删除后将无法恢复。`
    : '确认删除这个代理？删除后将无法恢复。'
})

function usageCount(proxy: any): string {
  const count = environments.value.filter(
    (e: any) => e.proxy?.host === proxy.host && e.proxy?.port === proxy.port
  ).length
  return count > 0 ? `${count} 个环境` : '-'
}

watch(currentGroupId, () => {
  currentPage.value = 1
})

watch([totalPages, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
}, { immediate: true })

function toggleAll() {
  const pageIds = paginatedProxies.value.map((p: any) => p.id)
  if (allSelected.value) selectedIds.value = selectedIds.value.filter(id => !pageIds.includes(id))
  else selectedIds.value = Array.from(new Set([...selectedIds.value, ...pageIds]))
}
function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function openCreate() {
  Object.assign(form, { name: '', type: 'http', host: '', port: 8080, username: '', password: '', groupId: currentGroupId.value !== null ? currentGroupId.value : '' })
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  editingProxy.value = null
  showEditor.value = true
}
function edit(p: any) {
  Object.assign(form, { name: p.name, type: p.type, host: p.host, port: p.port, username: p.username || '', password: '', groupId: p.groupId || '' })
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  editingProxy.value = p
  showEditor.value = true
}

async function saveProxy() {
  // 强制写入所有错误（不清），确保点保存时错误一定显示
  if (!form.name.trim()) fieldErrors.name = '请输入代理名称'
  if (!form.host.trim()) fieldErrors.host = '请输入主机地址'
  if (!form.name.trim() || !form.host.trim()) return

  try {
    const data: any = { ...form, groupId: form.groupId || '' }
    if (editingProxy.value) {
      // 编辑时：若密码字段留空，保留原密码，不覆盖
      if (!data.password) delete data.password
      await store.dispatch('proxies/update', { id: editingProxy.value.id, ...data })
    } else {
      await store.dispatch('proxies/create', data)
    }
    showEditor.value = false
    editingProxy.value = null
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || e))
  }
}

async function copyProxy(p: any) {
  const copy = {
    name: `${p.name}_副本`,
    type: p.type,
    host: p.host,
    port: p.port,
    username: p.username || '',
    groupId: p.groupId || undefined,
    // 安全起见，副本不复制密码，让用户重新填写
  }
  await store.dispatch('proxies/create', copy)
}

async function testProxy(id: string) {
  testingId.value = id
  try {
    await store.dispatch('proxies/testConnection', id)
  } catch { /* error handled in store */ }
  finally { testingId.value = null }
}

async function batchTest() {
  batchTesting.value = true
  for (const id of selectedIds.value) {
    try { await store.dispatch('proxies/testConnection', id) } catch { /* ignore */ }
  }
  batchTesting.value = false
}

async function deleteOne(id: string) {
  const proxy = proxies.value.find((item: any) => item.id === id)
  pendingDeleteProxyIds.value = [id]
  pendingDeleteProxyName.value = proxy?.name || ''
  showDeleteProxyConfirm.value = true
}

async function batchDelete() {
  if (selectedIds.value.length === 0) return
  pendingDeleteProxyIds.value = [...selectedIds.value]
  pendingDeleteProxyName.value = ''
  showDeleteProxyConfirm.value = true
}

function cancelDeleteProxy() {
  showDeleteProxyConfirm.value = false
  pendingDeleteProxyIds.value = []
  pendingDeleteProxyName.value = ''
}

async function confirmDeleteProxy() {
  const ids = [...pendingDeleteProxyIds.value]
  cancelDeleteProxy()
  if (ids.length === 0) return
  for (const id of ids) {
    await store.dispatch('proxies/delete', id)
  }
  selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
}

function proxyStatusClass(s: string) {
  return {
    available: 'bg-emerald-50 text-emerald-600',
    unavailable: 'bg-red-50 text-red-600',
    unchecked: 'bg-slate-100 text-slate-500'
  }[s] ?? 'bg-slate-100 text-slate-500'
}
function proxyStatusLabel(s: string) {
  return { available: '可用', unavailable: '不可用', unchecked: '未检测' }[s] ?? s
}

function normalizePageSize(value: unknown): number {
  const size = Number(value)
  return [10, 20, 50, 100].includes(size) ? size : 10
}

function rowNumber(index: number): number {
  return (currentPage.value - 1) * pageSize.value + index + 1
}

async function focusGroupDialogInput() {
  await nextTick()
  requestAnimationFrame(() => {
    groupDialogInput.value?.focus()
    groupDialogInput.value?.select()
  })
}

function openGroupDialog(name = '', groupId: string | null = null) {
  editingGroupId.value = groupId
  groupDialogName.value = name
  showGroupDialog.value = true
  void focusGroupDialogInput()
}

function startCreateGroup() {
  openGroupDialog()
}

function startEditGroup(group: any) {
  openGroupDialog(group.name, group.id)
}

function closeGroupDialog() {
  showGroupDialog.value = false
  editingGroupId.value = null
  groupDialogName.value = ''
}

async function saveGroupDialog() {
  const name = groupDialogName.value.trim()
  if (!name) return
  if (editingGroupId.value) {
    await store.dispatch('proxyGroups/update', { id: editingGroupId.value, name })
  } else {
    await store.dispatch('proxyGroups/create', { name })
  }
  closeGroupDialog()
}

async function deleteGroup(groupId: string) {
  const inUse = proxies.value.filter((p: any) => p.groupId === groupId).length
  if (inUse > 0) {
    toast.warning(`该分组正在被 ${inUse} 个代理使用，请先将代理移出该分组后再试。`)
    return
  }

  const group = sortedGroups.value.find((item: any) => item.id === groupId)
  pendingDeleteGroupId.value = groupId
  pendingDeleteGroupName.value = group?.name || ''
  showDeleteGroupConfirm.value = true
}

function cancelDeleteGroup() {
  showDeleteGroupConfirm.value = false
  pendingDeleteGroupId.value = null
  pendingDeleteGroupName.value = ''
}

async function confirmDeleteGroup() {
  const groupId = pendingDeleteGroupId.value
  cancelDeleteGroup()
  if (!groupId) return
  await store.dispatch('proxyGroups/delete', groupId)
  if (currentGroupId.value === groupId) currentGroupId.value = null
}

function batchMoveGroup() {
  showMoveGroup.value = true
}

async function doMoveGroup(groupId: string) {
  for (const id of selectedIds.value) {
    // 注意：groupId 为空字符串表示"不分组"，不能传 undefined（IPC 序列化会丢弃 undefined 字段）
    await store.dispatch('proxies/update', { id, groupId: groupId || '' })
  }
  showMoveGroup.value = false
  selectedIds.value = []
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
  background: white;
}
.input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.btn-primary {
  padding: 7px 16px;
  font-size: 13px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary:hover { background: #2563eb; }
.btn-outline {
  padding: 7px 16px;
  font-size: 13px;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.btn-outline:hover { background: #f9fafb; }
.tool-btn {
  padding: 5px 10px;
  font-size: 12px;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.tool-btn:hover:not(:disabled) { background: #f9fafb; }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tool-btn-danger {
  padding: 5px 10px;
  font-size: 12px;
  background: white;
  color: #ef4444;
  border: 1px solid #fecaca;
  border-radius: 6px;
  cursor: pointer;
}
.tool-btn-danger:hover { background: #fef2f2; }
.ghost-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  border-radius: 4px;
}
.ghost-btn:hover { background: #f1f5f9; }
.ghost-btn-danger { color: #ef4444; }
.ghost-btn-danger:hover { background: #fef2f2; }
.ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
