# Fingerprint Browser

基于 Electron 的多环境指纹浏览器。项目面向需要管理多个独立浏览器环境的桌面场景，每个环境拥有独立的用户数据目录、指纹参数、代理配置、Cookie、插件状态和运行生命周期。

## 功能概览

- 多环境管理：创建、编辑、删除、批量启动和关闭浏览器环境。
- 指纹配置：支持平台、浏览器品牌、版本、语言、时区、硬件并发数等参数。
- 代理管理：支持 HTTP、HTTPS、SOCKS5 代理，以及代理分组和连通性检测。
- Cookie 管理：通过 CDP 读取、设置、导入和导出运行中环境的 Cookie。
- 窗口控制：通过 Windows 原生模块查找、排列、最大化、最小化浏览器窗口。
- 同步操作：支持主环境到多个镜像环境的浏览器操作同步。
- 脚本自动化：录制和回放页面操作步骤。
- 插件管理：提供插件列表、插件商店入口、安装状态和环境关联的应用侧管理能力。
- 本地 HTTP API：Electron 主进程提供仅监听本机回环地址的集成接口。

## 技术栈

- 桌面框架：Electron 29
- 前端框架：Vue 3、Vue Router、Vuex
- 构建工具：Vite、vite-plugin-electron、electron-builder
- 样式：Tailwind CSS
- 语言：TypeScript
- 原生能力：C++ N-API + Win32 API
- 浏览器协议：Chrome DevTools Protocol
- 持久化：electron-store

## 运行要求

- Windows 作为主要目标平台。
- Node.js 20 或兼容版本。
- npm。
- 构建原生模块时需要 Visual Studio C++ Build Tools 和 node-gyp 可用。

项目会通过 `scripts/prepare-fingerprint-browser.ps1` 准备定制 Chromium 到 `vendor/fingerprint-chromium/`。如果目录中已经存在 `chrome.exe`，脚本会直接复用。

## 快速开始

安装依赖：

```bash
npm install
```

准备指纹浏览器内核：

```bash
npm run prepare:fingerprint-browser
```

启动开发环境：

```bash
npm run dev
```

执行完整构建：

```bash
npm run build
```

构建 Windows 安装包：

```bash
npm run build:win
```

预览生产构建：

```bash
npm run preview
```

## 原生窗口模块

Windows 窗口控制能力位于 `native/win32-window/`，用于按浏览器进程树查找窗口、获取显示器信息、移动窗口和批量排列。

单独重建原生模块：

```bash
cd native/win32-window
npx node-gyp rebuild
```

主要接口包括：

- `findWindowByPid(pid)`
- `findAllBrowserWindows()`
- `setWindowPosition(hwnd, position)`
- `showWindow(hwnd, command)`
- `getMonitors()`
- `arrangeWindows(hwnds, positions?)`

## 项目结构

```text
.
├── electron/                 # Electron 主进程和 preload
│   ├── main/
│   │   ├── controllers/      # 同步等控制器
│   │   ├── managers/         # 环境、窗口、Cookie、脚本、CDP 等管理器
│   │   └── services/         # 存储、启动、本地 API、插件、同步扩展等服务
│   └── preload/              # contextBridge IPC 桥
├── src/                      # Vue 渲染进程
│   ├── components/           # 通用组件和业务弹窗
│   ├── constants/            # 常量选项
│   ├── router/               # 页面路由
│   ├── store/                # Vuex store modules
│   ├── types/                # 前端类型定义
│   ├── utils/                # IPC 与 toast 工具
│   └── views/                # 页面视图
├── native/win32-window/      # C++ N-API 原生窗口模块
├── scripts/                  # 构建和准备脚本
├── vendor/                   # 指纹 Chromium 等外部运行时资源
├── doc/                      # 规格、API 和实现文档
└── release/                  # electron-builder 输出目录
```

## 关键模块

### 环境生命周期

`EnvironmentManager` 负责环境的增删改查和启动关闭编排。每个环境拥有独立 `userDataDir`，启动时由 `LaunchService` 组装 Chromium 参数、分配 CDP 端口并记录运行进程。

### 指纹浏览器启动

构建前会准备 `vendor/fingerprint-chromium/chrome.exe`。运行环境默认使用独立用户目录、代理参数、指纹参数和必要扩展启动浏览器。

### CDP 能力

`CDPClient` 封装 Chrome DevTools Protocol 连接。当前用于 Cookie 管理、脚本录制回放，以及部分同步相关能力。

### 窗口同步与控制

窗口控制依赖 `native/win32-window`。项目采用原生窗口、进程树和屏幕坐标进行窗口定位，不依赖 CDP 或 DOM 状态决定原生窗口映射。

### 插件管理

插件相关能力分布在主进程 services、Vuex modules 和 `/plugins`、`/plugins/store` 页面中。实现时需要保持环境隔离、启动期 reconcile 和浏览器侧本地卸载语义。

### 本地 HTTP API

主进程提供本地接口，默认监听：

```text
http://127.0.0.1:45912
```

接口覆盖环境、环境分组、代理分组、代理和窗口控制。详细说明见 `doc/local-http-api.md`。

## 常用开发入口

- `electron/main/index.ts`：主进程入口和 IPC 注册。
- `electron/preload/index.ts`：渲染进程可用的安全 IPC 桥。
- `electron/main/services/StorageService.ts`：持久化数据模型和默认值。
- `electron/main/services/LaunchService.ts`：浏览器启动、关闭、PID 管理。
- `electron/main/managers/EnvironmentManager.ts`：环境业务逻辑。
- `electron/main/controllers/SyncController.ts`：多浏览器同步控制。
- `src/router/index.ts`：前端页面路由。
- `src/store/index.ts`：Vuex 模块聚合。
- `src/components/EnvironmentEditor.vue`：环境创建和编辑表单。

## 文档索引

- `doc/SPEC.md`：项目规格和架构说明。
- `doc/local-http-api.md`：本地 HTTP API 对接文档。
- `doc/window-manager-spec.md`：窗口管理模块详细规格。
- `doc/window-sync-hook-design.md`：原生窗口同步设计。
- `doc/window-sync-extension-plan.md`：扩展侧文本同步规划。
- `doc/plugin-management-system-plan.md`：插件管理系统规划和评审约束。

## 开发注意事项

- 不要用 CDP 替代原生窗口同步路径；窗口同步要求保持在浏览器外部。
- 不要通过切换前台窗口、剪贴板、`WM_PASTE` 或 UI Automation 写入文本来做镜像文本同步。
- Chromium 顶层 UI 窗口应按屏幕坐标和原生窗口匹配，不要维护弹窗索引或 DOM/CDP 映射。
- 插件实现不能覆盖同步扩展的 `--load-extension` 注入路径。
- 所有会修改状态的 IPC 通道都应补齐参数校验。
- 代理密码当前仍可能以明文形式存储在 electron-store 中，生产使用前需要评估安全要求。

## 构建产物

- 渲染进程输出：`dist/`
- Electron 主进程输出：`dist-electron/`
- Windows 安装包输出：`release/`
- Chromium 运行时资源：`vendor/fingerprint-chromium/`

## 许可

当前仓库尚未声明许可证。发布或分发前请补充正式许可说明。
