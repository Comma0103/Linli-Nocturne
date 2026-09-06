# Linli Nocturne（林离·余音）：Phase 3 → Phase 4 交接文档

> 将本文完整交给新任务即可开始开发，无需旧聊天记录。本文是当前唯一交接入口，在原文件上持续更新，不另建重复的长期状态文档。
>
> 更新日期：2026-09-07。更新前核对的 `main` 提交：`615ff80`；本轮重新运行 `pnpm test`，84/84 通过。接手时仍须检查最新提交、工作区和测试，本文的快照不能代替现状检查。

## 1. 接手目标与第一步

你正在接手 [Comma0103/Linli-Nocturne](https://github.com/Comma0103/Linli-Nocturne)。项目名称为 **Linli Nocturne（林离·余音）**，默认分支 `main`。代码和展示文案使用简体中文，不添加地域限制。

用户要的是：普通玩家安装我们交付的软件或插件后，直接在原装《BSide: Olivia Lin》Steam 游戏界面使用恢复和扩展的功能。HTTP 接口通过、脚本成功、数据库有结果，都不能单独代表游戏体验已经完成。

现在从 **Phase 4-1** 开始，以已有音乐代码为基础补齐完整用户路径。先做现状核对和本轮需求、设计、验收标准，再实施最小增量修改；不要重做 Phase 0–3，也不要一次性重写整个 Phase 4。

接手顺序：

1. 确认当前目录是这个代码仓库，并检查 `git remote -v`。新任务的工作目录可能是 Steam 游戏目录，不能在那里创建代码、运行产物或执行补丁试错；以用户选择的仓库位置为准，不硬编码上一台电脑的路径。
2. 在仓库根目录执行 `git status`、`git log -12 --oneline`、`pnpm test`。保留用户已有修改；不能清理、覆盖或一起提交不属于本轮的文件。
3. 阅读本文，再阅读 [README](../README.md)、[需求](./requirements.md)、[架构](./architecture.md)、[已知问题](./known-issues.md)、[Phase 4](./phase4.md)、[RenderJob](./render-job.md)、[模块设置](./module-settings.md)、[游戏接入](./original-installation.md) 和相关源码、测试。
4. 对照第 4 节列出的源码差异，区分“已有能力”“尚未完整接通”“未来扩展点”，确定 Phase 4-1 的第一个可验证增量并开始开发。

本机开发基线为 Windows、Node.js 24、pnpm；项目 README 要求 Node.js 22 及以上、pnpm 9 及以上。MP4 编码使用 FFmpeg，视频检查使用 FFprobe，OliviaSoul 适配器使用 PowerShell。依赖不可用时先定位实际运行环境，不把某个开发工具自带的运行时绝对路径写进项目。

## 2. 阶段边界和已完成事项

| 阶段 | 职责 | 当前状态 |
| --- | --- | --- |
| Phase 0–1 | 调研、协议和本地领域核心 | 已完成，保留现有实现与测试 |
| Phase 2 | 游戏接入基础 | 已完成；包括官方预设曲目 Steam 演奏验收 |
| Phase 3 | 信件体验 | 代码及离线、真实模型 Steam 文字回信路径已验收 |
| Phase 4 | 完整音乐体验 | 尚未开始新里程碑；上传 MIDI 原生播放仍有跨层缺陷 |
| Phase 5 | 定制演奏与 3D 表现 | 待开发：先做现有实现调研和最小技术预研，再建立统一时间轴、同步模块和可替换 Renderer |
| Phase 6 | 视频回信与即兴创作 | 待开发：依赖 Phase 5 技术底座；先调研真实功能，再实现上下文、生成器、fallback 和用户入口 |
| Phase 7 | App 与发行 | 待完成：最终 GUI、普通用户安装器、诊断恢复和发行流程 |

### 三条能力线的边界

后续开发必须把下面三种体验分开管理：

- **文字回信**：信件文本、模型/Persona/Harness、有限记忆和文字状态流转。
- **视频回信（含即兴创作）**：由回信上下文触发的视频回复，可能包含林离说话、自拍、弹琴、唱歌或根据话题进行改编；它不是已有 MP4 导入，也不是用户上传 MIDI 后的定制演奏。
- **定制演奏**：用户上传 MIDI 或选择曲目后，生成音频、演奏媒体和后续 3D 演奏表现。

三者可以共用 `RenderJob` 的排队、处理中、成功、失败、取消、重启恢复、媒体保存、格式检查和查询基础设施，但必须由各自的领域服务定义输入、输出和验收标准。视频回信生成必须使用独立的 `VideoGenerator` 接口和注册表；`media.videoImporter` 仍只负责已有视频资产检查。

视频回信自动生成不归入 Phase 3 的后续编号，也不能因为 Phase 3 已完成视频资产流程而算作完成。正式设计文档应在路线图确定独立的阶段编号后再命名，不能创建 `phase3-9-video-reply-generation.md` 这种会混淆阶段边界的文件。

### 已完成的信件基础

- 默认每日 3 封、每封延迟 5 分钟；`letters.dailyLimitBypass` 默认关闭，开启后跳过次数和等待限制，并向游戏报告仍可写信。
- 领域状态为 `pending/processing/replied/failed`；有 SQLite 原子领取、有限重试、最大尝试次数、Worker 和过期 processing 租约恢复。
- 外部、本地 OpenAI 兼容模型和无模型 fallback 已接入；Persona、Harness、Memory 可组合。有限 SQLite 记忆默认关闭。
- 视频回信已有 MP4 资产导入、检查、保存、播放、替换、删除及状态处理；这不是视频自动生成，也不是 3D 回信。
- Steam 信件兼容层的数字状态、写信额度、玩家称呼、失败重寄和 Harness 路径问题已修复，有对应回归测试，不要重新制造这些问题。

2026-09-07 用户在客户端 `0.0.9.627` 中实际确认了两类结果：

- 重新打开离线测试信件后，看到了回信正文。
- DeepSeek + 仓库内 Persona + OliviaSoul v18 Harness 完成真实请求和多步处理，游戏中显示完整回信，称呼使用配置里的玩家名字。

证据入口：[Steam 验收](./phase3-7-steam-acceptance.md)、[真实 provider 验收](./phase3-2-provider-and-harness.md)、[Phase 3 总览](./phase3.md)。代表性提交为 `b7cd5ef`（Harness 路径修复）、`243c3e4`（验收记录）；更早里程碑及提交见 README 开发路线。

这些证据不等于所有模型、全部第三方能力、视频自动生成或完整发行版均已验收。离线 fallback 是无模型回复路径，不用于评价真实模型质量，也不能执行 OliviaSoul 的多步模型调用。

### 已有的音乐和接入基础

- MIDI 上传、音符/Tempo/踏板解析、时间轴清单、内置 WAV 渲染和音频 MP4 封装。
- 任务结果、失败状态、媒体读取、SQLite 元数据和已生成媒体恢复；曲目分页、歌单保存与原版字段兼容。
- 本地曲目已能在离线曲库显示并加入音乐桌面；官方预设曲目演奏正常。
- AudioRenderer、Renderer 注册表、GamePlaybackAdapter、Encoder 和统一 RenderJob 已存在，不要从零重建。
- 版本白名单、SHA-256 基线、外置备份、受保护补丁、回滚和修改检测已实现。只验证过客户端 `0.0.9.627`；最终安装器仍缺进程锁、事务日志、安装后完整验证和卸载命令。

## 3. 当前配置、第三方复用和模块原则

### 配置与运行入口

普通用户配置是 `config/user-config.json`，由 `config/user-config.example.json` 复制，已被 Git 忽略。不要再迁回 `secrets/`，不要覆盖用户已填写的配置，也不要把模型名或 API Key 固定成开发者自己的值。

信件配置的组合关系必须保持：

```text
letters.baseModel.provider：offline / external / local
                + letters.persona
                + letters.harness
                + letters.memory
                → 统一回信结果
```

Persona/Harness 位于基础模型之上，不是与外部 API、本地模型互斥的模型选项。完整 OliviaSoul Harness 自己调用所选模型，不能退回把它当成备用模型的错误设计。不同实现的 fallback 行为须按代码和测试核对，不能承诺任何组合都会自动降级。

- `config/module-settings.json` 是实现 ID 和普通选项的开发者配置；`ModuleSettingsStore` 明确拒绝密钥。现有校验命令和终端向导分别是 `scripts/validate-module-settings.mjs`、`scripts/configure-modules.mjs`，最终 App 图形设置页尚未完成。
- 私有 `config/user-config.json` 可以保存用户的模型地址、模型名和 API Key；这与“不在 module-settings 中保存密钥”是两个不同约束。密钥不得进入日志、信件、媒体元数据、聊天输出或提交。
- 当前启动器检测到用户配置时优先使用其解析结果；不能假设修改 module-settings 或环境变量一定会覆盖用户配置。实际合并行为见 `src/config/user-config.js` 和 `src/app/local-app.js`。
- 启动命令为 `node scripts/start-local-service.mjs`，默认显示 `http://localhost:27149`；健康检查应在另一个终端执行。配置修改后需重启服务。
- 默认运行目录是仓库根目录下被忽略的 `data/`，可通过 `LINLI_DATA_ROOT` 指定其他位置。SQLite、媒体和 Harness 运行副本都必须在 Steam 游戏目录之外；并非必须在代码仓库之外。
- Persona/Harness 的相对路径以用户配置文件所在目录解析；模板的 `../third_party/...` 因此可跨机器使用。运行时动态解析出绝对路径是正确做法，不能硬编码开发者电脑路径。
- `user.displayName` 是玩家名字；领域和游戏协议的 recipient 是林离；Harness 的 person 是归档键。此约定只用于维护代码契约，不要把这个已修复的 Bug 再写成 README 功能或用户警告。

### 复用和可插拔要求

适用于所有 Phase：核心处理统一接口和中间表示；能复用成熟实现就通过适配器接入，确实不适用的部分再自行实现。

- OliviaSoul：`third_party/OliviaSoul/v18-harness`，复用多步信件 Harness、规则和脚本。
- olivia-lin：`third_party/olivia-lin`，内置人格、书信技艺、公开记忆、评测材料及相关源文件。文件已收录不代表每种能力都已连入运行流程。
- 默认所需资产已经随仓库提供，不能只留下接口再要求用户分别下载两个上游仓库。来源、固定提交和已有许可记录见 [第三方目录说明](../third_party/README.md) 与 [引用说明](./third-party-credits.md)；复用时保留这些记录和 README 末尾致谢。

应可替换：模型、人格、Harness、MemoryProvider、音频/视频渲染、播放适配器、编码器、来源导入器及未来 3D 同步器。新增实现须有可测试接口、配置校验、错误反馈和用户选择入口。最终 App 必须让只会用 Steam 的玩家也能选择模块和 fallback，不能把“开发者能注入对象”当作用户设置已经完成。

无需形式化抽象：SQLite 已被确定为本地事实源；原版游戏独有的 TOD、song 和 WebPlayer 契约放在游戏适配层即可。只有一种合理接入方式、替换对用户没有实质收益的内部组件，不要求凭空制造第二种实现。

## 4. 本轮核查发现的边界：作为 Phase 4 的起点

以下来自 `615ff80` 源码的只读核查，本轮未改代码。新任务先补测试确认，再按相关里程碑修复，不因 README 的概括勾选而忽略运行入口的实际行为。

| 核对项 | 当前代码事实与开发含义 |
| --- | --- |
| 音乐配置是否生效 | `loadUserConfig()` 从默认模块设置出发，只重建信件选择；没有把模板的 music/media/threeD 选择合入运行设置。存在 user-config 时，local-app 又不走 module-settings 的读取分支。Phase 4 必须验证用户选择能到达实际 Renderer/Encoder/PlaybackAdapter。 |
| 时区是否完整传入 | local-app 把用户时区传给 LetterService，却未传给 MidiJobService。两项领域服务共用日界线工具的测试已通过，但非默认时区在服务启动入口仍需补集成验证。 |
| 媒体格式是否一致 | local-app 传入 MP4 编码器，却未同时传入 MidiJobService 的 mediaExtension/mediaContentType，后两者默认仍为 wav/audio-wav。要用独立媒体和网关测试核对实际字节、文件后缀、响应类型及重启读取，不能把它直接认定为原生播放 Bug 的原因。 |
| 取消与恢复的深度 | MidiJobService.generate 当前同步渲染，结束后保存成功或失败结果；上传缓存位于内存。已有 cancel 接口、终态恢复和 RenderJob 状态定义，不代表已经能中断正在渲染的任务、恢复未完成上传或自动重试渲染。 |
| 能力声明与实际实现 | ModuleRegistry 当前提供 ID、版本、标签、描述和工厂；RenderJob 是数据/状态模型，不是用户可选择的插件。threeD 仍是预留设置，尚无默认 3D 注册实现。模板中的 game/privacy 字段也不能仅因存在就视为已完整执行。 |
| 信件 fallback 边界 | module-runtime 对 standalone Harness 显式关闭外层 fallback；不能把普通 provider 的降级测试推广成所有 Harness 组合的保证。保留已验收信件链路，涉及公共设置时补对应回归。 |

上述差异不推翻已记录的 Phase 3 实机成功，也不构成 `LINLI-PLAY-001` 的根因证据。它们说明“已有底层能力”和“全部用户路径完成”必须分别验收。

旧文档还存在局部历史表述，例如 module-settings 中的“人格资产不会复制进仓库”“所有设置 JSON 都不能保存密钥”“默认 data 在项目外”，以及 known-issues 尾部“可以先完成 Phase 3”。应按本交接、当前模板和源码理解；进入相关修改时同步纠正，不按这些旧句子撤回已内置资产或重复 Phase 3。本次仅更新这一份交接文档。

## 5. Phase 4 及后续执行路线

| 里程碑 | 本轮要交付的用户能力和验收边界 |
| --- | --- |
| Phase 4-1：MIDI 预览与媒体任务 | 复用上传/解析/渲染代码，补齐普通用户可操作的预览与任务状态；验证媒体格式、轮询、取消、失败恢复和重启行为。先核对第 4 节，不重新造 MIDI 解析器。 |
| Phase 4-2：曲库、歌单和模块选择 | 补齐曲目管理、歌单与播放器/Renderer/Encoder 选择，让设置真正影响运行结果。必要的简单界面或易懂入口随功能交付，不能全部推到最终发行再做。 |
| Phase 4-3：原生证据调查 | 按第 6 节证据门槛，定位原生 WebPlayer 拒绝或未选中本地媒体的实际分支；与一般预览开发分开记录。 |
| Phase 4-4：Steam 播放/演奏验收 | 在正确版本、可恢复的受保护接入下，由用户确认媒体切换、进入演奏桌面、听到本地声音及进度推进。 |
| Phase 4-5：外部音乐导入 | 为网易云、QQ 音乐等提供可替换来源适配器，把可用曲目信息、音频或 MIDI 转成内部曲目表示，再进入曲库和播放。 |
| Phase 4-6：宽松演奏 | 支持音频播放或近似 MIDI 驱动的演奏，不要求手指与音乐逐帧匹配；不能把普通播放标成精确 3D 演奏。 |

外部音乐只处理用户有权使用、可合法取得的内容，不绕过 DRM 或访问控制；框架本身不添加地域限制。来源服务不得写死进 MusicService。

Phase 4 按七个独立对话轮次推进，先完成音乐设置、曲库与歌单、原生证据调查、Steam 播放/演奏、外部音乐导入、宽松演奏和 Phase 4 总验收。Phase 5 先做定制演奏与 3D 表现的现有实现调研、最小技术预研和技术底座；Phase 6 再基于这套底座做视频回信与即兴创作；Phase 7 完成普通用户安装器、最终 GUI、诊断恢复与发行。

每轮先写需求、设计和验收标准，再小步实现、测试、网关冒烟和文档同步。优先修复能独立复现的具体缺口；不扩大成整套新框架，不因原生播放阻塞停止所有可独立完成的音乐工作。

## 6. LINLI-PLAY-001：保留事实和调查门槛

当前事实：

- 本地 MIDI 能上传、解析、生成、在“我的上传”显示并加入音乐桌面。
- 点击“演奏”后，原生 WebPlayer 未切换到本地媒体；旧预设曲目继续发送时间事件，桌面没有进入本地曲目演奏，也没有本地声音。
- 同版本、同网关下官方预设曲目正常。
- 已尝试短/长 MIDI、重启、localhost、.mp4、HEAD/Range、TOD1200/TOD1730/TOD2000 和恢复原生 song 对象。这些外围尝试未解决问题，不再要求用户重复盲测。

详细证据见 [known-issues.md](./known-issues.md)。其中日志文件名和时间是历史证据索引，不保证新机器存在这些本地文件。缺少日志时不得编造其内容。

**只有拿到原生 WebPlayer 的只读反汇编、CEF 媒体事件或完整媒体请求证据后，才建立单独的诊断工作项并继续定位。** 在此之前可以整理已有证据、规划只读采集和完成独立预览工作，不能凭猜测改 video/audio、TOD、Range 或 song 字段。用户没有明确要求另起任务时，诊断工作项留在当前任务内。

即使独立网关测试发现格式或配置缺口，也应分别证明和修复；不能因此宣称原生 Bug 已定位或要求用户再重复同一套测试。该缺陷属于 Phase 4，不是 Phase 2 或 Phase 3 的前置阻塞。

## 7. 源码与测试导航

| 入口 | 作用 |
| --- | --- |
| `scripts/start-local-service.mjs`、`src/app/local-app.js` | 配置、SQLite、Worker、音乐服务和网关的实际启动装配 |
| `src/config/user-config.js`、`module-settings.js`、`module-runtime.js` | 私有配置、无密钥模块设置、选择解析与运行实现 |
| `src/config/module-registry.js`、`default-module-registries.js` | 通用注册表和当前可用实现 |
| `src/music/music-service.js`、`midi-job-service.js` | 领域导入/歌单、上传任务/媒体/曲目分页；修改前先分清调用入口 |
| `src/music/midi-manifest.js`、`audio-renderer.js`、`renderer-registry.js` | MIDI 解析、时间信息及音频渲染扩展点 |
| `src/music/media-encoder.js`、`playback-adapter.js` | MP4 编码、通用及原生游戏曲目转换 |
| `src/core/render-job.js`、`time-boundary.js`、`src/storage/sqlite-store.js` | 统一任务状态、自然日日界线及事实存储 |
| `src/gateway/local-gateway.js`、`midi-compat.js`、`letter-compat.js` | HTTP 路由、媒体响应和游戏契约转换 |
| `src/letters/` | 已验收信件、Persona/Harness/Memory 和视频资产服务 |
| `scripts/plan-install.mjs`、`apply-install.mjs`、`src/patcher/` | 只读计划、受保护执行及回滚 |
| `tests/midi-job-service.test.mjs`、`music-service.test.mjs`、`gateway.test.mjs`、`gateway-compat.test.mjs` | 音乐、恢复、协议及网关测试 |
| `tests/modular-adapters.test.mjs`、`local-app.test.mjs`、`time-boundary.test.mjs`、`phase3-acceptance.test.mjs` | 可替换实现、启动配置、日界线及信件回归 |

同一单元格内省略目录的文件沿用前一个文件的目录。接口存在只是起点，配置文件、运行实例、网关结果和用户操作必须连起来验证。

## 8. README 与 docs 的最新维护要求

自上次交接后，`85bdb94` 统一了交接命名；`88a33bb` 至 `615ff80` 调整了 README 的用户流程和功能表达。期间没有新增 Phase 4 实现。这些文档要求是用户已明确确认的要求：

- **README 同时服务普通玩家与开发者，两部分分开。** 保留开发者用法、架构、开发路线和开发与测试，不能为了简短删掉开发信息。
- **项目状态**只说明当前进度和主要边界；**当前功能**按“信件与回信 / MIDI、曲库与媒体任务 / 可插拔模块与游戏资产 / 尚未完成”分组，使用 checkbox 和简短功能说明，兼顾完整性与可读性。
- 当前功能保留必要的能力细节，不能缩成几个模糊大词，也不铺满协议字段、日志、旧 Bug、配置身份或操作命令。实现与未完成边界按证据更新，不把勾选当成覆盖所有场景的保证。
- 用户流程保持“下载安装 → 改用户配置 → 起服务 → 接入并打开游戏体验”。用户配置指南保留在安装之后；不再新增重复罗列功能的“当前用法”章节。
- 用户需要选择或填写的新功能必须同步补入配置模板、实际读取逻辑和用户指南；“以后必须更新本节”这种维护指令放在开发文档中，不写给普通玩家。
- 删除显而易见的过渡句和重复警告，例如“安装完成后继续阅读下面”“本节是完整流程”，也不要把已修复的名字混淆 Bug 长期写成用户注意事项。
- 开发者说明应给出可运行的调用方式、调试入口、相关源码/测试和扩展路径，不能只丢几个类名或无法运行的片段。
- **开发路线位于架构与开发与测试之间**；采用 Phase 一级、Phase x-y 二级里程碑及 checkbox。已完成项给出实际代表性 commit，设计链接在同级项目之间保持一致。
- **设计与验收文档命名统一**：阶段总览使用 `phasex.md`，有独立需求、设计和验收边界的里程碑使用 `phasex-y-did-what.md`，其中 `did-what` 用简短英文说明实际内容。README 的索引和开发路线必须使用相同的 Phase 编号；没有独立文件的总体验收项可以链接对应阶段总览，但仍要明确写出其里程碑编号。
- **交接文档展示名称统一**：README 使用“`Phase X → Phase Y 交接文档`”格式；现有 `phase_2_to_3_handoff.md` 和 `phase_3_to_4_handoff.md` 文件路径暂保持不变，以免破坏已经发布的历史链接。
- docs 采用“每个 Phase 一个总览 + 必要的独立里程碑设计文档”，不为形式对齐拆碎已完成的 Phase 0–2。新设计应有独立需求和验收范围，并链接回总览及 README。
- 交接名称为 `phase_2_to_3_handoff.md`、`phase_3_to_4_handoff.md`。前者仅供历史追溯，不能覆盖本文的当前边界；不恢复旧的 `phase2-handoff.md` 名称。
- README 最后保留 OliviaSoul 和 olivia-lin 致谢及实际复用范围；不要承诺已吸收两个上游的全部能力。
- 新功能或语义变更后，用 `rg` 检查 README、docs、模板和相关源码的引用与表述，同步修正文档冲突。保留历史验收，但标明当时范围。

## 9. 游戏操作、验证和交付纪律

涉及真实游戏目录时：

1. 先确认游戏完全退出，再只读检查版本和基线。
2. 使用游戏目录之外的备份，写入前给出具体目标、改动计划、校验和回滚方式，确认计划确实可应用。
3. 首次安装使用 pristine 基线及 `canApply: true`。若 `installation-state:modified`，不能强行覆盖或把现有补丁当作原装；只读查明已有接入和备份，需要更新时使用能识别该状态的受保护增量流程。
4. 未知版本、未识别修改或计划被拒绝时停止写入，不能修改校验来放行。
5. 写入后验证目标文件，并保留回滚路径；不直接手改专有 DLL、资源包或用户安装来试错。

已有接入的游戏不需要每次测试都重装。先确认运行服务、配置和已有接入状态；可在仓库、临时测试目录修复的问题，不写游戏目录。不会要求用户为普通文档或本地单元测试退出游戏。

用户明确报告实际点击、界面显示、听到声音或其他观察后，才能记录相应 Steam 验收；网关冒烟、媒体可读、数据库成功或日志中的 read_at 不能替代实机结果。新测试也不能借用旧信件验收来勾选音乐验收。

每轮报告实际改动文件、测试命令与结果、未完成项，以及是否需要用户进行 Steam 操作。解释开发了什么功能，用直白中文，少堆术语。

提交前执行：

```powershell
pnpm test
git diff --check
git status
```

只提交本轮源代码、测试和文档（含必要的无密钥配置模板）；不提交用户配置、API Key、真实信件、数据库、日志、媒体、work/data/_probe 产物、游戏资源或专有 DLL。复用第三方源文件时保留来源与已有许可记录。

检查差异后小步提交，推送 `main`，验证本地 HEAD 与 origin/main 一致，并确认工作区没有遗漏。遇到远程新提交先查明并整合，不强推。修改 README 时不再另造长期状态文档；后续按本交接进入 Phase 4-1 开发。
