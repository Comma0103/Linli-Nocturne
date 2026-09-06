# 模块化适配层最小增量修复

## 目标

修复 Phase 0–3 倒查中发现的模块化缺口，同时保留原版游戏接入所必须固定的契约。核心服务只依赖接口和中间表示；内置实现仍作为默认值，但不再是唯一写死的实现。

## 本轮范围

1. 增加统一 `AudioRenderer` 接口和 Renderer 注册表，现有内置 WAV 渲染器作为默认实现。
2. 将原生 `song`、TOD 和 WebPlayer 字段移到 `GamePlaybackAdapter`；音乐任务服务只处理曲目、媒体和 RenderJob。
3. 增加 `PersonaProvider`，支持默认人格、静态人格和外部人格文件；外部人格文件可以来自 `olivia-lin` 或其他项目，不复制进仓库。
4. 增加通用 `ModuleRegistry` 与人类可读的 JSON 模块设置，统一保存 provider、renderer、播放适配器、人格和记忆实现的选择；API Key 只使用环境变量引用。

## 保持固定的边界

- LocalGateway 的原版路由、响应外壳和字段名必须保持兼容。
- 版本白名单、DLL 签名、前端补丁签名和 `LINLI-PLAY-001` 的原生调查仍属于特定游戏适配层。
- SQLite 继续作为本地事实源，不为了抽象而替换存储引擎。

## 统一接口

- `AudioRenderer.render(buffer, options) -> { wav, duration, timingManifest }`
- `GamePlaybackAdapter.toUserSong({ job, mediaUrl }) -> clientSong`
- `PersonaProvider.getPrompt(input) -> { text, provider, metadata }`
- `ModuleRegistry.register/resolve/list()` 管理可用实现；设置文件只保存实现 ID 和非敏感选项。

## 验收标准

- 自定义 fake AudioRenderer 可以注入 `MusicService` 和 `MidiJobService`，不修改服务代码。
- 自定义 GamePlaybackAdapter 可以替换 Olivia 客户端适配器；默认输出保持现有 0.0.9.627 字段和 TOD 行为。
- 自定义 PersonaProvider、静态人格和外部文件人格都可以注入 provider；没有人格 provider 时现有回信行为不变。
- 设置文件可以被读取、校验和保存；未知实现 ID 被拒绝并给出可读错误，设置文件不接受 API Key 字段。
- 现有网关契约、MIDI 任务和信件测试保持通过，新增模块替换测试通过。

## 对倒查六项问题的结论

1. **Renderer 绑死**：已通过 `AudioRenderer`、Renderer 注册表和构造注入修复；内置音频只是默认实现。
2. **音乐服务混入游戏播放器字段**：已把原生 `song`、TOD 和 WebPlayer 字段移到 `GamePlaybackAdapter`，`MidiJobService` 只处理任务、媒体和统一曲目数据。
3. **普通用户没有选择入口**：已提供人类可读 JSON 设置和交互式配置向导；最终图形设置页仍待 Phase 7，但会复用同一设置模型。
4. **人格没有独立模块**：已提供 `PersonaProvider`，支持默认、静态和外部文件实现；`olivia-lin` 人格资料可按路径接入。
5. **没有统一注册和配置层**：已提供 `ModuleRegistry`、默认注册表、设置校验、版本字段和运行时解析；未知实现或敏感字段会被拒绝。
6. **SQLite 固定实现**：保留为项目明确要求的本地事实源，没有为了形式上的可插拔而增加无用户收益的存储抽象。

## 后续

本轮提供设置后端和清晰配置文件；最终面向普通用户的图形设置界面在 Phase 7 使用同一份设置格式，不另造一套配置协议。
