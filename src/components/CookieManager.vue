<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white rounded-xl shadow-2xl w-[860px] max-h-[85vh] flex flex-col">
      <!-- 标题栏 -->
      <div class="px-5 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <h3 class="text-base font-semibold text-slate-800">Cookie 管理</h3>
        <span class="text-xs text-slate-400">{{ environmentName }}</span>
        <div class="flex-1"></div>
        <span v-if="!isRunning" class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">浏览器未运行</span>
        <span v-else class="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">运行中</span>
        <button @click="$emit('close')" class="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 工具栏 -->
      <div class="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索名称 / 域名..."
          class="h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:outline-none w-52"
        />
        <div class="flex-1"></div>
        <button @click="refreshCookies" :disabled="!isRunning || loading" class="tool-btn">
          <svg class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          刷新
        </button>
        <button @click="openAddDialog" :disabled="!isRunning" class="tool-btn">+ 新增</button>
        <button @click="triggerImport" :disabled="!isRunning" class="tool-btn">导入</button>
        <button @click="exportCookies" :disabled="!isRunning || cookies.length === 0" class="tool-btn">导出</button>
        <button @click="confirmClearAll" :disabled="!isRunning || cookies.length === 0" class="tool-btn-danger">清空全部</button>
        <input ref="importFileInput" type="file" accept=".json,.txt" class="hidden" @change="handleImportFile" />
      </div>

      <!-- 表格 -->
      <div class="flex-1 overflow-auto">
        <div v-if="!isRunning" class="flex flex-col items-center justify-center py-16 text-slate-400">
          <svg class="w-10 h-10 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-sm">请先启动浏览器</p>
        </div>
        <div v-else-if="loading" class="flex items-center justify-center py-16 text-slate-400">
          <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          加载中...
        </div>
        <div v-else-if="filteredCookies.length === 0" class="flex flex-col items-center justify-center py-16 text-slate-400">
          <p class="text-sm">{{ searchQuery ? '没有匹配的 Cookie' : '暂无 Cookie' }}</p>
        </div>
        <table v-else class="w-full text-xs">
          <thead class="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="h-9 px-4 text-left font-medium text-slate-500 w-[200px]">名称</th>
              <th class="h-9 px-4 text-left font-medium text-slate-500 w-[180px]">域名</th>
              <th class="h-9 px-4 text-left font-medium text-slate-500">值</th>
              <th class="h-9 px-4 text-left font-medium text-slate-500 w-[80px]">路径</th>
              <th class="h-9 px-4 text-center font-medium text-slate-500 w-[60px]">Secure</th>
              <th class="h-9 px-4 text-center font-medium text-slate-500 w-[70px]">HttpOnly</th>
              <th class="h-9 px-4 text-right font-medium text-slate-500 w-[80px]">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(cookie, idx) in filteredCookies"
              :key="idx"
              class="border-b border-slate-100 hover:bg-blue-50/40 transition-colors group"
            >
              <td class="py-2 px-4 font-mono text-slate-700 truncate max-w-[200px]" :title="cookie.name">{{ cookie.name }}</td>
              <td class="py-2 px-4 text-slate-500 truncate max-w-[180px]" :title="cookie.domain">{{ cookie.domain }}</td>
              <td class="py-2 px-4 text-slate-400 font-mono truncate max-w-[220px]" :title="cookie.value">{{ cookie.value }}</td>
              <td class="py-2 px-4 text-slate-400">{{ cookie.path || '/' }}</td>
              <td class="py-2 px-4 text-center">
                <span v-if="cookie.secure" class="text-emerald-500">✓</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="py-2 px-4 text-center">
                <span v-if="cookie.httpOnly" class="text-emerald-500">✓</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="py-2 px-4 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button @click="openEditDialog(cookie)" class="px-2 py-0.5 rounded hover:bg-blue-100 text-blue-600 text-xs">编辑</button>
                  <button @click="deleteCookie(cookie)" class="px-2 py-0.5 rounded hover:bg-red-100 text-red-500 text-xs">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底栏 -->
      <div class="px-5 py-3 border-t border-slate-100 flex items-center text-xs text-slate-400 shrink-0">
        <span v-if="cookies.length > 0">共 {{ cookies.length }} 个 Cookie{{ searchQuery ? `，匹配 ${filteredCookies.length} 个` : '' }}</span>
        <span v-else>-</span>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" @click.self="showEditModal = false">
      <div class="bg-white rounded-xl shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h4 class="font-semibold text-slate-800">{{ editForm.isNew ? '新增 Cookie' : '编辑 Cookie' }}</h4>
          <button @click="showEditModal = false" class="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
        </div>
        <div class="p-5 space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">名称 <span class="text-red-400">*</span></label>
            <input ref="editNameInput" v-model="editForm.name" type="text" class="form-input" placeholder="cookie_name" :disabled="!editForm.isNew" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">值 <span class="text-red-400">*</span></label>
            <input v-model="editForm.value" type="text" class="form-input" placeholder="cookie_value" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">域名 <span class="text-red-400">*</span></label>
            <input v-model="editForm.domain" type="text" class="form-input" placeholder=".example.com" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">路径</label>
            <input v-model="editForm.path" type="text" class="form-input" placeholder="/" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">过期时间（Unix秒，留空=会话）</label>
            <input v-model.number="editForm.expires" type="number" class="form-input" placeholder="可选" />
          </div>
          <div class="flex gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
              <input v-model="editForm.secure" type="checkbox" class="w-3.5 h-3.5" /> Secure
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
              <input v-model="editForm.httpOnly" type="checkbox" class="w-3.5 h-3.5" /> HttpOnly
            </label>
          </div>
        </div>
        <div class="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button @click="showEditModal = false" class="btn-outline text-xs">取消</button>
          <button @click="saveCookie" :disabled="!editForm.name || !editForm.domain" class="btn-primary text-xs">保存</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="确认删除 Cookie？"
      :message="deleteConfirmMessage"
      danger
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="confirmDeleteAction"
      @cancel="cancelDeleteAction"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { toast } from '@/utils/toast'

