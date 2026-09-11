# 模块设置

当前开发版使用一个人类可读的 JSON 设置文件保存“选择哪种实现”。示例见 [`config/module-settings.example.json`](../config/module-settings.example.json)。`module-settings.json` 只保存实现 ID 和普通选项，不保存 API Key；普通用户的私有模型地址、模型名和 API Key 可以写在 Git 忽略的 `config/user-config.json`，也可以通过环境变量传给运行时。

Phase 4-2 的模块选择验收已完成，范围是配置文件、终端向导和真实启动装配；当前没有游戏内 Renderer/Encoder 图形选择页。普通用户优先使用 `node scripts/configure-modules.mjs --user-config config/user-config.json`，保存后重启服务；已有 user-config 时仅修改下面的 module-settings 不会覆盖它。

2026-09-11 收尾验收使用的默认本机组合是 DeepSeek 外部 provider、`linli.persona-bundle`、`linli.fusion-v1` 和 `olivia-soul.sqlite`。该选择已在 Steam `0.0.9.627` 中完成在线回信、持久记忆和 MIDI/歌单回归；`letters.dailyLimitBypass` 属于 `user-config.json` 的运行策略，不是模块 ID，启动时会同时传给信件和 MIDI 服务。

校验示例：

```powershell
node scripts/validate-module-settings.mjs config/module-settings.example.json
```

普通用户可以运行交互式设置向导，按编号选择实现，直接回车保留当前选择：

```powershell
node scripts/configure-modules.mjs config/module-settings.json
```

设置可以分别选择：

- `letters.provider`：离线 fallback、外部 OpenAI 兼容 API 或本地 OpenAI 兼容模型。
- `letters.harness`：可选的 OliviaSoul v18 或其他已注册 Harness。
- `letters.persona`：默认人格、静态人格或外部人格文件。仓库已内置 `olivia-lin` 的公开人格资料，也可以指向用户自己的外部文件。
- `letters.memory`：`disabled` 关闭、`sqlite` 有限近期记忆、`olivia-soul.sqlite` 持续摘要与关系账本。实验模板默认选择后者；独立旧 Harness 不可与项目记忆同时开启。
- `music.renderer`：内置音频 Renderer 或其他已注册 Renderer。
- `music.playbackAdapter`：Olivia Lin 原生播放器适配器或其他播放器适配器。
- `music.encoder`：媒体编码器实现。
- `media.videoImporter`：视频导入检查器；默认使用 FFprobe MP4 检查器，也可以注册其他实现。
- 视频回信生成器：未来通过独立的 `VideoGeneratorRegistry` 选择；当前尚未写入用户配置模板，也不能用 `media.videoImporter` 代替。
- `threeD.renderer`：未来的 3D Renderer。

领域服务通过 `ModuleRegistry` 和 `resolveModuleSelections()` 取得实现，服务本身不读取设置文件，也不依赖某个具体第三方项目。未来 GUI 设置页直接编辑同一份设置模型，不再另造配置协议。

## 信件组合关系

用户私有配置 `config/user-config.json` 使用更直白的组合结构：

```text
baseModel（offline / external / local）
        ↓
Persona（人格和书信技艺）
        ↓
Harness（消费显式记忆、预检、检查和重写）
        ↓
统一回信结果
```

因此，离线模型、DeepSeek 外部模型和本地模型都可以使用同一个 Persona 和 Harness。切换 `baseModel.provider` 不应清除或替换 `persona`、`harness` 的选择。

信件里的两个名字有不同用途：`user.displayName` 是玩家本人（例如“嘉树”），用于回信称呼以及告诉模型这封信是谁写的；`林离`仍是游戏里的收信人标识，用于信件存储、每日配额和原生客户端契约。Harness 的 `person` 则是内部归档键，三者不能混用。

对应的上游项目和仓库内资产为：

- 上游 OliviaSoul：[yilangren/OliviaSoul](https://github.com/yilangren/OliviaSoul)；仓库内资产：`third_party/OliviaSoul/v18-harness`
- 上游 olivia-lin：[1Dreamer666/olivia-lin](https://github.com/1Dreamer666/olivia-lin)；仓库内资产：`third_party/olivia-lin/BSide_Olivia_Lin/persona`

这两个目录是仓库内独立的第三方资产目录，不与核心代码混在一起。运行时生成的 `_probe`、往来档案和数据库不会写入这些目录。`src/letters/model-adapter.js` 中的 `OliviaSoulHarnessProvider` 是“完整 Harness 自己调用模型”的模式：它会使用基础模型配置作为外部脚本的后端。它不是第二个可替换模型；切换 offline/external/local 只改变后端，Persona 和 Harness 选择保持不变。当前 `offline-fallback` 只能做无模型链路测试，不能执行 OliviaSoul 的多步模型 Harness。

## 启动开发版本地服务

普通玩家测试 Steam 游戏路径时，不需要手写 Node 组装代码：

```powershell
node scripts/configure-modules.mjs config/module-settings.json
.\scripts\start-local-service.ps1
```

仓库已经内置 `third_party/olivia-lin` 的 Persona 资产和 `third_party/OliviaSoul/v18-harness` 的开发版 Harness，不需要用户再下载这两个仓库。可复制 `config/user-config.example.json` 到 `config/user-config.json` 作为起点；后者已被 Git 忽略。

有 user-config 时以它为准，实验模板默认选择 Olivia-lin 离线人格引擎；没有私有配置时仍兼容原来的离线 fallback。服务地址为 `http://localhost:27149`。仅使用 module-settings 的开发者可通过环境变量配置外部 provider：

```powershell
$env:LINLI_MODEL_ENDPOINT = 'https://api.deepseek.com'
$env:LINLI_MODEL_NAME = '<选择当前可用的模型名>'
$env:DEEPSEEK_API_KEY = '<只在本机安全环境中设置，不要写入仓库>'
.\scripts\start-local-service.ps1
```

也可以使用 `LINLI_MODEL_API_KEY` 代替 `DEEPSEEK_API_KEY`。密钥只写本机私有配置或环境变量，不放入公开模块设置、日志或提交。外部 provider 不可用时，`letters.fallback` 可按所选实现的错误策略降级。

SQLite 和媒体保存在 `LINLI_DATA_ROOT` 指定目录，默认仓库内 Git 忽略的 `data/`；诊断日志由独立配置决定。开发时应从仓库根目录启动，不能把 Steam 资源目录作为数据目录。

使用私有配置时，模块向导入口是 `node scripts/configure-modules.mjs --user-config config/user-config.json`。玩家、记忆状态和数据包由 `node scripts/manage-user-data.mjs` 提供编号菜单；两者共享现有配置，无需另建账户或 save/load 系统。
