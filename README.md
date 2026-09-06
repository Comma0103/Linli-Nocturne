# Linli Nocturne（林离·余音）

> 《BSide: Olivia Lin》的本地功能复原与扩展项目。

林离·余音致力于在原服务停止后，恢复信件、回信、MIDI 演奏、本地音乐、视频回信，并为未来的 3D 手指同步演奏保留可扩展的技术路径。

## 项目状态

截至当前，Phase 0–3 已完成，已在 Steam 0.0.9.627 中验收离线回信和 DeepSeek + Persona + OliviaSoul Harness 真实回信；Phase 4-1 正在开发，首轮已打通音乐配置和媒体格式契约。项目仍是开发版，不是发行版。上传曲目接管原生 WebPlayer 的问题 `LINLI-PLAY-001` 仍需证据调查。

## 当前功能

### 信件与回信

* [x] **信件规则与可靠处理**：遵循每日最多 3 封、默认每封延迟 5 分钟的原版规则；支持排队、状态流转、原子领取、过期任务恢复、失败重试和最大尝试次数。
* [x] **可替换的回信生成链路**：支持离线回信、外部 OpenAI 兼容 API、本地 OpenAI 兼容模型，并可组合 Persona、Harness 与有限记忆；外部实现失败时可按配置回退。
* [x] **Persona、Harness 与有限记忆**：支持默认、静态文件和外部文件 Persona，通用 Harness 插槽，以及受限 SQLite MemoryProvider；记忆默认关闭，并限制条数、单条长度和上下文长度。OliviaSoul v18 是可选 Harness 实现。
* [x] **Steam 实机回信**：已在 Steam 客户端 `0.0.9.627` 中验收离线回信，以及 DeepSeek + Persona + OliviaSoul Harness 的真实回信。

### MIDI、曲库与媒体任务

* [x] **MIDI 解析与时间轴**：支持标准 MIDI 文件解析，提取音符、Tempo、延音踏板并生成时间轴清单。
* [x] **WAV/MP4 媒体任务**：支持 MIDI 上传、任务创建、WAV 渲染、MP4 音频封装、状态轮询、取消、删除、失败状态和 SQLite 持久化恢复。
* [x] **用户曲库与歌单**：保存用户曲目和歌单，支持分页、原版字段兼容、加入或移除歌单，以及离线曲库入口和本地生成曲目展示。
* [ ] **原生 WebPlayer 播放/演奏接管**：上传 MIDI 目前尚未真正接管原生 WebPlayer、进入演奏桌面或稳定发声（`LINLI-PLAY-001`）。

### 可插拔模块与游戏资产

* [x] **可插拔模块体系**：Provider、Persona、Harness、Renderer、PlaybackAdapter、Encoder、Importer、RenderJob 和 ModuleRegistry 均通过统一接口或适配器连接，可按配置选择实现。
* [x] **视频回信资产管理**：支持视频资产导入、格式检查、保存、播放、替换、删除，以及处理中、成功和失败状态管理；这不包括视频自动生成。
* [x] **安全安装与恢复**：支持版本白名单、SHA-256 基线校验、游戏目录外备份、已知补丁回滚和修改检测。

### 尚未完成

* [ ] 网易云、QQ 音乐等外部歌单或歌曲导入。
* [ ] 宽松演奏模式。
* [ ] 视频自动生成。
* [ ] 即兴作曲。
* [ ] 3D 手指、琴键、镜头和动作同步。
* [ ] 最终 GUI 设置、普通用户安装器和发行版。

## 安装

### 当前开发版

环境要求：Windows 10/11、Node.js 22 及以上（当前使用 Node.js 24）、pnpm 9 及以上。后续游戏接入阶段还需要安装《BSide: Olivia Lin》本体。

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

只修改 `config/user-config.json`，不要修改模板。这个文件已被 Git 忽略。

至少填写玩家名字和时区：

```json
"user": {
  "displayName": "嘉树",
  "language": "zh-CN",
  "timeZone": "Asia/Shanghai"
}
```

`displayName` 用于回信称呼和模型上下文。

### 2. 选择信件模式

#### 离线回信（无需 API Key）

模板默认就是离线模式，适合先确认本地服务和游戏接入。测试时可把 `letters.dailyLimitBypass` 临时改为 `true`，跳过每日 3 封和 5 分钟等待。

