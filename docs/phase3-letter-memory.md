# Phase 3 第 4 轮：信件记忆和连续对话

## 本轮定位

本轮让回信 provider 可以参考之前的有限对话，同时把记忆做成可替换模块。默认核心流程不依赖某个数据库、模型或第三方 Harness；视频回信、最终 App 设置界面和 Phase 4 的 `LINLI-PLAY-001` 不在本轮实现。

## 需求

1. 定义统一的 `MemoryProvider` 接口，至少支持 `recall(input)` 和 `remember(input)`；SQLite、远程记忆服务和第三方 Harness 的记忆都可以实现它。
2. LetterService 在生成回信前请求有限记忆，在成功回信后保存本轮对话；记忆失败不能让已经生成的回信变成失败。
3. 记忆必须有总开关、每位收信人的最大条数、单条最大字符数和注入模型的最大字符数。
4. 记忆只保存必要的截断文本和来源信件 ID，不保存 API Key、provider 原始响应或无限增长的完整历史。
5. 默认使用无记忆实现，现有信件行为不因升级自动改变；用户显式启用后才保存和注入记忆。

## 设计

- `MemoryProvider` 是项目自己的稳定契约。`NoopMemoryProvider` 保持关闭状态，`SqliteMemoryProvider` 提供本地 bounded memory；未来可增加 OliviaSoul memory、向量库或其他远程实现。
- `SqliteStore` 增加 `memory_episodes` 表，每条记录关联 `source_letter_id`，通过唯一约束保证同一封信不会重复写入；插入后按收信人裁剪最旧记录。
- 记忆上下文以统一纯文本传给 `ModelAdapter.generateReply()` 的 `memory` 字段。外部 OpenAI provider 和 OliviaSoul Harness 只负责把它转换为各自输入格式，领域服务不读取第三方记忆文件。
- 记忆 provider 的异常只记录为可诊断状态并跳过本轮记忆；回信正文和信件状态仍以 LetterService/SQLite 为准。

## 验收标准

- 未配置记忆时，现有 provider 收到空记忆，现有信件测试和回信文本不变。
- 启用 SQLite 记忆后，第二封信能收到第一封已回复信的截断上下文；成功回信后只保存一条对应 episode。
- 超过最大条数、单条字符数或总上下文字符数时，旧记录或超出部分被裁剪，数据库不会无限增长。
- 关闭记忆后不新增记录，也不向 provider 注入历史文本。
- 模拟记忆 provider 的读取或写入失败时，信件仍能正常回复，且 provider 不会得到敏感配置或未限制的原始数据。
- 完整 `pnpm test`、网关冒烟测试和 `git diff --check` 通过。

## 边界

本轮只实现有限对话记忆和统一接口，不实现自动摘要、向量检索、人格长期档案或视频回信。真实 App 设置界面将在后续设置/发行阶段接入记忆开关和 provider 选择。
