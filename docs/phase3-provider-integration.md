# Phase 3 第 2 轮：真实模型 Provider 与 OliviaSoul Harness 适配

## 本轮定位

本轮目标是让信件服务可以连接真实外部模型、任意可插拔 Harness，或现有离线 fallback。OliviaSoul v18 是其中一个可选 Harness 适配器，不是信件核心的固定依赖。后台 worker、长期记忆、视频回信和 Phase 4 的 `LINLI-PLAY-001` 不在本轮实现。

## 复用策略

本轮同时借鉴两个项目，但职责不同：

- `https://github.com/1Dreamer666/olivia-lin`：参考人格资料、书信技艺、离线人格引擎和人格验收用例。
- `https://github.com/yilangren/OliviaSoul`：直接复用其 v18 Harness 的预检、记忆组装、生成、检查和必要重写流程。

Linli Nocturne 不重写 OliviaSoul 已经成熟的 Harness。通过配置 `harness.root` 指向外部项目的 `v18-harness` 目录，运行时调用它的 `run-live.ps1`；因此 Harness 的 Prompt、脚本、记忆档案和模型配置仍由 OliviaSoul 管理。仓库内新增的只是 Node provider 适配器、调用契约和测试。

项目文档会保留上述仓库链接、使用的版本/目录和调用方式。不会把 API Key、运行时数据库、真实信件、`_probe/` 产物或游戏资源提交进 Linli Nocturne。

## 需求

1. 支持配置外部 OpenAI 兼容模型端点，发送 system prompt、来信、模型名和认证头，并解析标准 JSON 回复。
2. 提供通用 Harness 插槽。任何实现 `generate(input)` 并返回统一结果的 Harness 都可以注入；同时提供 OliviaSoul v18 适配器，调用 `run-live.ps1`，校验 `HARNESS LIVE DONE`、非空正文和 `[BLOCKED]` 安全结果。
3. 外部 provider 失败或超时后，按外部 provider、Harness、本地模型、fallback 的顺序尝试；禁用 fallback 时返回明确错误。
4. API Key 只存在于请求头或进程环境，不写入信件、SQLite、错误文本、测试快照或日志。
5. provider 路径、端点、模型名、超时、system prompt 和 fallback 开关全部由调用方配置，不写死任何用户路径或地域。
6. 保持现有 `ModelAdapter.generateReply()` 契约不变，旧 fake provider 和当前信件重试逻辑继续通过。

## 设计

- `OpenAICompatibleProvider` 负责外部 HTTP 调用，使用 `fetch`、超时和最小化错误码；响应正文只提取模型文本，不把原始响应写入错误。
- `HarnessProvider` 是项目拥有的通用插槽；自定义 Harness 可以直接注入，不需要修改 `LetterService`。`OliviaSoulHarnessProvider` 只是一个适配器实现，使用参数数组启动 PowerShell，不拼接 shell 命令；临时来信和回信文件放在系统临时目录，完成后删除。
- `createConfiguredModelAdapter(config)` 按 `external`、`harness`、`local`、`fallback` 创建 `ModelProviderChain`。`harness` 可以是任意 provider 对象，也可以配置为 `olivia-soul-v18`；旧的 `local.kind = olivia-soul-harness` 仅保留兼容。
- OliviaSoul 的 Harness 自己维护人物档案、跨封账本和记忆投影；本轮不把这些文件复制到 Linli Nocturne，也不再另造一套同功能的 Prompt。

## 配置示例

```js
const adapter = createConfiguredModelAdapter({
  external: {
    endpoint: 'https://example.invalid/v1',
    apiKey: process.env.LINLI_EXTERNAL_API_KEY,
    model: 'example-model',
    systemPrompt: '只输出林离的中文回信。',
    timeoutMs: 15000,
  },
  harness: {
    kind: 'olivia-soul-v18',
    root: 'D:/Aesthetic/work/OliviaSoul-reference/v18-harness',
    person: 'linli-local-user',
    timeoutMs: 60000,
  },
  // 也可以把任意自定义 Harness 直接注入：
  // harness: { provider: 'my-harness', generate: async input => ({ text: '...', provider: 'my-harness' }) },
  fallback: true,
});
```

## 验收标准

- fake OpenAI 兼容端点收到正确的模型、system/user 消息和 Bearer 认证头，并能返回规范化文字。
- fake Harness runner 收到参数数组、正确的临时文件和 `v18-harness/run-live.ps1` 路径；成功输出被规范化为统一 provider 结果。
- 自定义 Harness 可以替换 OliviaSoul 适配器而不修改 `LetterService`；外部端点返回 500 或超时时，能够继续调用 Harness，再按顺序尝试本地模型和 fallback。
- 禁用 fallback 且所有 provider 失败时，返回 `provider_chain_exhausted`，错误中不出现 API Key、原始响应正文或私信内容。
- 所有临时文件在成功和失败后都被清理；现有 `pnpm test` 全部通过，并新增本轮 provider 测试。

## 本轮完成边界

本轮完成“连接和复用 provider”的能力，不代表真实 API 已在用户机器上配置，也不代表后台自动回信已经完成。人格质量沿用 OliviaSoul 的 Harness 规则，后续再用其回归用例接入 Linli 的验收流程。
