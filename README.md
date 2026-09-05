# Linli Nocturne（林离·余音）

> 《BSide: Olivia Lin》的本地功能复原与扩展项目。

林离·余音致力于在原服务停止后，恢复信件、回信、MIDI 演奏、本地音乐、视频回信，并为未来的 3D 手指同步演奏保留可扩展的技术路径。

## 项目状态

项目正在进行 Phase 2 开发。基础领域服务已经可以运行并通过测试；原装前端补丁已经完成只读 dry-run，正在进行独立暂存接入和真实启动验证。

## 开发路线

- [x] **Phase 0 — 调研与设计**：调研 0.0.9.627 客户端基线、整理原有功能、冻结接口、设计用户流程。
- [x] **Phase 1 — 本地领域核心**：SQLite 存储、本地网关、写信规则、离线回信、RenderJob 状态机、MIDI 解析、Tempo 和延音踏板提取。
- [x] **Phase 1 音乐基础**：离线 WAV 音频渲染和本地歌单。
- [ ] **Phase 2 — 游戏接入**：恢复写信入口、将本地网关接入游戏客户端、实现安全备份和回滚补丁。版本白名单、基线校验和备份回滚已开始实现。
- [ ] **Phase 3 — 信件体验**：记忆、失败重试、文字回信、视频回信导入，以及外部/本地模型提供方。
- [ ] **Phase 4 — 音乐体验**：用户上传 MIDI、预览、音频/视频任务和游戏内歌单界面。
- [ ] **Phase 5 — 即兴创作**：支持外部 API 和完全本地运行的模型辅助作曲。
- [ ] **Phase 6 — 3D 演奏**：时间轴、手指轨道、镜头轨道、动作轨道和可替换的 3D Renderer。
- [ ] **Phase 7 — 发布发行**：面向普通用户的安装器、诊断、备份恢复、发行包和完整文档。

未勾选项目是计划目标，不代表原服务可以被百分之百复刻。渲染器和模型提供方均采用可替换设计，后续可以持续改进而不必重写游戏接入层。

## 当前功能

- **信件**：默认遵循原游戏每日最多 3 封、每封延迟 5 分钟的规则，并提供高级 bypass 开关。
- **模型提供方**：当前包含离线降级实现，外部 API 和本地模型共用统一接口。
- **MIDI**：支持标准 MIDI 文件解析、音符/Tempo/延音踏板事件、时间轴清单和本地 WAV 渲染。
- **MIDI 网关**：已具备本地上传、任务创建、结果轮询和 WAV 媒体读取的首版兼容契约。
- **本地歌单**：基于 SQLite 保存歌单条目，后续可暴露给游戏客户端。
- **媒体任务**：音频、视频和未来 3D Renderer 共用 RenderJob 模型。
- **可恢复性**：补丁前先建立游戏文件基线；用户数据和生成媒体放在 Steam 目录之外。
- **原装接入**：安装器会区分原装、已被其他工具修改和未知状态；用户不需要预先安装 OliviaSoul。

## 安装

### 当前开发版

环境要求：Windows 10/11、Node.js 22 及以上（当前使用 Node.js 24）、pnpm 9 及以上。后续游戏接入阶段还需要安装《BSide: Olivia Lin》本体。

```powershell
git clone https://github.com/Comma0103/Linli-Nocturne.git
cd Linli-Nocturne
pnpm test
```

当前版本可以运行领域核心和测试，暂时不会自动修改游戏文件。

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
- [原装游戏基线与插件接入](./docs/original-installation.md)
- [原版前端接口审计](./docs/frontend-audit.md)

## 开发与测试

```powershell
pnpm test
```

每项功能都应同时提交接口、测试和文档更新。采用小步提交，方便本地开发、远程审阅和后续维护。

## 范围与保存原则

本仓库不分发原始游戏资源、修改后的专有 DLL、用户信件、用户私有媒体或 API Key。补丁器在修改游戏安装目录前，必须创建基线、备份、校验记录和回滚路径。

## 许可证

代码采用 [MIT License](./LICENSE)。游戏资源和第三方材料仍受其原权利人的许可条款约束。
