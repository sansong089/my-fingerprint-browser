<template>
  <div class="h-full flex flex-col p-6">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-semibold text-gray-800">设置</h2>
      <button @click="$router.push('/')" class="p-2 hover:bg-gray-100 rounded-lg">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-2xl space-y-6">
        <!-- 浏览器设置 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-700 mb-4">浏览器设置</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">浏览器路径</label>
              <div class="flex gap-2">
                <input v-model="localSettings.browserPath" type="text" class="input flex-1" placeholder="例如: C:\fingerprint-chromium\chrome.exe">
              </div>
              <p class="text-xs text-gray-500 mt-1">请填写 fingerprint-chromium 或 Chrome 的可执行文件完整路径</p>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">默认平台</label>
              <select v-model="localSettings.defaultPlatform" class="input">
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="macos">macOS</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">默认时区</label>
              <input v-model="localSettings.defaultTimezone" type="text" class="input" placeholder="Asia/Shanghai">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">默认语言</label>
              <input v-model="localSettings.defaultLang" type="text" class="input" placeholder="en-US">
            </div>
          </div>
        </div>
        
        <!-- 同步设置 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-700 mb-4">同步设置</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">同步延迟 (ms)</label>
              <input v-model.number="localSettings.syncDelay" type="number" class="input" min="0" max="1000">
              <p class="text-xs text-gray-500 mt-1">数值越小同步越快，但可能增加CPU占用</p>
            </div>
          </div>
        </div>
        
        <!-- 常规设置 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-700 mb-4">常规设置</h3>
          
          <div class="space-y-4">
            <label class="flex items-center gap-2">
              <input v-model="localSettings.autoStart" type="checkbox" class="w-4 h-4 text-blue-500">
              <span class="text-sm text-gray-700">开机自动启动</span>
            </label>
            
            <label class="flex items-center gap-2">
              <input v-model="localSettings.minimizeToTray" type="checkbox" class="w-4 h-4 text-blue-500">
              <span class="text-sm text-gray-700">最小化到系统托盘</span>
            </label>
          </div>
        </div>
        
        <!-- 关于 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-700 mb-4">关于</h3>
          <div class="text-sm text-gray-500">
            <p>Fingerprint Browser v1.0.0</p>
            <p class="mt-1">基于 Electron + Vue + Vuex 开发</p>
          </div>
        </div>
      </div>
    </div>
    
    <div class="pt-4 border-t border-gray-200 flex justify-end gap-2">
      <button @click="$router.push('/')" class="btn btn-secondary">返回</button>
      <button @click="saveSettings" :disabled="saving" class="btn btn-primary">
        {{ saving ? '保存中...' : '保存并返回' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import type { Settings } from '@/store/index'
import { toast } from '@/utils/toast'

const store = useStore()
const $router = useRouter()

const localSettings = ref<Settings>({
  browserPath: '',
  defaultPlatform: 'windows',
  defaultTimezone: 'Asia/Shanghai',
  defaultLang: 'en-US',
  autoStart: false,
  minimizeToTray: false,
  syncDelay: 50
})

onMounted(async () => {
  await store.dispatch('loadSettings')
  localSettings.value = { ...store.state.settings }
})

const saving = ref(false)
const errorMsg = ref('')

const saveSettings = async () => {
  saving.value = true
  errorMsg.value = ''
  try {
    await store.dispatch('saveSettings', localSettings.value)
    // 保存成功后自动返回
    await store.dispatch('loadSettings')
    $router.push('/')
  } catch (e: any) {
    errorMsg.value = e.message || '保存失败'
    toast.error('保存失败: ' + errorMsg.value)
  } finally {
    saving.value = false
  }
}
</script>
