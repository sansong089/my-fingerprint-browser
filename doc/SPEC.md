# Fingerprint Browser — 项目规格文档

> **项目名称**: my-fingerprint-browser
> **版本**: 1.0.0
> **描述**: 基于 Electron 的多环境指纹浏览器
> **最后更新**: 2026-04-17

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈与依赖](#2-技术栈与依赖)
- [3. 项目结构](#3-项目结构)
- [4. 架构设计](#4-架构设计)
  - [4.1 整体架构](#41-整体架构)
  - [4.2 进程模型](#42-进程模型)
  - [4.3 数据流](#43-数据流)
  - [4.4 核心设计原则](#44-核心设计原则)
- [5. Electron 主进程](#5-electron-主进程)
  - [5.1 入口文件 (index.ts)](#51-入口文件-indexts)
  - [5.2 IPC 通道总览](#52-ipc-通道总览)
  - [5.3 服务层 (services)](#53-服务层-services)
  - [5.4 管理器层 (managers)](#54-管理器层-managers)
  - [5.5 控制器层 (controllers)](#55-控制器层-controllers)
  - [5.6 预加载脚本 (preload)](#56-预加载脚本-preload)
- [6. 前端渲染进程](#6-前端渲染进程)
  - [6.1 路由配置](#61-路由配置)
  - [6.2 状态管理 (Vuex Store)](#62-状态管理-vuex-store)
  - [6.3 页面视图](#63-页面视图)
  - [6.4 组件库](#64-组件库)
  - [6.5 类型系统](#65-类型系统)
- [7. C++ 原生模块 (win32-window)](#7-c-原生模块-win32-window)
  - [7.1 模块接口](#71-模块接口)
  - [7.2 PID 精确查找算法](#72-pid-精确查找算法)
  - [7.3 延迟加载机制](#73-延迟加载机制)
  - [8. 编译与部署](#8-编译与部署)
- [9. 功能模块详述](#9-功能模块详述)
  - [9.1 环境管理](#91-环境管理)
  - [9.2 浏览器启动 (LaunchService)](#92-浏览器启动-launchservice)
  - [9.3 CDP 集成](#93-cdp-集成)
  - [9.4 同步操作 (SyncController)](#94-同步操作-synccontroller)
  - [9.5 脚本自动化 (ScriptManager)](#95-脚本自动化-scriptmanager)
  - [9.6 Cookie 管理](#96-cookie-管理)
  - [9.7 窗口管理](#97-窗口管理)
  - [9.8 代理管理](#98-代理管理)
  - [9.9 分组与模板](#99-分组与模板)
  - [9.10 导入/导出](#910-导入导出)
  - [9.11 活动日志](#911-活动日志)
  - [9.12 插件管理（规划中）](#912-插件管理规划中)
- [10. 安全模型](#10-安全模型)
- [11. 已知限制与待办](#11-已知限制与待办)

---

## 1. 项目概览

| 属性 | 值 |
|------|-----|
| **名称** | Fingerprint Browser (my-fingerprint-browser) |
| **类型** | Electron 桌面应用 |
| **定位** | 多环境指纹浏览器——每个环境独立 UA、硬件指纹、代理、Cookie 隔离 |
| **平台** | Windows（主要目标），兼容 macOS / Linux |
| **App ID** | `com.fingerprint.browser` |
| **构建输出** | NSIS 安装包 (`release/`) |

### 核心功能矩阵

| 功能模块 | 说明 | 状态 |
|---------|------|------|
| 多环境管理 | 创建/编辑/删除指纹环境，独立 userDataDir + CDP 端口 | ✅ |
| 浏览器生命周期 | 启动/关闭/批量操作，PID 追踪，退出事件通知 | ✅ |
| 指纹伪装 | seed 驱动的 platform/brand/concurrency/timezone/lang 伪装参数 | ✅ |
| 代理支持 | HTTP/HTTPS/SOCKS5 代理，含认证，连通性检测 | ✅ |
| CDP 深度集成 | Cookie CRUD、脚本录制/回放、同步操作的协议基础 | ✅ |
| 多浏览器同步 | 主浏览器 → N 个镜像浏览器的输入事件转发 | ✅ |
| 脚本自动化 | 录制 DOM 操作 → 生成步骤 → 回放执行 | ✅ |
| Cookie 管理 | 获取/设置/导入/导出（EditThisCookie JSON 格式） | ✅ |
| Windows 原生窗口控制 | 排列/最大化/最小化/恢复 Chrome 窗口（C++ N-API） | ✅ |
| 分组管理 | 环境分组 + 颜色标识 | ✅ |
| 代理池管理 | 代理 CRUD + 可用性检测 | ✅ |
| 模板系统 | 预设指纹配置模板 | ✅ |
| 环境导入/导出 | JSON 批量导入/导出（上限 500 条） | ✅ |
| 活动日志 | 全局操作审计日志（buffer + 定时刷盘） | ✅ |
| 插件管理（规划中） | 应用侧安装/卸载 + 新环境继承 + 本地卸载抑制语义，受 Step 0 后端验证门控 | 🚧 规划中 |

---

## 2. 技术栈与依赖

### 运行时依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `vue` | ^3.4.21 | 前端框架（Composition API） |
| `vue-router` | ^4.3.0 | SPA 路由（Hash 模式） |
| `vuex` | ^4.1.0 | 全局状态管理（8 modules） |
| `electron-store` | ^8.2.0 | Electron 持久化存储（JSON 文件） |
| `uuid` | ^9.0.1 | UUID 生成（activity log ID） |
| `lucide-vue-next` | ^1.0.0 | 图标库 |

### 开发依赖

| 包名 | 用途 |
|------|------|
| `electron` ^29.1.1 | Electron 运行时 |
| `electron-builder` ^24.13.3 | NSIS 安装包打包 |
| `vite` ^5.1.5 | 构建工具（主进程 + 渲染进程） |
| `vite-plugin-electron` ^0.28.4 | Electron 集成（main + preload 入口） |
| `vite-plugin-electron-renderer` ^0.14.5 | 渲染进程 Node API 支持 |
| `@vitejs/plugin-vue` ^5.0.4 | Vue SFC 编译 |
| `tailwindcss` ^3.4.1 | 原子化 CSS 框架 |
| `typescript` ^5.4.2 | 类型系统（strict 模式，noImplicitAny: false） |
| `vue-tsc` ^2.0.6 | Vue TypeScript 检查 |

### 原生依赖（C++）

| 依赖 | 用途 |
|------|------|
| Node.js N-API (`napi.h`) | Node.js 原生 addon 接口 |
| Win32 API (`windows.h`) | 窗口枚举/控制 |
| Toolhelp32 (`tlhelp32.h`) | 进程树遍历 |
| Visual Studio 2022 MSBuild | C++ 编译 |
| node-gyp >= 10 | Node.js 原生模块构建工具链 |

### 可选运行时依赖

| 包名 | 用途 | 加载方式 |
|------|------|----------|
| `chrome-remote-interface` | CDP 协议客户端 | 动态 `require()`（CDPClient.ts） |

---

## 3. 项目结构

```
d:\00-work\mywork\my-fingerprint-browser\
├── electron/                          # Electron 主进程
│   ├── main/
│   │   ├── index.ts                   # 主入口（窗口创建 + 40+ IPC handlers）
│   │   ├── managers/                  # 业务管理器
│   │   │   ├── EnvironmentManager.ts  # 环境增删改查 + 启停 + 批量操作
│   │   │   ├── WindowManager.ts       # Win32 窗口控制（Proxy 延迟加载）
│   │   │   ├── ScriptManager.ts       # 脚本录制/回放引擎
│   │   │   ├── CookieManager.ts        # Cookie CRUD（基于 CDP）
│   │   │   ├── CDPClient.ts           # CDP 协议封装层
│   │   │   ├── CDPServerManager.ts     # CDP 端口分配与管理
│   │   │   ├── IPCValidator.ts        # IPC 参数校验（schema 驱动）
│   │   │   ├── ActivityLogService.ts  # 活动日志（buffer + store）
│   │   │   └── BrowserEventBus.ts     # 主进程→渲染进程事件总线
│   │   ├── services/
│   │   │   ├── StorageService.ts      # 统一持久化（electron-store）
│   │   │   └── LaunchService.ts        # 浏览器 spawn 启动 + PID 管理
│   │   └── controllers/
│   │       └── SyncController.ts      # 多浏览器同步控制器
│   └── preload/
│       └── index.ts                   # contextBridge 安全 IPC 桥
│
├── src/                               # Vue 渲染进程前端
│   ├── main.ts                        # Vite 入口
│   ├── App.vue                        # 根组件（Header + Sidebar + RouterView + StatusBar）
│   ├── router/index.ts                # 6 个路由页面（懒加载）
│   ├── store/
│   │   ├── index.ts                   # Store 聚合（8 modules + global state）
│   │   └── modules/
│   │       ├── environments.ts        # 环境状态 + CRUD actions
│   │       ├── groups.ts              # 分组状态
│   │       ├── proxies.ts             # 代理池状态
│   │       ├── templates.ts           # 模板状态
│   │       ├── scripts.ts             # 脚本状态
│   │       ├── settings.ts            # 应用设置
│   │       ├── logs.ts                # 日志状态
│   │       └── ui.ts                  # UI 状态（侧边栏折叠、选中项等）
│   ├── views/
│   │   ├── Dashboard.vue              # 仪表盘（环境列表 + 会话区域）
│   │   ├── EnvironmentsView.vue       # 环境管理页
│   │   ├── SessionsView.vue           # 运行会话页（窗口排列/最大/最小化）
│   │   ├── OverviewView.vue           # 总览页
│   │   ├── ProxiesView.vue            # 代理管理页
│   │   ├── ScriptsView.vue            # 脚本管理页
│   │   ├── Settings.vue               # 设置页（旧）
│   │   └── SettingsView.vue           # 设置页（新）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.vue          # 顶部工具栏
│   │   │   ├── Sidebar.vue            # 全局导航侧边栏
│   │   │   ├── GroupSidebar.vue       # 分组侧边栏
│   │   │   └── StatusBar.vue          # 底部状态栏
│   │   ├── common/
│   │   │   ├── ConfirmDialog.vue      # 通用确认弹窗
│   │   │   └── Toast.vue              # 轻量提示组件
│   │   ├── EnvironmentEditor.vue      # 环境编辑器（新建/编辑弹窗）
│   │   ├── BatchCreateDialog.vue      # 批量创建对话框
│   │   └── ImportExportDialog.vue    # 导入/导出对话框
│   ├── types/                         # TypeScript 类型定义（权威源镜像）
│   │   ├── index.ts                   # 统一导出
│   │   ├── environment.ts             # Environment / FingerprintConfig / ProxyConfig
│   │   ├── group.ts                   # Group
│   │   ├── proxy.ts                   # Proxy
│   │   ├── settings.ts                # Settings
│   │   ├── template.ts                # ProfileTemplate
│   │   ├── script.ts                  # Script / ScriptStep
│   │   ├── log.ts                     # ActivityLog
│   │   ├── cookie.ts                  # CookieData
│   │   ├── window.ts                  # WindowInfo / WindowPosition / MonitorInfo
│   │   └── ipc.ts                     # IPC 请求参数类型
│   ├── constants/
│   │   └── colors.ts                  # 环境颜色常量
│   ├── utils/
│   │   └── ipcAction.ts               # 统一 IPC 调用管道（loading/error 管理）
│   └── style.css                      # 全局样式（滚动条等）
│
├── native/                            # C++ N-API 原生模块
│   └── win32-window/
│       ├── binding.gyp                # node-gyp 构建配置（C++17, user32.lib, gdi32.lib）
│       ├── index.d.ts                 # TypeScript 类型声明
│       ├── package.json               # 模块元数据
│       └── src/
│           ├── addon.cpp              # N-API 入口（模块初始化 + 方法注册）
│           ├── window_manager.hpp     # WindowManager 类声明
│           ├── window_manager.cpp     # 窗口枚举/查找/控制实现（核心 ~400 行）
│           ├── monitor_manager.hpp    # 显示器管理类声明
│           └── monitor_manager.cpp    # 多显示器枚举/工作区计算
│
├── doc/                               # 项目文档
│   ├── SPEC.md                        # 本文件 — 项目整体规格
│   └── window-manager-spec.md         # 窗口管理模块详细规格
│
├── dist-electron/                     # 主进程编译输出（git ignored）
├── index.html                          # HTML 入口
├── package.json                        # 项目配置与依赖
├── vite.config.ts                      # Vite 构建配置（Electron 插件 + external）
├── tsconfig.json                       # TypeScript 配置（paths alias）
├── tsconfig.node.json                  # Node 端 TypeScript 配置
├── tailwind.config.js                  # Tailwind CSS（primary 蓝色系）
└── postcss.config.js                   # PostCSS（tailwindcss + autoprefixer）
```

---

## 4. 架构设计

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                      渲染进程 (Renderer)                      │
│  ┌─────────┐  ┌──────────┐  ┌──────┐  ┌─────┐  ┌─────────┐  │
│  │Vue Views│  │Vuex Store│  │Router│  │Types│  │Utils    │  │
│  └────┬────┘  └─────┬────┘  └──┬───┘  └──┬──┘  └────┬────┘  │
│       │              │          │         │           │        │
│       └──────────────┴──────────┴─────────┴───────────┘        │
│                              ▼                                  │
│                    ┌──────────────────┐                         │
│                    │  window.electronAPI│ (contextBridge)       │
│                    └────────┬─────────┘                         │
└─────────────────────────────┼───────────────────────────────────┘
                              │ IPC (invoke/on)
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       主进程 (Main)                             │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  index.ts — 窗口创建 + 40+ ipcMain.handle 注册        │     │
│  └─────────────────────┬────────────────────────────────┘     │
│                        │                                      │
│       ┌────────────────┼────────────────┐                     │
│       ▼                ▼                ▼                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │Services  │  │  Managers    │  │ Controllers  │            │
│  │          │  │              │  │              │            │
│  │Storage   │  │Environment   │  │SyncController│            │
│  │Launch    │  │Window (Proxy)│  │              │            │
│  │Service   │  │Script (录放) │  │              │            │
│  │          │  │Cookie (CDP)  │  │              │            │
│  │          │  │CDP Client    │  │              │            │
│  │          │  │IPC Validator │  │              │            │
│  │          │  │Activity Log  │  │              │            │
│  │          │  │Event Bus     │  │              │            │
│  └──────────┘  └──────┬───────┘  └──────────────┘            │
│                        │                                       │
│                        ▼ (lazy require)                        │
│              ┌───────────────────┐                             │
│              │  win32_window.node │ (C++ N-API)               │
│              │  · findWindowByPid │                            │
│              │  · setWindowPosition│                           │
│              │  · showWindow       │                           │
│              │  · getMonitors      │                           │
│              └───────────────────┘                             │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  preload/index.ts — contextBridge 安全桥              │     │
│  └──────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼ (spawn)
                    ┌─────────────────┐
                    │  Chrome / Edge  │ (独立进程)
                    │  --remote-      │
                    │  debugging-port │
                    │  --user-data-dir│
                    │  --proxy-server │
                    │  --fingerprint= │
                    └─────────────────┘
```

### 4.2 进程模型

| 进程 | 技术 | 职责 |
|------|------|------|
| **主进程** | Electron Main | 窗口管理、IPC 调度、持久化、浏览器生命周期、原生模块调用 |
| **渲染进程** | Vue 3 + Vite | UI 展示、用户交互、状态管理 |
| **Chrome 进程** | 外部 spawn | 每个 Environment 一个独立 Chrome 实例，多进程架构（Browser/Renderer/GPU/Utility） |
| **CDP 连接** | chrome-remote-interface | 主进程通过 WebSocket 连接 Chrome DevTools Protocol |

### 4.3 数据流

```
用户操作 → Vue Component → Vuex Action → electronAPI.invoke(channel, params)
    → ipcRenderer.invoke → 主进程 ipcMain.handle
    → Manager/Service 业务逻辑 → electron-store 持久化 / CDP 操作 / Win32 API
    → 返回结果 → 渲染进程 → Vuex Mutation → UI 更新
```

### 4.4 核心设计原则

| 原则 | 实现 |
|------|------|
| **安全 IPC** | `contextIsolation: true`, `nodeIntegration: false`，所有通信通过 `contextBridge.exposeInMainWorld` |
| **精确 PID 匹配** | 窗口操作基于 `envId → launchService.getPid(envId)` → `findWindowByPid(pid)` 精确链路 |
| **进程树遍历** | Chrome 多进程架构下通过 `CreateToolhelp32Snapshot` BFS 遍历进程树 |
| **进程名白名单** | 只接受 `chrome.exe` / `msedge.exe`，排除其他 Chromium 内核应用 |
| **延迟加载** | 原生 `.node` 模块通过 ES Proxy 延迟 require，避免 Vite/Rollup 解析二进制文件 |
| **原生强依赖** | `.node` 不存在或加载失败时必须显式报错，禁止静默替代实现 |
| **Schema 驱动校验** | 所有 IPC handler 通过 `IPCValidator.validate()` 校验参数格式和长度限制 |
| **事件驱动** | `BrowserEventBus` 统一管理主进程→渲染进程的实时推送（浏览器崩溃/退出/同步状态） |
| **类型权威源** | `StorageService.ts` 定义主进程 interface，`src/types/` 为前端镜像，禁止组件中重定义数据模型 |

---

## 5. Electron 主进程

### 5.1 入口文件 (index.ts)

**路径**: `electron/main/index.ts`  
**行数**: ~589 行

**窗口配置：**

| 属性 | 值 |
|------|-----|
| 尺寸 | 1400 × 900 |
| 最小尺寸 | 1024 × 700 |
| nodeIntegration | `false` |
| contextIsolation | `true` |
| sandbox | `false` |
| 开发模式 | 加载 `localhost:5173`，自动打开 DevTools |
| 生产模式 | 加载 `dist/index.html` |

**生命周期钩子：**
- `app.whenReady()`: 创建窗口 + 重置所有环境 running 状态
- `app.on('activate')`: macOS 无窗口时重建
- `app.on('window-all-closed')`: 关闭所有浏览器后退出（非 macOS）
- `app.on('before-quit')`: 刷盘 activity log

### 5.2 IPC 通道总览

共 **40+** 个 IPC 通道，分为以下域：

#### 环境管理（4 个）

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get-environments` | - | `Environment[]` | 获取所有环境 |
| `create-environment` | data (validated) | `Environment` | 创建环境 |
| `update-environment` | id, data (validated) | `Environment \| null` | 更新环境 |
| `delete-environment` | id (validated) | `boolean` | 删除环境（先关浏览器） |

#### 浏览器操作（3 个）

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `launch-browser` | envId (validated) | `boolean` | 启动浏览器实例 |
| `close-browser` | envId (validated) | `boolean` | 关闭浏览器实例 |
| `get-browser-status` | envId | `boolean` | 查询运行状态 |

#### 同步操作（3 个）

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `start-sync` | mainEnvId, mirrorEnvIds (validated) | `boolean` | 启动多浏览器同步 |
| `stop-sync` | - | `true` | 停止同步 |
| `close-all` | - | `true` | 关闭所有浏览器 |

#### 设置（2 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-settings` | - | `Settings` |
| `save-settings` | settings (validated) | `true` |

#### 分组管理（4 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-groups` | - | `Group[]` |
| `groups-create` | data (validated) | `Group` |
| `groups-update` | data (validated) | `true` |
| `groups-delete` | data | `true` |

#### 代理管理（5 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-proxies` | - | `Proxy[]` |
| `proxies-create` | data (validated) | `Proxy` |
| `proxies-update` | data (validated) | `true` |
| `proxies-delete` | data | `true` |
| `proxy-test` | `{id}` | `{status, latency}` |

#### 模板管理（4 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-templates` | - | `ProfileTemplate[]` |
| `templates-create` | data | `ProfileTemplate` |
| `templates-update` | data | `true` |
| `templates-delete` | data | `true` |

#### 脚本管理（5 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-scripts` | - | `Script[]` |
| `scripts-create` | data | `Script` |
| `scripts-update` | data | `true` |
| `scripts-delete` | data | `true` |
| `run-script` | `{scriptId, envId}` | `{success, error?}` |
| `start-record` | - | `boolean` |
| `stop-record` | - | `Script` |

#### Cookie 管理（4 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `cookie-get` | `{envId}` | `CookieData[]` |
| `cookie-set` | `{envId, cookies}` | `boolean` |
| `cookie-import` | `{envId, cookies[]}` | `{success, failed}` |
| `cookie-export` | `{envId}` | `CookieData[]` |

#### 窗口管理（5 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `windows-maximize` | `{envIds[]}` | `true` |
| `windows-minimize` | `{envIds[]}` | `true` |
| `windows-restore` | `{envIds[]}` | `true` |
| `windows-arrange` | `{mode, envIds[]}` | `true \| false` |
| `get-monitors` | - | `MonitorInfo[]` |

#### 其他（4 个）

| Channel | 参数 | 返回 |
|---------|------|------|
| `get-main-window` | - | `BrowserWindow` |
| `export-environments` | `{envIds[]}` | 部分环境数据 |
| `import-environments` | `{environments[], format?}` | `{imported, total}` |
| `activity-logs` | `{envId?, limit?}` | `ActivityLog[]` |
| `batch-launch` | `{envIds[]}` | `{success[], failed[]}` |
| `batch-close` | `{envIds[]}` | `{success[], failed[]}` |

### 5.3 服务层 (services)

#### StorageService

**路径**: `electron/main/services/StorageService.ts`  
**职责**: 统一持久化存储服务（Single Source of Truth）

**数据实体（6 类）：**

| 实体 | 存储键 | 说明 |
|------|--------|------|
| `environments` | `environments[]` | 环境列表（核心数据） |
| `settings` | `settings` | 应用设置（浏览器路径、默认平台等） |
| `groups` | `groups[]` | 分组定义 |
| `proxies` | `proxies[]` | 代理池 |
| `templates` | `templates[]` | 指纹预设模板 |
| `scripts` | `scripts[]` | 自动化脚本 |

**存储引擎**: `electron-store`（JSON 文件，name: `fingerprint-browser-data`）  
**接口风格**: 标准 CRUD — `getXxx()` / `addXxx()` / `updateXxx(id, data)` / `deleteXxx(id)`

**Settings 默认值：**

```typescript
{
  browserPath: '',
  defaultPlatform: 'windows',
  defaultTimezone: 'Asia/Shanghai',
  defaultLang: 'en-US',
  autoStart: false,
  minimizeToTray: false,
  syncDelay: 50
}
```

**类型定义（权威源）：**

```typescript
interface FingerprintConfig {
  seed: number
  platform: 'windows' | 'linux' | 'macos'
  platformVersion?: string
  brand?: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  brandVersion?: string
  hardwareConcurrency?: number
  timezone?: string
  lang?: string
  disabledSpoofing?: string[]
}

interface ProxyConfig {
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

interface Environment {
  id: string
  name: string
  fingerprint: FingerprintConfig
  proxy?: ProxyConfig
  userDataDir: string
  cdpPort: number
  createdAt: string
  lastUsed: string
  tags: string[]
  color: string
  status: 'stopped' | 'running' | 'error'
  url?: string
  groupId?: string
  templateId?: string
  launchedAt?: string
}
```

#### LaunchService

**路径**: `electron/main/services/LaunchService.ts`  
**行数**: ~304 行  
**职责**: 浏览器进程的完整生命周期管理

**核心能力：**

| 方法 | 说明 |
|------|------|
| `launch(envId, options)` | spawn 启动 Chrome，等待 CDP 就绪后记录 PID |
| `close(envId)` | taskkill 强制关闭（Windows）/ kill（其他平台） |
| `closeAll()` | 关闭所有已记录的浏览器进程 |
| `isRunning(envId)` | 检查进程是否存活且未 killed |
| `getPid(envId)` | 获取启动时记录的 PID（供窗口管理使用） |
| `buildArgs(options)` | 构建 Chrome CLI 启动参数 |
| `waitForCDPReady(port, timeout?)` | 轮询检测 CDP 端口就绪 |

**浏览器路径检测优先级：**
1. 用户在 Settings 中指定的路径
2. 平台常见安装路径（Windows: Program Files/Program Files (x86)）
3. 未找到有效路径时终止启动并提示用户配置路径

**Chrome 启动参数：**

| 参数类别 | 参数 | 说明 |
|---------|------|------|
| 基础 | `--user-data-dir=<dir>` | 独立用户数据目录 |
| CDP | `--remote-debugging-port=<port>` | DevTools Protocol 端口 |
| 安全 | `--remote-debugging-address=127.0.0.1` | 仅本地监听 |
| 行为 | `--no-first-run`, `--no-default-browser-check` | 跳过首次向导 |
| 指纹 | `--fingerprint=<seed>` 等 | 指纹种子驱动 |
| 代理 | `--proxy-server=<url>` | HTTP/SOCKS5 代理 |
| 代理认证 | `--proxy-auth=user:pass` | 代理认证信息 |
| 反检测 | `--disable-webrtc-foreground-indicator`, `--disable-detection-forms` | 自动化规避 |

**进程事件监听：**
- `exit` → 从 processes Map 移除 → eventBus 发送 `browser-event:closed`
- `disconnect` → eventBus 发送 `browser-event:crashed`

### 5.4 管理器层 (managers)

#### EnvironmentManager

**路径**: `electron/main/managers/EnvironmentManager.ts`  
**行数**: ~213 行  
**职责**: 环境的业务逻辑层（CRUD + 启停 + 批量操作）

| 方法 | 说明 |
|------|------|
| `resetRunningStatuses()` | 应用启动时将所有 running 状态重置为 stopped |
| `createEnvironment(data)` | 创建环境（生成 ID/userDataDir/cdpPort/color） |
| `updateEnvironment(id, data)` | 更新环境（更新 lastUsed 时间戳） |
| `deleteEnvironment(id)` | 先关闭浏览器再删除 |
| `launchBrowser(id)` | 委托 LaunchService，更新 status 为 running |
| `closeBrowser(id)` | 委托 LaunchService，更新 status 为 stopped |
| `closeAllBrowsers()` | 关闭所有运行中的环境 |
| `batchLaunch(envIds[])` | 并发启动，返回 `{success[], failed[]}` |
| `batchClose(envIds[])` | 逐个关闭，返回结果明细 |
| `batchDelete(envIds[])` | 逐个删除 |

**ID 生成规则**: `env_${Date.now()}_${random(36).substr(2, 9)}`  
**CDP 端口分配范围**: 9222–9322（自动寻找未占用端口）  
**颜色池**: 8 色（蓝/绿/黄/红/紫/粉/青/ lime），随机选取

#### WindowManager

**路径**: `electron/main/managers/WindowManager.ts`  
**行数**: ~121 行  
**职责**: Win32 窗口控制的 JS 适配层（详见 `doc/window-manager-spec.md`）

**关键设计：ES Proxy 延迟加载**

```typescript
export const windowManager = new Proxy({} as any, {
  get(_target, prop: string) {
    const native = getNativeModule()   // 首次调用才 require .node
    const value = native[prop]
    if (value === undefined) throw new Error(`Native window module does not export "${prop}"`)
    return typeof value === 'function' ? value.bind(native) : value
  }
})
```

**原生模块不可用**: 当 `.node` 文件不存在或加载失败时，窗口控制必须立即显式失败，并在
`output/logs/window-manager.log` 记录所有尝试路径和错误原因。禁止返回空窗口、false 或模拟显示器数据。

#### ScriptManager

**路径**: `electron/main/managers/ScriptManager.ts`  
**行数**: ~354 行  
**职责**: 脚本录制与回放引擎

**录制流程：**
1. 连接到运行中环境的 CDP 端口
2. 注入 DOM 事件捕获脚本（click/input/scroll/navigate）
3. 自动生成 CSS 选择器（ID > class > tag path）
4. 收集操作序列为 `ScriptStep[]`
5. 停止录制时保存为 Script 对象

**支持的步骤类型：**

| 步骤类型 | 数据 | 回放方式 |
|---------|------|---------|
| `click` | selector, offsetX, offsetY | `document.querySelector(sel).click()` |
| `input` | selector, value | focus + setValue + dispatch input |
| `scroll` | selector | `scrollIntoView({behavior: 'smooth'})` |
| `navigate` | URL | `Page.navigate` CDP 命令 |
| `wait` | delay (ms) | `setTimeout` |

**回放流程：**
1. 按 Script.steps 数组顺序遍历
2. 每步通过 CDP `Runtime.evaluate` 在浏览器内执行
3. 步骤间延迟可配置（单步最大 5000ms）
4. 记录 activity log

#### CookieManager

**路径**: `electron/main/managers/CookieManager.ts`  
**行数**: ~119 行  
**职责**: 基于 CDP 的 Cookie CRUD

| 方法 | 说明 |
|------|------|
| `getAllCookies(cdpPort)` | `Network.getAllCookies` → 标准化为 `CookieData[]` |
| `setCookie(cdpPort, cookie)` | `Network.setCookie` |
| `importCookies(cdpPort, cookies[])` | 批量设置，返回 `{success, failed}` |
| `exportCookies(cdpPort)` | 等价于 getAllCookies |
| `deleteCookie(cdpPort, name, domain)` | `Network.deleteCookies` |

**连接策略**: 用完即关（connect → 操作 → close），不保持长连接。

#### CDPClient

**路径**: `electron/main/managers/CDPClient.ts`  
**行数**: ~115 行  
**职责**: Chrome DevTools Protocol 统一封装层

**特性：**
- 动态 `require('chrome-remote-interface')`（可选依赖）
- 连接管理：`connect()` / `close()` / `isConnected`
- 命令发送：`send(method, params)`
- 便捷方法：`getAllCookies()` / `setCookie()` / `evaluate(expression)`

**CookieData 类型（内联定义）：**

```typescript
interface CookieData {
  name: string; value: string; domain: string; path?: string;
  secure?: boolean; httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None'; expires?: number;
}
```

#### IPCValidator

**路径**: `electron/main/managers/IPCValidator.ts`  
**行数**: ~122 行  
**职责**: Schema 驱动的 IPC 参数校验

**覆盖的通道 schema：**

| 通道 | 校验规则 |
|------|---------|
| `create-environment` | name: string[1,100] |
| `update-environment` | id: string[required] |
| `delete-environment` | id: string[required] |
| `launch-browser` | envId: string[required] |
| `close-browser` | envId: string[required] |
| `batch-launch` | envIds: array[required] |
| `batch-close` | envIds: array[required] |
| `groups-create` | name: string[1,50], color: string |
| `proxies-create` | name/host/port 必填，type 可选 |
| `save-settings` | browserPath/defaultPlatform 字符串 |
| `start-sync` | mainEnvId + mirrorEnvIds 必填 |
| `activity-logs` | envId/limit 可选 |

无 schema 的通道直接放行（向后兼容）。校验失败抛 Error 给渲染进程。

#### ActivityLogService

**路径**: `electron/main/managers/ActivityLogService.ts`  
**行数**: ~107 行  
**职责**: 独立的全局操作审计日志

**存储机制：**
- 内存 buffer（满 50 条触发 flush）
- 独立 electron-store 文件（`activity-logs.json`）
- 1000 条上限裁剪（FIFO）
- 定时刷盘间隔 5 秒
- app quit 前强制 flush

**日志条目结构：**

```typescript
interface ActivityLog {
  id: string           // crypto.randomUUID()
  timestamp: string    // ISO 8601
  envId: string        // 环境ID 或 'system'
  action: string       // create/delete/launch/close/import/export/...
  details: string      // 人类可读描述
}
```

**查询 API:** 支持按 `envId` 过滤 + `limit` 限制，按 timestamp 降序。

#### BrowserEventBus

**路径**: `electron/main/managers/BrowserEventBus.ts`  
**行数**: ~60 行  
**职责**: 主进程 → 渲染进程的事件推送总线

**双通道推送：**
1. `webContents.send('app-event', channel, data)` → 渲染进程
2. 本地 `Map<string, Set<Handler>>` 广播 → 主进程内模块间

**事件类型：**
- `launched` / `closed` / `crashed` — 浏览器生命周期
- `sync-event` — 同步操作状态变化
- `script-event` — 录制开始/停止/回放完成
- `proxy-tested` — 代理检测结果

### 5.5 控制器层 (controllers)

#### SyncController

**路径**: `electron/main/controllers/SyncController.ts`  
**行数**: ~285 行  
**职责**: 多浏览器输入同步控制器

**工作原理：**
1. 连接主浏览器 CDP → `Input.enable`
2. 连接所有镜像浏览器 CDP → `Input.enable`
3. 向主浏览器注入 DOM 事件拦截脚本（monkey-patch addEventListener）
4. 轮询主浏览器中的事件队列（`__FPB_SYNC_EVENTS__`）
5. 将事件转发到镜像浏览器（`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`）

**支持的事件类型：**
- 鼠标：click, mousedown, mouseup, mousemove
- 键盘：keydown, keyup
- 转发延迟：可配置（default 50ms，最小 30ms）

### 5.6 预加载脚本 (preload)

**路径**: `electron/preload/index.ts`  
**行数**: ~94 行

**暴露给渲染进程的 API（`window.electronAPI`）：**

| 方法 | 签名 | 说明 |
|------|------|------|
| `getMainWindow` | `() => Promise<unknown>` | 获取主窗口引用 |
| `getEnvironments` | `<T>() => Promise<T>` | 获取环境列表 |
| `createEnvironment` | `(data) => Promise<unknown>` | 创建环境 |
| `updateEnvironment` | `(id, data) => Promise<unknown>` | 更新环境 |
| `deleteEnvironment` | `(id) => Promise<boolean>` | 删除环境 |
| `launchBrowser` | `(envId) => Promise<boolean>` | 启动浏览器 |
| `closeBrowser` | `(envId) => Promise<boolean>` | 关闭浏览器 |
| `getBrowserStatus` | `(envId) => Promise<unknown>` | 查询状态 |
| `startSync` | `(mainId, mirrors) => Promise<boolean>` | 开始同步 |
| `stopSync` | `() => Promise<boolean>` | 停止同步 |
| `closeAll` | `() => Promise<boolean>` | 关闭全部 |
| `getSettings` | `() => Promise<unknown>` | 获取设置 |
| `saveSettings` | `(settings) => Promise<boolean>` | 保存设置 |
| `invoke` | `<T>(channel, ...args) => Promise<T>` | **通用 IPC 方法**（新增通道无需改 preload） |
| `onAppEvent` | `(channel, callback) => Handler` | 订阅主进程事件推送 |
| `offAppEvent` | `(channel, handler) => void` | 取消订阅 |
| `onBrowserEvent` | `(callback) => void` | [保留] 旧版事件接口 |
| `platform` | `string` | 当前平台 |
| `versions` | `{node, chrome, electron}` | 版本号 |

---

## 6. 前端渲染进程

### 6.1 路由配置

**路径**: `src/router/index.ts`

| 路径 | 名称 | 组件 | 说明 |
|------|------|------|------|
| `/` | Overview | `OverviewView.vue` | 总览仪表盘 |
| `/environments` | Environments | `EnvironmentsView.vue` | 环境管理 |
| `/sessions` | Sessions | `SessionsView.vue` | 运行会话（窗口操作） |
| `/proxies` | Proxies | `ProxiesView.vue` | 代理管理 |
| `/scripts` | Scripts | `ScriptsView.vue` | 脚本管理 |
| `/settings` | Settings | `SettingsView.vue` | 应用设置 |

使用 Hash History（`createWebHashHistory()`），全部懒加载。

### 6.2 状态管理 (Vuex Store)

**路径**: `src/store/index.ts`

**全局 State：**

```typescript
state: () => ({
  globalLoading: false,
  globalError: null as string | null,
})
```

**8 个 Module：**

| Module | 文件 | 职责 |
|--------|------|------|
| `environments` | `modules/environments.ts` | 环境列表 + CRUD + 启停 + loadingKeys |
| `groups` | `modules/groups.ts` | 分组列表 + CRUD |
| `proxies` | `modules/proxies.ts` | 代理池 + CRUD + 检测状态 |
| `scripts` | `modules/scripts.ts` | 脚本列表 + CRUD |
| `settings` | `modules/settings.ts` | 应用设置 |
| `logs` | `modules/logs.ts` | 日志展示 |
| `ui` | `modules/ui.ts` | UI 状态（sidebarCollapsed, selectedEnvIds 等） |

**environments module 核心 Getters：**

| Getter | 说明 |
|--------|------|
| `runningSessions` | `status === 'running'` 的环境（即"会话"） |
| `runningCount` | 运行中数量 |
| `stoppedEnvironments` | 已停止的环境 |
| `totalCount` | 总数 |
| `getById(id)` | 按 ID 查找 |
| `getByGroup(groupId)` | 按分组筛选 |
| `ungrouped` | 未分组的环境 |

**命名空间**: 除 ui 外所有 module 使用 `namespaced: true`。跨 module 调用通过 `root: true`（如 environments 读取 groups.list）。

### 6.3 页面视图

#### Dashboard.vue（~299 行）

左侧面板：环境搜索/列表/选中操作 + 新建按钮  
右侧面板：运行会话网格/列表视图 + 工具栏  
功能：单启/单停/批量启动/批量删除/同步模式/关闭全部/刷新

#### SessionsView.vue（~6.4 KB）

运行中会话管理页  
核心功能：**排列窗口 / 最大化 / 最小化** 按钮  
调用 `window.electronAPI.invoke('windows-arrange', {mode, envIds})`

#### EnvironmentsView.vue（~11.25 KB）

环境管理主页，包含环境卡片列表、搜索过滤、分组筛选、批量操作

#### ProxiesView.vue（~6.84 KB）

代理管理页，CRUD + TCP 连通性检测（5 秒超时）

#### ScriptsView.vue（~2.83 KB）

脚本列表 + 录制/回放入口

#### OverviewView / SettingsView

总览统计 + 应用配置

### 6.4 组件库

| 组件 | 说明 |
|------|------|
| `AppHeader.vue` | 顶部标题栏 + 全局操作 |
| `Sidebar.vue` | 左侧导航菜单（6 个路由入口） |
| `GroupSidebar.vue` | 分组过滤器 |
| `StatusBar.vue` | 底部状态栏（运行计数等） |
| `EnvironmentEditor.vue` | 环境创建/编辑/批量创建表单弹窗（指纹/代理/标签/分组，通过 count 参数区分模式） |
| `CookieManager.vue` | Cookie 管理弹窗（获取/设置/导入/导出/增删改） |
| `ImportExportDialog.vue` | JSON 导入导出对话框 |
| `ConfirmDialog.vue` | 通用确认对话框（danger 模式） |
| `Toast.vue` | 轻量消息提示 |

### 6.5 类型系统

**路径**: `src/types/`

**权威源规则**：`StorageService.ts` 定义主进程 interface → `src/types/` 是前端镜像 → 所有组件从 `@/types` 导入，禁止重新定义。

| 类型文件 | 导出的类型 |
|---------|-----------|
| `environment.ts` | `FingerprintConfig`, `ProxyConfig`, `Environment` |
| `group.ts` | `Group` |
| `proxy.ts` | `Proxy` |
| `settings.ts` | `Settings` |
| `template.ts` | `ProfileTemplate` |
| `script.ts` | `Script`, `ScriptStep` |
| `log.ts` | `ActivityLog` |
| `cookie.ts` | `CookieData` |
| `window.ts` | `WindowInfo`, `WindowPosition`, `MonitorInfo` |
| `ipc.ts` | 14 个 IPC Params 接口（Create/Update/Batch/Sync/Cookie/Window/Log） |

---

## 7. C++ 原生模块 (win32-window)

> 详细规格见 `doc/window-manager-spec.md`，此处为摘要。

### 7.1 模块接口

**TypeScript 声明**: `native/win32-window/index.d.ts`

| 方法 | 签名 | 说明 |
|------|------|------|
| `findWindowByPid(pid)` | `pid: number → WindowInfo[]` | PID + 进程树查找 |
| `findAllBrowserWindows()` | `→ WindowInfo[]` | 全局浏览器窗口枚举 |
| `setWindowPosition(hwnd, pos)` | `hwnd, pos → boolean` | 设置位置大小 |
| `showWindow(hwnd, cmd)` | `hwnd, cmd → boolean` | 控制 show/hide/max/min/restore |
| `isWindowValid(hwnd)` | `hwnd → boolean` | 句柄有效性检查 |
| `getWindowPosition(hwnd)` | `hwnd → WindowPosition \| null` | 获取位置 |
| `getMonitors()` | `→ MonitorInfo[]` | 多显示器信息 |
| `arrangeWindows(hwnds, positions?)` | `hwnds[], positions? → boolean` | 批量排列 |
| `isNativeLoaded` | `readonly true` | 原生模块标识 |

### 7.2 PID 精确查找算法

**问题**：Chrome 多进程架构下，spawn 返回的 Browser 主进程 PID 可能不等于窗口所属进程 PID。

**解决方案**：`collectProcessTree(targetPid)` BFS 遍历整棵进程树：

```
输入: targetPid
输出: {targetPid, 所有后代子进程 PID}

复杂度: O(P) + O(W×logP) < 50ms
```

配合 `EnumWindowsProc` 中的 `QueryFullProcessImageNameW` 进程名白名单（仅 chrome.exe/msedge.exe）。

### 7.3 延迟加载机制

**原因**：Vite/Rollup 无法解析 `.node` 二进制文件 → tree-shake 截断代码。

**方案**：ES Proxy + 首次调用 lazy require + 原生模块强依赖。

---

## 8. 编译与部署

### 8.1 开发命令

```bash
npm run dev          # 启动开发服务器（Vite HMR + Electron 窗口）
npm run build        # 完整构建：vue-tsc → vite build → electron-builder
npm run build:win    # 仅 Windows NSIS 安装包
npm run preview      # 预览生产构建
```

### 8.2 C++ 模块编译

```bash
cd native/win32-window
npx node-gyp rebuild
```

**产物**: `build/Release/win32_window.node` (~165 KB)

### 8.3 打包配置 (electron-builder)

| 配置项 | 值 |
|--------|-----|
| 输出目录 | `release/` |
| 目标 | NSIS (x64) |
| 图标 | `public/icon.ico` |
| 一键安装 | 否 |
| 自定义安装目录 | 允许 |
| 卸载时清理 AppData | 是 |
| 包含文件 | `dist/**/*`, `dist-electron/**/*` |

### 8.4 Vite 配置要点

```typescript
// electron 入口
entry: 'electron/main/index.ts'     // 主进程 → dist-electron/main/
entry: 'electron/preload/index.ts'  // preload → dist-electron/preload/

// 关键 external（避免 Rollup 尝试解析原生模块）
external: ['electron', 'electron-store', 'win32-window', '.node']

// 路径别名
alias: { '@': resolve(__dirname, 'src') }
```

---

## 9. 功能模块详述

### 9.1 环境管理

**数据模型**：每个 Environment 代表一个独立的浏览器实例配置。

**生命周期状态机**：

```
stopped → starting → running → stopping → stopped
                          ↘ error → stopped
```

**唯一标识**：`env_${timestamp}_${random(36)}`
**数据隔离**：每个环境独立的 `userDataDir`（位于 `%APPDATA%/fingerprint-browser/profiles/`）
**CDP 端口**：9222–9322 范围内自动分配，保证不冲突

### 9.2 浏览器启动 (LaunchService)

**启动流程**：

```
launch(envId, options)
  ├─ 检查已有进程 → 有则先关闭
  ├─ buildArgs(options) → 组装 CLI 参数
  ├─ 检测 browserPath → 用户指定 > 常见路径 > 未找到则终止
  ├─ spawn(browserPath, args, { detached: true })
  ├─ proc.unref() → 让子进程独立于父进程
  └─ waitForCDPReady(port, 5000ms)
      ├─ 轮询 http://127.0.0.:{port}/json/version
      └─ 成功 → 记录 PID 到 processes Map
```

**关闭流程**：Windows 使用 `taskkill /pid /f /t` 强制终止进程树。

### 9.3 CDP 集成

Chrome 以 `--remote-debugging-port` 启动后，暴露 WebSocket 端点供外部连接。

**当前 CDP 使用场景**：

| 场景 | 使用的 CDP Domain | Manager |
|------|-------------------|---------|
| Cookie CRUD | Network | CookieManager |
| 脚本录制 | Page, Runtime | ScriptManager |
| 脚本回放 | Runtime | ScriptManager |
| 同步操作 | Input | SyncController |

### 9.4 同步操作 (SyncController)

**适用场景**：同时在多个浏览器中执行相同操作（如批量注册、多账号养号）。

**架构**：主浏览器捕获事件 → 轮询收集 → 转发到 N 个镜像浏览器

**局限**：当前基于 DOM 事件 monkey-patch + 轮询，非真正的 CDP Input 事件捕获。对于复杂交互可能不够精准。

### 9.5 脚本自动化 (ScriptManager)

**录制**：注入 `__FPB_RECORDING__` 标志 + `__FPB_STEPS__` 数组，拦截 click/input/scroll/navigate 事件。

**选择器生成策略**（优先级）：
1. `#elementId` （CSS escape）
2. `tag.class1.class2`（最多 2 个 class）
3. `tag > parentTag > grandParentTag`（最多 3 层路径）

**回放**：按步骤序号逐一通过 CDP `Runtime.evaluate` 执行 JavaScript 表达式。

### 9.6 Cookie 管理

**基于 CDP（Chrome DevTools Protocol）的 Cookie 操作，需要 Chrome 进程在线。**

**数据模型（CookieData）：**

```typescript
interface CookieData {
  name: string
  value: string
  domain: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number          // Unix 时间戳（秒）
}
```

**格式兼容：EditThisCookie JSON 格式**

**核心能力（通过 CDPClient 封装）：**

| 方法 | CDP 协议 | 说明 |
|------|----------|------|
| `getAllCookies(cdpPort)` | `Network.getAllCookies` | 获取指定环境的所有 Cookie → 标准化为 `CookieData[]` |
| `setCookie(cdpPort, cookie)` | `Network.setCookie` | 设置单个 Cookie |
| `importCookies(cdpPort, cookies[])` | 批量 `Network.setCookie` | 批量导入，返回 `{success, failed}` 统计 |
| `exportCookies(cdpPort)` | 等价于 getAllCookies | 导出全部 Cookie 为 JSON 数组 |
| `deleteCookie(cdpPort, name, domain)` | `Network.deleteCookies` | 按名称+域名删除 |

**连接策略**：用完即关（connect → 操作 → close），不保持长连接。避免占用 CDP 连接数。

**导入流程：**
1. 用户选择文件（Electron dialog.showOpenDialog）
2. 解析 EditThisCookie JSON 格式
3. 逐条调用 `Network.setCookie`
4. 统计成功/失败数并返回
5. 记录 activity log

**导出流程：**
1. 连接到运行中环境的 CDP 端口
2. 调用 `Network.getAllCookies`
3. 标准化为 CookieData[] 数组
4. 通过 Electron dialog.showSaveDialog 写入 JSON 文件

**Cookie IPC 通道：**

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `cookie-get` | `{envId}` | `CookieData[]` | 获取所有 Cookie |
| `cookie-set` | `{envId, cookies: CookieData[]}` | `boolean` | 设置 Cookie（支持批量） |
| `cookie-import` | `{envId, filePath}` | `{success: number, failed: number}` | 从文件导入 |
| `cookie-export` | `{envId}` | `CookieData[]` | 导出为 JSON |

**前端交互入口：**
- 环境右键菜单 →「Cookie 管理」
- 弹窗表格展示当前环境所有 Cookie
- 支持增/删/改操作 + 导入/导出按钮
- 需要环境处于 running 状态（CDP 在线）才能操作

### 9.7 窗口管理

详见 `doc/window-manager-spec.md`。

**排列布局算法**（grid 模式）：
- `cols = ceil(sqrt(N))`, `rows = ceil(N / cols)`
- 每格宽度 = `floor(workAreaWidth / cols) - 10px`
- 每格高度 = `floor(workAreaHeight / rows) - 10px`
- 先 `restore` 再 `setWindowPosition`

### 9.8 代理管理

**代理类型**：HTTP / HTTPS / SOCKS5

**数据模型（Proxy）：**

```typescript
interface Proxy {
  id: string              // uuid
  name: string            // 显示名称
  type: 'http' | 'https' | 'socks5'
  host: string            // 主机地址
  port: number            // 端口
  username?: string       // 认证用户名（可选）
  password?: string       // 认证密码（可选）
  groupId?: string        // 所属分组（可选）
  status: 'unchecked' | 'available' | 'unavailable'
  lastCheck?: string      // 最后检测时间 (ISO 8601)
  createdAt: string
}
```

**连通性检测机制：**

| 属性 | 值 |
|------|-----|
| 检测方式 | TCP Socket 直连（非 HTTP 请求） |
| 超时时间 | 5000ms |
| 检测结果 | `status: 'available', latency: ms` 或 `status: 'unavailable', latency: -1` |

**代理认证支持：**
- LaunchService 启动 Chrome 时传入 `--proxy-server=<type>://<host>:<port>`
- 如有认证信息，额外追加 `--proxy-auth=<username>:<password>`
- 密码当前明文存储于 electron-store JSON（v2.0 阶段），v2.1 计划迁移至 Windows Credential Manager 或加密存储

**代理池管理功能：**
- CRUD 操作（创建/编辑/删除代理条目）
- 可用性检测（单个/批量）
- 环境关联：环境创建/编辑时可选择「从代理池选取」或「自定义代理」
- 代理使用数统计：基于 environments 中引用该 proxyId 的数量
- 分组归属：代理可归入分组，便于分类管理

**代理 IPC 通道：**

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get-proxies` | - | `Proxy[]` | 获取所有代理 |
| `proxies-create` | `{name, type, host, port, username?, password?}` | `Proxy` | 创建代理 |
| `proxies-update` | `{id, ...partial}` | `true` | 更新代理 |
| `proxies-delete` | `{id}` | `true` | 删除代理 |
| `proxy-test` | `{id}` | `{status, latency}` | 连通性检测 |

**代理校验规则（IPCValidator）：**
```typescript
// proxies-create schema
{
  name: z.string().min(1).max(100),
  type: z.enum(['http', 'https', 'socks5']),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(100).optional(),
  password: z.string().max(100).optional(),
}
```

### 9.9 分组管理

**分组**：环境可以归属到一个 Group，用于分类管理和批量操作。Group 有 name + color + order。

**批量创建**：通过 EnvironmentEditor 的 `count` 参数支持批量创建，自动生成带序号的名称（prefix_001, prefix_002...）。

### 9.10 导入/导出

**导出字段**：name, fingerprint, proxy, tags, color, groupId（不含运行状态和内部 ID）

**导入规则**：
- 单次上限 500 条
- 名称截断至 100 字符
- 空名称跳过
- 字段沙箱校验（危险键清理）
- 返回 `{imported, total}` 统计

**格式**：当前仅支持 JSON（CSV 参数预留但未实现完整解析器）

### 9.11 活动日志

**记录范围**：几乎所有写操作（create/delete/launch/close/import/export/script_run/cookie_import/export/group_create）

**存储性能**：buffer 50 条 batch flush + 5 秒定时 flush + 1000 条裁剪。

### 9.12 插件管理（规划中）

**状态**：当前仓库主线尚未落地该功能，必须先完成 `doc/plugin-management-system-plan.md` 中定义的 Step 0 后端证明/ADR，才能进入正式实现。

**已确认的 brownfield 接入点：**
- `StorageService`：新增 `plugins` / `pluginTargets` 等持久化集合，并保持旧数据默认值兼容。
- `EnvironmentManager`：负责新环境继承、启动前 reconcile、删除时清理目标与 profile 本地状态。
- `LaunchService`：当前只注入同步扩展，插件实现不得覆盖既有 `--load-extension` 用法。
- `IPCValidator`：插件写操作通道必须补齐 schema，不能继续依赖“无 schema 直接放行”。
- `src/router/index.ts` / `Sidebar.vue` / Vuex modules：插件页必须作为一等路由与导航入口接入。

**固定语义（评审不可放宽）：**
1. 应用侧安装默认作用于所有现有环境。
2. 新建环境默认继承应用侧已安装插件。
3. 浏览器内部卸载只影响当前 profile，不得篡改应用全局安装意图。
4. 应用侧重新安装只修复缺失/被抑制的环境。
5. v1 优先采用启动期 reconcile，不要求运行中热注入。

**文档入口**：详见 `doc/plugin-management-system-plan.md`。

---

## 10. 安全模型

### 10.1 Electron 安全

| 配置 | 值 | 说明 |
|------|-----|------|
| `nodeIntegration` | `false` | 渲染进程无法直接访问 Node.js API |
| `contextIsolation` | `true` | 主进程和渲染进程的 JS 隔离 |
| `sandbox` | `false` | Preload 脚本有完整的 Node.js 权限 |
| `preload` | 指定脚本 | 唯一的 Node.js ↔ Renderer 桥梁 |

### 10.2 IPC 安全

- **入参校验**：所有 handler 通过 `IPCValidator.validate()` 做 type/length 检查
- **CDP 安全**：`--remote-debugging-address=127.0.0.1` 仅监听本地
- **参数清理**：导入环境时截断超长字符串，移除危险字符

### 10.3 数据安全

- 所有数据存储在 `%APPDATA%/fingerprint-browser/` 下
- 卸载时可选择清理 AppData（NSIS 配置 `deleteAppDataOnUninstall: true`）

---

## 11. 已知限制与待办

| # | 类别 | 限制 | 状态 | 备注 |
|---|------|------|------|------|
| 1 | 插件管理（规划中） | Step 0 后端证明尚未完成，未确认可同时满足 custom `userDataDir`、重启持久化与浏览器侧本地卸载保留语义 | 🚧 | 完成 ADR/双环境手工证明前不得合入正式实现 |
| 1 | 平台 | C++ 原生模块仅支持 Windows | By Design | macOS/Linux 需独立实现（或条件编译禁用窗口功能） |
| 2 | 排列 | 排列模式仅支持 grid | 待扩展 | mode 参数预留 horizontal/vertical/cascade |
| 3 | 排列 | 多显示器排列只用主显示器 | 待优化 | 未来可根据窗口数跨屏分配 |
| 4 | 排列 | 窗口间距硬编码 10px | 待优化 | 可考虑可配置或自适应 |
| 5 | 同步 | 基于轮询的事件转发，非实时流 | 已知 | 对于高频操作可能有延迟感 |
| 6 | 脚本 | 不支持条件分支/循环/变量 | Phase 2 | v2.1 规划中 |
| 7 | 导入 | CSV 导入格式未完整实现 | 待完成 | 当前仅 JSON |
| 8 | 代理 | 无代理认证加密存储 | 待优化 | 密码明文存于 electron-store |
| 9 | 存储 | electron-store 单文件无并发保护 | 低风险 | 大量环境写入时可能丢数据 |
| 10 | UI | 缺少暗色主题 | 待扩展 | Tailwind 配置可扩展 dark mode |
| 11 | 窗口 | 无拖拽吸附功能 | 未来 | 高级交互，不在当前 scope |
| 12 | 浏览器 | 依赖系统安装的 Chrome/Edge | By Design | 未捆绑自定义 Chromium |
| 13 | CDP | chrome-remote-interface 为可选依赖 | OK | 缺失时 CDP 相关功能不可用 |

---

## 附录 A: NPM Scripts 速查

| 命令 | 功能 |
|------|------|
| `npm run dev` | 启动开发服务器（Vite HMR + Electron 窗口自动重启） |
| `npm run build` | vue-tsc 类型检查 → vite 构建 → electron-builder 打包 |
| `npm run build:win` | 仅构建 Windows NSIS 安装包 |
| `npm run preview` | 预览生产构建的应用 |

## 附录 B: 关键文件索引

| 文件 | 行数 | 核心职责 |
|------|------|---------|
| `electron/main/index.ts` | ~589 | 主入口 + 全部 IPC handlers |
| `electron/main/services/LaunchService.ts` | ~304 | 浏览器 spawn/PID/关闭 |
| `electron/main/services/StorageService.ts` | ~258 | 6 类数据实体的持久化 |
| `electron/main/managers/EnvironmentManager.ts` | ~214 | 环境业务逻辑 + 批量操作 |
| `electron/main/managers/ScriptManager.ts` | ~354 | 录制/回放引擎 |
| `electron/main/controllers/SyncController.ts` | ~285 | 多浏览器同步控制 |
| `electron/main/managers/WindowManager.ts` | ~121 | Win32 窗口 Proxy 适配层 |
| `electron/preload/index.ts` | ~94 | contextBridge 安全桥 |
| `native/win32-window/src/window_manager.cpp` | ~400 | 窗口枚举/查找/控制（C++） |
| `src/views/Dashboard.vue` | ~299 | 主仪表盘 |
| `src/store/modules/environments.ts` | ~193 | 环境 Vuex 模块 |
| `src/types/ipc.ts` | ~91 | IPC 参数类型定义 |
| `doc/window-manager-spec.md` | ~403 | 窗口管理模块详细规格 |
