/**
 * WindowManager — 浏览器窗口管理
 *
 * 原生模块使用延迟加载（lazy require），避免 Vite/Rollup 构建阶段尝试解析
 * .node 文件导致编译截断。窗口管理是原生强依赖：加载失败必须显式报错。
 */

import path from 'path'
import { appendFileSync, mkdirSync } from 'fs'

// 延迟加载的原生模块缓存
let _nativeModule: any = null
const debugLogDir = path.join(process.cwd(), 'output', 'logs')
const debugLogFile = path.join(debugLogDir, 'window-manager.log')

function debugLog(message: string, extra?: unknown) {
  try {
    mkdirSync(debugLogDir, { recursive: true })
    appendFileSync(
      debugLogFile,
      `[${new Date().toISOString()}] ${message}${extra !== undefined ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}\n`,
      'utf8'
    )
  } catch {
    // ignore log failures
  }
}

/** 获取原生模块（首次调用时加载） */
function getNativeModule(): any {
  if (_nativeModule) return _nativeModule
  debugLog('getNativeModule:start')

  const errors: Array<{ path: string; message: string }> = []
  try {
    const candidates = [
      // 开发环境：cwd 指向项目根目录
      path.join(process.cwd(), 'native/win32-window/build/Release/win32_window.node'),
      // 运行环境：dist-electron/main → 项目根目录 → native/
      path.join(__dirname, '../../native/win32-window/build/Release/win32_window.node'),
      path.join(__dirname, '../native/win32-window/build/Release/win32_window.node'),
    ]

    for (const p of Array.from(new Set(candidates))) {
      try {
        debugLog('getNativeModule:require-attempt', p)
        _nativeModule = require(p)
        debugLog('getNativeModule:require-success', { path: p, methods: Object.keys(_nativeModule) })
        console.log('[WindowManager] ✅ Native module loaded from:', p)
        console.log('[WindowManager]   Methods:', Object.keys(_nativeModule).join(', '))
        return _nativeModule
      } catch (error: any) {
        const message = error?.message || String(error)
        errors.push({ path: p, message })
        debugLog('getNativeModule:require-failed', { path: p, message })
      }
    }
  } catch (e: any) {
    debugLog('getNativeModule:outer-error', e?.message)
    errors.push({ path: '<module-loader>', message: e?.message || String(e) })
  }

  const detail = errors.map(item => `${item.path}: ${item.message}`).join('\n')
  const error = new Error(`Native window module unavailable. Window control cannot continue.\n${detail}`)
  debugLog('getNativeModule:unavailable', detail)
  throw error
}

/**
 * 代理对象：首次访问方法时才触发原生模块加载
 * 对外接口与原生模块完全一致，确保 index.ts 的静态分析不会 tree-shake 掉 handler
 */
export const windowManager: Record<string, any> = new Proxy({} as any, {
  get(_target, prop: string) {
    debugLog('windowManager:get', prop)
    const native = getNativeModule()
    const value = native[prop]
    if (value === undefined) {
      throw new Error(`Native window module does not export "${prop}"`)
    }
    // 如果是方法，绑定 this；如果是属性直接返回
    if (typeof value === 'function') {
      return (...args: any[]) => {
        debugLog('windowManager:call:start', { prop, args })
        const result = value.apply(native, args)
        debugLog('windowManager:call:end', { prop })
        return result
      }
    }
    return value
  }
})

export default windowManager
