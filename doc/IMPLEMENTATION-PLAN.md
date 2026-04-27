# 功能实现规划

**日期**: 2026-04-17
**版本**: v1.0

---

## 需求概述

1. **Cookie 管理** - 环境右键菜单 → Cookie 管理弹窗
2. **代理管理** - 完善代理管理功能
3. **移除模板功能** - 删除模板相关代码
4. **统一新建界面** - 批量/单个新建使用同一界面，通过数量区分

---

## 一、Cookie 管理功能

### 1.1 创建 CookieManager.vue 组件

**路径**: `src/components/CookieManager.vue`

**功能设计**:
| 功能 | 说明 |
|------|------|
| 获取 Cookie | 从运行中的浏览器通过 CDP 获取所有 Cookie |
| 表格展示 | 域名、名称、值、安全、过期时间等列 |
| 新增 Cookie | 表单：名称、值、域名、路径、过期时间 |
| 编辑 Cookie | 双击行或点击编辑按钮 |
| 删除 Cookie | 单个删除或批量删除 |
| 导入 | 支持 EditThisCookie JSON 格式导入 |
| 导出 | 导出为 JSON 文件 |

**UI 布局**:
```
┌─────────────────────────────────────────────┐
│  Cookie 管理                    [×]         │
├─────────────────────────────────────────────┤
│  [导入] [导出] [新增]            [刷新]     │
├─────────────────────────────────────────────┤
│  搜索: [___________]                         │
├─────────────────────────────────────────────┤
│  ☑ │ 域名 │ 名称 │ 值 │ 安全 │ 过期 │ 操作 │
│  ──┼──────┼──────┼─────┼──────┼──────┼─────│
│  ☑ │ .xxx │ sid  │...  │  ✓   │ -1   │ ✎ 🗑│
├─────────────────────────────────────────────┤
│                              [删除选中]     │
├─────────────────────────────────────────────┤
│  ⚠️ 需要环境处于运行状态才能管理 Cookie     │
└─────────────────────────────────────────────┘
```

### 1.2 环境操作列添加 Cookie 按钮

**修改**: `EnvironmentsView.vue`

**操作列新增**:
```html
<button @click.stop="openCookieManager(env)" class="...">Cookie</button>
```

**前置条件检查**:
- 环境必须处于 `running` 状态
- 否则提示"环境未运行，无法管理 Cookie"

### 1.3 IPC 通道确认

| Channel | 参数 | 返回 | 状态 |
|---------|------|------|------|
| `cookie-get` | `{envId}` | `CookieData[]` | ✅ 已有 |
| `cookie-set` | `{envId, cookies}` | `boolean` | ✅ 已有 |
| `cookie-delete` | `{envId, name, domain}` | `boolean` | ✅ 已有 |
| `cookie-export` | `{envId}` | `CookieData[]` | ✅ 已有 |

---

## 二、代理管理功能完善

### 2.1 当前状态

ProxiesView.vue 已实现基本的 CRUD 功能。

### 2.2 需完善功能

| 功能 | 当前状态 | 需要改进 |
|------|---------|---------|
| 批量测试 | ❌ | 添加"检测全部"按钮 |
| 批量删除 | ❌ | 添加复选框和批量删除 |
| 批量启用/禁用 | ❌ | 添加批量启用代理功能 |
| 代理使用统计 | ❌ | 显示被多少环境使用 |
| 复制代理 | ❌ | 添加复制功能快速创建相似代理 |

### 2.3 增强 UI 设计

```
┌────────────────────────────────────────────────────────┐
│  代理池管理                                    [新增]  │
├────────────────────────────────────────────────────────┤
│  [全选] [检测全部] [批量删除] [启用选中] [禁用选中]    │
├────────────────────────────────────────────────────────┤
│  ☑ │ 名称 │ 类型 │ 地址 │ 状态 │ 使用数 │ 操作      │
│  ──┼──────┼──────┼──────┼───────┼────────┼───────────│
│  ☑ │ 美独  │ HTTP │...   │ ✓可用  │ 3      │ [检测] [编辑] [复制] [删除] │
├────────────────────────────────────────────────────────┤
│  已选择 2 个，共 10 个代理                              │
└────────────────────────────────────────────────────────┘
```

### 2.4 修改文件

**修改**: `src/views/ProxiesView.vue`
- 添加复选框支持批量选择
- 添加批量操作按钮
- 添加代理使用统计显示
- 添加复制功能

