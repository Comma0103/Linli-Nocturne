# Linli Nocturne（林离·余音）

> 《BSide: Olivia Lin》的本地功能复原与扩展项目。

林离·余音致力于在原服务停止后，恢复信件、回信、MIDI 演奏、本地音乐、视频回信，并为未来的 3D 手指同步演奏保留可扩展的技术路径。

## 项目状态

截至当前，Phase 0–2 已完成，Phase 3 已完成信件可靠性、真实 provider/Harness、后台 worker 和有限对话记忆四个小里程碑。当前继续开发 Phase 3 的视频回信体验；项目仍是开发版，不是发行版。Phase 4 尚未开始，上传曲目接管原生 WebPlayer 的问题 `LINLI-PLAY-001` 仍保留在已知问题中。

## 开发路线

下面按提交记录和功能边界拆分开发步骤。已完成项保留对应的代表性提交，未勾选项是后续计划。所有模块都遵守可插拔原则，具体实现通过统一接口、适配器或中间表示接入。

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

#### [x] Phase 3-2：真实 provider 与可插拔 Harness（`5f6e463`、`62c92e1`）

接入 OpenAI 兼容外部 API、通用 Harness 插槽、OliviaSoul v18 适配器、本地模型接口和 fallback；OliviaSoul 只是一个可替换实现。

#### [x] Phase 3-3：后台 worker 与崩溃恢复（`8ae5964`）

自动领取待处理信件，防止进程内重复处理，恢复过期 `processing` 租约，并在达到最大尝试次数后失败。

#### [x] Phase 3-4：信件记忆和连续对话（`2c20767`）

把必要的历史内容整理为受限记忆，让回信能够参考上下文，同时限制保存范围和长度；默认关闭，启用后可使用 SQLite 或其他 MemoryProvider。

#### [x] Phase 3-M1：跨阶段模块化边界修复（`637b33c`）

抽出 AudioRenderer、GamePlaybackAdapter、PersonaProvider、ModuleRegistry 和统一模块设置；保留原版游戏契约在适配器边界内，SQLite 继续作为固定事实源。

#### [x] Phase 3-5：视频回信资产流程（`a3e5c95`）

实现视频回信的导入、格式检查、保存、播放、替换、删除和清晰的处理中/成功/失败状态。

设计和验收标准见 [Phase 3-5 视频回信资产流程](./docs/phase3-letter-video.md)。

#### [ ] Phase 3-6：Phase 3 总体验收

串联写信、排队、provider、重试、记忆和视频回信，补齐网关冒烟测试、错误恢复、文档和设置入口。

### Phase 4 — 完整音乐体验

#### [ ] Phase 4-1：用户 MIDI 预览和媒体任务

完成上传曲目的预览、音频/视频生成、状态轮询、取消、失败恢复和本地媒体播放。

#### [ ] Phase 4-2：曲库、歌单和 App 选择入口

把用户曲目稳定接入曲库和歌单，并允许用户选择具体播放器、渲染器或 fallback。

#### [ ] Phase 4-3：`LINLI-PLAY-001` 原生证据调查

在获得原生 WebPlayer 只读反汇编、CEF 媒体事件或完整媒体请求后，定位本地曲目无法接管播放的问题。

#### [ ] Phase 4-4：上传曲目 Steam 播放/演奏验收

在独立备份和正确版本基线下，验证上传曲目真正切换媒体、进入桌面演奏并完成进度推进。

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

详细的证据边界、历史记录和阶段交接仍以 [`docs/phase2-handoff.md`](./docs/phase2-handoff.md) 及各阶段文档为准。

## 当前功能

