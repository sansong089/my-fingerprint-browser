# Local HTTP API

本地 HTTP API 由 Electron 主进程提供，仅监听 `127.0.0.1:45912`。

## Base Info

- Base URL: `http://127.0.0.1:45912`
- 访问范围: 仅本机回环访问
- 请求体: `application/json`
- 响应体: `application/json`
- 环境资源路径统一使用短路径 `envs`

## Common Rules

### Success response

- 查询接口通常直接返回对象或数组
- 删除、窗口控制等动作接口通常返回：

```json
{
  "success": true
}
```

### Error response

所有失败响应统一为：

```json
{
  "error": "错误信息",
  "details": null
}
```

### Error semantics

- `400`: 请求参数错误
- `404`: 资源不存在
- `409`: 状态冲突，例如重复启动、停止未运行实例
- `500`: 启动失败、窗口未找到或其它运行时错误

## Data Models

### Environment object

```json
{
  "id": "env_1746690000000_xxxxx",
  "name": "Environment 1",
  "fingerprint": {
    "seed": 123456,
    "platform": "windows",
    "platformVersion": "10.0.19045",
    "brand": "Chrome",
    "brandVersion": "120.0.6099.71",
    "hardwareConcurrency": 4,
    "timezone": "Asia/Shanghai",
    "lang": "en-US",
    "disabledSpoofing": []
  },
  "proxy": {
    "type": "http",
    "host": "127.0.0.1",
    "port": 7890,
    "username": "user",
    "password": "pass"
  },
  "userDataDir": "C:/Users/Admin/AppData/Roaming/fingerprint-browser/profiles/1746690000000",
  "cdpPort": 9222,
  "createdAt": "2026-05-08T08:00:00.000Z",
  "lastUsed": "2026-05-08T08:00:00.000Z",
  "tags": [
    "demo"
  ],
  "color": "#3b82f6",
  "status": "running",
  "groupId": "grp_1746690000000_xxxxx",
  "launchedAt": "2026-05-08T08:10:00.000Z",
  "runtime": {
    "isRunning": true,
    "launchMode": "cdp",
    "pid": 12345,
    "cdpPort": 9222
  }
}
```

说明：

- `runtime` 是对外 HTTP API 附加的运行态信息
- `runtime.launchMode` 支持：
  - `cdp`
  - `standard`
  - `null`
- 当环境以 `standard` 模式运行时，`runtime.cdpPort` 返回 `null`

### Group object

