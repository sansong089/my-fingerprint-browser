/**
 * win32-window — C++ N-API 原生模块类型声明
 *
 * Windows 窗口控制 + 多显示器管理原生模块。
 * 通过 require('win32-window') 加载，编译产物为 .node 二进制。
 */

export interface WindowPosition {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowInfo {
  hwnd: number       // 窗口句柄（数值形式）
  title: string      // 窗口标题 (UTF-8)
  pid: number        // 所属进程 PID
  isVisible?: boolean // 窗口是否可见（非最小化）
}

export interface MonitorInfo {
  id: string         // 显示器设备名（如 \\.\DISPLAY1）
  isPrimary: boolean // 是否主显示器
  bounds: WindowPosition   // 显示器完整边界
  workArea: WindowPosition // 工作区（排除任务栏）
}

export interface WindowSyncState {
  active: boolean
  mainHwnd: number
  mirrorHwnds: number[]
  pendingTransactions: number
  windowGroupCount: number
  textSessionActive: boolean
}

/**
 * win32-window 模块导出接口
 */
export interface Win32WindowModule {
  /** 标识：原生模块已成功加载 */
  readonly isNativeLoaded: true

  /**
   * 通过进程 ID 查找所有顶级窗口
   * @param pid - 目标进程 PID
   * @returns 匹配的窗口列表（一个进程可能有多个窗口）
   */
  findWindowByPid(pid: number): WindowInfo[]

  /**
   * 查找所有浏览器窗口（Chrome/Edge/Chromium，按窗口类名匹配）
   * 适用于 Chrome 多进程架构下无法通过 PID 精确定位主窗口的场景
   * @returns 所有浏览器窗口列表
   */
  findAllBrowserWindows(): WindowInfo[]

  /**
   * 设置窗口位置和大小
   * @param hwnd - 窗口句柄
   * @param pos - 目标位置和尺寸
   * @returns 操作是否成功
   */
  setWindowPosition(hwnd: number, pos: WindowPosition): boolean

  /**
   * 控制窗口显示状态
   * @param hwnd - 窗口句柄
   * @param cmd - 命令: 'maximize' | 'minimize' | 'restore' | 'show' | 'hide'
   * @returns 操作是否成功
   */
  showWindow(hwnd: number, cmd: string): boolean

  /**
   * 检查窗口句柄是否有效（窗口是否存在且未销毁）
   * @param hwnd - 窗口句柄
   */
  isWindowValid(hwnd: number): boolean

  /**
   * 获取窗口位置和大小
   * @param hwnd - 窗口句柄
   * @returns 位置信息，无效窗口返回 null
   */
  getWindowPosition(hwnd: number): WindowPosition | null

  /**
   * 获取所有显示器信息
   * @returns 显示器列表
   */
  getMonitors(): MonitorInfo[]

  /**
   * 排列多个窗口到指定位置
   * @param hwnds - 窗口句柄数组
   * @param positions - 可选的位置数组；不传则自动在主显示器上网格排列
   * @returns 所有操作是否都成功
   */
  arrangeWindows(hwnds: number[], positions?: WindowPosition[]): boolean

  /**
   * 启动窗口同步会话
   * @param mainHwnd - 主窗口句柄
   * @param mirrorHwnds - 镜像窗口句柄列表
   */
  startWindowSync(mainHwnd: number, mirrorHwnds: number[]): boolean

  /** 停止窗口同步 */
  stopWindowSync(): boolean

  /** 获取窗口同步状态 */
  getWindowSyncState(): WindowSyncState
}

declare const win32_window: Win32WindowModule
export default win32_window
