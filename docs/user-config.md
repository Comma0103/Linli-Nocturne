# `user-config.json` 配置说明

`config/user-config.json` 是普通用户的私有运行配置。它从 `config/user-config.example.json` 复制而来，已被 Git 忽略；只修改自己的配置文件，不要修改模板，也不要把它提交到仓库。

本地启动脚本的默认配置和数据路径以项目目录为基准，不受启动时工作目录影响。`LINLI_USER_CONFIG`、`LINLI_MODULE_SETTINGS` 和 `LINLI_DATA_ROOT` 仍可显式覆盖路径。

默认 MIDI MP4 编码和视频回信导入依赖 FFmpeg 发行版中的 `ffmpeg`、`ffprobe`，需要让它们在 PATH 中可执行；也可以用 `LINLI_FFMPEG_PATH`、`LINLI_FFPROBE_PATH` 指定路径。离线人格 provider 另外需要 Python 3；只使用 WAV、最简 fallback 或不导入视频时可不安装对应的可选工具。

在线验收如需禁止离线兜底，可在自己的第四套配置中设置 `letters.fallbackEnabled: false`。耗时较长的模型可显式设置 `letters.baseModel.external.timeoutMs`（毫秒，例如 `180000`）；未设置时当前 OpenAI 兼容 provider 使用 15000 毫秒。单次请求超时与 `letters.harness.timeoutMs` 的整个流程超时是两项不同限制。修改后需重启服务；实际成功应以执行记录中的在线 provider、Harness 各阶段和记忆元数据确认。

本机后续 Steam 测试默认使用第四套组合：DeepSeek 外部 provider、`linli.persona-bundle`、`linli.fusion-v1` 和 `olivia-soul.sqlite` 持久记忆，关闭 fallback，并把外部模型超时设为 180000 毫秒。测试时可将 `letters.dailyLimitBypass` 设为 `true`；该开关同时覆盖写信和 MIDI 定制演奏的每日用量显示，客户端仍保留 `dailyLimit=3` 作为协议上限。私有 `config/user-config.json` 已被 Git 忽略，API Key 不写入本文或提交；示例模板继续保持无密钥、可离线启动。

README 只介绍通用启动流程。本页先解释所有配置属性，再按信件、预设曲库和上传曲子等功能给出配置示例。配置保存后必须重启本地服务。

当前主分支提供 `olivia-lin.offline`、`linli.persona-bundle`、`linli.fusion-v1` 和 `persona-contract`；这些资产已随仓库提供，不需要另行下载。

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
| `privacy` | 对象                 | 模板中的隐私选项 | 外部模型请求默认允许，也可显式关闭；外部媒体来源仍未接入。           |

### `user`

| 属性               | 类型和允许值                                                 | 默认值          | 说明                                                                       |
| ------------------ | ------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------- |
| `user.displayName` | 字符串                                                       | `""`            | 玩家名字，用于回信称呼和模型上下文。它不是游戏信件收件人；收件人仍是林离。 |
| `user.profileId` | 字符串 | `"default"` | 稳定玩家 ID，用于信件、额度和记忆隔离；改称呼保留该 ID，创建新玩家才更换。 |
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
| `letters.dailyLimitBypass`              | 布尔值                                                                      | `false`                    | `true` 时跳过写信每日 3 封和 5 分钟等待，并让 MIDI 定制演奏的 `generatedToday` 返回 0，适合本地测试；不改变游戏中仍可写信的协议上限。 |

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
| `letters.memory.enabled` | 布尔值 | `true` | 统一控制项目历史读取、上下文注入和记忆更新；关闭期间的往来仍可在信箱阅读，但不自动加入记忆。 |
| `letters.memory.provider` | `olivia-soul.sqlite`、`sqlite` 或已注册 ID | `olivia-soul.sqlite` | 持续分层记忆或有限近期记忆，二选一；关闭使用 `enabled: false`。 |
| `letters.memory.maxEpisodes` | 正整数 | `12` | 有限 sqlite 的近期条数；持续记忆仍保留完整成功往来，另维护这份兼容窗口，便于切回有限实现。 |
| `letters.memory.maxCharsPerEpisode` | 正整数 | `2000` | 有限记忆及兼容窗口的单条长度，不裁剪信箱原文或长期历史。 |
| `letters.memory.maxContextChars`    | 正整数                                             | `6000`                                 | 传给下一次回信的记忆上下文最大字符数。                                                          |

