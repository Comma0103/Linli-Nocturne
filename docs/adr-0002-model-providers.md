# ADR-0002：模型提供方可插拔

## 决策

统一 `ModelAdapter` 协议，提供外部 API、可插拔 Harness、本地模型和无模型降级四类 provider。每个 provider 只暴露 `generate(input)` 并返回可规范化的 `{ text, provider, metadata }`；`ModelProviderChain` 负责按外部、Harness、本地、fallback 顺序选择可用结果。OliviaSoul v18 通过适配器接入，是 Harness 的一个实现，不是核心依赖。额度、记忆、审核、重试和持久化由领域服务负责。

## 结果

用户首次配置时可以通过 ModuleSettings 选择 provider、Harness、人格和记忆实现；高级设置允许按任务切换。API Key、端点和模型名不写入信件内容，也不进入 Git。外部/本地 provider 的具体网络或进程调用由调用方注入，便于用 fake provider 验证协议而不依赖真实服务。
