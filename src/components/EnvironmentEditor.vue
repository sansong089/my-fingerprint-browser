<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @mousedown.self="$emit('close')">
    <div class="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
      <div class="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-800">{{ isEdit ? '编辑环境' : (isBatchMode ? '批量创建环境' : '新建环境') }}</h3>
        <button @click="$emit('close')" class="p-1 hover:bg-gray-100 rounded">
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="p-4 overflow-y-auto max-h-[60vh]">
        <div class="space-y-4">
          <!-- 基本信息 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">环境名称{{ isBatchMode ? '前缀' : '' }} <span class="text-red-400">*</span></label>
            <input
              ref="nameInput"
              v-model="formData.name"
              type="text"
              class="input"
              :class="{ 'border-red-400 bg-red-50': fieldErrors.name }"
              :placeholder="isBatchMode ? '如: 账号' : '输入环境名称'"
              @blur="validateField('name')"
              @input="delete fieldErrors.name"
            />
            <p v-if="fieldErrors.name" class="mt-1 text-xs text-red-500">{{ fieldErrors.name }}</p>
          </div>

          <!-- 批量创建专区 -->
          <div v-if="isBatchMode" class="flex gap-3">
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">数量</label>
              <input v-model.number="batchCount" type="number" min="1" max="100" class="input" />
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">起始编号</label>
              <input v-model.number="batchStartIndex" type="number" min="1" class="input" />
            </div>
          </div>
          <div v-if="isBatchMode && formData.name" class="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            预览：{{ namePreview }}
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">标签</label>
            <input v-model="tagsInput" type="text" class="input" placeholder="用逗号分隔">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CDP端口（调试启动）</label>
            <input
              v-model.number="formData.cdpPort"
              type="number"
              min="1024"
              max="65535"
              class="input"
              :class="{ 'border-red-400 bg-red-50': fieldErrors.cdpPort }"
              placeholder="留空随机"
              @blur="validateField('cdpPort')"
              @input="delete fieldErrors.cdpPort"
            />
            <p v-if="fieldErrors.cdpPort" class="mt-1 text-xs text-red-500">{{ fieldErrors.cdpPort }}</p>
          </div>

          <!-- 分组分配 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">所属分组</label>
            <select v-model="formData.groupId" class="input text-sm">
              <option value="">未分组</option>
              <option v-for="g in groupsList" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">颜色标识</label>
            <div class="flex gap-2">
              <button
                v-for="color in colors"
                :key="color"
                @click="formData.color = color"
                class="w-6 h-6 rounded-full border-2"
                :style="{ backgroundColor: color }"
                :class="formData.color === color ? 'border-gray-800' : 'border-transparent'"
              ></button>
            </div>
          </div>

          <!-- 指纹设置 -->
          <div class="pt-4 border-t border-gray-200">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">指纹设置</h4>

            <div class="space-y-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Seed (指纹种子)</label>
                <input v-model.number="formData.fingerprint.seed" type="number" class="input text-sm">
              </div>

              <div>
                <label class="block text-xs text-gray-600 mb-1">平台</label>
                <select v-model="formData.fingerprint.platform" class="input text-sm">
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="macos">macOS</option>
                </select>
              </div>

              <div>
                <label class="block text-xs text-gray-600 mb-1">浏览器品牌</label>
                <select v-model="formData.fingerprint.brand" class="input text-sm">
                  <option value="Chrome">Chrome</option>
                  <option value="Edge">Edge</option>
                  <option value="Opera">Opera</option>
                  <option value="Vivaldi">Vivaldi</option>
                </select>
              </div>

              <div>
                <label class="block text-xs text-gray-600 mb-1">CPU核心数</label>
                <input v-model.number="formData.fingerprint.hardwareConcurrency" type="number" class="input text-sm">
              </div>

              <label class="flex items-start gap-2 rounded-md border-t border-gray-200 bg-slate-50 px-3 py-2 pt-3">
                <input v-model="formData.fingerprint.followIpGeo" type="checkbox" class="mt-0.5 w-4 h-4">
                <span>
                  <span class="block text-xs text-gray-700">跟随 IP 归属地</span>
                  <span class="block text-[11px] text-gray-500">开启后，启动浏览器前根据当前出口 IP 自动决定语言和时区。</span>
                </span>
              </label>

              <div>
                <label class="block text-xs text-gray-600 mb-1">时区</label>
                <select
                  v-model="formData.fingerprint.timezone"
                  class="input text-sm"
                  :disabled="formData.fingerprint.followIpGeo"
                  :class="{ 'bg-slate-100 text-slate-400 cursor-not-allowed': formData.fingerprint.followIpGeo }"
                  @change="onTimezoneChange"
                >
                  <option
                    v-if="formData.fingerprint.timezone && !isKnownTimezone(formData.fingerprint.timezone)"
                    :value="formData.fingerprint.timezone"
                  >
                    {{ formData.fingerprint.timezone }}
                  </option>
                  <option v-for="timezone in TIMEZONE_OPTIONS" :key="timezone.value" :value="timezone.value">
                    {{ timezone.label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-xs text-gray-600 mb-1">语言</label>
                <select
                  v-model="formData.fingerprint.lang"
                  class="input text-sm"
                  :disabled="formData.fingerprint.followIpGeo"
                  :class="{ 'bg-slate-100 text-slate-400 cursor-not-allowed': formData.fingerprint.followIpGeo }"
                >
                  <option
                    v-if="formData.fingerprint.lang && !isKnownLanguage(formData.fingerprint.lang)"
                    :value="formData.fingerprint.lang"
                  >
                    {{ formData.fingerprint.lang }}
                  </option>
                  <option v-for="language in LANGUAGE_OPTIONS" :key="language.value" :value="language.value">
                    {{ language.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- 代理设置（代理池选择 + 手动输入双模式） -->
          <div class="pt-4 border-t border-gray-200">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">代理设置</h4>

            <div class="space-y-3">
              <label class="flex items-center gap-2">
                <input v-model="useProxy" type="checkbox" class="w-4 h-4" @change="delete fieldErrors.proxyHost">
                <span class="text-sm text-gray-700">启用代理</span>
              </label>

              <div v-if="useProxy" class="space-y-3 pl-6">
                <!-- 代理模式切换：从池选择 / 手动输入 -->
                <div class="flex items-center gap-3 mb-2">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" v-model="proxyMode" value="pool" class="w-3.5 h-3.5" @change="delete fieldErrors.proxyHost">
                    <span class="text-xs text-gray-600">从代理池选择</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" v-model="proxyMode" value="manual" class="w-3.5 h-3.5" @change="delete fieldErrors.proxyHost">
                    <span class="text-xs text-gray-600">手动输入</span>
                  </label>
                </div>

                <!-- 从代理池选择 -->
                <div v-if="proxyMode === 'pool'">
                  <select
                    v-model="selectedProxyId"
                    class="input text-sm w-full"
                    :class="{ 'border-red-400 bg-red-50': fieldErrors.proxyHost }"
                    @change="onSelectProxyFromPool(); delete fieldErrors.proxyHost"
                  >
                    <option value="">-- 选择代理 --</option>
                    <optgroup label="可用" v-if="availableProxies.length > 0">
                      <option v-for="p in availableProxies" :key="p.id" :value="p.id">
                        {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
                      </option>
                    </optgroup>
                    <optgroup label="其他" v-if="unavailableProxies.length > 0">
                      <option v-for="p in unavailableProxies" :key="p.id" :value="p.id">
                        {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }}) [不可用]
                      </option>
                    </optgroup>
                  </select>
                  <p v-if="fieldErrors.proxyHost" class="mt-1 text-xs text-red-500">{{ fieldErrors.proxyHost }}</p>
                </div>

                <!-- 手动输入 -->
                <div v-else class="space-y-2">
                  <select v-model="formData.proxy.type" class="input text-sm">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                  <div class="flex gap-2">
                    <input
                      v-model="formData.proxy.host"
                      type="text"
                      class="input text-sm flex-1"
                      :class="{ 'border-red-400 bg-red-50': fieldErrors.proxyHost }"
                      placeholder="主机"
                      @input="delete fieldErrors.proxyHost"
                    />
                    <input v-model.number="formData.proxy.port" type="number" class="input text-sm w-24" placeholder="端口">
                  </div>
                  <p v-if="fieldErrors.proxyHost" class="mt-1 text-xs text-red-500">{{ fieldErrors.proxyHost }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="p-4 border-t border-gray-200 flex justify-end gap-2">
        <button @click="$emit('close')" class="btn btn-secondary">取消</button>
        <button @click="save" :disabled="!formData.name.trim()" class="btn btn-primary">
          {{ isEdit ? '保存' : (isBatchMode ? `创建 ${batchCount} 个` : '创建') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useStore } from 'vuex'
import type { Environment, FingerprintConfig, ProxyConfig } from '@/store/index'
import {
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
  getRecommendedLanguageForTimezone,
  isKnownLanguage,
  isKnownTimezone,
} from '@/constants/localeOptions'

const store = useStore()

const props = defineProps<{
  environment: Environment | null
  count?: number  // >1 时进入批量模式
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', data: Partial<Environment> | Array<Partial<Environment>>): void
}>()

const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const isEdit = computed(() => !!props.environment)
const isBatchMode = computed(() => !isEdit.value && (props.count ?? 1) > 1)
const batchCount = ref(props.count && props.count > 1 ? props.count : 5)
const batchStartIndex = ref(1)
const nameInput = ref<HTMLInputElement | null>(null)

const namePreview = computed(() => {
  if (!formData.value.name) return ''
  const end = batchStartIndex.value + batchCount.value - 1
  return `${formData.value.name}${batchStartIndex.value} ~ ${formData.value.name}${end}`
})

const tagsInput = ref('')
const useProxy = ref(false)
const proxyMode = ref<'pool' | 'manual'>('pool')
const selectedProxyId = ref<string>('')
const fieldErrors = ref<Record<string, string>>({})

async function focusNameInput() {
  await nextTick()
  requestAnimationFrame(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

function validateField(field: string) {
  if (field === 'name' && !formData.value.name.trim()) {
    fieldErrors.value.name = '请输入环境名称'
  } else {
    delete fieldErrors.value.name
  }
  if (field === 'proxyHost') {
    const needProxy = useProxy.value
    const hasHost = proxyMode.value === 'pool'
      ? !!selectedProxyId.value
      : !!formData.value.proxy?.host
    if (needProxy && !hasHost) {
      fieldErrors.value.proxyHost = '请选择或输入代理地址'
    } else {
      delete fieldErrors.value.proxyHost
    }
  }
  if (field === 'cdpPort') {
    const port = normalizeCDPPort(formData.value.cdpPort)
    if (formData.value.cdpPort !== undefined && formData.value.cdpPort !== null && !port) {
      fieldErrors.value.cdpPort = '端口范围为 1024-65535，留空则随机分配'
    } else if (isBatchMode.value && port && port + batchCount.value - 1 > 65535) {
      fieldErrors.value.cdpPort = '批量递增后的端口不能超过 65535'
    } else {
      delete fieldErrors.value.cdpPort
    }
  }
}

function validateAll(): boolean {
  validateField('name')
  validateField('proxyHost')
  validateField('cdpPort')
  return !fieldErrors.value.name && !fieldErrors.value.proxyHost && !fieldErrors.value.cdpPort
}

onMounted(() => {
  if (!proxies.value.length) store.dispatch('proxies/fetchAll')
  if (!groupsList.value.length) store.dispatch('groups/fetchAll')
  void focusNameInput()
})

// ---- 数据源 ----
const proxies = computed(() => (store.state.proxies as any)?.list || [])
const groupsList = computed(() => (store.state.groups as any)?.list || [])

// 按可用性分组显示
const availableProxies = computed(() => proxies.value.filter((p: any) => p.status === 'available'))
const unavailableProxies = computed(() => proxies.value.filter((p: any) => p.status !== 'available'))

// ---- 表单数据 ----

const defaultFingerprint = (): FingerprintConfig => ({
  seed: Math.floor(Math.random() * 1000000),
  platform: 'windows',
  platformVersion: '10.0.19045',
  brand: 'Chrome',
  brandVersion: '144.0.7559.132',
  hardwareConcurrency: 4,
  timezone: 'Asia/Shanghai',
  lang: 'zh-CN',
  followIpGeo: false,
})

const defaultProxy = (): ProxyConfig => ({
  type: 'http',
  host: '',
  port: 0
})

const formData = ref<{
  name: string
  tags: string[]
  color: string
  groupId?: string
  cdpPort?: number | null
  fingerprint: FingerprintConfig
  proxy: ProxyConfig
}>({
  name: '',
  tags: [],
  color: colors[0],
  groupId: undefined,
  cdpPort: undefined,
  fingerprint: defaultFingerprint(),
  proxy: defaultProxy()
})

watch(() => props.environment, (env) => {
  if (env) {
    formData.value = {
      name: env.name,
      tags: env.tags,
      color: env.color,
      groupId: env.groupId,
      cdpPort: env.cdpPort,
      fingerprint: { ...env.fingerprint },
      proxy: env.proxy ? { ...env.proxy } : defaultProxy()
    }
    tagsInput.value = env.tags.join(', ')
    useProxy.value = !!env.proxy
    if (env.proxy?.host && env.proxy?.port) {
      const match = proxies.value.find((p: any) =>
        p.host === env.proxy!.host && p.port === env.proxy!.port
      )
      if (match) {
        selectedProxyId.value = match.id
        proxyMode.value = 'pool'
      } else {
        selectedProxyId.value = ''
        proxyMode.value = 'manual'
      }
    } else {
      selectedProxyId.value = ''
      proxyMode.value = 'pool'
    }
  } else {
    formData.value = {
      name: '',
      tags: [],
      color: colors[0],
      groupId: undefined,
      cdpPort: undefined,
      fingerprint: defaultFingerprint(),
      proxy: defaultProxy()
    }
    tagsInput.value = ''
    useProxy.value = false
    selectedProxyId.value = ''
    proxyMode.value = 'pool'
    fieldErrors.value = {}
  }
  void focusNameInput()
}, { immediate: true })

// ---- 从代理池中选择 ----
function onSelectProxyFromPool() {
  const proxy = proxies.value.find((p: any) => p.id === selectedProxyId.value)
  if (proxy) {
    formData.value.proxy = {
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
    }
  }
}

function onTimezoneChange() {
  const recommendedLang = getRecommendedLanguageForTimezone(formData.value.fingerprint.timezone)
  if (recommendedLang) {
    formData.value.fingerprint.lang = recommendedLang
  }
}

function normalizeCDPPort(value: unknown): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined
  const port = Number(value)
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : undefined
}

// ---- 保存 ----
function save() {
  if (!validateAll()) return
  const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t)
  const proxy = useProxy.value && formData.value.proxy?.host ? formData.value.proxy : undefined
  const cdpPort = normalizeCDPPort(formData.value.cdpPort)

  if (isBatchMode.value) {
    // 批量模式：生成多条环境数据，每条独立随机指纹 seed
    const batch: Array<Partial<Environment>> = []
    for (let i = 0; i < batchCount.value; i++) {
      batch.push({
        name: `${formData.value.name}${batchStartIndex.value + i}`,
        tags,
        color: formData.value.color,
        groupId: formData.value.groupId || undefined,
        ...(cdpPort ? { cdpPort: cdpPort + i } : {}),
        fingerprint: { ...formData.value.fingerprint, seed: Math.floor(Math.random() * 1000000) },
        proxy,
      })
    }
    emit('save', batch)
  } else {
    const data: Partial<Environment> = {
      name: formData.value.name,
      tags,
      color: formData.value.color,
      groupId: formData.value.groupId || undefined,
      ...(cdpPort ? { cdpPort } : {}),
      fingerprint: formData.value.fingerprint,
      proxy,
    }
    emit('save', data)
  }
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
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}
.input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}
.btn-primary {
  background: #3b82f6;
  color: white;
}
.btn-primary:hover { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-secondary:hover { background: #f9fafb; }
</style>