interface CookieData {
  name: string
  value: string
  domain: string
  path?: string
  expires?: number
  secure?: boolean
  httpOnly?: boolean
  sameSite?: string
}

const props = defineProps<{
  envId: string
  environmentName: string
  isRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const cookies = ref<CookieData[]>([])
const loading = ref(false)
const searchQuery = ref('')
const showEditModal = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)
const editNameInput = ref<HTMLInputElement | null>(null)
const showDeleteConfirm = ref(false)
const pendingDeleteCookie = ref<CookieData | null>(null)
const deleteAction = ref<'single' | 'clear-all' | null>(null)

const editForm = ref({
  isNew: true,
  name: '',
  value: '',
  domain: '',
  path: '/',
  expires: undefined as number | undefined,
  secure: false,
  httpOnly: false,
})

const filteredCookies = computed(() => {
  if (!searchQuery.value.trim()) return cookies.value
  const q = searchQuery.value.toLowerCase()
  return cookies.value.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.domain.toLowerCase().includes(q)
  )
})
const deleteConfirmMessage = computed(() => {
  if (deleteAction.value === 'clear-all') {
    return `确认清空全部 ${cookies.value.length} 个 Cookie？此操作不可撤销。`
  }
  if (pendingDeleteCookie.value) {
    return `确认删除 Cookie "${pendingDeleteCookie.value.name}"？`
  }
  return '确认执行删除操作？'
})

async function focusEditInput() {
  await nextTick()
  requestAnimationFrame(() => {
    editNameInput.value?.focus()
    editNameInput.value?.select()
  })
}

async function refreshCookies() {
  if (!props.isRunning) return
  loading.value = true
  try {
    const result = await (window as any).electronAPI.invoke('cookie-get', { envId: props.envId })
    cookies.value = result || []
  } catch (e: any) {
    console.error('[CookieManager] get error:', e)
    toast.error('获取 Cookie 失败: ' + (e.message || e))
  } finally {
    loading.value = false
  }
}

