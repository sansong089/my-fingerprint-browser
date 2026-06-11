# 环境导入导出设计文档

## 概述

环境导入导出功能允许用户将浏览器环境（包括配置、Profile 数据、Cookie、插件）打包为 ZIP 文件，在不同机器之间迁移。

## 设计目标

1. **完整性**：导出环境配置、Profile 数据、Cookie、插件
2. **安全性**：Cookie 使用用户密码加密，明文不进入文件
3. **可移植性**：支持跨机器导入导出
4. **向后兼容**：处理环境名称冲突、插件已存在等情况

## 导出文件结构

```
export_YYYY-MM-DD.zip
├── manifest.json                    # 元数据
├── profiles/                        # 环境 Profile 数据
│   └── {envId}/
│       └── Default/
│           ├── Cookies.encrypted    # 加密的 Cookie（可选）
│           ├── History              # 浏览历史
│           ├── Bookmarks            # 书签
│           ├── Preferences          # 设置
│           ├── Local Storage/       # localStorage
│           ├── Session Storage/     # sessionStorage
│           ├── IndexedDB/           # IndexedDB
│           └── ...                  # 其他数据
└── plugins/                         # 插件制品
    └── {pluginId}/
        ├── manifest.json
        └── ...
```

## manifest.json 格式

```json
{
  "version": 1,
  "exportedAt": "2026-06-04T10:00:00Z",
  "encryption": {
    "algorithm": "aes-256-gcm",
    "keyDerivation": "pbkdf2",
    "iterations": 100000
  },
  "environments": [
    {
      "id": "env_001",
      "name": "Profile 1",
      "fingerprint": {
        "seed": 12345,
        "platform": "windows",
        "brand": "Chrome"
      },
      "proxy": {
        "type": "http",
        "host": "127.0.0.1",
        "port": 8080
      },
      "tags": ["work"],
      "color": "#3b82f6",
      "groupId": "grp_xxx",
      "profileDir": "profiles/env_001",
      "cookieFile": "profiles/env_001/Default/Cookies.encrypted",
      "pluginIds": ["cjpalhdlnbpafiamejdnhcphjbkeiagm"]
    }
  ],
  "plugins": [
    {
      "id": "cjpalhdlnbpafiamejdnhcphjbkeiagm",
      "name": "uBlock Origin",
      "version": "1.56.0",
      "artifactDir": "plugins/cjpalhdlnbpafiamejdnhcphjbkeiagm"
    }
  ]
}
```

## Cookie 加密方案

### 加密流程

```
导出时：
1. 读取 Cookies SQLite 文件（本机 DPAPI 解密）
2. 提取所有 cookie 数据（JSON 序列化）
3. 用用户密码 + PBKDF2 派生密钥
4. AES-256-GCM 加密整个 JSON
5. 写入 Cookies.encrypted 文件
```

### 导入时：
```
1. 用户提供密码
2. 读取 Cookies.encrypted
3. 用密码 + PBKDF2 派生密钥
4. AES-256-GCM 解密
5. 写入新环境的 Cookies SQLite 文件
```

### 加密配置

| 参数 | 值 |
|------|-----|
| 算法 | AES-256-GCM |
| 密钥派生 | PBKDF2 |
| 迭代次数 | 100,000 |
| Salt 长度 | 16 字节 |
| IV 长度 | 12 字节 |
| 认证标签 | 16 字节 |

### Cookies.encrypted 文件格式

```
┌─────────────────────────────────┐
│  Salt (16 bytes)                │
├─────────────────────────────────┤
│  IV (12 bytes)                  │
├─────────────────────────────────┤
│  Auth Tag (16 bytes)            │
├─────────────────────────────────┤
│  Encrypted Data (变长)          │
└─────────────────────────────────┘
```

## 排除规则

### 排除的文件

| 文件/目录 | 原因 |
|----------|------|
| `Cookies` | 单独加密导出 |
| `Cookies-journal` | SQLite 日志 |
| `Login Data` | 密码（安全考虑） |
| `Login Data-journal` | SQLite 日志 |
| `Web Data` | 信用卡（安全考虑） |
| `Web Data-journal` | SQLite 日志 |
| `Cache/` | 缓存文件 |
| `Code Cache/` | 代码缓存 |
| `lockfile` | 锁文件 |
| `*.log` | 日志文件 |

### 保留的文件

| 文件/目录 | 说明 |
|----------|------|
| `History` | 浏览历史 |
| `Bookmarks` | 书签 |
| `Preferences` | 设置 |
| `Secure Preferences` | 安全设置 |
| `Local Storage/` | localStorage |
| `Session Storage/` | sessionStorage |
| `IndexedDB/` | IndexedDB |
| `Cookies.encrypted` | 加密的 Cookie（可选） |

## 导入流程

```
1. 选择 ZIP 文件
2. 解压到临时目录
3. 读取 manifest.json
4. 验证版本兼容性
5. 获取现有环境名称列表
6. 对每个待导入环境：
   a. 解析唯一名称（处理重名）
   b. 创建新环境（生成新 ID、新 userDataDir）
   c. 复制 Profile 目录（排除加密文件）
   d. 解密并导入 Cookie（如果提供了密码）
   e. 创建环境记录
   f. 创建环境-插件关联
7. 对每个插件：
   a. 检查本地是否已存在（pluginId）
   b. 不存在 → 复制到 userData/ext/
   c. 创建插件记录
8. 清理临时目录
```

## 名称冲突处理

导入时如果环境名称已存在，自动添加后缀：

```
"Profile 1" → "Profile 1 (1)" → "Profile 1 (2)" → ...
```

## 插件处理

- **已存在**：跳过复制，只创建环境关联
- **不存在**：复制插件制品，创建插件记录和环境关联

## 限制条件

1. **只能导出未运行的环境**：运行中的环境文件被锁定
2. **Cookie 密码可选**：不设置密码则不导出 Cookie
3. **跨机器 Cookie**：加密的 Cookie 需要密码才能在其他机器导入

## 代码结构

### 后端

| 文件 | 职责 |
|------|------|
| `ExportImportService.ts` | 导入导出核心逻辑 |
| `CookieFileService.ts` | Cookie SQLite 读写 |
| `index.ts` | IPC 处理程序 |

### 前端

| 文件 | 职责 |
|------|------|
| `ImportExportDialog.vue` | 导入导出对话框 |

## API

### 导出环境

```typescript
// IPC: export-environments
params: {
  envIds: string[]          // 要导出的环境 ID
  cookiePassword?: string   // Cookie 加密密码（可选）
}
result: {
  success: boolean
  path: string              // ZIP 文件路径
}
```

### 导入环境

```typescript
// IPC: import-environments
params: {
  filePath?: string         // ZIP 文件路径（可选，不传则显示对话框）
  cookiePassword?: string   // Cookie 解密密码
}
result: {
  environments: { id: string; name: string }[]
  plugins: { id: string; name: string; skipped: boolean }[]
}
```

## 依赖

| 包 | 用途 |
|----|------|
| `archiver` | 创建 ZIP 压缩包 |
| `extract-zip` | 解压 ZIP 文件 |
| `better-sqlite3` | 读写 Cookies SQLite |

## 安全考虑

1. **Cookie 加密**：使用 AES-256-GCM + PBKDF2，明文不进入文件
2. **密码数据排除**：Login Data 不导出
3. **信用卡数据排除**：Web Data 不导出
4. **临时目录清理**：导入导出后立即删除临时文件
