# Chromium 原生窗口同步任务拆分

> 来源文档：`doc/window-sync-hook-design.md`
>
> 日期：2026-04-27

---

## 1. 拆分原则

每个任务只做一件事：

- 目标单一
- 交付可验证
- 失败影响范围可控
- 可以独立回归

---

## 2. 任务列表

### Task 1：移除已证伪的 IME 补丁链路

目标：

- 删除 `sync_manager` 中所有已证伪的 IME 状态同步、IME 热键镜像、提交结果猜测逻辑

范围：

- `native/win32-window/src/sync_manager.cpp`
- `native/win32-window/src/sync_manager.hpp`

完成标准：

- 不再存在 `ImmGetOpenStatus` 驱动同步主链路
- 不再存在 `ImmSimulateHotKey` 驱动同步主链路
- 不再存在中文输入特判补丁残留
- 英文键盘和鼠标同步行为不比当前基线更差

---

### Task 2：稳定当前同步基线

目标：

- 回到“不会闪烁、不会劫持主窗口输入、不会破坏中文输入”的稳定版本

范围：

- 原生同步生命周期
- 键盘与鼠标现有镜像路径

完成标准：

- 启动同步不崩溃
- 停止同步可清理
- 主窗口可正常输入英文和中文
- 当前已实现能力不被新清理破坏

---

### Task 3：引入原生输入事务队列骨架

目标：

- 将“捕获输入”和“执行同步”从结构上拆开

范围：

- 新增 capture queue
- 新增 replay worker
- 原生同步生命周期接入队列启动和停止

建议文件：

- `native/win32-window/src/input_capture.*`
- `native/win32-window/src/input_replay.*`
- `native/win32-window/src/sync_manager.*`

完成标准：

- hook 回调只做捕获与入队
- 不再在 hook 回调内直接做重型同步操作
- replay worker 生命周期可控

---

### Task 4：定义统一事务结构

目标：

- 为后续窗口操作、点击、文本输入提供统一事件模型

范围：

- 原生层事务类型定义
- 事务序列号、时间戳、源窗口信息、坐标信息

完成标准：

- 至少支持：
  - `mouse-click`
  - `mouse-wheel`
  - `key-command`
  - `window-state`
- 事务数据结构在 capture 和 replay 间稳定传递

---

### Task 5：建立窗口组模型

目标：

- 把“主窗口 + 镜像窗口”升级为“窗口组”

范围：

- 顶层窗口映射
- 输入目标映射
- 主窗口与镜像窗口角色管理

建议文件：

- `native/win32-window/src/window_graph.*`

完成标准：

- 每个参与环境都有窗口组记录
- 能获取顶层 root hwnd
- 能获取候选输入目标 hwnd 列表

---

### Task 6：实现 popup 发现与绑定

目标：

- 让 Chromium popup 不再游离于同步系统之外

范围：

- 新建 popup 跟踪
- popup 到所属窗口组绑定

建议文件：

- `native/win32-window/src/popup_tracker.*`

完成标准：

- 能发现同步进程树中新出现的 popup
- 能把 popup 绑定到正确的主/镜像窗口组

---

### Task 7：实现非文本鼠标事务重放

目标：

- 点击、双击、滚轮先走稳定事务路径

范围：

- 坐标映射
- 客户区与非客户区命中
- replay worker 内鼠标执行

完成标准：

- 页面点击同步
- 浏览器原生按钮点击同步
- 滚轮同步
- 不引入主窗口闪烁

---

### Task 8：实现窗口事务同步

目标：

- 将最小化、恢复、移动、缩放纳入统一事务模型

范围：

- `SetWinEventHook`
- 事务分类
- 镜像窗口布局与状态同步

完成标准：

- 开关窗口状态一致
- 窗口移动与排列逻辑不冲突

---

### Task 9：实现普通键盘命令事务

目标：

- 英文按键、快捷键、删除、方向键等走统一事务重放

范围：

- `key-command` 分类
- replay worker 键盘重放

完成标准：

- 英文输入可同步
- 常见快捷键可同步
- 不破坏主窗口焦点体验

---

### Task 10：实现文本输入会话分类器

目标：

- 正式区分“普通按键事务”和“文本输入会话”

范围：

- 输入开始、进行中、结束判定
- 中文输入、英文连续输入统一归类

建议文件：

- `native/win32-window/src/text_session.*`

完成标准：

- 可识别一段连续输入为同一个文本会话
- 不再把中文输入当成若干独立物理键

---

### Task 11：实现文本输入会话重放

目标：

- 真正解决 Chromium 原生窗口内中文输入与文本提交同步

范围：

- 文本会话 replay
- 候选、提交、退格、取消等会话动作处理

完成标准：

- 主窗口输入中文时，镜像窗口得到中文结果而不是拼音字母
- 主窗口中文输入不闪烁、不失焦

---

### Task 12：接入 Chromium popup 的文本输入同步

目标：

- 让 popup 中的可输入操作也走统一文本会话链路

范围：

- popup 输入目标发现
- popup 文本事务目标绑定

完成标准：

- popup 场景下的输入不丢目标

---

### Task 13：完善同步悬浮工具栏与状态收口

目标：

- 工具栏状态准确，停止同步动作可可靠执行
- 顶部停靠收起行为遵循 `doc/floating-toolbar-docking.md` 的主进程状态机方案

范围：

- `SyncController`
- 工具栏窗口
- 前端 store
- 顶部停靠、展开、收起状态持久化

完成标准：

- 状态显示准确
- 停止同步后 hook/worker/toolbar 全部释放
- 鼠标离开且工具栏靠近屏幕上边缘时可靠收起，拖离上边缘后不自动缩回

---

### Task 14：整理与移除调试日志

目标：

- 在架构稳定后收敛临时调试输出

范围：

- `window-sync-native.log`
- 原生临时诊断代码

完成标准：

- 保留必要日志
- 删除试错阶段的噪声日志

---

## 3. 实施顺序

推荐严格按以下顺序执行：

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10
11. Task 11
12. Task 12
13. Task 13
14. Task 14

---

## 4. 当前立即执行项

当前批准后立刻开始的任务：

- Task 1：移除已证伪的 IME 补丁链路
- Task 2：稳定当前同步基线

这两个任务完成前，不进入事务引擎编码。

---

## 5. 当前执行状态

更新时间：2026-04-27

- Task 1：已完成
- Task 2：已完成
- Task 3：已完成，已新增 `InputReplayWorker`
- Task 4：已完成，已新增 `SyncTransaction`
- Task 5：已完成，已新增 `WindowGraph`
- Task 6：已完成，已新增 `PopupTracker` 并接入 WinEvent
- Task 7：已完成，鼠标事务已迁入 replay worker
- Task 8：已完成，窗口状态事务已迁入 replay worker
- Task 9：已完成，基础键盘事务已迁入 replay worker
- Task 10：已完成，已新增 `TextSessionClassifier`
- Task 11：部分完成，文本会话已分类，但中文提交结果同步仍需运行验证与继续深化
- Task 12：部分完成，popup 已跟踪，popup 文本输入目标绑定仍需运行验证
- Task 13：已完成现有状态收口，原生状态新增队列、窗口组、popup、文本会话字段
- Task 14：未执行，当前仍保留必要诊断日志用于后续运行验证
