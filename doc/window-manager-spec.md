# 窗口管理模块规格文档

> 模块路径：`electron/main/managers/WindowManager.ts` + `native/win32-window/`
>
> 最后更新：2026-04-17

---

## 1. 架构概览

窗口管理采用 **三层架构**，从 UI 到 Win32 API 的完整调用链路：

```
┌─────────────────────────────────────────────────────┐
│  前端 (SessionsView.vue)                            │
│  ┌───────────┬──────────┬──────────┐                │
│  │ 排列窗口   │ 最大化   │  最小化  │  ← 用户操作     │
│  └─────┬─────┴────┬─────┴────┬─────┘                │
└────────┼──────────┼──────────┼───────────────────────┘
         │ invoke   │ invoke   │ invoke
         │          │          │
┌────────▼──────────▼──────────▼───────────────────────┐
│  IPC 层 (electron/main/index.ts)                      │
│                                                       │
│  windows-arrange    windows-maximize    windows-minimize
│  windows-restore                                       │
│       │                 │                    │        │
│  envIds → getPid()  envIds → getPid()   envIds → getPid()│
│       ▼                 ▼                    ▼        │
│  findWindowByPid()  findWindowByPid()    findWindowByPid()│
│       │                 │                    │        │
│  setWindowPosition() showWindow(max)      showWindow(min)│
└───────────────────────────┬────────────────────────────┘
                            │ Proxy (延迟加载)
                            ▼
┌───────────────────────────────────────────────────────┐
│  C++ N-API 原生模块 (win32_window.node)               │
│                                                       │
│  FindWindowsByPid(pid)  →  EnumWindows + 进程树匹配   │
│  SetWindowPosition(hwnd, pos)  →  SetWindowPos Win32  │
│  ShowWindowCmd(hwnd, cmd)  →  ShowWindow Win32        │
│  GetMonitors()  →  EnumDisplayMonitors Win32          │
└───────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **精确 PID 匹配** | 所有窗口操作基于 `envId → launchService.getPid(envId)` 获取启动时记录的 PID，不使用全局模糊枚举 |
| **进程树遍历** | Chrome 多进程架构下（Browser/Renderer/GPU/Utility），通过 `CreateToolhelp32Snapshot` BFS 遍历整棵进程树，确保子进程上的窗口也能被找到 |
| **进程名白名单** | `EnumWindows` 回调中通过 `QueryFullProcessImageNameW` 验证只接受 `chrome.exe` / `msedge.exe`，排除 Electron/VS Code/Codex 等 Chromium 内核应用 |
| **延迟加载** | 原生 `.node` 模块通过 ES Proxy 实现首次调用时才 `require()`，避免 Vite/Rollup 构建阶段解析二进制文件导致 tree-shake 截断 |

---

## 2. IPC Handler 定义

所有 handler 注册在 `electron/main/index.ts` 中，接收前端通过 `window.electronAPI.invoke(channel, params)` 发起的请求。

### 2.1 windows-maximize

**频道：** `windows-maximize`

**参数：**
```typescript
{
  envIds: string[]   // 环境ID列表，如 ['env_1775555306927_e3bz46nvd']
}
```

**逻辑：**
1. 遍历 `envIds`
2. 对每个 `envId` 调用 `launchService.getPid(envId)` 获取 PID
3. 调用 `windowManager.findWindowByPid(pid)` 查找该进程树的可见窗口
4. 对每个窗口调用 `windowManager.showWindow(hwnd, 'maximize')`

**返回：** `true`

---

### 2.2 windows-minimize

**频道：** `windows-minimize`

**参数/返回：** 同 `windows-maximize`，差异仅在于 showWindow 的 cmd 参数为 `'minimize'`

---

### 2.3 windows-restore

**频道：** `windows-restore`

**参数/返回：** 同上，cmd 为 `'restore'`

---

### 2.4 windows-arrange ⭐ 核心

**频道：** `windows-arrange`

**参数：**
```typescript
{
  mode: 'grid'          // 当前固定为 grid 网格模式（预留扩展）
  envIds: string[]       // 环境ID列表
}
```

**逻辑：**
1. 校验 `envIds` 非空数组
2. 遍历每个 `envId` → `getPid(envId)` → `findWindowByPid(pid)` 收集目标窗口
3. 获取显示器信息：`getMonitors()` 取主显示器的 workArea
4. 计算网格布局：
   - `cols = ceil(sqrt(count))`, `rows = ceil(count / cols)`
   - 每个窗口宽度 = `floor(workArea.width / cols) - 10px`（10px 间距）
   - 每个窗口高度 = `floor(workArea.height / rows) - 10px`
5. 对每个目标窗口依次执行：
   - `showWindow(hwnd, 'restore')` — 先从最小化恢复
   - `setWindowPosition(hwnd, {x, y, width, height})` — 移动到计算位置

**返回：** `true`（有窗口时）或 `false`（无窗口时）

**布局示意（2 个窗口）：**
```
┌──────────────────────┬──────────────────────┐
│                      │                      │
│     窗口 #0          │     窗口 #1          │
│   (envIds[0])        │   (envIds[1])        │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

