# Linli Nocturne（林离·余音）

> *Musica noctis, memoria cordis.*（夜之音乐，心之记忆）

林离·余音致力于在原服务停止后，恢复信件、回信、MIDI 演奏、本地音乐、视频回信，并为未来的 3D 手指同步演奏保留可扩展的技术路径。

## 项目状态

Phase 0–3 的基础功能已完成，持续记忆、关系账本和数据迁移已通过 Steam 离线及 DeepSeek 在线回信复验，并已合入 `main`（`phase3-letter-fusion-v1.0.0`）。Phase 4 的 4-1 至 4-4 已完成，4-5 至 4-7 待完成；下一步是外部歌单与歌曲导入的调研和设计。2026-09-11，实验分支 `exp/ponytail-release-optimization` 的当前收尾改动（预设歌单元数据/封面回退、在线第四套配置、MIDI `bypass` 和合成视频回信播放）已由用户完成 Steam 实机验收。项目仍是开发版，实验分支尚未合并或打标签。

## 当前功能

### 信件与回信

* [x] **信件规则与可靠处理**：遵循每日最多 3 封、默认每封延迟 5 分钟的原版规则；支持排队、状态流转、原子领取、过期任务恢复、失败重试和最大尝试次数。
* [x] **可替换的回信生成链路**：支持仓库内 Olivia-lin 离线人格引擎、外部 OpenAI 兼容 API、本地 OpenAI 兼容模型，并可组合 Persona、Harness 与有限记忆；失败时可按配置回退。
* [x] **Persona、Harness 与持续记忆**：内置 Olivia-lin 人格/书信素材包和 OliviaSoul v18 检查流程。可选的 SQLite 持续记忆保存完整往来、分层摘要和关系账本，并检索旧信；每封信记录实现、版本及来源。称呼和落款按人格整理，篇幅与收尾保持自然。
* [x] **玩家档案与数据迁移**：按玩家隔离信件和记忆，可改名、切换、查看或清空；支持导出数据包和在另一台电脑导入。
* [x] **Steam 实机回信**：已在 Steam 客户端 `0.0.9.627` 中验收离线回信，以及 DeepSeek + Persona + OliviaSoul Harness + `olivia-soul.sqlite` 持久记忆的真实回信；本轮实验分支再次确认在线 provider、Harness 阶段和游戏内正文显示。

### MIDI、曲库与媒体任务

* [x] **MIDI 解析与时间轴**：支持标准 MIDI 文件解析，提取音符、Tempo、延音踏板并生成时间轴清单。
* [x] **WAV/MP4 媒体任务**：支持 MIDI 上传、任务创建、WAV 渲染、MP4 音频封装、状态轮询、取消、删除、失败状态和 SQLite 持久化恢复。
* [x] **用户曲库与歌单**：保存用户曲目和歌单，支持分页、原版字段兼容、加入或移除歌单，以及离线曲库入口和本地生成曲目展示。
* [x] **原生 WebPlayer 播放/演奏接管**：Steam 0.0.9.627 已验收上传曲目从“我的上传”和歌单进入演奏、发声及进度推进；预设曲目加入歌单后的名称、时长、封面占位和演奏也已在本轮补丁后通过验收。当前上传 MIDI 生成音频媒体，演奏时黑屏，不包含 3D 人物演奏画面。
* [x] **本地试听**：已验收上传曲目及古典、ACG、轻音乐样本试听；预设曲目使用游戏已下载且文件命名受支持的缓存。试听使用独立播放器，底部演奏栏不跟随试听更新。

### 可插拔模块与游戏资产

* [x] **可插拔模块体系**：Provider、Persona、Harness、Renderer、PlaybackAdapter、Encoder、Importer、RenderJob 和 ModuleRegistry 均通过统一接口或适配器连接，可按配置选择实现。
* [x] **视频回信资产管理**：支持已有视频资产导入、格式检查、保存、播放、替换、删除，以及处理中、成功和失败状态管理；三条合成视频回信已在 Steam 中通过播放验收。这不包括视频回信自动生成。
* [x] **安全安装与恢复**：支持版本白名单、SHA-256 基线校验、游戏目录外备份、已知补丁回滚和修改检测。

