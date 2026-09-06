# Phase 3 首个里程碑：信件可靠性

## 目标与范围

本里程碑统一信件和 MIDI 的“当天”边界，并把信件处理从一次性手动生成扩展为可恢复的状态机。保留现有 `POST /letter/process` 作为开发和网关冒烟入口；后台 worker 只定义可调用的领取接口，不在本里程碑引入常驻进程。

本里程碑不处理 `LINLI-PLAY-001`，不接触 Steam 游戏目录，也不宣称自动文字回信、视频回信或最终安装器已完成。`LINLI-PLAY-001` 属于 Phase 4 音乐体验的跨层缺陷，不是本里程碑或 Phase 3 后续工作的技术前置条件。

## 需求

1. LetterService 与 MidiJobService 使用同一个显式 IANA 时区配置，默认值为 `Asia/Shanghai`；跨午夜时，信件额度和 MIDI 生成统计必须落在同一个本地自然日。
2. Letter 状态固定为 `pending`、`processing`、`replied`、`failed`。新信件进入 `pending`，只有原子领取成功后才进入 `processing`。
3. 领取操作必须幂等：并发调用最多只有一个调用拿到同一封信；服务重启后不会把已回复信件再次领取。
4. 模型失败时按配置的重试延迟重新进入 `pending`；达到最大尝试次数后进入 `failed`，保存最后一次错误，不能无限重试。
5. 外部 API、本地模型和离线 fallback 通过同一个 `generate(input)` 协议接入；fake provider 可以覆盖成功、失败和 fallback 链路。
6. 文字回信端到端测试覆盖网关发送、延迟后处理、回复读取、失败重试和最终失败。

## 设计

- `src/core/time-boundary.js` 提供基于 IANA 时区的本地日边界计算。SQLite 仍保存 UTC ISO 时间；查询使用该时区对应的 UTC `[start, end)` 区间。
- `letters.status` 采用 `pending/processing/replied/failed`，并增加 `attempt_count`、`processing_started_at`、`last_error`、`next_attempt_at` 字段。旧数据库中的 `queued` 迁移为 `pending`。
- SQLite 领取在事务中完成：选择最早可处理的 `pending` 信件并立即递增尝试次数、写入 `processing`；重复领取只能看到空结果。模型成功写入 `replied`，失败时根据 `maxAttempts` 写回 `pending` 或 `failed`。
- `ModelProviderChain` 按外部、本地、fallback 顺序尝试 provider。每个 provider 都只暴露 `generate(input)`；`ModelAdapter` 负责校验并规范化 `{ text, provider, metadata }`。
- 网关兼容字段继续保留；`letterStatus` 在兼容响应中反映 `replied/failed/llm_processing`，失败原因放在 `error`，不改变原版路由形状。

## 验收标准

- 在 `Asia/Shanghai` 的 23:59 与次日 00:01 发送信件时，额度分别计入两个自然日；MIDI `generatedToday` 使用同一边界。
- 两个并发 `processNext()` 调用不会重复生成同一封信；成功后状态为 `replied`。
- fake 外部 provider 成功时不调用后续 provider；外部失败时本地 provider 接管；两者都失败时 fallback 接管；无 fallback 且全部失败时得到明确错误。
- provider 连续失败在达到最大次数前返回 `pending` 并等待下一次处理，达到最大次数后为 `failed` 且保留错误。
- 网关端到端测试验证发送、处理、列表/详情和失败状态；`pnpm test`、`git diff --check` 全部通过。

## 配置边界

时区、最大尝试次数和重试延迟均为服务构造参数。外部 API 的端点、模型名和凭据只由 provider 配置持有，不写入 Letter 内容、SQLite 信件正文或 Git；真实网络 provider 和后台 worker 留待后续小步实现。
