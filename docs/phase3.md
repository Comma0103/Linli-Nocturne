# Phase 3：信件体验总览

Phase 3 负责信件发送、排队、文字回信、人格/记忆接入和已有视频回信资产管理。这里的“视频回信资产”只包括已有 MP4 的导入、检查、保存、播放、替换和删除，不包括视频回信自动生成，也不包括视频回信中的即兴创作。

文字回信、视频回信（含即兴创作）和定制演奏是三条不同能力线。Phase 3 已完成文字回信和视频资产基础；视频回信生成及其中的即兴创作不归入 Phase 3 的后续编号，定制演奏则继续由 Phase 4 及后续音乐路线单独推进。它不负责用户 MIDI 接管原生 WebPlayer；`LINLI-PLAY-001` 属于 Phase 4 的跨层问题。

## 文档组织

Phase 0、Phase 1 和 Phase 2 目前各有一份阶段总览文档。Phase 3 也保留这份总览，同时把每个有独立需求、设计和验收边界的里程碑拆成详细文档。README 的开发路线在每个 Phase 3 二级项后都标出对应文档，避免只看路线时找不到设计依据。

| 路线项 | 详细设计与验收 | 状态 |
| --- | --- | --- |
| Phase 3-1 | [信件可靠性首个里程碑](./phase3-1-letter-reliability.md) | 已完成 |
| Phase 3-2 | [真实 Provider 与 OliviaSoul Harness](./phase3-2-provider-and-harness.md) | 已完成 |
| Phase 3-3 | [信件后台 Worker](./phase3-3-letter-worker.md) | 已完成 |
| Phase 3-4 | [信件记忆和连续对话](./phase3-4-letter-memory.md) | 已完成 |
| Phase 3-M1 | [模块化适配层最小增量修复](./phase3-m1-modular-adapters.md) | 已完成 |
| Phase 3-5 | [视频回信资产流程](./phase3-5-letter-video-assets.md) | 已完成 |
| Phase 3-6 | 本页的总体验收边界和交接文档 | 已完成 |
| Phase 3-7 | [Steam 游戏界面实机验收（离线 fallback）](./phase3-7-steam-acceptance.md) | 已完成 |
| Phase 3-8 | [真实模型 Steam 实机验收](./phase3-2-provider-and-harness.md) | 已完成（`243c3e4`） |
| Phase 3 融合 | [Persona 与 Harness 融合](./phase3-exp-persona-harness-fusion.md) | 已实现融合、持续记忆和迁移，并完成 Steam 离线/在线复验；已合入 `main` |

## 总体验收边界

Phase 3-6 已把上述信件文字链路、Worker、Provider、记忆和视频资产流程串起来，完成设置解析、错误恢复、网关端到端测试和文档同步；代表性验收提交为 `b5e7e8a`。Phase 3-7 已由用户完成离线 fallback 的 Steam 界面验收，Phase 3-8 又由用户在 Steam 中完成 DeepSeek + Persona + OliviaSoul Harness 真实模型验收。Phase 3 的代码链路和 Steam 用户路径现已完成；最终 App 设置页、视频自动生成、安装器和发行流程仍属于后续工作。

Phase 3 完成后的音乐工作已推进至 Phase 4-1 至 4-4 验收完成，下一步是 Phase 4-5 外部音乐导入的调研与设计，见 [Phase 4 总览](./phase4.md)。任何新增第三方 Provider、Harness、Persona、Renderer 或视频检查器都必须接入统一注册表和适配器，不得把现有实现写成唯一实现。

Phase 3 融合实现了第三方 Persona 素材包、Olivia-lin 离线人格引擎、`linli.fusion-v1` 和逐次执行留痕；用户已在 Steam 中完成离线与 DeepSeek 两轮实机验收，相关代码已合入 `main`。

后续倒查发现的第三方素材接入、离线人格引擎、落款和逐封执行来源缺口已在融合实验中处理，并通过本次两轮 Steam 复验；旧实机记录仍作为历史证据保留。

## 2026-09-11 收尾复核

最终 Steam 回归再次确认第四套 DeepSeek + Persona + `linli.fusion-v1` + `olivia-soul.sqlite` 在线写信，以及三条合成视频回信资产播放。`letters.dailyLimitBypass=true` 同时覆盖信件和 MIDI 定制演奏的本地每日用量显示；这些收尾改动已合入 `main`，并由 `phase4-steam-acceptance-v1.0.0` 标记。Phase 3 的自动视频生成仍未实现，已有资产播放和自动生成继续按两条能力线记录。
