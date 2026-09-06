# 初始架构

Game Client -> Local Gateway -> Domain Services -> Stores and Renderers

核心模块：
- PatchManager：版本识别、备份、补丁、校验、回滚。
- LocalGateway：兼容游戏前端的登录、信件、音乐、歌单和媒体接口。
- LetterService：额度、延迟、状态领取、生成、检查、重试和记忆。
- MemoryProvider：可选的有限对话记忆接口；默认 `NoopMemoryProvider`，内置 `SqliteMemoryProvider`，通过条数、单条字符数和上下文字符数限制保存范围。
- LetterWorker：后台调度、processing 租约恢复和进程内 tick 互斥；保留手动处理接口用于诊断。
- ModelAdapter：外部 API、可插拔 Harness、本地模型、离线人格引擎；OliviaSoul v18 通过适配器接入，其他 Harness 也可替换。
- MusicService：MIDI 上传、解析、任务编排、曲库和歌单。
- RenderPipeline：AudioRenderer、VideoRenderer、Future3DRenderer。
- MediaStore：校验、元数据、Range 读取、备份。
- DesktopApp：安装、配置、启动、诊断和恢复。

关键实体：
Letter、MemoryEpisode、MidiAsset、RenderJob、PlaylistItem、ClientBaseline、ModelProfile。

Phase 3 信件可靠性约定：Letter 状态为 `pending`、`processing`、`replied`、`failed`；SQLite 事务原子领取并记录尝试次数，失败按重试策略回到 `pending` 或进入 `failed`。信件和 MIDI 共用显式 IANA 时区日界线，默认 `Asia/Shanghai`，数据库仍保存 UTC ISO 时间。

原则：
1. 游戏前端作为展示层，本地服务通过兼容 API 接入。
2. SQLite 是事实源，导出文件是投影。
3. 所有音频、视频和未来 3D 任务统一使用 RenderJob。
4. 渲染器可插拔，第一版音频实现不能锁死未来 3D 方案。
5. 普通用户流程优先，开发者模式作为高级入口。

## 全局模块化约定

Linli Nocturne 的核心层只处理统一接口和中间表示，不把任何一个第三方项目当作唯一实现。每类能力都通过 provider、adapter 或 renderer 接入，并由能力注册表报告名称、版本、配置项、支持的输入输出和健康状态。

- **信件**：`LetterProvider` 统一外部 API、本地模型、第三方 Harness 和 fallback；OliviaSoul 是一个可选适配器。
- **音乐与演奏**：`MusicPlayer`/播放适配器统一 MIDI、音频、原生 WebPlayer 和其他播放器；`LINLI-PLAY-001` 只描述其中一个接入缺陷。
- **媒体与 3D**：`RenderJob` 是统一中间表示，Audio、Video、Future3D 和动作同步器都是可替换实现。
- **用户设置**：App 保存每个模块当前选择、配置和 fallback 策略；切换实现不应要求修改领域服务代码。

第三方适配器可以复用成熟项目的源码、脚本或协议，但必须保留来源和版本记录，并把第三方依赖隔离在适配器边界内。领域服务不能直接读取第三方项目的私有数据库、Prompt 文件或目录结构。