### 尚未完成

* [ ] 网易云、QQ 音乐等外部歌单或歌曲导入。
* [ ] 宽松演奏模式。
* [ ] 视频回信自动生成（包括视频回信中的即兴创作）。
* [ ] 定制演奏的规则化或模型辅助即兴作曲。
* [ ] 3D 手指、琴键、镜头和动作同步。
* [ ] 最终 GUI 设置、普通用户安装器和发行版。

### 本轮收尾验收（2026-09-11）

本轮实验分支的代码、前端补丁和本地服务配置已由用户在 Steam 中完成最终验收。验收范围包括：三条合成视频回信播放、第四套 DeepSeek + Persona + Harness + 持久记忆在线写信、`letters.dailyLimitBypass=true` 同时放开写信和定制演奏的每日显示额度、MIDI 上传/生成/试听/演奏，以及预设曲目加入歌单后的完整元数据、音符占位、重复加入和移除。

该结论只覆盖已经实现的当前范围。外部歌单导入、宽松演奏、视频自动生成、3D 人物/手指同步、最终 GUI 和从 pristine 原版目录一次完成的发行安装流程仍按下方路线保留为未完成项。

## 安装

### 环境要求

Node.js 22 及以上、pnpm 9 及以上。Windows 用户启动服务时优先使用仓库自带的 `scripts/start-local-service.ps1`；它会自动探测常见 Node.js 安装路径，不要求当前 PowerShell 已配置 PATH：

**macOS / Linux**

```bash
curl -fsSL https://fnm.vercel.app/install | bash
fnm use --install-if-missing 22
npm install -g pnpm@9
```

**Windows（PowerShell）**

```powershell
winget install Schniz.fnm
fnm env --use-on-cd | Out-String | Invoke-Expression
fnm use --install-if-missing 22
npm install -g pnpm@9
```

使用仓库内离线人格引擎还需要 Python 3：

```text
macOS：brew install python
Windows：winget install Python.Python.3.11
Linux（Debian/Ubuntu）：sudo apt install python3
```

在 Windows 10/11、macOS 或 Linux 上均可运行本地服务；接入游戏还需要安装《BSide: Olivia Lin》本体。

```powershell
git clone https://github.com/Comma0103/Linli-Nocturne.git
cd Linli-Nocturne
pnpm install
pnpm test
```

## 用户配置指南

### 1. 创建本机配置

在仓库根目录执行：

```powershell
Copy-Item config/user-config.example.json config/user-config.json
notepad config/user-config.json
```

只修改 `config/user-config.json`，不要修改模板。这个文件已被 Git 忽略。完整的 `user-config.json` 属性说明、允许取值，以及信件、预设曲库、上传 MIDI、视频回信和记忆等功能的配置示例，见 [`docs/user-config.md`](./docs/user-config.md)。

本机 Steam 测试使用的第四套配置为 DeepSeek + `linli.persona-bundle` + `linli.fusion-v1` + `olivia-soul.sqlite`，并关闭 fallback、把外部模型超时设为 180000 毫秒；测试时可将 `letters.dailyLimitBypass` 设为 `true`，它同时作用于信件和 MIDI 定制演奏的每日用量显示。该私有配置不提交到仓库；示例模板仍保持无密钥、可离线启动。

### 2. 启动本地服务

配置保存后，在仓库根目录执行，并保持窗口运行：

```powershell
.\scripts\start-local-service.ps1
Invoke-RestMethod http://localhost:27149/health
```

也可以双击 `scripts/start-local-service.cmd` 启动服务。

`privacy.allowExternalModelRequests` 默认是 `true`。如果不希望来信或启用的记忆发送给外部模型，可将它改为 `false`；此时选择 `external.openai-compatible` 会阻止服务启动。只测试 MIDI 时仍可选择离线 provider。

如果旧命令 `node scripts/start-local-service.mjs` 提示“node 不是命令”，请重新打开 PowerShell 后使用上面的仓库启动脚本；脚本会自动寻找常见 Node.js 安装位置。仍未找到时，请先安装 Node.js 22 及以上版本。