```json
{
  "id": "grp_1746690000000_xxxxx",
  "name": "默认分组",
  "color": "#3b82f6",
  "order": 0,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

### ProxyGroup object

```json
{
  "id": "pgrp_1746690000000_xxxxx",
  "name": "海外代理",
  "color": "#3b82f6",
  "order": 0,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

### Proxy object

```json
{
  "id": "proxy_1746690000000_xxxxx",
  "name": "US HTTP Proxy",
  "type": "http",
  "host": "127.0.0.1",
  "port": 7890,
  "username": "user",
  "password": "pass",
  "groupId": "pgrp_1746690000000_xxxxx",
  "status": "unchecked",
  "lastCheck": "2026-05-08T08:00:00.000Z",
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

## Environment APIs

### 1. 获取全部环境

- Method: `GET`
- Path: `/envs`
- Description: 返回所有环境，包含持久化字段和运行态字段
- Request body: 无

Success response:

```json
[
  {
    "id": "env_1746690000000_xxxxx",
    "name": "Environment 1",
    "status": "running",
    "runtime": {
      "isRunning": true,
      "launchMode": "cdp",
      "pid": 12345,
      "cdpPort": 9222
    }
  }
]
```

Common errors:

- 无业务错误，空列表时返回 `200` 和 `[]`

### 2. 获取运行中的环境实例

- Method: `GET`
- Path: `/envs/running`
- Description: 返回当前运行中的浏览器环境实例，不需要调用方再自行筛选
- Request body: 无

Success response:

```json
[
  {
    "id": "env_1746690000000_xxxxx",
    "name": "Environment 1",
    "status": "running",
    "runtime": {
      "isRunning": true,
      "launchMode": "standard",
      "pid": 12345,
      "cdpPort": null
    }
  }
]
```

Common errors:

- 无业务错误，当前没有运行实例时返回 `200` 和 `[]`

### 3. 创建环境

- Method: `POST`
- Path: `/envs`
- Description: 创建一个新的浏览器环境

Request body:

```json
{
  "name": "Environment 1",
  "fingerprint": {
    "seed": 123456,
    "platform": "windows",
    "platformVersion": "10.0.19045",
    "brand": "Chrome",
    "brandVersion": "120.0.6099.71",
    "hardwareConcurrency": 4,
    "timezone": "Asia/Shanghai",
    "lang": "en-US",
    "disabledSpoofing": []
  },
  "proxy": {
    "type": "http",
    "host": "127.0.0.1",
    "port": 7890,
    "username": "user",
    "password": "pass"
  },
  "tags": [
    "demo"
  ],
  "color": "#3b82f6",
  "groupId": "grp_1746690000000_xxxxx"
}
```

字段说明：

- `name`: 必填，环境名称
- `fingerprint`: 建议传完整对象；当前服务端只强校验 `name`
- `proxy`: 可选
- `tags`: 可选
- `color`: 可选
- `groupId`: 可选

Success response:

```json
{
  "id": "env_1746690000000_xxxxx",
  "name": "Environment 1",
  "status": "stopped"
}
```

Common errors:

- `400`: `name` 缺失或为空

### 4. 更新环境

- Method: `PUT`
- Path: `/envs/:id`
- Description: 更新指定环境

Path params:

- `id`: 环境 ID

Request body:

```json
{
  "name": "Environment 1 Updated",
  "tags": [
    "demo",
    "updated"
  ],
  "color": "#10b981"
}
```

Success response:

```json
{
  "id": "env_1746690000000_xxxxx",
  "name": "Environment 1 Updated",
  "runtime": {
    "isRunning": false,
    "launchMode": null,
    "pid": null,
    "cdpPort": null
  }
}
```

Common errors:

- `404`: 环境不存在
- `400`: 请求体不合法

### 5. 删除环境

- Method: `DELETE`
- Path: `/envs/:id`
- Description: 删除指定环境；如果环境正在运行，会先尝试关闭实例

Path params:

- `id`: 环境 ID

Success response:

```json
{
  "success": true
}
```

Common errors:

- `404`: 环境不存在

### 6. 启动环境

- Method: `POST`
- Path: `/envs/:id/start`
- Description: 启动指定环境，支持 `cdp` 和 `standard` 两种模式

Path params:

- `id`: 环境 ID

Request body:

```json
{
  "launchMode": "cdp"
}
```

字段说明：

- `launchMode`: 可选，默认 `cdp`

支持值：

- `cdp`: 以可远程调试模式启动，`runtime.cdpPort` 返回端口
- `standard`: 以非 CDP 模式启动，`runtime.cdpPort` 返回 `null`

Success response:

```json
{
  "id": "env_1746690000000_xxxxx",
  "status": "running",
  "runtime": {
    "isRunning": true,
    "launchMode": "cdp",
    "pid": 12345,
    "cdpPort": 9222
  }
}
```

Common errors:

- `404`: 环境不存在
- `409`: 环境已在运行
- `400`: `launchMode` 不是 `cdp` 或 `standard`
- `500`: 启动失败

### 7. 停止环境

- Method: `POST`
- Path: `/envs/:id/stop`
- Description: 停止指定环境

Path params:

- `id`: 环境 ID

Request body: 无

Success response:

```json
{
  "id": "env_1746690000000_xxxxx",
  "status": "stopped",
  "runtime": {
    "isRunning": false,
    "launchMode": null,
    "pid": null,
    "cdpPort": null
  }
}
```

Common errors:

- `404`: 环境不存在
- `409`: 环境当前未运行
- `500`: 停止失败

### 8. 最大化环境窗口

- Method: `POST`
- Path: `/envs/window/maximize`
- Description: 最大化指定运行中环境的窗口

Request body:

```json
{
  "envIds": [
    "env_1746690000000_xxxxx",
    "env_1746690000001_yyyyy"
  ]
}
```

字段说明：

- `envIds`: 必填，非空字符串数组

Success response:

```json
{
  "success": true,
  "envIds": [
    "env_1746690000000_xxxxx",
    "env_1746690000001_yyyyy"
  ]
}
```

Common errors:

- `400`: `envIds` 不是非空字符串数组
- `404`: 某个环境不存在
- `409`: 某个环境未运行

### 9. 最小化环境窗口

- Method: `POST`
- Path: `/envs/window/minimize`
- Description: 最小化指定运行中环境的窗口

Request body:

```json
{
  "envIds": [
    "env_1746690000000_xxxxx"
  ]
}
```

Success response:

```json
{
  "success": true,
  "envIds": [
    "env_1746690000000_xxxxx"
  ]
}
```

Common errors:

- `400`: `envIds` 不是非空字符串数组
- `404`: 某个环境不存在
- `409`: 某个环境未运行

### 10. 自动排列环境窗口

- Method: `POST`
- Path: `/envs/window/arrange`
- Description: 自动排列指定运行中环境的窗口

Request body:

```json
{
  "envIds": [
    "env_1746690000000_xxxxx",
    "env_1746690000001_yyyyy",
    "env_1746690000002_zzzzz"
  ]
}
```

Success response:

```json
{
  "success": true,
  "envIds": [
    "env_1746690000000_xxxxx",
    "env_1746690000001_yyyyy",
    "env_1746690000002_zzzzz"
  ]
}
```

Common errors:

- `400`: `envIds` 不是非空字符串数组
- `404`: 某个环境不存在
- `409`: 某个环境未运行
- `500`: 找不到可排列的窗口

## Group APIs

### 11. 获取环境分组列表

- Method: `GET`
- Path: `/groups`
- Description: 返回全部环境分组
- Request body: 无

Success response:

```json
[
  {
    "id": "grp_1746690000000_xxxxx",
    "name": "默认分组",
    "color": "#3b82f6",
    "order": 0,
    "createdAt": "2026-05-08T08:00:00.000Z"
  }
]
```

### 12. 创建环境分组

- Method: `POST`
- Path: `/groups`
- Description: 创建一个环境分组

Request body:

```json
{
  "name": "营销环境",
  "color": "#8b5cf6"
}
```

Success response:

```json
{
  "id": "grp_1746690000000_xxxxx",
  "name": "营销环境",
  "color": "#8b5cf6",
  "order": 0,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

Common errors:

- `400`: `name` 缺失或为空

### 13. 更新环境分组

- Method: `PUT`
- Path: `/groups/:id`
- Description: 更新环境分组名称、颜色或顺序

Path params:

- `id`: 分组 ID

Request body:

```json
{
  "name": "营销环境-更新",
  "color": "#10b981",
  "order": 1
}
```

Success response:

```json
{
  "id": "grp_1746690000000_xxxxx",
  "name": "营销环境-更新",
  "color": "#10b981",
  "order": 1,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

Common errors:

- `404`: 分组不存在
- `400`: 请求体不合法

### 14. 删除环境分组

- Method: `DELETE`
- Path: `/groups/:id`
- Description: 删除指定环境分组

Path params:

- `id`: 分组 ID

Success response:

```json
{
  "success": true
}
```

Common errors:

- `404`: 分组不存在

## Proxy Group APIs

### 15. 获取代理分组列表

- Method: `GET`
- Path: `/proxy-groups`
- Description: 返回全部代理分组
- Request body: 无

Success response:

```json
[
  {
    "id": "pgrp_1746690000000_xxxxx",
    "name": "海外代理",
    "color": "#3b82f6",
    "order": 0,
    "createdAt": "2026-05-08T08:00:00.000Z"
  }
]
```

### 16. 创建代理分组

- Method: `POST`
- Path: `/proxy-groups`
- Description: 创建一个代理分组

Request body:

```json
{
  "name": "海外代理",
  "color": "#f59e0b"
}
```

Success response:

```json
{
  "id": "pgrp_1746690000000_xxxxx",
  "name": "海外代理",
  "color": "#f59e0b",
  "order": 0,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

Common errors:

- `400`: `name` 缺失或为空

### 17. 更新代理分组

- Method: `PUT`
- Path: `/proxy-groups/:id`
- Description: 更新代理分组名称、颜色或顺序

Path params:

- `id`: 代理分组 ID

Request body:

```json
{
  "name": "海外代理-更新",
  "color": "#06b6d4",
  "order": 1
}
```

Success response:

```json
{
  "id": "pgrp_1746690000000_xxxxx",
  "name": "海外代理-更新",
  "color": "#06b6d4",
  "order": 1,
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

Common errors:

- `404`: 代理分组不存在
- `400`: 请求体不合法

### 18. 删除代理分组

- Method: `DELETE`
- Path: `/proxy-groups/:id`
- Description: 删除指定代理分组

Path params:

- `id`: 代理分组 ID

Success response:

```json
{
  "success": true
}
```

Common errors:

- `404`: 代理分组不存在

## Proxy APIs

### 19. 获取代理列表

- Method: `GET`
- Path: `/proxies`
- Description: 返回全部代理配置
- Request body: 无

Success response:

```json
[
  {
    "id": "proxy_1746690000000_xxxxx",
    "name": "US HTTP Proxy",
    "type": "http",
    "host": "127.0.0.1",
    "port": 7890,
    "username": "user",
    "password": "pass",
    "groupId": "pgrp_1746690000000_xxxxx",
    "status": "unchecked",
    "createdAt": "2026-05-08T08:00:00.000Z"
  }
]
```

### 20. 创建代理

- Method: `POST`
- Path: `/proxies`
- Description: 创建一个代理配置

Request body:

```json
{
  "name": "US HTTP Proxy",
  "type": "http",
  "host": "127.0.0.1",
  "port": 7890,
  "username": "user",
  "password": "pass",
  "groupId": "pgrp_1746690000000_xxxxx"
}
```

字段说明：

- `name`: 必填
- `type`: 必填，支持 `http`、`https`、`socks5`
- `host`: 必填
- `port`: 必填
- `username`: 可选
- `password`: 可选
- `groupId`: 可选；传空字符串表示不分组

Success response:

```json
{
  "id": "proxy_1746690000000_xxxxx",
  "name": "US HTTP Proxy",
  "type": "http",
  "host": "127.0.0.1",
  "port": 7890,
  "username": "user",
  "password": "pass",
  "groupId": "pgrp_1746690000000_xxxxx",
  "status": "unchecked",
  "createdAt": "2026-05-08T08:00:00.000Z"
}
```

Common errors:

- `400`: `name`、`type`、`host`、`port` 不合法

### 21. 更新代理

- Method: `PUT`
- Path: `/proxies/:id`
- Description: 更新指定代理

Path params:

- `id`: 代理 ID

Request body:

```json
{
  "name": "US HTTP Proxy Updated",
  "host": "127.0.0.2",
  "port": 7891,
  "groupId": ""
}
```

说明：

- `groupId` 传空字符串表示清空分组

Success response:

```json
{
  "id": "proxy_1746690000000_xxxxx",
  "name": "US HTTP Proxy Updated",
  "host": "127.0.0.2",
  "port": 7891,
  "status": "unchecked"
}
```

Common errors:

- `404`: 代理不存在
- `400`: 请求体不合法

### 22. 删除代理

- Method: `DELETE`
- Path: `/proxies/:id`
- Description: 删除指定代理

Path params:

- `id`: 代理 ID

Success response:

```json
{
  "success": true
}
```

Common errors:

- `404`: 代理不存在

## Recommended Integration Sequence

推荐接入顺序：

1. 调用 `GET /envs` 或 `GET /envs/running` 拉取环境
2. 调用 `POST /envs/:id/start` 启动环境
3. 如需窗口控制，调用对应 `/envs/window/*` 接口
4. 业务结束后调用 `POST /envs/:id/stop`

如果你准备给第三方系统开放这组接口，建议把本文件作为正式对接文档直接使用。
