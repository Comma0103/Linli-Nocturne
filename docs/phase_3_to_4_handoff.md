# Linli Nocturne（林离·余音）Phase 4 及后续开发交接

> 这是给全新 Task/Thread 使用的单一交接文档。新任务没有当前聊天上下文时，先完整阅读本文，再按“启动指令”读取仓库和开始工作。本文以仓库当前 `main` 和提交 `243c3e4` 为准，不依赖旧聊天记录中的口头结论。

## 1. 项目身份和总目标

你正在接手 GitHub 仓库 `https://github.com/Comma0103/Linli-Nocturne`。项目名称是 **Linli Nocturne（林离·余音）**，默认分支是 `main`。代码和展示文案使用简体中文，不添加地域限制。

项目建立在原版《BSide: Olivia Lin》Steam 本体之上，目标是恢复原服务停止后的信件、文字回信、视频回信、MIDI 上传、本地曲库和演奏入口，并为即兴创作以及未来的 3D 手指、琴键、镜头、动作同步保留扩展点。当前仍是开发版，不是发行版，也没有完成最终普通用户安装器。

原游戏默认规则必须保留：每天最多 3 封信、每封信默认延迟 5 分钟；`bypass` 默认关闭但保留开关。信件回信必须支持外部模型 API、完全本地模型和离线 fallback。所有外部实现都应通过统一接口、适配器、注册表或中间表示接入，不能把某个第三方项目写成唯一实现。

## 2. 当前真实状态

### 2.1 Phase 3 已完成

Phase 3 的信件代码链路和 Steam 用户路径已经完成，证据包括：

- 信件状态、时区日界线、原子领取、重试上限和后台 Worker 已有自动化测试。
- 外部 OpenAI 兼容 provider、本地模型接口、通用 Harness、PersonaProvider 和离线 fallback 使用统一调用契约。
- 仓库内置可复用的 OliviaSoul v18 Harness 资产和 olivia-lin Persona 资产；两者通过适配器接入，均不是核心唯一实现。
- 信件记忆默认关闭，SQLite MemoryProvider 可替换且有长度限制。
- 视频回信资产已有导入、检查、保存、替换、删除和状态流程；视频自动生成尚未完成。
- `user.displayName` 表示玩家本人，例如“嘉树”；`林离`仍是游戏收信人、数据库 recipient、每日配额和原生协议字段；Harness 的 `person` 是内部归档键，三者不能混用。
- 失败信件可以通过原版重寄接口创建新信件，旧失败记录保留。
- Steam 客户端 `0.0.9.627` 已由用户实际验证：离线 fallback 可以显示正文；DeepSeek + Persona + OliviaSoul Harness 也已实际生成并显示完整回信，且正文以“嘉树”称呼玩家。
- 最新自动化基线为 `pnpm test`：84 项通过。开始新工作时必须重新运行测试，不要只相信这个数字。

Phase 3 的关键提交包括：`16eaaed`、`5f6e463`、`62c92e1`、`8ae5964`、`2c20767`、`637b33c`、`a3e5c95`、`b5e7e8a`、`c715b5b`、`ed4eccc`、`b7cd5ef`、`243c3e4`。不要重复实现这些已完成的功能，先查看当前源码和测试确认现状。

### 2.2 Phase 4 尚未完成

Phase 4 负责“完整音乐体验”，从用户 MIDI 已经能够上传、生成、显示和加入音乐桌面，推进到普通玩家可预览、播放、尝试演奏，并为外部音乐来源保留可插拔导入适配器。`docs/phase4.md` 是阶段总览，但本文是新 Task 的优先交接入口。

Phase 4 的建议顺序：

1. **Phase 4-1：用户 MIDI 预览和媒体任务**：确认上传、解析、渲染、音频/视频媒体、任务状态、轮询、取消、失败恢复和本地预览形成完整用户路径。
2. **Phase 4-2：曲库、歌单和模块选择入口**：把用户曲目稳定接入曲库和歌单，确保 Renderer、播放器、编码器和 fallback 都通过模块设置选择。
3. **Phase 4-3：`LINLI-PLAY-001` 原生证据调查**：只在拥有原生 WebPlayer 只读反汇编、CEF 媒体事件或完整媒体请求证据后，分析上传曲目为何不能成为当前媒体源。
4. **Phase 4-4：上传曲目 Steam 播放/演奏验收**：在安全的独立备份和正确版本基线下，由用户实际确认上传曲目切换媒体、进入演奏桌面并推进进度。
5. **Phase 4-5：外部歌单/歌曲导入**：为网易云音乐、QQ 音乐等来源设计可替换导入适配器，转换为项目内部曲目表示；只处理用户有权使用的内容，不绕过 DRM、登录保护或地区限制。
6. **Phase 4-6：宽松演奏模式**：允许音频播放或近似 MIDI 事件进入演奏流程，不要求手指、琴键、镜头和动作逐帧匹配；严格 3D 同步属于 Phase 6。