### `music`

这些选择会进入本地服务的 MIDI 任务运行实例。

| 属性                    | 类型和允许值                                 | 默认值                   | 说明                                                                                                    |
| ----------------------- | -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `music.renderer`        | 当前默认可用为 `builtin.audio`               | `builtin.audio`          | 把 MIDI 渲染为本地音频的 Renderer。                                                                     |
| `music.playbackAdapter` | `olivia-lin.native` 或 `generic`             | `olivia-lin.native`      | 把已生成曲目转换为播放器所需字段。`olivia-lin.native` 已通过 Steam 0.0.9.627 上传曲目演奏验收；`generic` 用于通用媒体读取，不提供原生游戏接管契约。 |
| `music.encoder`         | `builtin.audio-only-mp4`，或空字符串关闭编码 | `builtin.audio-only-mp4` | MP4 编码器会生成 `.mp4` 和 `video/mp4`；关闭编码时保留 WAV，使用 `.wav` 和 `audio/wav`。                |
| `music.nativeUgcRoot`   | 文件夹路径或空字符串                         | 自动从 Olivia 日志发现 | 原生播放器要求的游戏 `songStoragePath`。留空时读取 `%APPDATA%/miHoYo/Olivia-steam/logs/Olivia.log`；填写后按该路径创建歌曲目录并写入媒体。 |

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
| `privacy.allowExternalModelRequests` | 布尔值       | `true`                   | 默认允许来信和启用的记忆发送给所选外部模型；改为 `false` 后选择 `external.openai-compatible` 会阻止服务启动。 |
| `privacy.allowExternalMediaSources`  | 布尔值       | `false`                  | 外部音乐来源预留字段；当前没有外部来源适配器，不会自动开启下载或绕过访问控制。                 |

## 二、按功能配置

### 信件

#### 信件模式套装速查

信件配置由基础模型、Persona、Harness 和记忆四个插槽组成。下面列出当前常用的完整组合；`composition` 只是说明文字，不负责切换实现。

| 套装 | 基础模型 | Persona | Harness | 记忆 | 用途 |
| --- | --- | --- | --- | --- | --- |
| 1. 最简单离线回信 | `offline-fallback` | 无 | 关闭 | 关闭 | 只验证服务和游戏链路，回信最简单 |
| 2. 离线人格回信 | `olivia-lin.offline` | `linli.persona-bundle` | 关闭 | `sqlite` 或 `olivia-soul.sqlite` | 无需 API Key 的离线使用 |
| 3. DeepSeek 直连 | `external.openai-compatible` | `linli.persona-bundle` | 关闭 | `sqlite` 或 `olivia-soul.sqlite` | DeepSeek 直接生成回信 |
| 4. DeepSeek + Persona + Fusion Harness | `external.openai-compatible` | `linli.persona-bundle` | `linli.fusion-v1` | 推荐 `olivia-soul.sqlite` | 当前本机测试默认的完整统一流程 |
| 5. DeepSeek + Persona + OliviaSoul v18 | `external.openai-compatible` | 通常为 `file` | `olivia-soul-v18` | 必须关闭项目记忆 | 旧版独立流程，Harness 自己管理记忆 |
| 6. 本地模型直连 | `local.openai-compatible` | `linli.persona-bundle` | 关闭 | `sqlite` 或 `olivia-soul.sqlite` | 使用本机 OpenAI 兼容模型 |
| 7. 本地模型 + Fusion Harness | `local.openai-compatible` | `linli.persona-bundle` | `linli.fusion-v1` | 推荐 `olivia-soul.sqlite` | 本地模型的完整统一流程 |

其中，Persona 负责林离的人格和写信风格，Harness 负责预检、生成、检查和必要重写，Memory 负责连续对话。`fallbackEnabled` 是失败时是否允许降级的开关，不是另一套模式。`olivia-soul-v18` 自带记忆管理，不能和项目的 `sqlite` 或 `olivia-soul.sqlite` 同时开启。

#### 七套最小配置

下面只列出每套需要切换的 `letters` 字段；外部模型还必须填写自己的 API Key，并保持 `privacy.allowExternalModelRequests` 为 `true`。未列出的通用字段可以沿用模板。

**1. 最简单离线回信**

