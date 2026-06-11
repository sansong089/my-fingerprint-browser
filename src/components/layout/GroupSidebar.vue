<template>
  <aside class="w-[200px] border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0">
    <!-- 分组标题 -->
    <div class="px-3 py-2.5 border-b border-slate-200">
      <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wider">分组</h3>
    </div>

    <!-- 分组列表 -->
    <div class="flex-1 overflow-y-auto py-1">
      <!-- 全部 -->
      <button
        @click="selectGroup(null)"
        class="w-full text-left px-4 py-2 text-sm transition-colors rounded-r-md mr-2"
        :class="currentGroupId === null ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
      >全部环境</button>

      <!-- 未分组 -->
      <button
        @click="selectGroup('')"
        class="w-full text-left px-4 py-2 text-sm transition-colors rounded-r-md mr-2"
        :class="currentGroupId === '' ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
      >未分组</button>

      <!-- 自定义分组 -->
      <div
        v-for="group in sortedGroups"
        :key="group.id"
        @click="selectGroup(group.id)"
        class="group w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors rounded-r-md mr-2 cursor-pointer"
        :class="currentGroupId === group.id ? 'bg-blue-500/10 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'"
      >
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: group.color }"></span>
        <span class="truncate flex-1">{{ group.name }}</span>
        <span class="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            @click.stop="startEditGroup(group)"
            class="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
            title="编辑分组"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          <button
            @click.stop="requestDeleteGroup(group)"
            class="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
            title="删除分组"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </span>
      </div>
    </div>

    <!-- 新建分组按钮 -->
    <div class="p-2 border-t border-slate-200">
      <button
        @click="startCreateGroup"
        class="w-full px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors text-left"
      >+ 新建分组</button>
    </div>

    <!-- 新建 / 编辑分组弹窗 -->
    <div v-if="showGroupDialog" class="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-32" @mousedown.self="closeGroupDialog">
      <div class="bg-white rounded-lg shadow-lg w-[320px] p-4" @mousedown.stop>
        <h4 class="text-sm font-semibold mb-3">{{ editingGroupId ? '编辑分组' : '新建分组' }}</h4>
        <input
          ref="groupDialogInput"
          v-model="groupDialogName"
          type="text"
          placeholder="分组名称"
          class="input w-full mb-3"
          @keyup.enter="saveGroup"
        />
        <div class="flex justify-center gap-2">
          <button @click="closeGroupDialog" class="btn-outline text-xs">取消</button>
          <button @click="saveGroup" class="btn-primary text-xs">{{ editingGroupId ? '保存' : '创建' }}</button>
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
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useStore } from 'vuex'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { toast } from '@/utils/toast'

const store = useStore()
const showGroupDialog = ref(false)
const groupDialogName = ref('')
const editingGroupId = ref<string | null>(null)
const groupDialogInput = ref<HTMLInputElement | null>(null)
const showDeleteGroupConfirm = ref(false)
const pendingDeleteGroupId = ref<string | null>(null)
const pendingDeleteGroupName = ref('')

const currentGroupId = computed(() => (store.state.ui as any)?.currentGroupId)
const sortedGroups = computed(() => (store.state.groups as any)?.list?.slice().sort((a: any, b: any) => a.order - b.order) || [])
const environments = computed(() => (store.state.environments as any)?.list || [])
const deleteGroupConfirmMessage = computed(() =>
  pendingDeleteGroupName.value
    ? `删除后将无法恢复。“${pendingDeleteGroupName.value}” 当前为空分组，确认继续删除吗？`
    : '删除后将无法恢复，确认继续删除这个空分组吗？'
)

onMounted(() => {
  store.dispatch('groups/fetchAll')
})

function selectGroup(id: string | null) {
  store.commit('ui/SET_CURRENT_GROUP', id)
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

async function saveGroup() {
  const name = groupDialogName.value.trim()
  if (!name) return
  if (editingGroupId.value) {
    await store.dispatch('groups/update', { id: editingGroupId.value, name })
  } else {
    await store.dispatch('groups/create', { name })
  }
  closeGroupDialog()
}

function requestDeleteGroup(group: any) {
  const inUse = environments.value.filter((env: any) => env.groupId === group.id).length
  if (inUse > 0) {
    toast.warning(`该分组正在被 ${inUse} 个环境使用，请先将环境移出该分组后再试。`)
    return
  }

  pendingDeleteGroupId.value = group.id
  pendingDeleteGroupName.value = group.name
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
  await store.dispatch('groups/delete', groupId)
  if (currentGroupId.value === groupId) selectGroup(null)
}
</script>

<style scoped>.input { height: 34px; padding: 0 10px; border: 1px solid #e2e8f0; border-radius: 6px; outline: none; font-size: 13px; }
.input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.btn-primary { padding: 5px 14px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; }
.btn-outline { padding: 5px 14px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 5px; cursor: pointer; }</style>
