# Phase 3 第 2 轮：真实模型 Provider 与 OliviaSoul Harness 适配

## 本轮定位

本轮目标是让信件服务可以连接真实外部模型、任意可插拔 Harness，或现有离线 fallback。OliviaSoul v18 是其中一个可选 Harness 适配器，不是信件核心的固定依赖。后台 worker、长期记忆、视频回信和 Phase 4 的 `LINLI-PLAY-001` 不在本轮实现。

## 复用策略

本轮同时借鉴两个项目，但职责不同：

- `https://github.com/1Dreamer666/olivia-lin`：参考人格资料、书信技艺、离线人格引擎和人格验收用例。
- `https://github.com/yilangren/OliviaSoul`：直接复用其 v18 Harness 的预检、记忆组装、生成、检查和必要重写流程。

Linli Nocturne 不重写 OliviaSoul 已经成熟的 Harness。通过配置 `harness.root` 指向外部项目的 `v18-harness` 目录，运行时调用它的 `run-live.ps1`；因此 Harness 的 Prompt、脚本、记忆档案和模型配置仍由 OliviaSoul 管理。仓库内新增的只是 Node provider 适配器、调用契约和测试。

项目文档会保留上述仓库链接、使用的版本/目录和调用方式。不会把 API Key、运行时数据库、真实信件、`_probe/` 产物或游戏资源提交进 Linli Nocturne。

## OliviaSoul 与当前架构对照清单

这张清单是进入真实 provider 开发前的边界确认，后续每次接入新的第三方实现都按同样方式检查：

| 分类 | 内容 | 在 Linli Nocturne 中的处理 |
| --- | --- | --- |
| 直接复用 | OliviaSoul v18 的预检、记忆组装、生成、检查和必要重写流程 | 由 `OliviaSoulHarnessProvider` 调用外部 `run-live.ps1`，不重写这套成熟流程 |
| 直接复用 | OliviaSoul 的 Harness 脚本、人物档案和 Prompt 组织方式 | 保留在外部 Harness 目录，由用户配置路径；项目只传入信件并读取统一结果 |
| 需要适配 | PowerShell 参数、临时信件文件、回信文件和 `HARNESS LIVE DONE` 完成标记 | 由适配器转换为统一的 `generate(input) -> { text, provider, metadata }` |
| 需要适配 | `olivia-lin` 的人格资料、书信技艺、离线引擎和验收用例 | 作为外部参考或未来可选实现，接入时放在 Harness/Provider 边界内 |
| 必须自己实现 | Provider 链、超时、失败分类、fallback、隐私保护和 API 配置 | 由 Linli Nocturne 核心负责，保证 LetterService 不依赖某个第三方项目 |
| 必须自己实现 | 项目的模块选择、配置保存、能力检查和切换入口 | 当前由 `ModuleSettings`、校验器和可读配置向导提供基础入口；最终 App 图形设置页仍沿用同一模型，在设置/发行阶段补齐 |
| 不带入项目 | 第三方运行时数据库、真实信件、API Key、私有语料、`_probe/` 和游戏资源 | 不复制、不提交、不写入 Linli Nocturne 的源代码仓库 |

## 需求

1. 支持配置外部 OpenAI 兼容模型端点，发送 system prompt、来信、模型名和认证头，并解析标准 JSON 回复。
2. 提供通用 Harness 插槽。任何实现 `generate(input)` 并返回统一结果的 Harness 都可以注入；同时提供 OliviaSoul v18 适配器，调用 `run-live.ps1`，校验 `HARNESS LIVE DONE`、非空正文和 `[BLOCKED]` 安全结果。
3. 基础模型可以选择外部 API、本地模型或离线 fallback；Persona 始终作为基础模型输入层复用。OliviaSoul v18 是完整 Harness，它自己执行预检、生成、检查和重写，但后端端点、模型名和 Key 由基础模型配置提供；离线 fallback 只能做无模型链路测试，不能执行这套多步流程。
4. API Key 只存在于请求头或进程环境，不写入信件、SQLite、错误文本、测试快照或日志。
5. provider 路径、端点、模型名、超时、system prompt 和 fallback 开关全部由调用方配置，不写死任何用户路径或地域。
6. 保持现有 `ModelAdapter.generateReply()` 契约不变，旧 fake provider 和当前信件重试逻辑继续通过。

## 设计

- `OpenAICompatibleProvider` 负责外部 HTTP 调用，使用 `fetch`、超时和最小化错误码；响应正文只提取模型文本，不把原始响应写入错误。
- `HarnessProvider` 是项目拥有的通用插槽；自定义 Harness 可以直接注入，不需要修改 `LetterService`。`OliviaSoulHarnessProvider` 只是一个适配器实现，使用参数数组启动 PowerShell，不拼接 shell 命令；临时来信和回信文件放在系统临时目录，完成后删除。
- `createConfiguredModelAdapter(config)` 保留通用 provider 链；启用完整 OliviaSoul Harness 时，运行时应把它作为当前回信执行管线，并把选中的基础模型配置传给它。不能把 Harness 当成与基础模型互斥、却又在链中永远排不到的第二个模型。
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