**布局示意（3 个窗口）：**
```
┌──────────────────────┬──────────────────────┐
│                      │                      │
│     窗口 #0          │     窗口 #1          │
│                      │                      │
├──────────────────────┴──────────────────────┤
│                  窗口 #2                     │
└──────────────────────────────────────────────┘
```

**布局示意（4 个窗口）：**
```
┌──────────────────────┬──────────────────────┐
│     窗口 #0          │     窗口 #1          │
├──────────────────────┼──────────────────────┤
│     窗口 #2          │     窗口 #3          │
└──────────────────────┴──────────────────────┘
```

---

## 3. C++ 原生模块接口

编译产物：`native/win32-window/build/Release/win32_window.node`

### 3.1 数据结构

```typescript
interface WindowInfo {
  hwnd: number        // 窗口句柄（HWND 转数值）
  title: string       // 窗口标题（UTF-8 编码）
  pid: number         // 所属进程 PID
  isVisible: boolean  // 是否可见（非最小化状态）
}

interface WindowPosition {
  x: number           // 左上角 X 坐标（相对屏幕）
  y: number           // 左上角 Y 坐标
  width: number       // 窗口宽度（像素）
  height: number      // 窗口高度（像素）
}

interface MonitorInfo {
  id: string           // 设备名（如 '\\\\.\\DISPLAY1'）
  isPrimary: boolean   // 是否主显示器
  bounds: WindowPosition   // 显示器完整物理边界
  workArea: WindowPosition // 工作区（排除任务栏/停靠区域）
}
```

### 3.2 方法列表

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findWindowByPid(pid: number)` | 进程 PID | `WindowInfo[]` | 通过 PID + 进程树查找所有顶级窗口（仅 chrome.exe/msedge.exe） |
| `findAllBrowserWindows()` | 无 | `WindowInfo[]` | 全局枚举所有浏览器窗口（按类名 + 进程名过滤） |
| `setWindowPosition(hwnd, pos)` | hwnd + WindowPosition | `boolean` | 设置窗口位置和大小（SWP_NOZORDER \| SWP_NOACTIVATE \| SWP_SHOWWINDOW） |
| `showWindow(hwnd, cmd)` | hwnd + cmd 字符串 | `boolean` | 控制窗口状态：maximize/minimize/restore/show/hide |
| `isWindowValid(hwnd)` | hwnd | `boolean` | 检查窗口句柄是否有效（IsWindow） |
| `getWindowPosition(hwnd)` | hwnd | `WindowPosition \| null` | 获取窗口位置（GetWindowRect） |
| `getMonitors()` | 无 | `MonitorInfo[]` | 获取所有显示器信息 |
| `arrangeWindows(hwnds, positions?)` | hwnd 数组 + 可选位置数组 | `boolean` | 批量排列窗口 |

### 3.3 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `isNativeLoaded` | `true` | 原生模块加载成功标识 |

---

## 4. PID 精确查找算法

### 4.1 问题背景

Chrome 采用多进程架构：

```
chrome.exe (PID=12345, Browser 主进程, spawn 返回的 PID)
  ├── chrome.exe (PID=12346, GPU 进程)
  ├── chrome.exe (PID=12347, Renderer 进程)
  ├── chrome.exe (PID=12348, Utility 进程)
  └── chrome.exe (PID=12349, Plugin 进程)
```

`LaunchService.launch()` 通过 `spawn()` 启动浏览器后记录的是 **Browser 主进程 PID**。但主窗口 HWND 所属的进程可能不等于这个 PID（虽然实际经验中通常一致），因此需要进程树兜底。

### 4.2 算法流程

```
输入: targetPid = launchService.getPid(envId)

Step 1: collectProcessTree(targetPid)
  ├─ 初始集合 = {targetPid}
  ├─ BFS 循环:
  │    CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS)
  │    遍历所有进程:
  │       若 parentPid ∈ 集合 ∧ currentPid ∉ 集合
  │          → 加入 currentPid
  │    直到一轮无新发现
  └─ 输出 pidSet = {targetPid, 所有后代子进程 PID}

Step 2: EnumWindows(EnumWindowsProc, &ctx)
  EnumWindowsProc 对每个顶级窗口:
  ├─ 跳过有 owner 的子窗口
  ├─ GetWindowThreadProcessId(hwnd) → windowPid
  ├─ 跳过空标题 / Program Manager
  ├─ QueryFullProcessImageNameW → 验证进程名
  │    ├─ chrome.exe ✓ → 收集
  │    ├─ msedge.exe ✓ → 收集
  │    └─ 其他（electron.exe/Code.exe 等）✗ → 跳过
  └─ 收集到 ctx.results（包含所有 Chromium 类名窗口）

Step 3: 过滤
  从 ctx.results 中筛选 w.pid ∈ pidSet 的窗口
  → 返回精确匹配的窗口列表
