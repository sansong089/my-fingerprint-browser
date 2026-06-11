# 导入浏览器数据 — 设计文档

> 日期：2026-06-05
> 状态：已确认

## 概述

将现有的"导入收藏夹"功能扩展为"导入浏览器数据"，支持从 Chrome/Edge 浏览器 Profile 同时导入收藏夹和 Cookie。用户通过复选框选择要导入的数据类型，默认全部勾选。

## 架构

### 服务层

新建 `BrowserProfileImportService` 作为上层编排服务，调用已有的底层服务：

```
BrowserProfileImportService (新)
  ├─ importBookmarks(sourceType, sourcePath, envIds)
  │    └─ BookmarkImportService.importToEnvironments()
  ├─ importCookies(profileDir, envIds)
  │    ├─ CookieFileService.readCookiesFromFile(profileDir)   // 读源浏览器 Cookie
  │    └─ CookieFileService.writeCookiesToFile(env.userDataDir, cookies)  // 写入目标环境
  └─ importData(params)
       ├─ if 'bookmarks' in dataTypes → importBookmarks()
       └─ if 'cookies' in dataTypes → importCookies()
```

**不改动的底层服务**：
- `BookmarkImportService` — 保持只负责收藏夹解析和导入
- `CookieFileService` — 保持作为 Cookie 读写底层工具

### IPC 层

新增 3 个 IPC 通道，替代现有的 `bookmarks-*` 通道：

| 新通道 | 调用方法 | 说明 |
|--------|----------|------|
| `browser-data-detect-sources` | `detectSources()` | 检测 Chrome/Edge Profile |
| `browser-data-preview-import` | `preview(sourceType, sourcePath)` | 收藏夹预览 |
| `browser-data-import` | `importData(params)` | 导入，带 `dataTypes` 参数 |

### UI 层

- `BookmarkImportDialog.vue` → 重命名为 `BrowserDataImportDialog.vue`
- `EnvironmentsView.vue` — 按钮文案改为"导入浏览器数据"，引用新组件

## 接口定义

### BrowserDataImportParams

```typescript
interface BrowserDataImportParams {
  sourceType: 'chrome' | 'edge'
  sourcePath: string       // Bookmarks 文件路径，如 .../Default/Bookmarks
  envIds: string[]
  dataTypes: ('bookmarks' | 'cookies')[]
}
```

**路径推导**：`profileDir`（Profile 目录）从 `sourcePath` 推导，即 `dirname(sourcePath)`。
例如 `sourcePath = ".../Default/Bookmarks"` → `profileDir = ".../Default"`。
Cookie 文件路径：`{profileDir}/Network/Cookies`（Chrome 133+）。

### BrowserDataImportResult

```typescript
interface BrowserDataImportResult {
  importedEnvironments: number
  totalEnvironments: number
  // 收藏夹
  folderCount: number
  urlCount: number
  // Cookie
  cookieCount: number
  // 失败信息
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}
```

## UI 设计

### 对话框布局（方案 C：来源区域内嵌）

```
┌─────────────────────────────────────────┐
│ 导入浏览器数据                    [×]    │
│ 从 Chrome 或 Edge 导入到已停止的环境     │
├─────────────────────────────────────────┤
│                                         │
│ 来源                                    │
│ ┌──────────┐ ┌──────────┐              │
│ │  Chrome   │ │   Edge   │              │
│ └──────────┘ └──────────┘              │
│ ┌──────────────────────────────────┐   │
│ │ Default — Chrome                  │   │
│ └──────────────────────────────────┘   │
│ ┌──────────────────────┐ ┌────┐ ┌──┐  │
│ │ C:\...\Bookmarks     │ │选择│ │预│  │
│ └──────────────────────┘ └────┘ └──┘  │
│                                         │
│ ☑ 导入收藏夹    ☑ 导入 Cookie          │
│                                         │
│ 目标环境                    已选择 2/5  │
│ ┌──────────────────────────────────┐   │
│ │ ☐ 全选已停止环境                  │   │
│ │ ☑ ● 环境 A                       │   │
│ │ ☑ ● 环境 B                       │   │
│ │ ☐ ● 环境 C                       │   │
│ └──────────────────────────────────┘   │
│                                         │
│ ┌──────────────────────────────────┐   │
│ │ 文件夹：12  链接：87              │   │
│ │ Google | https://google.com      │   │
│ │ GitHub | https://github.com      │   │
│ └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│              [取消]  [导入到 2 个环境]   │
└─────────────────────────────────────────┘
```