#### DeepSeek + Persona + OliviaSoul Harness（可选）

把 `letters` 中对应字段改为自己的模型信息：

```json
"letters": {
  "baseModel": {
    "provider": "external.openai-compatible",
    "external": {
      "endpoint": "https://api.deepseek.com",
      "model": "你的模型名称",
      "apiKey": "你的 API Key"
    }
  },
  "fallbackEnabled": true,
  "persona": {
    "providerId": "file",
    "file": "../third_party/olivia-lin/BSide_Olivia_Lin/persona/olivia_lin.md"
  },
  "harness": {
    "enabled": true,
    "providerId": "olivia-soul-v18",
    "root": "../third_party/OliviaSoul/v18-harness",
    "person": "linli-local-user"
  }
}
```

API Key 只保存在本机的 `config/user-config.json`，不能提交或公开。仓库已经内置 OliviaSoul 和 olivia-lin 资产，不需要另外下载。`fallbackEnabled` 开启后，外部模型失败可以回到离线回信。

#### 本地模型（可选）

把 `baseModel.provider` 改为 `local.openai-compatible`，然后填写 `baseModel.local` 的本地 OpenAI 兼容地址、模型名和 Key；本地模型服务必须先在本机启动。

### 3. 启动本地服务

配置保存后，在仓库根目录执行，并保持窗口运行：

```powershell
node scripts/start-local-service.mjs
Invoke-RestMethod http://localhost:27149/health
```

返回 `ok: true` 后，信件服务已经启动。修改配置后必须重启这个服务才会生效。

### 4. 第一次接入 Steam 游戏

如果只想调用本地 HTTP 服务，到这里即可；如果要在游戏界面体验，先完全退出游戏，再对游戏目录做只读检查：

```powershell
node scripts/plan-install.mjs "你的 Steam 游戏目录" "游戏目录外的备份目录"
```

只有输出 `canApply: true`、版本为 `0.0.9.627` 且状态为 `pristine` 时，才允许执行写入：

```powershell
node scripts/apply-install.mjs "你的 Steam 游戏目录" "游戏目录外的备份目录" --apply --confirm=Linli-Nocturne
```

游戏目录如果已经被其他工具修改、版本未知或游戏仍在运行，必须停止。执行器会在写入前再次校验基线并创建备份。

### 5. 打开游戏并体验

保持本地服务运行，启动已完成接入的 Steam 客户端，打开信箱并写信。打开信件详情即可查看回信正文；默认规则是每日 3 封、每封等待 5 分钟。

当前阶段还可以使用已接入的 MIDI 上传、解析、生成和本地曲库入口；上传曲目真正接管原生 WebPlayer 的播放/演奏仍是 Phase 4 工作，受 `LINLI-PLAY-001` 影响。

修改配置后必须重启服务。回信失败时，先检查模型地址、模型名、API Key 和 Harness 开关。

## 开发者用法

用于不经过 Steam 直接调试领域服务、网关和模块实现。

### 运行测试和本地服务

```powershell
pnpm test
node scripts/start-local-service.mjs
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

写信功能使用 `LetterService`、`ModelAdapter`、Persona 和 Harness；本地 HTTP 网关是游戏客户端的兼容层。

### 开始增量开发

先阅读 [`docs/phase_3_to_4_handoff.md`](./docs/phase_3_to_4_handoff.md) 和对应阶段设计文档，再按“开发路线”选择未完成的小里程碑：先补需求、设计和验收标准，再修改接口、实现、测试和文档。需要直接验证游戏接入时，使用 `scripts/plan-install.mjs` 做只读检查，确认基线后再执行安装计划。

## 架构

```text
游戏客户端
    ↓ 兼容本地 HTTP 网关
领域服务 ── SQLite 存储
    ├─ LetterService + LetterWorker + MemoryProvider + ModelAdapter
    ├─ MusicService + MIDI Parser
    └─ RenderJob + Audio/Video/Future3D Renderer
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
- [Phase 3-8 真实模型 Steam 实机验收](./docs/phase3-2-provider-and-harness.md)
- [Phase 3 → Phase 4 交接文档](./docs/phase_3_to_4_handoff.md)
- [Phase 4 完整音乐体验总览](./docs/phase4.md)
- [Phase 4-1 音乐设置与媒体契约设计和验收](./docs/phase4-1-music-settings-and-media.md)
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

