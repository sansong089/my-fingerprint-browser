/**
 * ScriptManager — 自动化脚本管理
 *
 * Phase 1 功能：
 * - CRUD 脚本（通过 StorageService 持久化）
 * - 录制注入：启动 Chrome 时通过 CDP 注入 DOM 事件监听脚本
 * - 回放引擎：按 ScriptStep 序列逐步重放操作
 *
 * Phase 2（v2.1）：
 * - 可视化脚本编辑器
 * - 条件分支 / 循环 / 定时任务
 */
import { storageService } from '../services/StorageService'
import { launchService } from '../services/LaunchService'
import CDPClient from './CDPClient'

// Script/ScriptStep — 使用 any 避免与 src/types/script 类型冲突（Electron 主进程不直接引用 src/types）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Script = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptStep = any
import { eventBus } from './BrowserEventBus'

/** 当前录制状态 */
let recordingEnvId: string | null = null
let recordingCDP: CDPClient | null = null
let recordedSteps: ScriptStep[] = []
let recordingStartTime = 0

class ScriptManager {

  // ==================== CRUD（委托 StorageService）====================

  getAll(): Script[] {
    return storageService.getScripts()
  }

  getById(id: string): Script | undefined {
    return storageService.getScripts().find(s => s.id === id)
  }

