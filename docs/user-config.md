# `user-config.json` 配置说明

`config/user-config.json` 是普通用户的私有运行配置。它从 `config/user-config.example.json` 复制而来，已被 Git 忽略；只修改自己的配置文件，不要修改模板，也不要把它提交到仓库。

README 只介绍通用启动流程。本页先解释所有配置属性，再按信件、预设曲库和上传曲子等功能给出配置示例。配置保存后必须重启本地服务。

实验分支新增 `olivia-lin.offline`、`linli.persona-bundle`、`linli.fusion-v1` 和 `persona-contract`；这些资产已随仓库提供，不需要另行下载。

## 一、所有属性

### 根属性

| 属性      | 类型和允许值         | 默认值           | 说明                                                                   |
| --------- | -------------------- | ---------------- | ---------------------------------------------------------------------- |
| `version` | 整数，当前只能是 `1` | `1`              | 配置格式版本。不是 `1` 时服务不会启动。                                |
| `user`    | 对象                 | —                | 玩家身份和时区。                                                       |
| `letters` | 对象                 | —                | 信件和回信配置。                                                       |
| `music`   | 对象                 | 模板中的音乐设置 | MIDI 渲染、播放器适配器和媒体编码器选择。                              |
| `media`   | 对象                 | 模板中的媒体设置 | 视频回信导入检查器选择。                                               |
| `threeD`  | 对象                 | 模板中的 3D 设置 | 未来 3D 演奏模块的预留位置，目前没有可用的默认 3D Renderer。           |
| `game`    | 对象                 | 模板中的游戏信息 | 当前主要用于记录目标游戏信息；本地服务不会用它替代启动参数或环境变量。 |
| `privacy` | 对象                 | 模板中的隐私选项 | 外部模型请求需要明确允许；外部媒体来源仍未接入。                     |

### `user`

| 属性               | 类型和允许值                                                 | 默认值          | 说明                                                                       |
| ------------------ | ------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------- |
| `user.displayName` | 字符串                                                       | `""`            | 玩家名字，用于回信称呼和模型上下文。它不是游戏信件收件人；收件人仍是林离。 |
| `user.profileId` | 字符串 | `"default"` | 本机多套用户/会话的记忆隔离键。 |
| `user.language`    | 字符串，模板为 `"zh-CN"`                                     | `"zh-CN"`       | 界面语言预留字段。当前服务主要使用简体中文文案，暂不根据它切换整套界面。   |
| `user.timeZone`    | IANA 时区字符串，例如 `Asia/Shanghai`、`America/Los_Angeles` | `Asia/Shanghai` | 信件和 MIDI 任务的自然日边界。填写本机实际使用的时区。                     |

### `letters`

#### 基础模型