每个二级里程碑开始前，先新增或更新该里程碑的需求、设计和验收标准；然后小步修改代码、补有意义的单元测试和网关冒烟测试，再同步文档。不要把整个 Phase 4 一次性重写。

## 3. 必须保留的跨层问题：LINLI-PLAY-001

当前已知事实：

- 本地 MIDI 可以上传、解析、生成媒体、在“我的上传”显示并加入音乐桌面。
- 点击本地曲目的“演奏”后，原生 WebPlayer 没有切换到本地媒体；旧预设曲目继续发送时间事件，桌面不进入本地曲目演奏，也没有本地曲目声音。
- 同一客户端、同一网关和同一版本下，官方预设曲目可以正常演奏。
- 过去已经尝试过短/长 MIDI、重启、`localhost`、`.mp4`、`HEAD`、`Range`、`TOD1200/TOD1730/TOD2000`、恢复原生 `song` 对象等外围方案；不要要求用户重复这些无效测试。
- 目前没有足够的原生 WebPlayer 内部证据。继续猜测性修改 video/audio、TOD 或前端字段会制造噪声，不能作为 Phase 4-3 的替代。

因此，除非拿到只读反汇编、CEF 媒体事件或完整媒体请求证据，否则只做 Phase 4-1/4-2 的本地可验证工作，或创建单独的只读诊断任务。不要让此问题倒退影响已完成的 Phase 3。

## 4. 模块化和可插拔原则

项目核心只处理统一接口和中间表示。用户应能在设置中选择具体实现，而不必修改领域服务代码。

- 信件：`ModelAdapter`、provider registry、`PersonaProvider`、`MemoryProvider` 和 Harness 插槽共同工作。OliviaSoul 只是可选 Harness；其他 Harness、外部 API、本地模型和 fallback 都必须可替换。
- 音乐：`MidiJobService` 负责 MIDI 任务和曲目数据；Renderer 负责媒体生成；`GamePlaybackAdapter` 负责转换为原生游戏或其他播放器需要的曲目格式。不要让渲染、曲库和原生 WebPlayer 字段继续混在一个不可替换实现里。
- 媒体：音频、视频和未来 3D 统一使用 RenderJob 方向；Renderer、Encoder、Importer 和同步器都应报告实现 ID、版本、能力和失败状态。
- 外部音乐来源：网易云、QQ 音乐等只能通过来源适配器进入统一曲目中间表示，不能写死进 `MusicService`。
- 用户设置：当前已有人类可读 JSON、模块注册表和配置入口；最终 App GUI 应复用同一设置模型，让普通玩家能选择 provider、Harness、Persona、Renderer、播放器和 fallback。不要把某个实现写成默认之外的唯一实现。
- SQLite 是当前明确的本地事实源，不需要为了形式上的可插拔而替换；数据库保存内容对用户没有本质差异时，保持 SQLite。

第三方资产：

