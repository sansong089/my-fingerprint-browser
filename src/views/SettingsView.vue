<template>
  <div class="h-full p-6 overflow-y-auto max-w-[640px]">
    <h2 class="text-base font-semibold text-slate-800 mb-5">设置</h2>

    <div class="space-y-5">
      <!-- 浏览器路径 -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">浏览器路径</label>
        <input v-model="settings.browserPath" type="text" placeholder="留空则自动检测" class="input w-full" />
        <p class="text-xs text-slate-400 mt-1">留空时默认使用应用内嵌 fingerprint Chromium；也可指定其他浏览器路径</p>
      </div>

      <!-- 默认平台 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">默认操作系统</label>
          <select v-model="settings.defaultPlatform" class="input w-full">
            <option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">默认时区</label>
          <input v-model="settings.defaultTimezone" type="text" class="input w-full" />
        </div>
      </div>

      <!-- 语言 -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">默认语言</label>
        <select v-model="settings.defaultLang" class="input w-full">
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English (US)</option>
          <option value="ja-JP">日本語</option>
          <option value="ko-KR">한국어</option>
        </select>
      </div>

      <!-- 开关选项 -->
      <div class="space-y-3">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" v-model="settings.autoStart" class="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500">
          <span class="text-sm text-slate-700">启动时自动运行</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" v-model="settings.minimizeToTray" class="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500">
          <span class="text-sm text-slate-700">关闭时最小化到托盘</span>
        </label>
      </div>

      <!-- 同步延迟 -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">同步延迟 (ms)</label>
        <input v-model.number="settings.syncDelay" type="number" min="10" max="1000" step="10" class="input w-full max-w-[200px]" />
      </div>

      <!-- 保存按钮 -->
      <div class="pt-4 border-t border-slate-200 flex justify-end gap-2">
        <button @click="resetSettings" class="btn-outline">重置默认</button>
        <button @click="save" :disabled="saving" class="btn-primary">{{ saving ? '保存中...' : '保存设置' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useStore } from 'vuex'

const store = useStore()
const saving = ref(false)

const settings = reactive({
  browserPath: '',
  defaultPlatform: 'windows' as string,
  defaultTimezone: 'Asia/Shanghai',
  defaultLang: 'zh-CN',
  autoStart: false,
  minimizeToTray: false,
  syncDelay: 50,
})

onMounted(async () => {
  await store.dispatch('settings/fetch')
  const s = store.state.settings?.data
  if (s) Object.assign(settings, s)
})

async function save() {
  saving.value = true
  try { await store.dispatch('settings/save', { ...settings }) }
  finally { saving.value = false }
}

function resetSettings() {
  store.dispatch('settings/reset')
}
</script>

<style scoped>.input { height: 36px; padding: 0 12px; border: 1px solid #e2e8f0; border-radius: 6px; outline: none; font-size: 13px; }
.input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
.btn-primary { padding: 7px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; } .btn-primary:disabled { opacity: .5; }
.btn-outline { padding: 7px 20px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; }</style>