| 属性                                    | 类型和允许值                                                                | 默认值                     | 说明                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `letters.composition`                   | 字符串，模板为 `base-model-with-persona-and-harness`                        | 模板值                     | 给人看的组合说明。当前启动器根据下面的具体字段选择实现，不靠它切换模型。                                      |
| `letters.baseModel.provider`            | `olivia-lin.offline`、`offline-fallback`、`external.openai-compatible`、`local.openai-compatible` | `olivia-lin.offline` | 选择仓库内离线人格引擎、最简 fallback、外部 API 或本地模型。 |
| `letters.baseModel.offline.python` | Python 命令或路径 | `python` | 仅离线人格引擎使用；命令不含路径分隔符时从 PATH 查找。 |
| `letters.baseModel.external.providerId` | 字符串，模板为 `external.openai-compatible`                                 | 模板值                     | 外部服务的说明字段。真正的选择由 `baseModel.provider` 决定。                                                  |
| `letters.baseModel.external.service`    | 字符串，例如 `deepseek`                                                     | `deepseek`                 | 服务来源说明字段，不会替代 `endpoint`。                                                                       |
| `letters.baseModel.external.endpoint`   | URL 字符串                                                                  | `https://api.deepseek.com` | 外部 OpenAI 兼容接口地址。                                                                                    |
| `letters.baseModel.external.model`      | 字符串                                                                      | 空字符串                   | 外部服务使用的模型名，必须填写为服务当前支持的模型。                                                          |
| `letters.baseModel.external.apiKey`     | 字符串                                                                      | 空字符串                   | 外部服务密钥。只保存在本机 `user-config.json`，不要写入日志、聊天、提交或公开文档。                           |
| `letters.baseModel.local.providerId`    | 字符串，模板为 `local.openai-compatible`                                    | 模板值                     | 本地服务的说明字段。真正的选择由 `baseModel.provider` 决定。                                                  |
| `letters.baseModel.local.endpoint`      | URL 字符串                                                                  | `http://127.0.0.1:1234/v1` | 本地 OpenAI 兼容服务地址。                                                                                    |
| `letters.baseModel.local.model`         | 字符串                                                                      | 空字符串                   | 本地服务使用的模型名。                                                                                        |
| `letters.baseModel.local.apiKey`        | 字符串                                                                      | 空字符串                   | 本地服务密钥；若本地服务不需要密钥可留空。                                                                    |
| `letters.systemPrompt`                  | 字符串                                                                      | 内置中文林离提示词         | 可选的基础模型系统提示词，会传给外部或本地 OpenAI 兼容 provider。                                             |
| `letters.fallbackEnabled`               | 布尔值                                                                      | `true`                     | 普通外部或本地 provider 失败时是否允许回到可用的 fallback。完整 OliviaSoul Harness 的降级边界仍由其实现决定。 |
| `letters.outputPolicy.providerId` | `persona-contract` 或 `none` | `persona-contract` | 保存前按所选 Persona 整理回信；林离素材包把玩家称呼放在首行，规范末尾 `—— 林离`。不强制时间/天气起首，不追加回信邀请。 |
| `letters.dailyLimitBypass`              | 布尔值                                                                      | `false`                    | `true` 时跳过每日 3 封和 5 分钟等待，适合本地测试；不改变游戏中仍可写信的协议返回。                           |

#### Persona、Harness 和记忆

| 属性                                | 类型和允许值                                       | 默认值                                 | 说明                                                                                            |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `letters.persona.providerId`        | `default`、`static`、`file`、`linli.persona-bundle`，或已注册 ID | 模板为 `linli.persona-bundle` | 选择人格来源；素材包同时加载人格、书信技艺、背景、示例和来源哈希。 |
| `letters.persona.sourceProject`     | 字符串                                             | `olivia-lin`                           | 资产来源说明字段，不负责加载文件。                                                              |
| `letters.persona.file`              | 文件路径                                           | 模板中的 `olivia-lin` 路径             | `providerId` 为 `file` 时使用。相对路径以 `user-config.json` 所在目录解析；也可以填写绝对路径。 |
| `letters.persona.text`              | 字符串                                             | 空字符串                               | `providerId` 为 `static` 时使用的静态人格文本。                                                 |
| `letters.harness.enabled`           | 布尔值                                             | `false`                                | 是否启用 Harness。关闭后不会选择 `providerId` 指定的 Harness。                                  |
| `letters.harness.providerId`        | `linli.fusion-v1`、`olivia-soul-v18`，或已注册 ID | `linli.fusion-v1` | 选择 Harness 实现；融合实现把所选基础模型作为唯一模型，并显式传入一份历史。 |
| `letters.harness.sourceProject`     | 字符串                                             | `OliviaSoul`                           | 资产来源说明字段。                                                                              |
| `letters.harness.root`              | 文件夹路径                                         | 模板中的 `OliviaSoul/v18-harness` 路径 | Harness 运行目录。相对路径以 `user-config.json` 所在目录解析。                                  |
| `letters.harness.person`            | 字符串                                             | `linli-local-user`                     | Harness 内部归档键，不是玩家显示名，也不是游戏收件人。                                          |
| `letters.harness.diagnostics.enabled` | 布尔值                                          | `false`                                | 是否在本机保存每个 Harness 阶段的诊断正文；只建议调试时开启。                                  |
| `letters.harness.diagnostics.directory` | 文件夹路径                                     | `../logs/letter-diagnostics`            | 诊断文件目录；相对路径以 `user-config.json` 所在目录解析。                                     |
| `letters.memory.enabled`            | 布尔值                                             | `true`                                 | 是否保存有限的本地对话记忆。关闭时不写入记忆。                                                  |
| `letters.memory.provider`           | 当前可用为 `sqlite`                                | `sqlite`                               | 开启记忆时选择 MemoryProvider。关闭记忆应使用 `enabled: false`。                                |
| `letters.memory.maxEpisodes`        | 正整数                                             | `12`                                   | 最多保留多少条对话记忆。                                                                        |
| `letters.memory.maxCharsPerEpisode` | 正整数                                             | `2000`                                 | 单条记忆最大字符数。                                                                            |
| `letters.memory.maxContextChars`    | 正整数                                             | `6000`                                 | 传给下一次回信的记忆上下文最大字符数。                                                          |

