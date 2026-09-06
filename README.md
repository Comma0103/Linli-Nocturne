# Linli Nocturne（林离·余音）

> 《BSide: Olivia Lin》的本地功能复原与扩展项目。

林离·余音致力于在原服务停止后，恢复信件、回信、MIDI 演奏、本地音乐、视频回信，并为未来的 3D 手指同步演奏保留可扩展的技术路径。

## 项目状态

Phase 2 已完成接入基础并进入交接状态。基础领域服务、网关契约、分页、备份回滚、原版接入和官方预设曲目 Steam 实机验收已有证据；上传曲目的完整播放体验属于 Phase 4，当前仍受 `LINLI-PLAY-001` 阻塞。完整状态、阶段边界和下一阶段 Prompt 见 [`docs/phase2-handoff.md`](./docs/phase2-handoff.md)。

Phase 3 的首个信件可靠性里程碑已完成：信件与 MIDI 共用显式时区日界线，信件具备 `pending/processing/replied/failed` 状态、原子领取、重试上限和可替换的外部/本地/fallback provider 接口；后台 worker、真实模型连接和视频回信仍未完成。设计与验收标准见 [`docs/phase3-letter-reliability.md`](./docs/phase3-letter-reliability.md)。

当前有一个已登记的已知阻塞：上传曲目能够生成并显示，但暂时无法接管原生 WebPlayer 进入桌面演奏；详见 [`LINLI-PLAY-001`](./docs/known-issues.md)。

## 开发路线

- [x] **Phase 0 — 调研与设计**：调研 0.0.9.627 客户端基线、整理原有功能、冻结接口、设计用户流程。
- [x] **Phase 1 — 本地领域核心**：SQLite 存储、本地网关、写信规则、离线回信、RenderJob 状态机、MIDI 解析、Tempo 和延音踏板提取。本阶段完成的是可独立运行的最小本地闭环。
- [x] **Phase 1 音乐基础**：离线 WAV 音频渲染和本地歌单。
- [x] **Phase 2 — 游戏接入基础**：版本白名单、基线校验、备份回滚、原版前端补丁、原生 DLL 入口补丁、网关契约、用户曲目分页、独立暂存验收和官方曲目 Steam 实机验收已完成。它不承诺上传曲目已经完成原生 WebPlayer 播放。
- [x] **Phase 3 首个里程碑 — 信件可靠性**：统一时区日界线、信件状态机、原子领取、重试上限和可替换 provider 接口已完成；后台 worker、真实模型连接和视频回信仍待后续小步实现。
- [ ] **Phase 4 — 音乐体验**：在 Phase 2 的接入基础上完成用户上传 MIDI 的完整体验，包括预览、音频/视频任务、游戏内歌单以及上传曲目真正接管播放器并进入演奏。`LINLI-PLAY-001` 归属于这一阶段的跨层缺陷。
- [ ] **Phase 5 — 即兴创作**：支持外部 API 和完全本地运行的模型辅助作曲。
- [ ] **Phase 6 — 3D 演奏**：时间轴、手指轨道、镜头轨道、动作轨道和可替换的 3D Renderer。
- [ ] **Phase 7 — 发布发行**：面向普通用户的安装器、诊断、备份恢复、发行包和完整文档。

未勾选项目是计划目标，不代表原服务可以被百分之百复刻。渲染器和模型提供方均采用可替换设计，后续可以持续改进而不必重写游戏接入层。

## 当前功能

- **信件**：默认遵循原游戏每日最多 3 封、每封延迟 5 分钟的规则，并提供高级 bypass 开关。
- **模型提供方**：当前包含离线降级实现，外部 API 和本地模型共用统一接口。
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
    ├─ LetterService + ModelAdapter
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