```

### 4.3 时间复杂度

| 步骤 | 操作 | 复杂度 |
|------|------|--------|
| 进程树收集 | BFS 遍历系统进程表 | O(P)，P = 系统进程总数（通常 < 500） |
| 窗口枚举 | EnumWindows 遍历所有顶级窗口 | O(W)，W = 顶级窗口数（通常 < 200） |
| 进程名验证 | OpenProcess + QueryFullProcessImageNameW | O(W) |
| 结果过滤 | std::set::count 查找 | O(W × log P) |

**总开销：< 50ms**（实测）

---

## 5. 延迟加载机制

### 5.1 为什么需要延迟加载？

Vite/Rollup 在构建 Electron 主进程代码时（`dist-electron/main/`），会静态分析 import/require 依赖。

如果在模块顶层执行 `require('win32_window.node')`：
1. Vite 尝试将 `.node` 二进制文件当作 JS 解析 → **构建失败或截断**
2. Rollup 无法理解原生二进制 → **tree-shake 掉整个 WindowManager 相关代码**
3. 表现：IPC handler 注册了但运行时报 "No handler registered for 'xxx'"

### 5.2 解决方案

使用 **ES Proxy** 包装原生模块，推迟 require 到首次方法调用时：

```typescript
// WindowManager.ts — 核心实现
let _nativeModule: any = null

function getNativeModule(): any {
  if (_nativeModule) return _nativeModule

  const candidates = [
    path.join(process.cwd(), 'native/win32-window/build/Release/win32_window.node'),
    path.join(__dirname, '../../native/win32-window/build/Release/win32_window.node'),
    path.join(__dirname, '../native/win32-window/build/Release/win32_window.node'),
  ]
  for (const p of candidates) {
    try { _nativeModule = require(p); return _nativeModule }
    catch { /* try next */ }
  }
  throw new Error('Native window module unavailable')
}

export const windowManager = new Proxy({} as any, {
  get(_target, prop: string) {
    const native = getNativeModule()
    const value = native[prop]
    if (value === undefined) throw new Error(`Native window module does not export "${prop}"`)
    return typeof value === 'function' ? value.bind(native) : value
  }
})
```

**配合 vite.config.ts external 配置：**
```typescript
external: ['electron', 'electron-store', 'win32-window', '.node']
```

### 5.3 原生模块强依赖

当 `.node` 文件不存在或加载失败时，窗口控制必须显式失败并记录加载错误。禁止返回空数据、false 或模拟显示器数据，否则会掩盖窗口同步和排列问题。

---

## 6. 编译与部署

### 6.1 编译环境要求

- Node.js >= 18
- Python 3.x（node-gyp 依赖）
- Visual Studio 2022（MSBuild，含 C++ 桌面开发负载）
- node-gyp >= 10

### 6.2 编译命令

```bash
cd native/win32-window
npx node-gyp rebuild
```

编译产物：`build/Release/win32_window.node`

### 6.3 关键依赖头文件

```cpp
#include <napi.h>          // Node.js N-API
#include <windows.h>       // Win32 API 基础（EnumWindows, SetWindowPos, ...）
#include <tlhelp32.h>      // Toolhelp32（CreateToolhelp32Snapshot, ProcessEntry）
#include <vector>
#include <string>
#include <set>             // 进程树 PID 集合
```

### 6.4 运行时加载路径优先级

```
1. dist-electron/main/../../native/win32-window/build/Release/win32_window.node
   ↑ 开发环境：dev server 运行时的相对路径
2. dist-electron/main/../native/win32-window/build/Release/win32_window.node
   ↑ 备选路径（打包后可能的结构变化）
```

---

## 7. 前端集成

### 7.1 UI 入口

文件：`src/views/SessionsView.vue`

```vue
<button @click="arrangeWindows" :disabled="runningSessions.length === 0">排列</button>
<button @click="maximizeAll" :disabled="runningSessions.length === 0">最大化</button>
<button @click="minimizeAll" :disabled="runningSessions.length === 0">最小化</button>
```

### 7.2 调用示例

```typescript
// 获取当前运行中的环境 ID 列表
const envIds = runningSessions.value.map((e: any) => e.id)

// 排列窗口
await window.electronAPI.invoke('windows-arrange', { mode: 'grid', envIds })

// 最大化全部
await window.electronAPI.invoke('windows-maximize', { envIds })

// 最小化全部
await window.electronAPI.invoke('windows-minimize', { envIds })
```

---

## 8. 已知限制与待办

| # | 限制 | 状态 | 备注 |
|---|------|------|------|
| 1 | 仅支持 Windows 平台 | By Design | C++ 模块使用 Win32 API，macOS/Linux 需独立实现 |
| 2 | `findAllBrowserWindows` 不再被窗口操作使用 | OK | 改为精确 PID 模式，此方法保留作为诊断工具 |
| 3 | 排列模式仅支持 grid | 待扩展 | 预留 mode 参数，可扩展 horizontal/vertical/cascade |
| 4 | 多显示器排列只使用主显示器 | 待优化 | 未来可根据窗口数量跨显示器分配 |
| 5 | 窗口间距硬编码为 10px | 待优化 | 可考虑可配置或自适应 |
| 6 | 无窗口拖拽吸附功能 | 未来 | 属于高级交互，不在当前 scope |