### `music`

这些选择会进入本地服务的 MIDI 任务运行实例。

| 属性                    | 类型和允许值                                 | 默认值                   | 说明                                                                                                    |
| ----------------------- | -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `music.renderer`        | 当前默认可用为 `builtin.audio`               | `builtin.audio`          | 把 MIDI 渲染为本地音频的 Renderer。                                                                     |
| `music.playbackAdapter` | `olivia-lin.native` 或 `generic`             | `olivia-lin.native`      | 把已生成曲目转换为游戏曲库字段的适配器。原生 WebPlayer 是否真正接管上传曲目仍受 `LINLI-PLAY-001` 影响。 |
| `music.encoder`         | `builtin.audio-only-mp4`，或空字符串关闭编码 | `builtin.audio-only-mp4` | MP4 编码器会生成 `.mp4` 和 `video/mp4`；关闭编码时保留 WAV，使用 `.wav` 和 `audio/wav`。                |

### `media`

| 属性                  | 类型和允许值                                                | 默认值                | 说明                                                                                       |
| --------------------- | ----------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `media.renderer`      | 当前没有单独的媒体 Renderer；通常保留模板值 `builtin.audio` | `builtin.audio`       | 模块设置中的预留选择。当前视频回信导入流程使用 `videoImporter`，不会根据这个字段切换实现。 |
| `media.videoImporter` | 当前默认可用为 `builtin.ffprobe.mp4`                        | `builtin.ffprobe.mp4` | 检查视频回信 MP4 的格式和元数据。视频回信目前是导入和管理已有 MP4，不是自动生成视频。      |

### `threeD`

| 属性              | 类型和允许值                                   | 默认值   | 说明                                                           |
| ----------------- | ---------------------------------------------- | -------- | -------------------------------------------------------------- |
| `threeD.renderer` | 空字符串或 `null` 表示未选择；目前没有可用实现 | 空字符串 | 预留给未来的 3D Renderer，不会开启手指、琴键、镜头或动作同步。 |

### `game` 和 `privacy`

| 属性                                 | 类型和允许值 | 默认值                   | 说明                                                                                           |
| ------------------------------------ | ------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `game.serviceUrl`                    | URL 字符串   | `http://localhost:27149` | 模板中的目标服务记录。当前服务地址由 `LINLI_HOST`、`LINLI_PORT` 或启动器默认值决定。           |
| `game.clientVersion`                 | 版本字符串   | `0.0.9.627`              | 模板中的目标客户端记录。安装计划会单独检查游戏版本，不由此字段放行未知版本。                   |
| `privacy.allowExternalModelRequests` | 布尔值       | `false`                  | 选择 `external.openai-compatible` 时必须改为 `true`，否则服务不会启动；来信和启用的记忆可能发送给该服务。 |
| `privacy.allowExternalMediaSources`  | 布尔值       | `false`                  | 外部音乐来源预留字段；当前没有外部来源适配器，不会自动开启下载或绕过访问控制。                 |

## 二、按功能配置

### 信件

#### 先使用离线信件确认服务

模板默认就是离线模式，不需要 API Key。只填写自己的名字和时区即可：