function openAddDialog() {
  editForm.value = {
    isNew: true,
    name: '',
    value: '',
    domain: '',
    path: '/',
    expires: undefined,
    secure: false,
    httpOnly: false,
  }
  showEditModal.value = true
  void focusEditInput()
}

function openEditDialog(cookie: CookieData) {
  editForm.value = {
    isNew: false,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    expires: cookie.expires,
    secure: cookie.secure || false,
    httpOnly: cookie.httpOnly || false,
  }
  showEditModal.value = true
  void focusEditInput()
}

async function saveCookie() {
  const cookie: CookieData = {
    name: editForm.value.name,
    value: editForm.value.value,
    domain: editForm.value.domain,
    path: editForm.value.path || '/',
    secure: editForm.value.secure,
    httpOnly: editForm.value.httpOnly,
  }
  if (editForm.value.expires) cookie.expires = editForm.value.expires

  try {
    // 如果是编辑（非新增），先删除旧 cookie
    if (!editForm.value.isNew) {
      await (window as any).electronAPI.invoke('cookie-delete', {
        envId: props.envId,
        name: editForm.value.name,
        domain: editForm.value.domain,
      })
    }
    await (window as any).electronAPI.invoke('cookie-set', {
      envId: props.envId,
      cookies: cookie,
    })
    showEditModal.value = false
    await refreshCookies()
  } catch (e: any) {
    toast.error('保存 Cookie 失败: ' + (e.message || e))
  }
}

function deleteCookie(cookie: CookieData) {
  pendingDeleteCookie.value = cookie
  deleteAction.value = 'single'
  showDeleteConfirm.value = true
}

function confirmClearAll() {
  deleteAction.value = 'clear-all'
  pendingDeleteCookie.value = null
  showDeleteConfirm.value = true
}

function cancelDeleteAction() {
  showDeleteConfirm.value = false
  pendingDeleteCookie.value = null
  deleteAction.value = null
}

async function confirmDeleteAction() {
  const action = deleteAction.value
  const cookie = pendingDeleteCookie.value
  cancelDeleteAction()

  if (action === 'single' && cookie) {
    try {
      await (window as any).electronAPI.invoke('cookie-delete', {
        envId: props.envId,
        name: cookie.name,
        domain: cookie.domain,
      })
      await refreshCookies()
    } catch (e: any) {
      toast.error('删除 Cookie 失败: ' + (e.message || e))
    }
    return
  }

  if (action === 'clear-all') {
    try {
      await (window as any).electronAPI.invoke('cookie-clear', { envId: props.envId })
      await refreshCookies()
    } catch (e: any) {
      toast.error('清空失败: ' + (e.message || e))
    }
  }
}

async function exportCookies() {
  try {
    const data = await (window as any).electronAPI.invoke('cookie-export', { envId: props.envId })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cookies_${props.envId}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    toast.error('导出失败: ' + (e.message || e))
  }
}

function triggerImport() {
  importFileInput.value?.click()
}

async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const importList = Array.isArray(parsed) ? parsed : [parsed]
    const result = await (window as any).electronAPI.invoke('cookie-import', {
      envId: props.envId,
      cookies: importList,
    })
    toast.success(`导入完成：成功 ${result.success} 个，失败 ${result.failed} 个`)
    await refreshCookies()
  } catch (e: any) {
    toast.error('导入失败: ' + (e.message || e))
  } finally {
    if (importFileInput.value) importFileInput.value.value = ''
  }
}

onMounted(() => {
  if (props.isRunning) refreshCookies()
})
</script>

<style scoped>
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 12px;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
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
  transition: all 0.15s;
}
.tool-btn-danger:hover:not(:disabled) { background: #fef2f2; }
.tool-btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  background: white;
}
.form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.form-input:disabled { background: #f8fafc; color: #94a3b8; }
.btn-primary {
  padding: 6px 16px;
  font-size: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline {
  padding: 6px 16px;
  font-size: 12px;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.btn-outline:hover { background: #f9fafb; }
</style>
