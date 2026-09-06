# Phase 3 第 3 轮：信件后台 Worker

## 本轮定位

本轮让信件在服务启动后自动处理，不再要求用户或游戏前端手动调用 `POST /letter/process`。手动接口继续保留，作为调试和诊断入口。本轮不改变信件额度、延迟、provider 选择或回信内容格式，也不处理视频回信。

## 需求

1. Worker 启动后按固定间隔领取可处理的 `pending` 信件并调用现有 `LetterService`。
2. 同一进程内不能因为定时器重叠而同时处理同一批任务；多进程或重启场景仍由 SQLite 原子领取保证不重复领取。
3. 进程在 `processing` 状态退出后，下一次启动必须能识别过期租约，将信件重新排队；达到最大尝试次数后进入 `failed`，不能无限重试。
4. Worker 必须有明确的启动、停止和单次运行接口，便于 App 生命周期管理、测试和诊断。
5. Worker 失败不能让定时器停止；单封信的 provider 错误仍由 `LetterService` 记录并按既有重试策略处理。

## 设计

- `LetterWorker` 只负责调度，不直接读写信件字段。它调用 `LetterService.recoverStaleProcessing()` 和 `processNext()`。
- SQLite 增加按 `processing_started_at` 检查过期租约的操作。租约过期时，未达到上限的信件回到 `pending`，达到上限的信件进入 `failed`。
- Worker 默认每次 tick 处理一封信，避免 provider 较慢时占满本地资源；`runOnce()` 可由诊断命令主动调用。
- `runOnce()` 有进程内互斥，重叠调用共享同一个 Promise。跨进程安全仍依赖 `claimNextLetter()` 的条件更新。
- 默认租约时间为 5 分钟，默认轮询间隔为 1 秒；两者都可配置，不写死到 UI 或某个模型实现。

## 验收标准

- 启动 Worker 后，待处理信件无需调用 `/letter/process` 即能进入 `replied`。
- 两次并发 `runOnce()` 最多调用一次模型，信件不会生成两封回信。
- 模拟服务在 `processing` 状态退出并等待租约过期后，新的 Worker 能重新处理；达到最大尝试次数后状态为 `failed`。
- 停止 Worker 后不会再创建新的 tick；手动 `POST /letter/process` 仍然可用。
- Worker 测试、现有信件测试、网关冒烟测试和完整 `pnpm test` 全部通过。

## 边界

本轮完成本地后台调度和 SQLite 租约恢复，不代表真实外部模型已经配置，也不代表视频回信或最终 App 图形设置界面已经完成。普通用户当前可以通过可读配置向导选择 provider、Harness、人格、记忆和音乐适配器；最终图形界面会复用同一设置模型。