```json
"letters": {
  "baseModel": { "provider": "offline-fallback" },
  "persona": { "providerId": "default" },
  "harness": { "enabled": false },
  "memory": { "enabled": false },
  "fallbackEnabled": false
}
```

**2. 离线人格回信**

```json
"letters": {
  "baseModel": { "provider": "olivia-lin.offline" },
  "persona": { "providerId": "linli.persona-bundle" },
  "harness": { "enabled": false },
  "memory": { "enabled": true, "provider": "olivia-soul.sqlite" },
  "fallbackEnabled": true
}
```

**3. DeepSeek 直连**

```json
"letters": {
  "baseModel": {
    "provider": "external.openai-compatible",
    "external": { "endpoint": "https://api.deepseek.com", "model": "你的模型名称", "apiKey": "你的 API Key" }
  },
  "persona": { "providerId": "linli.persona-bundle" },
  "harness": { "enabled": false },
  "memory": { "enabled": true, "provider": "olivia-soul.sqlite" },
  "fallbackEnabled": true
}
```

**4. DeepSeek + Persona + Fusion Harness（推荐）**

```json
"letters": {
  "baseModel": {
    "provider": "external.openai-compatible",
    "external": { "endpoint": "https://api.deepseek.com", "model": "你的模型名称", "apiKey": "你的 API Key" }
  },
  "persona": { "providerId": "linli.persona-bundle" },
  "harness": { "enabled": true, "providerId": "linli.fusion-v1", "root": "../third_party/OliviaSoul/v18-harness", "person": "linli-local-user" },
  "memory": { "enabled": true, "provider": "olivia-soul.sqlite" },
  "fallbackEnabled": true
}
```

**5. DeepSeek + Persona + OliviaSoul v18（旧版独立流程）**

```json
"letters": {
  "baseModel": {
    "provider": "external.openai-compatible",
    "external": { "endpoint": "https://api.deepseek.com", "model": "你的模型名称", "apiKey": "你的 API Key" }
  },
  "persona": { "providerId": "file", "file": "../third_party/olivia-lin/BSide_Olivia_Lin/persona/olivia_lin.md" },
  "harness": { "enabled": true, "providerId": "olivia-soul-v18", "root": "../third_party/OliviaSoul/v18-harness", "person": "linli-local-user" },
  "memory": { "enabled": false },
  "fallbackEnabled": true
}
```

**6. 本地模型直连**

```json
"letters": {
  "baseModel": {
    "provider": "local.openai-compatible",
    "local": { "endpoint": "http://127.0.0.1:1234/v1", "model": "你的本地模型名称", "apiKey": "" }
  },
  "persona": { "providerId": "linli.persona-bundle" },
  "harness": { "enabled": false },
  "memory": { "enabled": true, "provider": "olivia-soul.sqlite" },
  "fallbackEnabled": true
}
```

**7. 本地模型 + Fusion Harness**

```json
"letters": {
  "baseModel": {
    "provider": "local.openai-compatible",
    "local": { "endpoint": "http://127.0.0.1:1234/v1", "model": "你的本地模型名称", "apiKey": "" }
  },
  "persona": { "providerId": "linli.persona-bundle" },
  "harness": { "enabled": true, "providerId": "linli.fusion-v1", "root": "../third_party/OliviaSoul/v18-harness", "person": "linli-local-user" },
  "memory": { "enabled": true, "provider": "olivia-soul.sqlite" },
  "fallbackEnabled": true
}
```

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

#### DeepSeek + Persona + OliviaSoul v18（旧版独立流程）

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

当前模板默认开启持续 SQLite 记忆：

```json
"letters": {
  "memory": {
    "enabled": true,
    "provider": "olivia-soul.sqlite",
    "maxEpisodes": 12,
    "maxCharsPerEpisode": 2000,
    "maxContextChars": 6000
  }
}
```

成功往来自动落盘；最近 5 封使用原文，再前 5 封使用逐封摘要，更早的往来归入五段式回忆，并可按需查回旧信。摘要使用当前选择的外部/本地模型；无模型离线时保留往来，待启用模型后继续整理。开启 Fusion Harness 时，关系账本由其预检继承更新，随成功回信保存。

模型首次处理超过五封的历史或有新信进入摘要层时，会产生额外的摘要请求；失败最多重试 3 次，不影响已收到的回信。总上下文仍受 `maxContextChars` 约束，超出部分不会全部送给模型。独立旧 `olivia-soul-v18` 自管记忆，不能同时开启项目记忆；需要统一记忆时选择 `linli.fusion-v1`。