把必要的历史内容整理为受限记忆，让回信能够参考上下文，同时限制保存范围和长度；默认关闭，启用后可使用 SQLite 或其他 MemoryProvider。

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

#### [x] Phase 3-8：真实模型 Steam 实机验收（DeepSeek + Persona + OliviaSoul Harness）（`b7cd5ef`）

使用 DeepSeek 外部模型、已内置 Persona 和 OliviaSoul Harness，在 Steam 界面完成真实回信测试；已确认模型请求成功、Harness 实际运行、Persona 生效，以及游戏内显示以玩家名字“嘉树”开头的完整回信正文。设计与验收记录见 [Phase 3 Provider 与 OliviaSoul Harness](./docs/phase3-2-provider-and-harness.md)。

### Phase 4 — 完整音乐体验

#### [ ] Phase 4-1：用户 MIDI 预览和媒体任务

完成上传曲目的预览、音频/视频生成、状态轮询、取消、失败恢复和本地媒体播放。

#### [ ] Phase 4-2：曲库、歌单和 App 选择入口

把用户曲目稳定接入曲库和歌单，并允许用户选择具体播放器、渲染器或 fallback。

#### [ ] Phase 4-3：`LINLI-PLAY-001` 原生证据调查

在获得原生 WebPlayer 只读反汇编、CEF 媒体事件或完整媒体请求后，定位本地曲目无法接管播放的问题。

#### [ ] Phase 4-4：上传曲目 Steam 播放/演奏验收

在独立备份和正确版本基线下，验证上传曲目真正切换媒体、进入桌面演奏并完成进度推进。

#### [ ] Phase 4-5：外部歌单与歌曲导入

为网易云音乐、QQ 音乐等来源提供可替换的歌单/歌曲导入适配器；把可用的曲目信息、音频或 MIDI 统一转换成项目内部曲目表示，再接入播放和曲库。只处理用户有权使用的内容，不绕过 DRM 或地区限制。

#### [ ] Phase 4-6：宽松演奏模式

允许导入的歌曲以音频播放或近似 MIDI 事件进入演奏流程。这个阶段不要求手指、琴键和音乐逐帧完全匹配；严格的 3D 同步仍留给 Phase 6，并且播放器、渲染器和同步器都保持可插拔。

### Phase 5 — 即兴创作

#### [ ] Phase 5-1：作曲中间表示和约束

定义音符、节奏、和声、段落和风格约束的统一表示。

#### [ ] Phase 5-2：外部 API、本地模型和 fallback 作曲 provider

沿用可插拔 provider 设计，让用户选择外部 API、完全本地模型或无模型路径。

#### [ ] Phase 5-3：生成、编辑、校验和导出 MIDI

把模型输出转换为可校验、可预览、可编辑和可加入曲库的 MIDI。

### Phase 6 — 3D 演奏

#### [ ] Phase 6-1：统一演奏时间轴

把 MIDI、音频、手指、琴键、镜头和动作轨道放入统一的时间轴中间表示。

#### [ ] Phase 6-2：手指与琴键同步模块

实现可替换的手指/琴键映射和同步校验，不把某个 3D 引擎写死。

#### [ ] Phase 6-3：镜头、动作和音色轨道

增加镜头、动作、音色和演奏表现轨道，并保持与 RenderJob 的状态和媒体输出一致。

#### [ ] Phase 6-4：可插拔 3D Renderer

接入一个或多个 3D 渲染器，统一输入输出、进度、失败和资源配置。

### Phase 7 — 发布发行

#### [ ] Phase 7-1：普通用户安装器

补齐进程锁、事务日志、安装后完整验证、卸载命令和安全回滚。

#### [ ] Phase 7-2：配置向导和模块选择

让用户为信件、模型、播放器、渲染器和 3D 模块选择实现、填写配置并切换 fallback。

#### [ ] Phase 7-3：诊断、备份和恢复

提供版本检查、能力检查、日志导出、外置备份、恢复和可读错误提示。

#### [ ] Phase 7-4：发行包和最终文档

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
