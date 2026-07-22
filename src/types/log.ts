/**
 * 操作日志类型定义
 */

export interface ActivityLog {
  id: string
  envId: string
  action:
    | 'launch'
    | 'close'
    | 'create'
    | 'update'
    | 'delete'
    | 'import'
    | 'export'
    | 'script_run'
  timestamp: string
  details?: string
}
