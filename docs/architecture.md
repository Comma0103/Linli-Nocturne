# 初始架构

Game Client -> Local Gateway -> Domain Services -> Stores and Renderers

核心模块：
- PatchManager：版本识别、备份、补丁、校验、回滚。
- LocalGateway：兼容游戏前端的登录、信件、音乐、歌单和媒体接口。
- LetterService：额度、延迟、生成、检查、重试和记忆。
- ModelAdapter：外部 API、本地模型、离线人格引擎。
- MusicService：MIDI 上传、解析、任务编排、曲库和歌单。
- RenderPipeline：AudioRenderer、VideoRenderer、Future3DRenderer。
- MediaStore：校验、元数据、Range 读取、备份。
- DesktopApp：安装、配置、启动、诊断和恢复。

关键实体：
Letter、MemoryEpisode、MidiAsset、RenderJob、PlaylistItem、ClientBaseline、ModelProfile。

原则：
1. 游戏前端作为展示层，本地服务通过兼容 API 接入。
2. SQLite 是事实源，导出文件是投影。
3. 所有音频、视频和未来 3D 任务统一使用 RenderJob。
4. 渲染器可插拔，第一版音频实现不能锁死未来 3D 方案。
5. 普通用户流程优先，开发者模式作为高级入口。