### 复选框行为

- 默认全选
- 至少勾选一个才能提交（按钮灰色禁用）
- 取消勾选"导入收藏夹"时，隐藏预览区域
- 取消勾选"导入 Cookie"时，不显示 Cookie 相关提示

### 结果消息

成功时：`已导入到 2/5 个环境，链接 87 个，Cookie 156 个`

部分失败时：`部分环境未导入：运行中 1 个，失败 2 个`

## Cookie 导入流程

### 读取源浏览器 Cookie

1. 从 `sourcePath` 推导 `profileDir = dirname(sourcePath)`
2. 确定源 Cookie 文件路径：`{profileDir}/Network/Cookies`（Chrome 133+）
3. 调用 `CookieFileService.readCookiesFromFile(profileDir)`
3. 内部流程：打开 SQLite → 读取所有 cookie 行 → 对每个 `encrypted_value`：
   - 从 `{profileDir}/Local State` 获取 DPAPI 加密的 AES key
   - PowerShell 调用 DPAPI 解密获取 AES key
   - AES-256-GCM 解密 cookie value
4. 返回 `CookieData[]`

### 写入目标环境 Cookie

1. 遍历每个目标环境（仅已停止的）
2. 调用 `CookieFileService.writeCookiesToFile(env.userDataDir, cookies)`
3. 内部流程：
   - 确保 `{userDataDir}/Default/Network/Cookies` SQLite 存在（不存在则创建空 DB）
   - 对每个 cookie：用目标环境的 AES key 加密 → INSERT OR REPLACE
4. 返回 `{ success, failed }`

### 关键路径

| 操作 | 源路径 | 目标路径 |
|------|--------|----------|
| 收藏夹读取 | `{profileDir}/Bookmarks` | — |
| 收藏夹写入 | — | `{env.userDataDir}/Default/Bookmarks` |
| Cookie 读取 | `{profileDir}/Network/Cookies` | — |
| Cookie 写入 | — | `{env.userDataDir}/Default/Network/Cookies` |
| AES key | `{profileDir}/Local State` | `{env.userDataDir}/Local State` |

其中 `profileDir = dirname(sourcePath)`，由 `BrowserProfileImportService` 自动推导。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 两个复选框都未勾选 | 提交按钮禁用 |
| 源 Cookie 文件不存在/为空 | 跳过 Cookie 导入，结果提示 |
| DPAPI 解密失败 | 跳过该环境 Cookie，记录到 `failed` |
| 目标环境运行中 | 跳过（与收藏夹一致） |
| 收藏夹成功但 Cookie 失败 | 结果分别显示计数 |
| 源 Chrome 运行中 | 不影响（SQLite 并发读安全） |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/main/services/BrowserProfileImportService.ts` | 新建 | 上层编排服务 |
| `electron/main/index.ts` | 修改 | 新增 `browser-data-*` IPC 通道 |
| `src/components/BrowserDataImportDialog.vue` | 新建 | 重命名+扩展的对话框组件 |
| `src/views/EnvironmentsView.vue` | 修改 | 按钮文案、引用新组件 |
| `electron/main/services/BookmarkImportService.ts` | 不改 | — |
| `electron/main/services/CookieFileService.ts` | 不改 | — |
| `electron/main/services/ExportImportService.ts` | 不改 | — |

## 不做的事

- 不新增 npm 依赖（DPAPI 解密已通过 PowerShell 实现）
- 不修改 `CookieFileService`（底层工具保持不变）
- 不支持运行中环境导入（与现有行为一致）
- 不为 Cookie 提供预览（用户确认不需要）
- 不支持自定义 Cookie 文件导入（只从 Profile 直接读取）