```json
{
  "user": {
    "displayName": "嘉树",
    "language": "zh-CN",
    "timeZone": "Asia/Shanghai"
  },
  "letters": {
    "baseModel": { "provider": "offline-fallback" },
    "fallbackEnabled": true,
    "dailyLimitBypass": false
  }
}
```

本地测试时可以把 `letters.dailyLimitBypass` 临时改为 `true`，跳过每日 3 封和每封 5 分钟等待。

#### DeepSeek + Persona + OliviaSoul Harness

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

API Key 只保存在本机的 `config/user-config.json`，不能提交或公开。仓库已经内置 OliviaSoul 和 olivia-lin 资产，不需要另外下载。`fallbackEnabled` 开启后，普通外部 provider 失败可以回到离线回信；完整 OliviaSoul Harness 的多步调用和 fallback 仍按其适配器边界执行。

#### 本地 OpenAI 兼容模型

先在本机启动兼容服务，再把 provider 改为 `local.openai-compatible`，填写 `baseModel.local`：

```json
"letters": {
  "baseModel": {
    "provider": "local.openai-compatible",
    "local": {
      "endpoint": "http://127.0.0.1:1234/v1",
      "model": "你的本地模型名称",
      "apiKey": ""
    }
  }
}
```

#### 记忆和连续对话

在信件配置中开启有限 SQLite 记忆：

```json
"letters": {
  "memory": {
    "enabled": true,
    "provider": "sqlite",
    "maxEpisodes": 12,
    "maxCharsPerEpisode": 2000,
    "maxContextChars": 6000
  }
}
```

记忆默认开启；仍会限制条数、单条大小和上下文大小。关闭时把 `enabled` 改为 `false`，不会继续写入新的记忆。

### 演奏

#### 演奏预设曲库

使用模板中的音乐设置即可：

```json
"music": {
  "renderer": "builtin.audio",
  "playbackAdapter": "olivia-lin.native",
  "encoder": "builtin.audio-only-mp4"
}
```

这会让本地服务使用内置音频 Renderer、原版曲库字段适配器和音频 MP4 编码器。官方预设曲目的 Steam 演奏已经单独验收；上传曲目真正接管原生 WebPlayer 仍未完成，不要把这个配置示例理解为该问题已经解决。

#### 上传自己的 MIDI 曲子

上传曲子沿用上面的 `music` 配置。默认编码器会生成可通过本地网关读取的 MP4；如果只想保留 WAV，可以把编码器设为空字符串：

```json
"music": {
  "renderer": "builtin.audio",
  "playbackAdapter": "generic",
  "encoder": ""
}
```

服务会保存上传任务、解析结果、媒体和曲库元数据。修改配置后重启服务，已有任务会从 SQLite 和媒体目录恢复读取；这仍属于本地预览和媒体任务路径，不等于 Steam 原生演奏接管。

### 视频回信

#### 视频回信导入

使用默认配置即可检查和管理已有 MP4 视频：

```json
"media": {
  "videoImporter": "builtin.ffprobe.mp4"
}
```

它只负责导入、检查、保存、替换、播放和删除已有视频，不会自动生成视频。

#### 视频回信生成

视频回信生成是独立于“视频回信导入”和“定制演奏”的后续能力。它不是把 `media.videoImporter` 换成另一个字符串就能开启的功能。

当前版本还没有正式的用户配置字段，也没有可供普通用户选择的视频生成器。后续设计确定后，会增加独立的 `VideoGenerator` 注册表和专用配置项，并分别说明：

- 视频回信如何根据文字回信上下文、角色状态、环境和可选即兴演奏生成视频；
- 本地 fallback、外部视频模型和本地高质量渲染器各自支持什么输入和输出；
- 生成任务的排队、处理中、成功、失败、取消、重启恢复、媒体保存、格式检查和查询方式；
- 为什么视频回信生成配置不能与已有 MP4 导入检查器共用字段。

在这些设计完成前，不要在 `user-config.json` 中添加不存在的 `media.videoGenerator` 或其他猜测性字段。
