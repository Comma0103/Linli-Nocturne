# 第三方 Persona 与 Harness 复用清单

本页记录实验分支 `exp/phase3-persona-harness-fusion` 实际装配的来源。两套仓库没有整体绑定优先级；每项能力按适用性取舍，生成结果和玩家历史仍由 Linli Nocturne 自己的接口与 SQLite 管理。

| 能力 | 来源 | 项目落点 | 处理方式 |
| --- | --- | --- | --- |
| 人格、背景 | `1Dreamer666/olivia-lin` 的 `persona/olivia_lin.md`、`memories.md` | `PersonaBundleProvider` | 原文装配并记录提交和哈希；历史描述不变成地区访问限制 |
| 书信结构、场景、样例 | `olivia-lin` 的 `letter_craft.md`、`samples/letters_from_her.md` | PersonaBundle 与离线引擎 | 采用具体细节、场景化回应和落款；时间/天气与邀请不是必选项；篇幅按内容决定，不强加固定字数 |
| 无模型生成 | `olivia-lin` 的 `skill/local_engine.py` | `OliviaLinOfflineProvider` | Python 薄桥接直接调用；不扫描上游配置、不读取上游记忆、不联网 |
| 预检、草稿、检查、有限重写 | `yilangren/OliviaSoul` v18 的 `harness/01/03/04/05` | `fusion-explicit.ps1` 与 `FusionHarness` | 只使用显式传入的模型、Persona、规则和历史，不调用隐藏档案 |
| 栏目和关系事实检查 | OliviaSoul v18 `harness/00-栏目.md`、`写法.md` | 融合 Harness | 保留关系证据检查；融合输入去掉固定字数/段数上限，称呼与记忆边界使用项目规则；上游文件不变 |
| 场景验收 | `olivia-lin/samples/eval_testcases.md` | 自动化和后续质量评测 | 用例作为输入和检查方向，不把示例答案塞进待测上下文 |
| 有限历史（保留选项） | 近期上下文与主题组织 | `SqliteMemoryProvider` | 保留有限往来和主题画像；与持续记忆可二选一 |
| 持续记忆与关系（已实现） | OliviaSoul 的 memory-lib.ps1、01-初始化账本.md、01-预检.md | `OliviaSoulSqliteMemoryProvider`、Fusion | 直接加载逐封/滚动摘要提示词，保留 5/5/旧信分层及来源规则；账本显式继承，随成功回信原子提交 |
| 原文证据（已实现） | OliviaSoul 的 history-retrieval.ps1 | olivia-soul-memory-retrieval.ps1 | 直接调用原版快照校验和 search/read/neighbors、去重及预算；仅从当前玩家 SQLite 生成临时快照 |

不自动读取上游私有配置或 APPDATA 数据库；关系、历史和摘要统一保存在项目 SQLite。refresh-live-memory.ps1 的显式输入模式用于参考，实际摘要采用 memory-lib.ps1 更完整的规则，避免重复实现。手工备用启动器、密码软删除和磁盘 mem_cache 不直接接入；项目提供统一遗忘与可校验数据包迁移。详见[融合实验 §4.1](./phase3-exp-persona-harness-fusion.md#41-持续关系与长期记忆2026-09-08)。持续记忆已通过自动化，并完成 Steam 离线/在线复验。

每封信的执行记录保存实际 provider、模型、Harness、Persona 哈希、记忆来源、阶段和降级原因；不保存 API Key、请求头、完整 Prompt 或推理过程。旧信缺少这些字段时标记为未知。

实验保留 `olivia-soul-v18` 作为独立旧适配器；默认融合实现是 `linli.fusion-v1`，两者都不是框架唯一实现。