  create(data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>): Script {
    const now = new Date().toISOString()
    const script: Script = {
      ...data,
      id: `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    }
    storageService.addScript(script)
    return script
  }

  update(id: string, data: Partial<Script>): Script | null {
    storageService.updateScript(id, { ...data, updatedAt: new Date().toISOString() })
    return this.getById(id)
  }

  delete(id: string): boolean {
    const existing = this.getById(id)
    if (!existing) return false
    storageService.deleteScript(id)
    return true
  }

  // ==================== 录制功能 ====================

  /** 是否正在录制 */
  isRecording(): boolean {
    return recordingEnvId !== null && recordingCDP?.isConnected === true
  }

  /** 获取当前录制的环境 ID */
  getRecordingEnvId(): string | null {
    return recordingEnvId
  }

  /**
   * 开始录制
   * 连接到运行中浏览器的 CDP，注入 DOM 事件捕获脚本
   */
  async startRecord(envId: string, cdpPort: number): Promise<boolean> {
    if (this.isRecording()) {
      console.warn('[ScriptManager] Already recording, stop first')
      return false
    }

    const cdp = new CDPClient(cdpPort)
    try {
      await cdp.connect()

      // 启用 Page 和 Runtime 域
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')

      // 注入录制脚本的 binding 名称
      await cdp.evaluate(`
        window.__FPB_RECORDING__ = true;
        window.__FPB_STEPS__ = [];
        window.__FPB_STEP_COUNTER__ = 0;

        // 点击事件捕获
        document.addEventListener('click', (e) => {
          const el = e.target;
          window.__FPB_STEPS__.push({
            stepId: ++window.__FPB_STEP_COUNTER__,
            type: 'click',
            selector: this._generateSelector(el),
            offsetX: e.offsetX,
            offsetY: e.offsetY,
            delay: Date.now() - window.__FPB_RECORD_START__
          });
        }, true);

        // 输入事件捕获
        document.addEventListener('input', (e) => {
          const el = e.target;
          window.__FPB_STEPS__.push({
            stepId: ++window.__FPB_STEP_COUNTER__,
            type: 'input',
            selector: this._generateSelector(el),
            value: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el.value : '',
            delay: Date.now() - window.__FPB_RECORD_START__
          });
        }, true);

        // 滚动事件捕获（节流）
        let lastScrollTime = 0;
        document.addEventListener('scroll', (e) => {
          const now = Date.now();
          if (now - lastScrollTime < 500) return;
          lastScrollTime = now;
          window.__FPB_STEPS__.push({
            stepId: ++window.__FPB_STEP_COUNTER__,
            type: 'scroll',
            selector: this._generateSelector(e.target),
            delay: now - window.__FPB_RECORD_START__
          });
        }, true);

        // 页面导航捕获
        window.addEventListener('beforeunload', () => {
          window.__FPB_STEPS__.push({
            stepId: ++window.__FPB_STEP_COUNTER__,
            type: 'navigate',
            value: location.href,
            delay: Date.now() - window.__FPB_RECORD_START__
          });
        });

        // 工具函数：生成 CSS 选择器
        window._generateSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\\s+/).filter(c => c).slice(0, 2);
            if (classes.length > 0) return el.tagName.toLowerCase() + '.' + classes.join('.');
          }
          let path = el.tagName.toLowerCase();
          let parent = el.parentElement;
          let depth = 0;
          while (parent && depth < 3) {
            path = parent.tagName.toLowerCase() + ' > ' + path;
            parent = parent.parentElement;
            depth++;
          }
          return path;
        };
        window.__FPB_RECORD_START__ = Date.now();
      `)

      recordingEnvId = envId
      recordingCDP = cdp
      recordedSteps = []
      recordingStartTime = Date.now()

      console.log(`[ScriptManager] Recording started for env ${envId}`)
      eventBus.emit('script-event', { type: 'recording-started', envId })

      return true
    } catch (error) {
      console.error('[ScriptManager] Failed to start record:', error)
      try { await cdp.close() } catch { /* ignore */ }
      return false
    }
  }

  /**
   * 停止录制并返回收集到的步骤
   */
  async stopRecord(): Promise<Script | null> {
    if (!this.isRecording()) return null

    try {
      // 从浏览器获取录制的步骤
      if (recordingCDP?.isConnected) {
        try {
          const rawSteps = await recordingCDP.evaluate(
            'JSON.stringify(window.__FPB_STEPS__ || [])'
          )
          if (rawSteps && typeof rawSteps === 'string') {
            recordedSteps = JSON.parse(rawSteps)
          }
        } catch (e) {
          console.warn('[ScriptManager] Failed to extract steps:', e)
        }
      }
    } finally {
      if (recordingCDP) {
        try { await recordingCDP.close() } catch { /* ignore */ }
        recordingCDP = null
      }

      const envId = recordingEnvId
      recordingEnvId = null

      // 创建脚本对象保存
      const script = this.create({
        name: `录制_${new Date().toLocaleString()}`,
        description: `从环境 ${envId} 录制`,
        steps: recordedSteps,
      })

      console.log(`[ScriptManager] Recording stopped, ${recordedSteps.length} steps captured`)
      eventBus.emit('script-event', { type: 'recording-stopped', envId, scriptId: script.id })

      return script
    }
  }

  // ==================== 回放功能 ====================

  /**
   * 在指定环境上回放脚本
   * @param scriptId 脚本 ID
   * @param envId 环境 ID
   * @param cdpPort 环境 CDP 端口
   * @param onStep 回调函数（用于 UI 进度更新）
   */
  async playScript(
    scriptId: string,
    envId: string,
    cdpPort: number,
    onStep?: (stepIndex: number, totalSteps: number) => void
  ): Promise<{ success: boolean; error?: string }> {
    const script = this.getById(scriptId)
    if (!script) return { success: false, error: `Script ${scriptId} not found` }

    const cdp = new CDPClient(cdpPort)
    try {
      await cdp.connect()

      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i]
        onStep?.(i + 1, script.steps.length)

        await this.executeStep(cdp, step)

        // 步骤间延迟（如果有）
        if ((step.delay || 0) > 0 && i < script.steps.length - 1) {
          await this.delay(Math.min(step.delay || 0, 5000)) // 单步最大 5s
        }
      }

      activityLogService.log({ envId, action: 'script_run', details: `执行脚本: ${script.name} (${script.steps.length} 步)` })
      eventBus.emit('script-event', { type: 'play-complete', envId, scriptId })

      return { success: true }
    } catch (error: any) {
      console.error(`[ScriptManager] Play error at step:`, error)
      return { success: false, error: error.message }
    } finally {
      try { await cdp.close() } catch { /* ignore */ }
    }
  }

  /** 执行单个步骤 */
  private async executeStep(cdp: CDPClient, step: ScriptStep): Promise<void> {
    switch (step.type) {
      case 'click': {
        await cdp.send('Runtime.evaluate', {
          expression: `
            (selector => {
              const el = document.querySelector(selector);
              if (el) { el.click(); return true; }
              return false;
            })(${JSON.stringify(step.selector || '')})
        `,
          returnByValue: true,
        })
        break
      }
      case 'input': {
        // 先 focus 再输入
        await cdp.send('Runtime.evaluate', {
          expression: `
            (args => {
              const el = document.querySelector(args.selector);
              if (el) {
                el.focus();
                el.value = args.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              return false;
            })(${JSON.stringify({ selector: step.selector || '', value: step.value || '' })})
        `,
          returnByValue: true,
        })
        break
      }
      case 'scroll': {
        await cdp.send('Runtime.evaluate', {
          expression: `
            (selector => {
              const el = document.querySelector(selector);
              if (el) { el.scrollIntoView({ behavior: 'smooth' }); return true; }
              return false;
            })(${JSON.stringify(step.selector || '')})
        `,
          returnByValue: true,
        })
        break
      }
      case 'navigate': {
        await cdp.send('Page.navigate', { url: step.value || '' })
        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 1000))
        break
      }
      case 'wait':
        await this.delay(step.delay || 500)
        break
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 循环依赖：懒加载避免循环引用
let activityLogService: any = null
function getActivityLogService() {
  if (!activityLogService) {
    try {
      activityLogService = require('./ActivityLogService').activityLogService
    } catch { /* 首次加载可能未初始化 */ }
  }
  return activityLogService
}

export const scriptManager = new ScriptManager()
export default ScriptManager
