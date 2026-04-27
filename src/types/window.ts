/**
 * 窗口管理类型定义（C++ 原生模块）
 */

export interface WindowPosition {
  x: number
  y: number
  width: number
  height: number
}

export interface MonitorInfo {
  id: string
  bounds: WindowPosition
  workArea: WindowPosition
  isPrimary: boolean
}

export interface WindowInfo {
  hwnd: number
  title: string
  pid: number
}