返回 `ok: true` 后，本地服务已经启动。修改配置后必须重启这个服务才会生效。

### 3. 第一次接入 Steam 游戏

如果只想调用本地 HTTP 服务，到这里即可；如果要在游戏界面体验，先完全退出游戏，再对游戏目录做只读检查：

```powershell
node scripts/plan-install.mjs "你的 Steam 游戏目录" "游戏目录外的备份目录"
```

只有输出 `canApply: true`、版本为 `0.0.9.627` 且状态为 `pristine` 时，才允许执行写入：

```powershell
node scripts/apply-install.mjs "你的 Steam 游戏目录" "游戏目录外的备份目录" --apply --confirm=Linli-Nocturne
```

游戏目录如果已经被其他工具修改、版本未知或游戏仍在运行，必须停止。执行器会在写入前再次校验基线并创建备份。

### 4. 打开游戏并体验

保持本地服务运行，启动已完成接入的 Steam 客户端，试用想使用的功能。

当前可使用已经接入的信件、MIDI 上传与生成、曲库与歌单、试听和演奏，以及视频回信资产管理。上传曲目从“我的上传”和歌单进入演奏、预设曲目加入歌单后的播放、三条合成视频回信播放和第四套在线写信均已通过本轮 Steam 0.0.9.627 验收。首次从原版游戏安装全部增量补丁的流程仍待整合，见[游戏接入的交付边界](./docs/original-installation.md#当前交付边界2026-09-09)。

### 5. 管理记忆和迁移数据

停止本地服务后，在仓库根目录运行：

```powershell
node scripts/manage-user-data.mjs
```

按编号切换玩家、查看/清空记忆，或导出、导入数据包。换电脑时，在新电脑导入同一个包，再填写模型密钥并启动服务。详见[记忆与数据迁移](./docs/user-config.md#记忆和连续对话)。

## 开发者用法

用于不经过 Steam 直接调试领域服务、网关和模块实现。

### 运行测试和本地服务

```powershell
pnpm test
.\scripts\start-local-service.ps1
Invoke-RestMethod http://localhost:27149/health
```

### 调用领域接口

开发者可以直接调用领域接口解析 MIDI、生成本地 WAV 并加入 SQLite 歌单：

```js
import { SqliteStore } from './src/storage/sqlite-store.js';
import { MusicService } from './src/music/music-service.js';

const store = new SqliteStore('./data/linli.sqlite');
const music = new MusicService({ store });
const track = music.importMidi({ buffer: midiBytes, sourceName: 'my-song.mid', title: '我的曲目' });
music.addToPlaylist(track);
```

写信功能使用 `LetterService`、`ModelAdapter`、Persona 和 Harness；本地 HTTP 网关是游戏客户端的兼容层。单封信的只读执行记录可通过 `GET /letter/execution/<letterId>` 查看。

想在不编辑 JSON 的情况下更换已注册模块，可执行 `node scripts/configure-modules.mjs --user-config config/user-config.json`；外部模型的 API Key 仍只在本机配置文件中填写。

### 开始增量开发

先阅读 [`docs/phase_3_to_4_handoff.md`](./docs/phase_3_to_4_handoff.md) 和对应阶段设计文档，再按“开发路线”选择未完成的小里程碑：先补需求、设计和验收标准，再修改接口、实现、测试和文档。需要直接验证游戏接入时，使用 `scripts/plan-install.mjs` 做只读检查，确认基线后再执行安装计划。

## 架构

```text
游戏客户端
    ↓ 兼容本地 HTTP 网关
领域服务 ── SQLite 存储
    ├─ LetterService + LetterWorker + MemoryProvider + ModelAdapter
    ├─ MusicService + MIDI Parser
    └─ RenderJob + AudioRenderer / VideoGenerator / VideoRenderer / Future3DRenderer
```

设计文档位于 [`docs/`](./docs/)：

- [需求说明](./docs/requirements.md)
- [初始架构](./docs/architecture.md)
- [普通用户流程](./docs/ui-flow.md)
- [RenderJob 状态机](./docs/render-job.md)
- [Phase 0](./docs/phase0.md)、[Phase 1](./docs/phase1.md)、[Phase 2](./docs/phase2.md)
- [Phase 2 → Phase 3 交接文档（完整 Prompt）](./docs/phase_2_to_3_handoff.md)
- [Phase 3 信件体验总览](./docs/phase3.md)
- [Phase 3-1 信件可靠性首个里程碑](./docs/phase3-1-letter-reliability.md)
- [Phase 3-2 Provider 与 OliviaSoul Harness 适配](./docs/phase3-2-provider-and-harness.md)
- [Phase 3-3 信件后台 Worker](./docs/phase3-3-letter-worker.md)
- [Phase 3-4 信件记忆和连续对话](./docs/phase3-4-letter-memory.md)
- [Phase 3-M1 模块化适配层最小增量修复](./docs/phase3-m1-modular-adapters.md)
- [Phase 3-5 视频回信资产流程](./docs/phase3-5-letter-video-assets.md)
- [Phase 3-6 信件体验总体验收](./docs/phase3.md)
- [Phase 3-7 Steam 实机验收](./docs/phase3-7-steam-acceptance.md)
- [Phase 3 Persona 与 Harness 融合实验](./docs/phase3-exp-persona-harness-fusion.md)
- [第三方 Persona/Harness 复用清单](./docs/third-party-fusion-map.md)
- [Phase 3-8 真实模型 Steam 实机验收](./docs/phase3-2-provider-and-harness.md)
- [Phase 3 → Phase 4 交接文档](./docs/phase_3_to_4_handoff.md)
- [Phase 4 完整音乐体验总览](./docs/phase4.md)
- [Phase 4-1 音乐设置与媒体契约设计和验收](./docs/phase4-1-music-settings-and-media.md)
- [Phase 4-2 曲库、歌单和模块选择入口](./docs/phase4-2-library-playlist-and-module-entry.md)
- [Phase 4-3 原生 WebPlayer 证据调查](./docs/phase4-3-native-webplayer-evidence.md)
- [Phase 6-1 视频回信与即兴创作设计和验收](./docs/phase6-1-video-reply-and-improvisation.md)
- [第三方项目引用与复用说明](./docs/third-party-credits.md)
- [模块设置与实现选择](./docs/module-settings.md)
- [已内置的第三方 Persona/Harness 资产](./third_party/README.md)
- [原装游戏基线与插件接入](./docs/original-installation.md)
- [原版前端接口审计](./docs/frontend-audit.md)

## 开发路线

下面按提交记录和功能边界拆分开发步骤。已完成项保留对应的代表性提交，未勾选项是后续计划。所有模块都遵守可插拔原则，具体实现通过统一接口、适配器或中间表示接入。

文档采用“一级 Phase 总览 + 必要时的二级里程碑详细文档”结构。每个 Phase 都有总览入口；只有具备独立需求、设计和验收边界的里程碑才另设详细文档，路线项会明确给出对应链接。

### Phase 0 — 调研与设计

#### [x] Phase 0-1：客户端基线、需求和架构（`9081266`）

确认客户端版本、接口范围、用户流程、保存边界和初始架构。

#### [x] Phase 0-2：项目范围与公开文档整理（`c679aef`、`4d25fc7`、`41b1a55`）

建立中文 README、需求说明、阶段边界和不包含原始游戏资源的保存规则。

### Phase 1 — 本地领域核心

#### [x] Phase 1-1：SQLite、信件服务和本地网关（`764f354`、`94cda8c`）

建立信件规则、离线回信、SQLite 存储和兼容 HTTP 网关，并加入网关冒烟测试。

#### [x] Phase 1-2：MIDI 解析和时间轴（`47bfcc9`）

解析音符、Tempo 和延音踏板，生成可供渲染器和后续演奏模块使用的时间信息。

#### [x] Phase 1-3：离线音频渲染和本地歌单（`dcf20cf`）

生成本地 WAV，保存曲目和歌单，并把音频任务接入统一的 RenderJob 方向。

### Phase 2 — 游戏接入基础

#### [x] Phase 2-1：版本白名单、基线校验和安全备份（`7571bfb`、`e4fdf9e`、`d49c7ae`）

识别客户端版本和原装状态，建立 SHA-256 基线、游戏目录外备份、回滚和修改检测。

#### [x] Phase 2-2：原版接口审计和兼容路由（`c063b12`、`5a26464`）

审计前端调用，补齐登录、信件、曲库、MIDI 任务和媒体接口的兼容契约。

#### [x] Phase 2-3：MIDI 任务、媒体和用户曲库（`6bb5e3e`、`764105b`、`c11446c`）

实现上传、解析、生成、轮询、取消、删除、媒体读取、SQLite 任务恢复和用户曲目分页。

#### [x] Phase 2-4：前端与原生入口的受保护补丁（`bb9f9e5`、`44f01ad`、`90f3d57`）

在签名和基线校验通过后启用离线曲库入口，并保留幂等、回滚和未知版本拒绝。

#### [x] Phase 2-5：本地曲目兼容尝试与阻塞登记（`ffb21e7`–`fdf6bc1`）

完成本地媒体、TOD、Range、HTTPS 和原生 song 契约的外围兼容；确认 `LINLI-PLAY-001` 需要原生 WebPlayer 证据，停止猜测式修改。

#### [x] Phase 2-6：安装计划、执行器和官方曲目验收（`d6db366`–`9d6c812`）

完成只读安装计划、受保护执行器、失败回滚、独立暂存验收和官方预设曲目的 Steam 实机验收。

### Phase 3 — 信件体验

#### [x] Phase 3-1：信件可靠性和文字回信 E2E（`16eaaed`）

统一信件与 MIDI 的时区日界线，实现 `pending/processing/replied/failed`、原子领取、重试上限、fake provider 和文字回信网关测试。

设计与验收： [Phase 3-1 信件可靠性](./docs/phase3-1-letter-reliability.md)。

#### [x] Phase 3-2：真实 provider 与可插拔 Harness（`5f6e463`、`62c92e1`）

接入 OpenAI 兼容外部 API、通用 Harness 插槽、OliviaSoul v18 适配器、本地模型接口和 fallback；OliviaSoul 只是一个可替换实现。

设计与验收： [Phase 3-2 Provider 与 Harness](./docs/phase3-2-provider-and-harness.md)。

#### [x] Phase 3-3：后台 worker 与崩溃恢复（`8ae5964`）

自动领取待处理信件，防止进程内重复处理，恢复过期 `processing` 租约，并在达到最大尝试次数后失败。

设计与验收： [Phase 3-3 后台 Worker](./docs/phase3-3-letter-worker.md)。

#### [x] Phase 3-4：信件记忆和连续对话（`2c20767`）

把必要的历史内容整理为受限记忆，让回信能够参考上下文，同时限制保存范围和长度；默认使用 SQLite，也可以关闭或替换 MemoryProvider。

设计与验收： [Phase 3-4 信件记忆](./docs/phase3-4-letter-memory.md)。

#### [x] Phase 3-M1：跨阶段模块化边界修复（`637b33c`）

抽出 AudioRenderer、GamePlaybackAdapter、PersonaProvider、ModuleRegistry 和统一模块设置；保留原版游戏契约在适配器边界内，SQLite 继续作为固定事实源。

设计与验收： [Phase 3-M1 模块化边界修复](./docs/phase3-m1-modular-adapters.md)。

#### [x] Phase 3-5：视频回信资产流程（`a3e5c95`）

实现视频回信的导入、格式检查、保存、播放、替换、删除和清晰的处理中/成功/失败状态。

设计和验收标准见 [Phase 3-5 视频回信资产流程](./docs/phase3-5-letter-video-assets.md)。

#### [x] Phase 3-6：Phase 3 总体验收（`b5e7e8a`）

串联写信、排队、provider、重试、记忆和视频回信，补齐网关冒烟测试、错误恢复、文档和设置入口。

总览与验收边界： [Phase 3 信件体验总览](./docs/phase3.md)。

#### [x] Phase 3-7：Steam 游戏界面实机验收（离线 fallback，已通过）

用开发版本地服务和原版 0.0.9.627 客户端，已由用户实际验证发送信件、看到回信处理中状态，并在重新打开信件后看到文字回信正文。验收记录见 [Phase 3-7 Steam 实机验收](./docs/phase3-7-steam-acceptance.md)。

设计和操作步骤见 [Phase 3-7 Steam 实机验收](./docs/phase3-7-steam-acceptance.md)。

#### [x] Phase 3-8：真实模型 Steam 实机验收（DeepSeek + Persona + OliviaSoul Harness）（`243c3e4`）

使用 DeepSeek 外部模型、已内置 Persona 和 OliviaSoul Harness，在 Steam 界面完成真实回信测试；已确认模型请求成功、Harness 实际运行、Persona 生效，以及游戏内显示以玩家名字“嘉树”开头的完整回信正文。设计与验收记录见 [Phase 3 Provider 与 OliviaSoul Harness](./docs/phase3-2-provider-and-harness.md)。

#### [x] Phase 3-EXP：融合流程与持续记忆复验（`8fb4eee`、`ffbc555`）

已实现人格融合、分层长期记忆、关系账本、玩家隔离及数据迁移，并由用户在 Steam 中完成离线和 DeepSeek 在线回信复验；功能已合入 `main`。

设计与验收：[Persona 与 Harness 融合实验](./docs/phase3-exp-persona-harness-fusion.md)。

### Phase 4 — 完整音乐体验

Phase 4 的 7 个子阶段按依赖关系交叉推进，不是严格串行：4-1 提供任务和媒体基础，4-2 可在接口稳定后并行完善曲库入口，4-3 可独立进行原生 WebPlayer 只读证据调查；4-4、4-6 和 4-7 仍要等待各自前置验收。每个 checkbox 只在该子阶段整体验收通过后勾选，局部开发完成不代表前置阶段已完成。

#### [x] Phase 4-1：用户 MIDI 预览和媒体任务

完成上传曲目的预览、本地音频媒体生成、任务生命周期（排队、处理中、轮询、取消、失败恢复和重启恢复）以及本地媒体播放。自动化测试和 Steam 实机上传、生成、播放验收均已通过。

#### [x] Phase 4-2：曲库、歌单和模块选择入口

用户曲库、歌单增删去重、曲目名称与歌单演奏已通过实机验收，预设与上传曲目试听也已复验；本轮补丁还修复了预设加入歌单后的数字标题、零时长和缺少音符占位问题。播放器适配器、渲染器和编码器通过配置文件或终端向导选择，配置加载、重启生效及旧媒体保留格式已通过自动化验证；游戏内图形设置页属于 Phase 7。

设计与验收：[Phase 4-2 曲库、歌单和模块选择入口](./docs/phase4-2-library-playlist-and-module-entry.md)。

#### [x] Phase 4-3：`LINLI-PLAY-001` 原生证据调查

在获得原生 WebPlayer 只读反汇编、CEF 媒体事件或完整媒体请求后，定位本地曲目无法接管播放的问题，并确定可在服务侧修复的原生媒体契约。

只读调查已闭合调用链：原生层先按 `TOD12/TOD1730/TOD20` 选择条目，再检查 `<songStoragePath>/<id>/<文件名>` 是否存在，满足后才调用 WebPlayer；项目已按此契约实现修复。样本、证据与实现说明见 [Phase 4-3 原生 WebPlayer 证据调查](./docs/phase4-3-native-webplayer-evidence.md)。

#### [x] Phase 4-4：上传曲目 Steam 播放/演奏验收

在独立备份和正确版本基线下，已验证上传曲目真正切换媒体、进入桌面演奏并完成进度推进；预设歌单元数据/封面回退修复和本轮最终 Steam 实机回归也已通过。

#### 2026-09-11：实验分支收尾验收

`f51d630` 合并预设歌单的 snake_case/camelCase 元数据兼容和封面失败占位，`c18de54` 让同一 `bypass` 开关覆盖信件与 MIDI 每日用量。代码自动化回归为 `pnpm test` 142/142；用户随后在 Steam 中确认预设歌单播放、在线回信、合成视频回信和相关回归路径均通过。上述提交仍保留在实验分支，等待后续明确的合并与打标签指令。

#### [ ] Phase 4-5：外部歌单与歌曲导入

先检查已有导入器和曲库实现，调研来源的导出方式、可用媒体与成熟适配项目，再确定最小接入范围。为网易云音乐、QQ 音乐等来源提供可替换的歌单/歌曲导入适配器；把可用的曲目信息、音频或 MIDI 统一转换成项目内部曲目表示，再接入播放和曲库。只处理用户有权使用的内容，不绕过 DRM 或地区限制。

#### [ ] Phase 4-6：宽松演奏模式

允许导入的歌曲以音频播放或近似 MIDI 事件进入演奏流程。这个阶段不要求手指、琴键和音乐逐帧完全匹配；严格的 3D 同步仍留给 Phase 5，并且播放器、渲染器和同步器都保持可插拔。

#### [ ] Phase 4-7：Phase 4 完整音乐体验总验收与交接

汇总前六项的音乐设置、曲库歌单、原生证据、Steam 播放/演奏、外部来源和宽松演奏结果，完成 Phase 4 的整体验收与下一阶段交接。视频回信和 Phase 5 的定制演奏技术底座不在本阶段提前实现。

### Phase 5 — 定制演奏与 3D 表现（技术基础）

这一阶段是整个项目中技术风险最高的基础阶段之一。先做现有实现、素材、渲染路线和许可边界调研，再做最小技术预研，最后才进入可替换的正式实现。它不实现视频回信，但要为 Phase 6 提供可复用的演奏时间轴、动作轨道和渲染能力。

#### [ ] Phase 5-1：现有实现、素材和技术路线调研

调查原游戏的演奏表现、社区样例、可复用开源项目、角色与环境资产、3D 引擎、实时渲染和离线渲染方案，并记录许可证、硬件要求、输入输出和不可复用部分。

#### [ ] Phase 5-2：最小可行技术预研

用一首短 MIDI 和最小场景验证“音符时间轴 → 音频 → 琴键/手部动作 → 镜头/场景 → 视频”的最短链路，测量同步误差、渲染时间、资源占用和输出质量。预研失败时记录原因，不直接进入大规模实现。

#### [ ] Phase 5-3：统一演奏中间表示和时间轴

定义 MIDI、音频、琴键、手指、镜头、动作、表情和音色轨道的统一时间轴、中间表示、版本和校验规则，让不同 Renderer 可以使用同一份输入。

#### [ ] Phase 5-4：手指、琴键和演奏动作同步

实现可替换的手指/琴键映射、动作约束和同步校验，明确哪些表现可以近似、哪些表现必须精确，不把某个 3D 引擎或角色绑定写死。

#### [ ] Phase 5-5：镜头、环境、动作和音色轨道

建立演奏场景、镜头、角色动作、表情和音色表现轨道，并让它们与音频、MIDI 时间轴和 RenderJob 输出保持一致。

#### [ ] Phase 5-6：可替换 3D Renderer 和资源能力报告

接入至少一个可运行的 Renderer，统一输入输出、进度、失败、缓存和资源配置；同时报告不同 Renderer 对角色、环境、动作和硬件的能力差异。

#### [ ] Phase 5-7：定制演奏技术底座验收与 Phase 6 交接

完成从 MIDI/曲目到演奏媒体的端到端验收，记录同步误差、画面质量、性能和已知限制。只有达到明确的交接标准后，Phase 6 才能使用这套能力开发视频回信。

### Phase 6 — 视频回信与即兴创作

视频回信依赖 Phase 5 的演奏时间轴、动作轨道和 Renderer。这里的“即兴创作”指根据回信上下文触发的即兴演奏或改编，不等同于 Phase 5 的通用演奏技术底座。

#### [ ] Phase 6-1：现有功能调研、行为边界和用户流程

调查关服前视频回信、即兴创作的实际表现和用户样例，确认触发条件、回复结构、角色动作、声音、演奏和环境要求，再冻结输入、输出和验收边界。设计与验收记录见 [Phase 6-1 视频回信与即兴创作设计和验收](./docs/phase6-1-video-reply-and-improvisation.md)。

#### [ ] Phase 6-2：回信上下文与即兴创作中间表示

定义文字回信、玩家关系、角色状态、情绪、场景、声音、演奏意图和即兴约束如何转换为 Phase 5 可消费的演奏与表现计划。

#### [ ] Phase 6-3：VideoGenerator 接口、注册表和本地 fallback

实现独立的 `VideoGenerator` 和注册表，接入确定性的本地技术 fallback，验证排队、处理中、成功、失败、取消、重启恢复、媒体保存、格式检查和查询；它与已有 `videoImporter` 完全分离。

#### [ ] Phase 6-4：外部/本地高质量生成或渲染 provider

根据 Phase 6-1 的调研结果选择可行路线，接入外部视频模型、本地模型或实时/离线 Renderer；记录输入资产、硬件要求、成本、延迟、隐私和质量边界。

#### [ ] Phase 6-5：视频回信任务、网关和用户入口

把回信上下文、即兴计划、Phase 5 演奏输出和视频生成结果串成可恢复的任务流程，让用户在收到回信时能够查看、播放和管理视频资产。

#### [ ] Phase 6-6：视频回信与即兴创作验收

分别完成离线 fallback 技术验收、provider 质量验收和 Steam 实机验收；不能用简单 fallback 的成功替代正式角色表现质量验收。

### Phase 7 — 发布发行

#### [ ] Phase 7-1：发行形态和安装边界调研

确认进程锁、安装目录、依赖打包、更新、回滚、日志和卸载的实际约束，形成发行前置清单。

#### [ ] Phase 7-2：普通用户安装器

整合从原版一次安装所需的全部增量补丁，并验证与已验收功能一致；补齐进程锁、事务日志、安装后完整验证、卸载命令和安全回滚。当前具体缺口见[游戏接入](./docs/original-installation.md#当前交付边界2026-09-09)。

#### [ ] Phase 7-3：配置向导和模块选择

让用户为信件、模型、播放器、渲染器和 3D 模块选择实现、填写配置并切换 fallback。

#### [ ] Phase 7-4：诊断、备份和恢复

提供版本检查、能力检查、日志导出、外置备份、恢复和可读错误提示。

#### [ ] Phase 7-5：发行包和最终文档

整理许可证、第三方引用、安装说明、升级路径、已知问题和发行验证清单。

详细的证据边界、历史记录和阶段交接仍以 [`docs/phase_2_to_3_handoff.md`](./docs/phase_2_to_3_handoff.md) 及各阶段文档为准。

## 开发与测试

```powershell
pnpm test
```

每项功能都应同时提交接口、测试和文档更新。采用小步提交，方便本地开发、远程审阅和后续维护。

## 范围与保存原则

本仓库不分发原始游戏资源、修改后的专有 DLL、用户信件、用户私有媒体或 API Key。补丁器在修改游戏安装目录前，必须创建基线、备份、校验记录和回滚路径。

## 许可证

代码采用 [MIT License](./LICENSE)。游戏资源和第三方材料仍受其原权利人的许可条款约束。

## 第三方项目致谢

感谢 [yilangren/OliviaSoul](https://github.com/yilangren/OliviaSoul) 提供成熟的 v18 信件 Harness。林离·余音复用了其预检、记忆组装、生成、检查、必要重写流程，以及对应的公开规则和脚本，并通过 `OliviaSoulHarnessProvider` 接入。

感谢 [1Dreamer666/olivia-lin](https://github.com/1Dreamer666/olivia-lin) 提供公开的人格资料、书信技艺、记忆材料、评测用例和离线人格引擎。相关文件保留在 `third_party/olivia-lin`，许可证和来源提交见该目录说明。
