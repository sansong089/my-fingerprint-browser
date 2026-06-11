<template>
  <div class="h-full flex">
    <!-- 左侧环境列表 -->
    <aside class="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div class="p-4 border-b border-gray-100">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-700">环境列表</h2>
          <div class="flex gap-1">
            <button
              @click="createEnvironment"
              :disabled="isCreatingEnvironment"
              class="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="新建环境"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
            <button @click="batchLaunch" :disabled="selectedEnvironments.length === 0" class="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50" title="批量启动">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </button>
          </div>
        </div>
        <input v-model="searchQuery" type="text" placeholder="搜索环境..." class="input text-sm">
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        <div v-if="filteredEnvironments.length === 0" class="text-center py-8 text-gray-400 text-sm">
          暂无环境，点击+创建
        </div>
        <div 
          v-for="env in filteredEnvironments" 
          :key="env.id"
          @click="selectEnvironment(env.id)"
          class="p-3 mb-2 rounded-lg cursor-pointer border-2 transition-all"
          :class="selectedEnvironments.includes(env.id) ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'"
        >
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: env.color }"></div>
              <span class="font-medium text-gray-800 text-sm">{{ env.name }}</span>
            </div>
            <button 
              v-if="env.status === 'stopped'"
              @click.stop="openEnvironment(env.id)"
              :disabled="loadingEnvId === env.id"
              class="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 disabled:opacity-50"
            >{{ loadingEnvId === env.id ? '启动中' : '启动' }}</button>
            <button 
              v-else
              @click.stop="closeEnvironment(env.id)"
              :disabled="loadingEnvId === env.id"
              class="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 disabled:opacity-50"
            >{{ loadingEnvId === env.id ? '关闭中' : '关闭' }}</button>
          </div>
          <div class="text-xs text-gray-500">
            <div>Seed: {{ env.fingerprint.seed }}</div>
            <div>平台: {{ env.fingerprint.platform }}</div>
            <div class="text-gray-400 truncate" :title="env.userDataDir">目录: {{ env.userDataDir }}</div>
          </div>
        </div>
      </div>
      
      <!-- 已选环境操作 -->
      <div v-if="selectedEnvironments.length > 0" class="p-3 border-t border-gray-100 bg-gray-50">
        <div class="text-xs text-gray-500 mb-2">已选择 {{ selectedEnvironments.length }} 个环境</div>
        <div class="flex gap-1">
          <button @click="startSyncMode" :disabled="selectedEnvironments.length < 2" class="btn btn-primary text-xs py-1 px-2 disabled:opacity-50">
            同步操作
          </button>
          <button @click="batchDelete" :disabled="isEnvironmentOperationBusy" class="btn btn-danger text-xs py-1 px-2 disabled:opacity-50">
            批量删除
          </button>
        </div>
      </div>
    </aside>
    
    <!-- 右侧真实浏览器运行区域 -->
    <div class="flex-1 flex flex-col bg-gray-100">
      <div class="p-2 bg-white border-b border-gray-200 flex items-center gap-2">
        <select v-model="viewMode" class="input w-32 text-sm py-1">
          <option value="grid">网格视图</option>
          <option value="list">列表视图</option>
        </select>
        <div class="flex-1"></div>
        <button
          v-if="runningEnvironments.length > 0"
          @click="closeAllRunning"
          class="text-xs bg-red-500 text-white px-3 py-1.5 rounded hover:bg-red-600"
        >
          关闭全部浏览器
        </button>
        <span class="text-xs text-gray-500">{{ runningCount }} / {{ environments.length }} 运行中</span>
      </div>
      
      <!-- 真实浏览器运行状态 -->
      <div class="flex-1 p-2 overflow-auto" :class="viewMode === 'grid' ? 'grid grid-cols-2 gap-2 auto-rows-fr' : 'space-y-2'">
        <div 
          v-for="env in runningEnvironments" 
          :key="env.id"
          class="bg-white rounded-lg overflow-hidden border border-gray-200 flex flex-col"
        >
          <div class="h-8 bg-gray-100 border-b border-gray-200 flex items-center justify-between px-2 shrink-0">
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: env.color }"></div>
              <span class="text-xs text-gray-700 truncate max-w-[120px]">{{ env.name }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-[11px] text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                独立窗口运行中
              </span>
              <button @click="refreshEnvironment(env.id)" class="p-1 hover:bg-gray-200 rounded" title="刷新">
                <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
              <button @click="closeEnvironment(env.id)" class="p-1 hover:bg-gray-200 rounded" title="关闭">
                <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="flex-1 bg-gray-50 p-4 text-sm text-gray-600">
            <div class="grid gap-3" :class="viewMode === 'grid' ? 'md:grid-cols-2' : 'grid-cols-1'">
              <div class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="text-xs uppercase tracking-wide text-gray-400 mb-1">启动方式</div>
                <div class="font-medium text-gray-800">真实浏览器独立窗口</div>
                <div class="text-xs text-gray-500 mt-1">应用内不再创建嵌入视图，只负责启动、停止和管理会话。</div>
              </div>
              <div class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="text-xs uppercase tracking-wide text-gray-400 mb-1">调试端口</div>
                <div class="font-medium text-gray-800">CDP {{ env.cdpPort }}</div>
                <div class="text-xs text-gray-500 mt-1">可用于后续同步控制或 DevTools 协议接入。</div>
              </div>
              <div class="rounded-lg border border-gray-200 bg-white p-3 md:col-span-2">
                <div class="text-xs uppercase tracking-wide text-gray-400 mb-1">用户数据目录</div>
                <div class="font-medium text-gray-800 break-all">{{ env.userDataDir }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="runningEnvironments.length === 0" class="col-span-full flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
            </svg>
            <p>选择一个环境并启动真实浏览器窗口</p>
            <p class="text-xs mt-2">这里展示的是运行中的浏览器窗口，而不是应用内嵌的网页视图。</p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 环境编辑弹窗 -->
    <EnvironmentEditor
      v-if="showEditor"
      :environment="editingEnvironment"
      :saving="isEnvironmentOperationBusy"
      @close="closeEditor"
      @save="saveEnvironment"
    />

    <div
      v-if="isEnvironmentOperationBusy"
      class="fixed inset-0 z-[60] bg-slate-950/25 flex items-center justify-center"
    >
      <div class="rounded-lg bg-white px-5 py-4 shadow-xl border border-slate-200 text-center">
        <div class="mx-auto mb-3 h-8 w-8 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin"></div>
        <p class="text-sm font-medium text-slate-700">{{ environmentOperationTitle }}</p>
      </div>
    </div>

    <!-- ConfirmDialog (替代 confirm) -->
    <ConfirmDialog
      v-if="showConfirmDialog"
      :title="selectedEnvironments.length > 0 ? `删除 ${selectedEnvironments.length} 个环境？` : '提示'"
      :message="confirmDialogMessage"
      danger
      cancel-text="取消"
      confirm-text="确认删除"
      @confirm="confirmBatchDelete"
      @cancel="showConfirmDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import EnvironmentEditor from '@/components/EnvironmentEditor.vue'
import type { Environment, FingerprintConfig } from '@/types'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const store = useStore()
type EnvironmentCreateDraft = Partial<Environment> & { __randomFingerprint?: boolean }

// 页面加载时获取环境列表
onMounted(async () => {
  console.log('Dashboard mounted, loading environments...')
  await store.dispatch('environments/fetchAll')
})

const searchQuery = ref('')
const viewMode = ref('grid')
const showEditor = ref(false)
const editingEnvironment = ref<Environment | null>(null)
const isCreatingEnvironment = ref(false)
const isDeletingEnvironment = ref(false)

// 兼容旧 Dashboard（保留但指向新的 Vuex 模块结构）
const environments = computed(() => (store.state.environments as any)?.list || [])
const selectedEnvironments = computed<string[]>(() => (store.state.ui as any)?.selectedEnvIds || [])
const runningEnvironments = computed(() => store.getters['environments/runningEnvironments'] || [])
const runningCount = computed(() => runningEnvironments.value.length)
const isEnvironmentOperationBusy = computed(() => isCreatingEnvironment.value || isDeletingEnvironment.value)
const environmentOperationTitle = computed(() =>
  isDeletingEnvironment.value ? '正在删除环境...' : '正在保存环境...'
)

const filteredEnvironments = computed(() => {
  if (!searchQuery.value) return environments.value
  const query = searchQuery.value.toLowerCase()
  return environments.value.filter(e => 
    e.name.toLowerCase().includes(query) ||
    e.tags.some(t => t.toLowerCase().includes(query))
  )
})

const selectEnvironment = (id: string) => {
  store.commit('TOGGLE_ENVIRONMENT_SELECTION', id)
}

const loadingEnvId = ref('')

const openEnvironment = async (id: string) => {
  loadingEnvId.value = id
  try {
    await store.dispatch('environments/launch', id)
    confirmDialogMessage.value = '启动成功'
    showConfirmDialog.value = true
  } catch (e: any) {
    confirmDialogMessage.value = `启动失败: ${e.message || '未知错误'}`
    showConfirmDialog.value = true
  } finally {
    loadingEnvId.value = ''
  }
}

const createEnvironment = async () => {
  if (isEnvironmentOperationBusy.value) return
  editingEnvironment.value = null
  showEditor.value = true
}

const closeEditor = () => {
  showEditor.value = false
  editingEnvironment.value = null
}

const saveEnvironment = async (data: Partial<Environment> | Array<Partial<Environment>>) => {
  if (isEnvironmentOperationBusy.value) return

  const editing = editingEnvironment.value
  isCreatingEnvironment.value = true

  try {
    if (Array.isArray(data)) {
      closeEditor()
      for (const item of data) {
        await store.dispatch('environments/create', await prepareEnvironmentCreateDraft(item as EnvironmentCreateDraft))
      }
      return
    }

    if (editing) {
      await store.dispatch('updateEnvironment', { ...editing, ...data })
    } else {
      await store.dispatch('createEnvironment', data)
    }
    closeEditor()
  } finally {
    isCreatingEnvironment.value = false
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

const batchLaunch = async () => {
  for (const id of selectedEnvironments.value) {
    await store.dispatch('launchBrowser', id)
  }
}

const batchDelete = async () => {
  if (isEnvironmentOperationBusy.value) return
  showConfirmDialog.value = true
}

const confirmBatchDelete = async () => {
  showConfirmDialog.value = false
  if (isEnvironmentOperationBusy.value) return

  const ids = [...selectedEnvironments.value]
  if (ids.length === 0) return

  isDeletingEnvironment.value = true
  try {
    for (const id of ids) {
      await store.dispatch('environments/delete', id)
    }
  } finally {
    isDeletingEnvironment.value = false
  }
}

const closeEnvironment = async (id: string) => {
  loadingEnvId.value = id
  try {
    await store.dispatch('environments/close', id)
  } catch (e: any) {
    console.error('Close error:', e)
  } finally {
    loadingEnvId.value = ''
  }
}

const refreshEnvironment = async (id: string) => {
  await store.dispatch('closeBrowser', id)
  await store.dispatch('launchBrowser', id)
}

const closeAllRunning = async () => {
  await window.electronAPI.closeAll()
  await store.dispatch('environments/fetchAll')
}

const startSyncMode = async () => {
  const envIds = selectedEnvironments.value.filter(id =>
    runningEnvironments.value.some((env: any) => env.id === id)
  )
  if (envIds.length < 2) {
    confirmDialogMessage.value = '至少选择 2 个运行中的浏览器环境才能开始同步'
    showConfirmDialog.value = true
    return
  }

  const success = await window.electronAPI.startSync(envIds)
  confirmDialogMessage.value = success ? '已开始同步：窗口已自动排列' : '开始同步失败，请确认窗口已启动且原生模块可用'
  showConfirmDialog.value = true
}

// ConfirmDialog 状态
const confirmDialogMessage = ref('')
const showConfirmDialog = ref(false)
</script>
