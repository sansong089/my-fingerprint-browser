<template>
  <div class="h-full w-full flex flex-col overflow-hidden relative">
    <div class="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-slate-200 bg-white">
      <router-link
        to="/plugins"
        class="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mr-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        已安装
      </router-link>

      <span class="w-px h-4 bg-slate-200 mx-1 shrink-0"></span>

      <button class="nav-btn" :disabled="!canGoBack" @click="goBack" title="后退">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <button class="nav-btn" :disabled="!canGoForward" @click="goForward" title="前进">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
      <button class="nav-btn" @click="toggleReload" :title="isLoading ? '停止' : '刷新'">
        <svg v-if="!isLoading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6h12v12H6z"/>
        </svg>
      </button>
      <button class="nav-btn" @click="goHome" title="商店首页">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </button>

      <div class="flex-1 mx-2 min-w-0">
        <div class="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1 min-w-0">
          <span class="w-2 h-2 rounded-full shrink-0 transition-colors" :class="hookDotClass"></span>
          <span class="text-xs text-slate-500 truncate min-w-0 flex-1">{{ displayUrl }}</span>
        </div>
      </div>

      <button
        class="shrink-0 ml-2 px-3 py-1.5 text-xs rounded-lg transition-colors"
        :class="installButtonClass"
        :disabled="!canInstallFromToolbar"
        @click="installFromCurrentDetail"
      >
        {{ toolbarInstallLabel }}
      </button>
    </div>

    <div class="store-webview-shell">
      <webview
        ref="storeWebview"
        class="store-webview"
        :src="storeHomeUrl"
        allowpopups="false"
        webpreferences="contextIsolation=no, nodeIntegration=no"
        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { toast } from '@/utils/toast'

type HookStatus = 'idle' | 'searching' | 'hooked' | 'failed'
type InstallState = 'uninstalled' | 'installing' | 'installed'

type StoreDetail = {
  storeUrl: string
  pluginId: string
  title?: string
}

type HookResultStatus = 'hooked' | 'button-not-found' | 'not-detail' | 'button-lost'
type HookResult = {
  status: HookResultStatus
  detail: StoreDetail | null
}

const store = useStore()
const storeHomeUrl = 'https://chromewebstore.google.com/'
const storeWebview = ref<any | null>(null)
const currentStoreDetail = ref<StoreDetail | null>(null)
const hookStatus = ref<HookStatus>('idle')
const hookError = ref('')
const installState = ref<InstallState>('uninstalled')
const isLoading = ref(false)
const canGoBack = ref(false)
const canGoForward = ref(false)
const currentUrl = ref(storeHomeUrl)
const hookedPluginId = ref<string | null>(null)

let hookRetryTimer: number | undefined
let hookAttempts = 0
const HOOK_RETRY_DELAY_MS = 400
const HOOK_FAIL_ATTEMPTS = 25

function debugLog(stage: string, detail?: Record<string, unknown>) {
  console.log('[FPB debug]', {
    stage,
    ...detail,
  })
}

const displayUrl = computed(() => {
  try {
    const u = new URL(currentUrl.value)
    return u.hostname + u.pathname.replace(/\/$/, '') || currentUrl.value
  } catch {
    return currentUrl.value
  }
})

const hookDotClass = computed(() => {
  switch (hookStatus.value) {
    case 'hooked':
      return 'bg-emerald-500'
    case 'searching':
      return 'bg-blue-500'
    case 'failed':
      return 'bg-amber-500'
    default:
      return 'bg-slate-400'
  }
})

const toolbarInstallLabel = computed(() => {
  switch (installState.value) {
    case 'installing':
      return '安装中'
    case 'installed':
      return '已安装'
    default:
      return '安装'
  }
})

const canInstallFromToolbar = computed(() => {
  return !!currentStoreDetail.value && installState.value === 'uninstalled'
})

const installButtonClass = computed(() => (
  canInstallFromToolbar.value
    ? 'bg-blue-600 text-white hover:bg-blue-700'
    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
))

