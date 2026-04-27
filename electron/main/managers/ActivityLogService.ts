/**
 * ActivityLogService — 独立日志存储服务
 *
 * - 内存 buffer（50 条触发 flush）
 * - 独立 electron-store 文件（activity-logs.json）
 * - 1000 条上限裁剪
 * - 定时刷盘（5s）
 */
import Store from 'electron-store'
import type { ActivityLog } from '../../../src/types/log'

interface LogStore {
  logs: ActivityLog[]
}

const MAX_BUFFER_SIZE = 50
const MAX_STORE_SIZE = 1000
const FLUSH_INTERVAL_MS = 5000

class ActivityLogService {
  private buffer: ActivityLog[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private store: Store<LogStore>

  constructor() {
    this.store = new Store<LogStore>({
      name: 'activity-logs',
      defaults: { logs: [] },
    })
  }

  /** 记录一条日志（追加到 buffer） */
  log(entry: Omit<ActivityLog, 'id' | 'timestamp'>): void {
    const fullEntry: ActivityLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    }
    this.buffer.push(fullEntry)

    // 缓冲区满或首次写入时立即刷盘
    if (this.buffer.length >= MAX_BUFFER_SIZE || !this.flushTimer) {
      this.flush()
    }
  }

  /** 查询日志（从 store 读，支持按 envId 过滤） */
  query(options?: { envId?: string; limit?: number }): ActivityLog[] {
    let logs = this.store.get('logs', [])

    if (options?.envId) {
      logs = logs.filter(l => l.envId === options.envId)
    }

    // 按 timestamp 降序排列（最新的在前）
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    if (options?.limit && options.limit > 0) {
      logs = logs.slice(0, options.limit)
    }

    return logs
  }

  /** 将 buffer 写入 store，裁剪到 MAX_STORE_SIZE */
  private flush(): void {
    try {
      const existing = this.store.get('logs', [])
      const merged = [...existing, ...this.buffer]

      // 按 timestamp 降序，保留最新 MAX_STORE_SIZE 条
      merged.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      merged.splice(MAX_STORE_SIZE)

      this.store.set('logs', merged)
      this.buffer = []

      console.log(`[ActivityLogService] Flushed ${merged.length} logs`)

      // 设置定时 flush（如果还有新日志持续写入的话）
      if (this.flushTimer) clearInterval(this.flushTimer)
      this.flushTimer = setTimeout(() => {
        if (this.buffer.length > 0) this.flush()
        else this.flushTimer = null
      }, FLUSH_INTERVAL_MS)
    } catch (error) {
      console.error('[ActivityLogService] Flush error:', error)
    }
  }

  /** 关闭服务时强制刷盘（app quit 前） */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length > 0) {
      this.flush()
    }
  }
}

export const activityLogService = new ActivityLogService()
export default ActivityLogService