- **信件**：默认遵循原游戏每日最多 3 封、每封延迟 5 分钟的规则，并提供高级 bypass 开关。
- **模型提供方**：外部 API、可插拔 Harness、本地模型和离线降级共用统一接口；OliviaSoul 只是其中一个可选 Harness。
- **信件记忆**：默认关闭；启用后可使用有条数、单条字符数和上下文字符数限制的 MemoryProvider。
- **模块选择**：当前已有可读配置文件、校验命令和配置向导，用户可以为信件、音乐播放、媒体渲染和未来 3D 同步选择实现与 fallback；最终 App 图形设置页会复用同一模型，第三方项目都通过适配器接入。
- **MIDI 基础**：支持标准 MIDI 文件解析、音符/Tempo/延音踏板事件、时间轴清单、本地音频渲染和媒体任务；上传曲目完整接管原生 WebPlayer 的播放/演奏仍属于 Phase 4，受 `LINLI-PLAY-001` 影响。
- **MIDI 网关**：已具备符合原版客户端响应契约的本地上传、任务创建、结果轮询、媒体读取、统一 RenderJob 字段、SQLite 任务元数据持久化，以及用户曲目游标分页；服务重启后会按当前网关地址恢复历史任务的媒体 URL。协议回归测试覆盖上传预检、下划线字段和数字任务状态。游戏播放使用可信的 `localhost` 回环媒体地址，避免把 `127.0.0.1` HTTP 资源当作混合内容拦截。
- **本地歌单**：基于 SQLite 保存歌单条目，后续可暴露给游戏客户端。
- **媒体任务**：音频、视频和未来 3D Renderer 共用 RenderJob 模型。
- **可恢复性**：补丁前先建立游戏文件基线；用户数据和生成媒体放在 Steam 目录之外。
- **原装接入**：安装器会区分原装、已被其他工具修改和未知状态；用户不需要预先安装 OliviaSoul。
- **离线用户曲目**：针对已接入的客户端提供受控增量补丁，使本地生成曲目能够在离线曲库中显示；补丁会先备份当前前端包。

## 安装

### 当前开发版

环境要求：Windows 10/11、Node.js 22 及以上（当前使用 Node.js 24）、pnpm 9 及以上。后续游戏接入阶段还需要安装《BSide: Olivia Lin》本体。

```powershell
git clone https://github.com/Comma0103/Linli-Nocturne.git
cd Linli-Nocturne
pnpm install
pnpm test
```

当前版本可以运行领域核心和测试，暂时不会自动修改游戏文件。

可以先对游戏目录做只读接入检查（不会修改文件）：

```powershell
node scripts/plan-install.mjs "D:\Program Files (x86)\Steam\steamapps\common\BSide Olivia Lin Test" "D:\Aesthetic\Linli-Nocturne-Backups"
```

只有输出 `canApply: true` 时，后续安装器才会进入备份和补丁步骤。执行器还会在写入前再次校验原装基线，并在前端或 DLL 补丁失败时自动回滚；默认命令行仍以只读计划启动，避免误操作已有第三方修改的安装。

开发版安装命令默认仍是只读计划：

```powershell
node scripts/apply-install.mjs "D:\Program Files (x86)\Steam\steamapps\common\BSide Olivia Lin Test" "D:\Aesthetic\Linli-Nocturne-Backups"
```

只有确认游戏已退出、目录是原装基线，并明确添加 `--apply --confirm=Linli-Nocturne` 时才会执行备份和补丁。当前 Steam 目录如果被其他工具修改，命令会直接拒绝执行。

## 当前用法

当前开发接口可以解析 MIDI、生成本地 WAV，并加入 SQLite 歌单：

```js
import { SqliteStore } from './src/storage/sqlite-store.js';
import { MusicService } from './src/music/music-service.js';

const store = new SqliteStore('./data/linli.sqlite');
const music = new MusicService({ store });
const track = music.importMidi({ buffer: midiBytes, sourceName: 'my-song.mid', title: '我的曲目' });
music.addToPlaylist(track);
```

写信功能使用 `LetterService` 和 `ModelAdapter`；默认规则与原游戏保持一致。本地 HTTP 网关是后续游戏客户端的兼容层。

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
- [Phase 3 信件可靠性首个里程碑](./docs/phase3-letter-reliability.md)
- [Phase 3 Provider 与 OliviaSoul Harness 适配](./docs/phase3-provider-integration.md)
- [Phase 3 信件后台 Worker](./docs/phase3-letter-worker.md)
- [Phase 3 信件记忆和连续对话](./docs/phase3-letter-memory.md)
- [第三方项目引用与复用说明](./docs/third-party-credits.md)
- [模块设置与实现选择](./docs/module-settings.md)
- [原装游戏基线与插件接入](./docs/original-installation.md)
- [原版前端接口审计](./docs/frontend-audit.md)
- [Phase 2 收尾与 Phase 3 交接（完整 Prompt）](./docs/phase2-handoff.md)

## 开发与测试

```powershell
pnpm test
```

每项功能都应同时提交接口、测试和文档更新。采用小步提交，方便本地开发、远程审阅和后续维护。

## 范围与保存原则

本仓库不分发原始游戏资源、修改后的专有 DLL、用户信件、用户私有媒体或 API Key。补丁器在修改游戏安装目录前，必须创建基线、备份、校验记录和回滚路径。

## 许可证

代码采用 [MIT License](./LICENSE)。游戏资源和第三方材料仍受其原权利人的许可条款约束。