切换玩家、改称呼、查看/遗忘、重新纳入旧信和迁移数据均可用编号菜单完成。先停止本地服务，在仓库根目录运行：

```powershell
node scripts/manage-user-data.mjs
```

- **改名和换人**：改称呼保留历史；创建玩家生成独立 ID，切换后只读取该玩家的信件和记忆。向导在 `user.profiles` 保存名称索引。
- **关闭和遗忘**：关闭 `enabled` 不再读取或新增记忆。遗忘保留可阅读的信件，并使关联摘要和账本失效；旧信只有通过“重新纳入”才会再次参与。
- **旧数据升级**：已有有限记忆能证明的来源自动接续，其他旧信保留在信箱；需要补齐全部历史时，使用菜单的“将旧信重新纳入记忆”。
- **换电脑**：旧电脑选“导出数据包”，复制 ZIP 到新电脑；新电脑下载同一版本项目，创建配置后选“导入数据包”。程序自动校验、备份原数据、恢复数据库和媒体路径；重新填写模型密钥、启动服务即可。

数据包包含所有玩家的信件、摘要、账本、必要配置及数据目录内媒体；不包含密钥、诊断草稿、游戏资源或 Python/模型运行时。当前上限 256 MiB，外置自定义插件需在新机器另行安装。导入为整体替换，原目录保留为备份，不把两套数据库直接合并。

自动化或高级使用可直接执行：

```powershell
node scripts/export-user-data.mjs --output linli-user-data.zip
node scripts/import-user-data.mjs --input linli-user-data.zip
```

两条命令支持 `--data-root`、`--config`，默认与启动脚本使用相同的 `LINLI_DATA_ROOT`、`LINLI_USER_CONFIG` 或 `data/`、`config/user-config.json`。

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

这些设置用于上传 MIDI 的渲染、曲库字段适配和音频 MP4 编码，不会重新生成官方预设曲目。官方预设曲目和上传曲目的 Steam 演奏都已经在 0.0.9.627 中验收。

预设曲目的“试听”读取游戏已下载的本地缓存，需保持服务运行、缓存所在磁盘可用；目前支持 `<nameKey>_TOD1200/1730/2000_NI_L.mp4` 命名，优先使用 TOD1730。缺失或采用其他命名的缓存仍可能无法试听。三类预设曲库样本和上传 MIDI 均已复验，试听使用独立音频播放器，底部演奏栏不显示试听进度。

#### 上传自己的 MIDI 曲子

上传曲子沿用上面的 `music` 配置。默认编码器会生成可通过本地网关读取的音频 MP4。

使用原版 Olivia Lin 播放器时，服务还会把生成的媒体按 `<songStoragePath>/<歌曲 ID>/<文件名>` 写入游戏本地目录。服务会从游戏日志自动发现 `songStoragePath`；如果日志尚未生成，先启动一次游戏，或填写 `music.nativeUgcRoot`。目录不存在时会自动创建；没有权限时任务仍会保留，但结果中的 `nativePlayback` 会显示错误原因，请关闭游戏并检查目录权限后重试。这个过程不会修改 DLL 或其他游戏资源。

生成完成后，可在“我的上传”试听或演奏，也可加入右侧歌单后演奏；重复加入只保留一项，移出歌单不会删除上传曲目。当前音频 MP4 进入演奏时是黑屏和声音，人物、手指与琴键同步画面属于 Phase 5。

如果只想通过通用播放器读取 WAV，可以改为以下配置；这组配置不作为 Steam 原生演奏的验收组合：

```json
"music": {
  "renderer": "builtin.audio",
  "playbackAdapter": "generic",
  "encoder": ""
}
```

服务会保存上传任务、解析结果、媒体和曲库元数据。修改配置后重启服务，已有任务会从 SQLite 和媒体目录恢复读取。模块选择也可通过 `node scripts/configure-modules.mjs --user-config config/user-config.json` 的终端向导完成；当前没有游戏内 Renderer/Encoder 选择页。

更换编码器后，已经生成的文件保留原格式；新生成的媒体使用新设置。例如从 MP4 改成 WAV 后，旧曲目仍按 MP4 读取，不会自动重新生成。

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