---

## 三、移除模板功能

### 3.1 需要删除的内容

| 文件/功能 | 操作 |
|----------|------|
| `src/store/modules/templates.ts` | 删除 |
| `src/types/template.ts` | 删除 |
| `src/components/TemplatesView.vue` | 删除（如存在） |
| 环境编辑器中"保存为模板"按钮 | 移除 |
| templates store 注册 | 移除 |
| templates 相关 IPC | 保留（向后兼容，返回空） |

### 3.2 修改 EnvironmentEditor.vue

**移除**:
```html
<button v-if="isEdit" @click="saveAsTemplate" class="...">
  💾 保存为模板
</button>
```

**移除**:
```typescript
// 移除 saveAsTemplate 函数
// 移除 templatesList computed
// 移除 onMounted 中 templates fetch
```

### 3.3 修改 store/index.ts

**移除**:
```typescript
import templates from './modules/templates'
// modules 中移除 templates
```

---

## 四、统一新建界面

### 4.1 设计思路

修改 `EnvironmentEditor.vue`，通过 `count` prop 控制：
- `count = 1`（默认）: 单个创建模式
- `count > 1`: 批量创建模式，自动生成带序号的名称

### 4.2 批量模式 UI 差异

| 元素 | 单个模式 | 批量模式 |
|------|---------|---------|
| 标题 | 新建环境 / 编辑环境 | 批量新建环境 |
| 名称输入 | 显示单个名称输入框 | 显示前缀输入框 + 数量输入框 |
| 序号规则 | 无 | 自动在名称后加 -001, -002... |
| 预览 | 无 | 显示前5个名称预览 |
| 底部按钮 | 创建 / 保存 | 批量创建 |

### 4.3 修改 EnvironmentEditor.vue

**新增 Props**:
```typescript
const props = defineProps<{
  environment: Environment | null
  count?: number  // 默认 1
}>()
```

**新增表单字段**:
```typescript
const batchConfig = ref({
  prefix: '',
  count: 1,
  startNumber: 1
})
```

**名称预览计算**:
```typescript
const namePreview = computed(() => {
  if (props.count <= 1) return []
  return Array.from({ length: Math.min(props.count, 5) }, (_, i) => {
    const num = (batchConfig.value.startNumber + i).toString().padStart(3, '0')
    return `${batchConfig.value.prefix || '环境'}_${num}`
  })
})
```

### 4.4 修改 EnvironmentsView.vue

**移除 BatchCreateDialog 引用**:
```html
<!-- 删除 -->
<BatchCreateDialog v-if="showBatchCreate" @close="showBatchCreate = false" @created="onBatchCreated" />

<!-- 改为直接调用 Editor -->
<EnvironmentEditor v-if="showEditor" :environment="null" :count="batchCount" @close="closeEditor" @save="saveEnvironment" />
```

**新增批量数量选择**:
```html
<button @click="openBatchDialog" class="btn-outline text-xs">批量创建</button>
```

---

## 五、实现顺序

| 阶段 | 任务 | 优先级 |
|------|------|--------|
| **Phase 1** | 创建 CookieManager.vue 组件 | 🔴 高 |
| **Phase 1** | EnvironmentsView 操作列添加 Cookie 按钮 | 🔴 高 |
| **Phase 2** | 完善代理管理功能（批量操作） | 🟡 中 |
| **Phase 3** | 移除模板功能 | 🟡 中 |
| **Phase 4** | 统一新建界面 | 🟡 中 |
| **Phase 5** | 更新 SPEC.md 文档 | 🟢 低 |

---

## 六、关键文件清单

### 新增文件
- `src/components/CookieManager.vue` - Cookie 管理弹窗

### 修改文件
- `src/views/EnvironmentsView.vue` - 添加 Cookie 按钮、移除 BatchCreateDialog
- `src/components/EnvironmentEditor.vue` - 移除模板按钮、添加 count 参数
- `src/views/ProxiesView.vue` - 完善批量操作
- `src/store/index.ts` - 移除 templates 模块

### 删除文件
- `src/store/modules/templates.ts` - 模板模块
- `src/types/template.ts` - 模板类型

---

## 七、风险与注意事项

1. **Cookie 管理依赖 CDP**: 必须在浏览器运行状态下才能操作
2. **批量创建性能**: 数量大时需要考虑异步处理和进度反馈
3. **向后兼容**: 模板 IPC 保留但返回空数组，避免破坏现有调用