- 上游 [OliviaSoul](https://github.com/yilangren/OliviaSoul)，仓库内资产位于 `third_party/OliviaSoul/v18-harness`。
- 上游 [olivia-lin](https://github.com/1Dreamer666/olivia-lin)，仓库内 Persona 资产位于 `third_party/olivia-lin`。

可以复用仓库内已记录的第三方源码、脚本、人格资料和协议，但要保持来源说明、适配器边界和许可证记录。不要提交 API Key、运行时数据库、真实信件、媒体、`work/`、`data/`、`_probe/` 产物、游戏资源或专有 DLL。

## 5. 新 Task 必须先检查的内容

从仓库根目录开始，不假定旧聊天结论：

```powershell
git status
pnpm test
```

然后按顺序读取：

1. `docs/phase_3_to_4_handoff.md`（本文）；
2. `README.md` 的项目状态、开发路线、当前功能和架构；
3. `docs/requirements.md`、`docs/architecture.md`、`docs/known-issues.md`；
4. `docs/phase4.md`、`docs/render-job.md`、`docs/module-settings.md`、`docs/original-installation.md`；
5. 与当前里程碑直接相关的源码、测试和最近提交记录。

先用 `git log --oneline`、`git status` 和 `rg` 建立事实，不要因为旧文档中的历史段落重复实现 Phase 0–3。

关键源码位置：

- `src/music/midi-job-service.js`：MIDI 上传、解析、渲染任务、媒体和曲目分页。
- `src/music/audio-renderer.js`、`src/music/renderer-registry.js`：可替换音频 Renderer 和注册表。
- `src/music/playback-adapter.js`：通用曲目格式和 Olivia Lin 原生播放器适配边界。
- `src/core/render-job.js`：统一媒体任务状态机。
- `src/gateway/local-gateway.js`、`src/gateway/midi-compat.js`：本地网关和原版兼容响应。
- `src/letters/`、`src/config/`：已完成的信件、provider、Persona、Harness 和模块选择实现，除非当前工作确实需要，不要改动。
- `scripts/plan-install.mjs`、`scripts/apply-install.mjs` 及 `src/patcher/`：受保护的游戏接入流程。

## 6. 真实游戏目录和用户操作规则

任何涉及 Steam 游戏目录的操作都必须遵守：

1. 先让用户完全退出游戏；
2. 只读检查版本和基线；
3. 使用游戏目录外的备份；
4. 写入前明确说明计划并确认 `canApply: true`、客户端版本和 pristine 基线；
5. 写入后做完整校验和回滚准备；
6. 不要在用户安装目录里反复试错，也不要直接修改 DLL、前端包或游戏资源。

安装计划默认是只读的。未知版本或已被其他工具修改的目录必须停止。用户没有实际点击、重启、看到界面、听到声音或报告结果之前，不能把 Steam 实机验收写成完成。

本地开发服务、SQLite、媒体和日志应放在项目或游戏目录之外的运行目录；不要把任何本机绝对路径写入源码、文档示例或提交。代码中的绝对路径必须由用户配置或运行时 `resolve` 动态计算，不能写死开发者电脑路径。

## 7. 每轮工作的固定报告格式

每次修改后都要报告：

- 实际改动了哪些文件，以及每个文件的目的；
- 运行了哪些测试命令和结果；
- 未完成项、已知风险和没有证据的假设；
- 是否需要用户进行真实 Steam 操作；
- 若用户完成了实机操作，记录用户实际报告的观察结果和客户端版本。

提交前必须运行：

```powershell
pnpm test
git diff --check
git status
```

只提交源代码、测试和文档。提交后推送 `main`，并验证本地 `HEAD` 与 `origin/main` 一致。不要创建与本文重复的长期状态文档；如果某个 Phase 4 里程碑需要设计文档，应把它限制在该里程碑的需求和验收范围内。

## 8. 可直接作为新 Task 首条消息的启动指令

```text
你正在接手 GitHub 仓库 https://github.com/Comma0103/Linli-Nocturne 的后续开发。请把 docs/phase_3_to_4_handoff.md 作为当前唯一交接入口，先完整阅读它，再读取 README.md、docs/requirements.md、docs/architecture.md、docs/known-issues.md、docs/phase4.md、docs/module-settings.md、docs/render-job.md 和当前相关源码；不要依赖旧聊天记录中的未经证实结论。

先运行 git status 和 pnpm test，确认当前基线。Phase 3 已完成并有真实 Steam 证据：DeepSeek + Persona + OliviaSoul Harness 已在客户端 0.0.9.627 中生成和显示以“嘉树”称呼玩家的完整回信。不要重复开发 Phase 3，也不要把 Phase 3 的旧待办当成当前阻塞。

现在从 Phase 4-1 开始：先检查用户 MIDI 的预览、RenderJob、音频/视频媒体、任务轮询、取消、失败恢复和网关契约，写出本轮需求、设计和验收标准，再做最小代码修改、单元测试、网关冒烟测试和文档同步。随后按 Phase 4-2 到 Phase 4-6 逐轮推进：曲库和模块选择、LINLI-PLAY-001 的原生只读证据调查、上传曲目 Steam 播放/演奏验收、外部歌单导入适配器、宽松演奏模式。

必须保留模块化边界：Renderer、PlaybackAdapter、Provider、Harness、Persona、Memory、Encoder、Importer 和未来 3D Renderer 都是可替换实现；核心只依赖统一接口和中间表示。OliviaSoul 和 olivia-lin 是已内置的可复用资产，但不是唯一实现。用户设置最终必须能让普通玩家选择实现和 fallback。SQLite 作为固定本地事实源不需要为了抽象而替换。

必须保留 LINLI-PLAY-001 的证据边界：上传 MIDI 能显示和加入音乐桌面，但原生 WebPlayer 尚未切换到本地媒体。过去的外围猜测已失败；没有原生 WebPlayer 只读反汇编、CEF 媒体事件或完整媒体请求证据前，不要再次盲改 video/audio、TOD、Range、song 字段，也不要让用户重复无效测试。任何真实游戏目录操作都要先退出游戏、只读检查版本和 pristine 基线、使用目录外备份，并在写入前确认计划可应用。

每轮报告实际改动文件、测试命令和结果、未完成项、是否需要用户 Steam 操作。提交前运行 pnpm test、git diff --check、git status；只提交源代码、测试和文档，推送 main 后确认 HEAD 与 origin/main 一致。不要宣称 Phase 4、3D、最终安装器或发行版已经完成，除非有对应的代码、自动化测试和用户实机证据。
```