onMounted(() => {
  attachWebview()
  window.addEventListener('focus', handleWindowResume)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  stopHookRetry()
  detachWebview()
  window.removeEventListener('focus', handleWindowResume)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function extractStoreDetail(url: string, title?: string) {
  const match = url.match(/\/detail\/[^/]+\/([a-z]{32})(?:[/?#]|$)/i)
  if (!match) return null
  return {
    storeUrl: url,
    pluginId: match[1].toLowerCase(),
    title: title || currentStoreDetail.value?.title,
  }
}

function attachWebview() {
  const view = storeWebview.value
  if (!view) return
  view.addEventListener('dom-ready', handleReady)
  view.addEventListener('did-start-loading', handleLoadStart)
  view.addEventListener('did-stop-loading', handleLoadStop)
  view.addEventListener('did-fail-load', handleLoadStop)
  view.addEventListener('did-navigate', handleNavigation)
  view.addEventListener('did-navigate-in-page', handleNavigation)
  view.addEventListener('page-title-updated', handleNavigation)
  view.addEventListener('console-message', handleConsoleMessage)
}

function detachWebview() {
  const view = storeWebview.value
  if (!view) return
  view.removeEventListener('dom-ready', handleReady)
  view.removeEventListener('did-start-loading', handleLoadStart)
  view.removeEventListener('did-stop-loading', handleLoadStop)
  view.removeEventListener('did-fail-load', handleLoadStop)
  view.removeEventListener('did-navigate', handleNavigation)
  view.removeEventListener('did-navigate-in-page', handleNavigation)
  view.removeEventListener('page-title-updated', handleNavigation)
  view.removeEventListener('console-message', handleConsoleMessage)
}

function handleReady() {
  refreshNavigation()
  syncDetailFromCurrentPage()
  scheduleHookSearch()
  fixWebviewIframeHeight()
}

function fixWebviewIframeHeight() {
  const view = storeWebview.value
  if (!view) return
  try {
    const shadow = view.shadowRoot
    if (!shadow) return
    const iframe = shadow.querySelector('iframe')
    if (iframe) {
      ;(iframe as HTMLElement).style.height = '100%'
    }
  } catch {
    // ignore
  }
}

function handleNavigation() {
  refreshNavigation()
  syncDetailFromCurrentPage()
  scheduleHookSearch()
}

function handleLoadStart() {
  isLoading.value = true
  if (isStoreDetailUrl(currentUrl.value)) {
    debugLog('handle-load-start:reset-install-state', {
      currentUrl: currentUrl.value,
      previousInstallState: installState.value,
      hookedPluginId: hookedPluginId.value,
    })
    installState.value = 'uninstalled'
    hookedPluginId.value = null
    hookStatus.value = 'searching'
    hookError.value = ''
  }
}

function handleLoadStop() {
  isLoading.value = false
  refreshNavigation()
  syncDetailFromCurrentPage()
  scheduleHookSearch()
}

function isStoreDetailUrl(url: string) {
  return /\/detail\/[^/]+\/[a-z]{32}(?:[/?#]|$)/i.test(url)
}

function handleWindowResume() {
  if (document.hidden) return
  refreshNavigation()
  syncDetailFromCurrentPage()
  if (isStoreDetailUrl(currentUrl.value)) {
    scheduleHookSearch()
    void syncInstallStateToPage()
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopHookRetry()
    return
  }
  handleWindowResume()
}

function handleConsoleMessage(event: { message?: string }) {
  const message = event.message || ''
  if (message.startsWith('__FPB_HOOK_STATE__')) {
    const rawPayload = message.slice('__FPB_HOOK_STATE__'.length)
    try {
      const payload = JSON.parse(rawPayload) as HookResult
      debugLog('hook-state', payload)
      currentStoreDetail.value = payload.detail
      if (payload.status === 'hooked') {
        hookStatus.value = 'hooked'
        hookError.value = ''
        hookedPluginId.value = payload.detail?.pluginId || null
        stopHookRetry()
      } else if (payload.status === 'not-detail') {
        resetDetailState()
      } else if (payload.status === 'button-lost') {
        hookStatus.value = 'searching'
        hookError.value = ''
        hookedPluginId.value = null
        hookAttempts = 0
        scheduleNextHookAttempt()
      } else if (hookStatus.value !== 'hooked') {
        hookStatus.value = 'searching'
      }
    } catch {
      // ignore malformed messages
    }
    return
  }

  if (!message.startsWith('__FPB_INSTALL__')) return

  const rawPayload = message.slice('__FPB_INSTALL__'.length)
  let payload: { storeUrl: string; name?: string }
  try {
    payload = JSON.parse(rawPayload)
    debugLog('page-install-click', payload)
  } catch {
    toast.error('安装请求解析失败。')
    return
  }
  void installFromEmbeddedStore(payload)
}

function resetDetailState() {
  debugLog('reset-detail-state', {
    currentUrl: currentUrl.value,
    hookedPluginId: hookedPluginId.value,
  })
  stopHookRetry()
  currentStoreDetail.value = null
  hookedPluginId.value = null
  hookStatus.value = 'idle'
  hookError.value = ''
  installState.value = 'uninstalled'
}

function scheduleHookSearch() {
  if (!isStoreDetailUrl(currentUrl.value)) {
    debugLog('schedule-hook-search:skip-not-detail', {
      currentUrl: currentUrl.value,
    })
    resetDetailState()
    void clearPageHook()
    return
  }

  const detail = currentStoreDetail.value
  if (!detail) {
    debugLog('schedule-hook-search:no-detail', {
      currentUrl: currentUrl.value,
    })
    return
  }

  const pluginChanged = hookedPluginId.value !== detail.pluginId
  const needsNewSearch = hookStatus.value !== 'hooked' || pluginChanged

  debugLog('schedule-hook-search', {
    pluginId: detail.pluginId,
    hookedPluginId: hookedPluginId.value,
    pluginChanged,
    needsNewSearch,
    hookStatus: hookStatus.value,
    installState: installState.value,
  })

  if (!needsNewSearch) {
    return
  }

  stopHookRetry()
  hookStatus.value = 'searching'
  hookError.value = ''

  if (pluginChanged) {
    installState.value = 'uninstalled'
    hookAttempts = 0
    hookedPluginId.value = null
    void clearPageHook()
    void attemptHook()
    return
  }

  if (hookAttempts === 0) {
    debugLog('schedule-hook-search:first-attempt', {
      pluginId: detail.pluginId,
    })
  }

  if (!hookRetryTimer) {
    hookAttempts = 0
    void attemptHook()
  }
}

function stopHookRetry() {
  if (hookRetryTimer) {
    window.clearTimeout(hookRetryTimer)
    hookRetryTimer = undefined
  }
}

function scheduleNextHookAttempt() {
  stopHookRetry()
  hookRetryTimer = window.setTimeout(() => {
    void attemptHook()
  }, HOOK_RETRY_DELAY_MS)
}

async function attemptHook() {
  const view = storeWebview.value
  if (!view?.executeJavaScript || document.hidden || !isStoreDetailUrl(currentUrl.value)) {
    debugLog('attempt-hook:skip', {
      hasView: !!view?.executeJavaScript,
      hidden: document.hidden,
      currentUrl: currentUrl.value,
    })
    return
  }

  hookAttempts += 1
  debugLog('attempt-hook:start', {
    hookAttempts,
    currentUrl: currentUrl.value,
    pluginId: currentStoreDetail.value?.pluginId || null,
    installState: installState.value,
  })
  try {
    const result = await view.executeJavaScript(storeHookScript, true) as HookResult | undefined
    if (!result) {
      debugLog('attempt-hook:no-result', {
        hookAttempts,
      })
      return
    }

    debugLog('attempt-hook:result', result)
    currentStoreDetail.value = result.detail

    if (result.status === 'hooked') {
      hookStatus.value = 'hooked'
      hookError.value = ''
      stopHookRetry()
      await syncInstallStateToPage()
      return
    }

    if (result.status === 'not-detail') {
      resetDetailState()
      return
    }

    if (result.status === 'button-lost') {
      hookStatus.value = 'searching'
      hookError.value = ''
      scheduleNextHookAttempt()
      return
    }

    if (hookAttempts >= HOOK_FAIL_ATTEMPTS) {
      debugLog('attempt-hook:failed-max-attempts', {
        hookAttempts,
        currentUrl: currentUrl.value,
      })
      hookStatus.value = 'failed'
      hookError.value = '详情页按钮结构与预期不一致，当前页面暂不支持安装。'
      stopHookRetry()
      return
    }

    hookStatus.value = 'searching'
    scheduleNextHookAttempt()
  } catch (error: any) {
    debugLog('attempt-hook:error', {
      hookAttempts,
      message: error?.message || String(error),
    })
    if (hookAttempts >= HOOK_FAIL_ATTEMPTS) {
      hookStatus.value = 'failed'
      hookError.value = error?.message || '页面接管失败。'
      stopHookRetry()
      return
    }
    scheduleNextHookAttempt()
  }
}

function refreshNavigation() {
  const view = storeWebview.value
  if (!view) return
  try {
    const url = view.getURL?.() || storeHomeUrl
    currentUrl.value = url
    canGoBack.value = !!view.canGoBack?.()
    canGoForward.value = !!view.canGoForward?.()
  } catch {
    // ignore transient webview state
  }
}

function syncDetailFromCurrentPage() {
  const view = storeWebview.value
  if (!view) return
  try {
    const detail = extractStoreDetail(view.getURL?.() || currentUrl.value, view.getTitle?.())
    const previousPluginId = currentStoreDetail.value?.pluginId
    currentStoreDetail.value = detail

    debugLog('sync-detail-from-page', {
      currentUrl: view.getURL?.() || currentUrl.value,
      previousPluginId: previousPluginId || null,
      nextPluginId: detail?.pluginId || null,
      title: detail?.title || null,
    })

    if (!detail) {
      resetDetailState()
      void clearPageHook()
      return
    }

    if (detail.pluginId !== previousPluginId) {
      installState.value = 'uninstalled'
      hookedPluginId.value = null
      if (previousPluginId) {
        void clearPageHook()
      }
    }

    if (hookStatus.value === 'idle' || hookStatus.value === 'failed') {
      hookStatus.value = 'searching'
      hookError.value = ''
    }
  } catch {
    // ignore transient webview state
  }
}

function goHome() {
  const view = storeWebview.value
  if (!view) return
  resetDetailState()
  void clearPageHook()
  view.loadURL(storeHomeUrl)
}

function toggleReload() {
  const view = storeWebview.value
  if (!view) return
  if (isLoading.value) {
    view.stop?.()
    return
  }
  view.reload?.()
}

function goBack() {
  storeWebview.value?.goBack?.()
}

function goForward() {
  storeWebview.value?.goForward?.()
}

async function installFromEmbeddedStore(payload: { storeUrl: string; name?: string }) {
  if (installState.value !== 'uninstalled') return

  debugLog('install:start', {
    payload,
    pluginId: currentStoreDetail.value?.pluginId || null,
  })
  installState.value = 'installing'
  await syncInstallStateToPage()

  try {
    await store.dispatch('plugins/install', payload)
    installState.value = 'installed'
    await syncInstallStateToPage()
    debugLog('install:success', {
      payload,
      pluginId: currentStoreDetail.value?.pluginId || null,
    })
    toast.success('已记录插件安装；运行中的环境将在下次启动时应用。')
  } catch (error: any) {
    installState.value = 'uninstalled'
    await syncInstallStateToPage()
    debugLog('install:error', {
      payload,
      message: error.message || 'unknown install error',
    })
    toast.error(error.message || '无法安装当前插件。')
  }
}

async function installFromCurrentDetail() {
  if (!currentStoreDetail.value || installState.value !== 'uninstalled') return
  await installFromEmbeddedStore({
    storeUrl: currentStoreDetail.value.storeUrl,
    name: currentStoreDetail.value.title,
  })
}

async function syncInstallStateToPage() {
  const view = storeWebview.value
  if (!view?.executeJavaScript || !isStoreDetailUrl(currentUrl.value)) return
  try {
    debugLog('sync-install-state-to-page', {
      installState: installState.value,
      pluginId: currentStoreDetail.value?.pluginId || null,
    })
    await view.executeJavaScript(buildInstallStateSyncScript(installState.value), true)
  } catch {
    // ignore transient sync failures while page is rerendering
  }
}

async function clearPageHook() {
  const view = storeWebview.value
  if (!view?.executeJavaScript) return
  try {
    await view.executeJavaScript(String.raw`(() => {
      if (window.__FPBController?.dispose) {
        window.__FPBController.dispose()
      }
      window.__FPBController = null
      window.__FPBInstallState = 'uninstalled'
      return true
    })()`, true)
  } catch {
    // ignore transient teardown failures
  }
}

const storeHookScript = String.raw`(() => {
  const HOOK_STATE_EVENT = '__FPB_HOOK_STATE__'
  const INSTALL_EVENT = '__FPB_INSTALL__'
  const DEBUG_EVENT = '__FPB_DEBUG__'

  function debug(stage, detail) {
    console.log(DEBUG_EVENT + JSON.stringify({ stage, ...(detail || {}) }))
  }

  if (!window.__FPBController) {
    window.__FPBController = {
      installButton: null,
      installState: window.__FPBInstallState || 'uninstalled',
      attributeObserver: null,
      hooked: false,
      detail: null,
      hookBoundAt: '',
      emitHookState(status, detail) {
        const payload = JSON.stringify({ status, detail })
        if (window.__FPBLastHookStatePayload === payload) return
        window.__FPBLastHookStatePayload = payload
        console.log(HOOK_STATE_EVENT + payload)
      },
      getDetail() {
        const href = window.location.href
        const match = href.match(/\/detail\/[^/]+\/([a-z]{32})(?:[/?#]|$)/i)
        if (!match) return null
        return {
          storeUrl: href,
          pluginId: match[1].toLowerCase(),
          title: document.title || undefined,
        }
      },
      looksLikeInstallButton(target) {
        if (!(target instanceof HTMLButtonElement)) return false
        const text = (target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        const ariaLabel = (target.getAttribute('aria-label') || '').trim().toLowerCase()
        return text.includes('chrome')
          || text.includes('desktop')
          || text.includes('安装')
          || text.includes('add to')
          || text.includes('添加至')
          || ariaLabel.includes('chrome')
          || ariaLabel.includes('desktop')
          || ariaLabel.includes('安装')
          || ariaLabel.includes('add to')
          || ariaLabel.includes('添加至')
      },
      findInstallButton() {
        if (this.installButton instanceof HTMLButtonElement && this.installButton.isConnected) {
          debug('find-install-button:reuse', {
            text: (this.installButton.innerText || this.installButton.textContent || '').trim(),
            ariaLabel: this.installButton.getAttribute('aria-label'),
          })
          return this.installButton
        }

        const xpath = '/html/body/c-wiz/div/div/main/div/section[1]/section/div/div[4]/div/div/button'
        const exactMatch = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        debug('find-install-button:xpath', {
          found: exactMatch instanceof HTMLButtonElement,
          text: exactMatch instanceof HTMLButtonElement ? (exactMatch.innerText || exactMatch.textContent || '').trim() : '',
          ariaLabel: exactMatch instanceof HTMLButtonElement ? exactMatch.getAttribute('aria-label') : null,
        })
        if (exactMatch instanceof HTMLButtonElement && this.looksLikeInstallButton(exactMatch)) {
          return exactMatch
        }

        const candidates = Array.from(document.querySelectorAll('button')).filter((button) => {
          return this.looksLikeInstallButton(button)
        })
        debug('find-install-button:candidates', {
          count: candidates.length,
          items: candidates.slice(0, 5).map((button) => ({
            text: (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
            ariaLabel: button.getAttribute('aria-label'),
            className: button.className,
          })),
        })
        return candidates[0] || null
      },
      getExpectedButtonState() {
        if (this.installState === 'installing') {
          return { label: '安装中', disabled: true }
        }
        if (this.installState === 'installed') {
          return { label: '已安装', disabled: true }
        }
        return { label: '安装', disabled: false }
      },
      getButtonTextNode(target) {
        return target.querySelector('.UywwFc-vQzf8d')
          || Array.from(target.querySelectorAll('span, div')).find((node) => {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
            return text.length > 0
          })
      },
      readButtonState(target) {
        const textNode = this.getButtonTextNode(target)
        const label = ((textNode?.textContent || target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim())
        const disabled = target.disabled
          || target.getAttribute('aria-disabled') === 'true'
          || target.style.pointerEvents === 'none'
        return { label, disabled }
      },
      applyStateToButton(target) {
        const expected = this.getExpectedButtonState()
        const textNode = this.getButtonTextNode(target)

        target.disabled = expected.disabled
        if (expected.disabled) {
          target.setAttribute('disabled', '')
          target.setAttribute('aria-disabled', 'true')
        } else {
          target.removeAttribute('disabled')
          target.removeAttribute('aria-disabled')
        }
        target.style.pointerEvents = expected.disabled ? 'none' : 'auto'
        target.style.cursor = expected.disabled ? 'default' : 'pointer'
        target.style.opacity = expected.disabled ? '0.72' : '1'

        if (textNode) {
          textNode.textContent = expected.label
        } else {
          target.textContent = expected.label
        }
        target.setAttribute('aria-label', expected.label)
      },
      syncButtonIfNeeded(target) {
        const current = this.readButtonState(target)
        const expected = this.getExpectedButtonState()
        if (current.label === expected.label && current.disabled === expected.disabled) {
          return false
        }
        this.applyStateToButton(target)
        return true
      },
      handleButtonMutation() {
        const target = this.installButton
        if (!(target instanceof HTMLButtonElement) || !target.isConnected) {
          debug('button-mutation:lost', {
            installState: this.installState,
          })
          this.detachButton()
          this.emitHookState('button-lost', this.getDetail())
          return
        }
        debug('button-mutation:sync', {
          installState: this.installState,
          text: (target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim(),
          ariaLabel: target.getAttribute('aria-label'),
          disabled: target.disabled,
        })
        this.syncButtonIfNeeded(target)
      },
      observeButtonAttributes(target) {
        if (this.attributeObserver) {
          this.attributeObserver.disconnect()
        }
        this.attributeObserver = new MutationObserver(() => {
          this.handleButtonMutation()
        })
        this.attributeObserver.observe(target, {
          attributes: true,
          attributeFilter: ['disabled', 'aria-disabled', 'class', 'aria-label'],
          childList: true,
          subtree: true,
          characterData: true,
        })
      },
      bindInstallClick(target) {
        if (target.dataset.fpbHooked === 'true' && this.hookBoundAt === window.location.href) {
          return
        }

        target.dataset.fpbHooked = 'true'
        this.hookBoundAt = window.location.href
        target.addEventListener('click', (event) => {
          if (this.installState !== 'uninstalled') {
            event.preventDefault()
            event.stopImmediatePropagation()
            event.stopPropagation()
            return
          }

          this.installState = 'installing'
          window.__FPBInstallState = this.installState
          this.syncButtonIfNeeded(target)

          event.preventDefault()
          event.stopImmediatePropagation()
          event.stopPropagation()

          console.log(INSTALL_EVENT + JSON.stringify({
            storeUrl: window.location.href,
            name: document.title || undefined,
          }))
        }, true)
      },
      detachButton() {
        if (this.attributeObserver) {
          this.attributeObserver.disconnect()
          this.attributeObserver = null
        }
        this.installButton = null
        this.hooked = false
      },
      setInstallState(nextState) {
        this.installState = nextState
        window.__FPBInstallState = nextState
        const target = this.installButton
        debug('set-install-state', {
          nextState,
          hasButton: !!target,
          connected: !!target?.isConnected,
        })
        if (!(target instanceof HTMLButtonElement) || !target.isConnected) {
          return false
        }
        this.syncButtonIfNeeded(target)
        return true
      },
      hook() {
        this.detail = this.getDetail()
        debug('hook:start', {
          href: window.location.href,
          detail: this.detail,
          installState: this.installState,
        })
        if (!this.detail) {
          this.detachButton()
          this.emitHookState('not-detail', null)
          return { status: 'not-detail', detail: null }
        }

        const target = this.findInstallButton()
        if (!(target instanceof HTMLButtonElement)) {
          debug('hook:button-not-found', {
            href: window.location.href,
            detail: this.detail,
          })
          this.emitHookState('button-not-found', this.detail)
          return { status: 'button-not-found', detail: this.detail }
        }

        debug('hook:button-found', {
          text: (target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim(),
          ariaLabel: target.getAttribute('aria-label'),
          className: target.className,
        })
        this.installButton = target
        this.bindInstallClick(target)
        this.observeButtonAttributes(target)
        this.syncButtonIfNeeded(target)
        this.hooked = true
        this.emitHookState('hooked', this.detail)
        return { status: 'hooked', detail: this.detail }
      },
      dispose() {
        this.detachButton()
        this.detail = null
      },
    }
  }

  window.__FPBController.installState = window.__FPBInstallState || 'uninstalled'
  return window.__FPBController.hook()
})()`

function buildInstallStateSyncScript(nextState: InstallState) {
  return String.raw`(() => {
    window.__FPBInstallState = '${nextState}'
    return window.__FPBController?.setInstallState('${nextState}') || false
  })()`
}
</script>

<style scoped>
.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #64748b;
  transition: background-color 0.15s, color 0.15s;
  flex-shrink: 0;
}

.nav-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.store-webview-shell {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 48px;
  overflow: hidden;
  background: #f8fafc;
  display: flex;
}

.store-webview {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
