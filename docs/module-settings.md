# 模块设置

当前开发版使用一个人类可读的 JSON 设置文件保存“选择哪种实现”。示例见 [`config/module-settings.example.json`](../config/module-settings.example.json)。设置文件只保存实现 ID 和普通选项，不保存 API Key；外部模型的凭据通过环境变量传给运行时。

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
- `letters.persona`：默认人格、静态人格或外部人格文件。外部人格文件可以指向 `olivia-lin` 的公开人格资料，但不会复制进本仓库。
- `letters.memory`：关闭记忆或使用 SQLite 记忆。
- `music.renderer`：内置音频 Renderer 或其他已注册 Renderer。
- `music.playbackAdapter`：Olivia Lin 原生播放器适配器或其他播放器适配器。
- `music.encoder`：媒体编码器实现。
- `media.videoImporter`：视频导入检查器；默认使用 FFprobe MP4 检查器，也可以注册其他实现。
- `threeD.renderer`：未来的 3D Renderer。

领域服务通过 `ModuleRegistry` 和 `resolveModuleSelections()` 取得实现，服务本身不读取设置文件，也不依赖某个具体第三方项目。未来 GUI 设置页直接编辑同一份设置模型，不再另造配置协议。

## 信件组合关系

用户私有配置 `secrets/user-config.json` 使用更直白的组合结构：

```text
baseModel（offline / external / local）
        ↓
Persona（人格和书信技艺）
        ↓
Harness（预检、记忆组装、检查和重写）
        ↓
统一回信结果
```

因此，离线模型、DeepSeek 外部模型和本地模型都可以使用同一个 Persona 和 Harness。切换 `baseModel.provider` 不应清除或替换 `persona`、`harness` 的选择。

仓库外的参考实现当前位于：

- OliviaSoul v18 Harness：`D:\Aesthetic\work\OliviaSoul-reference\v18-harness`
- olivia-lin 人格资料：`D:\Aesthetic\work\olivia-lin-reference\BSide_Olivia_Lin\persona`

这两个目录不属于 Git 仓库，不会被提交。`src/letters/model-adapter.js` 中的 `OliviaSoulHarnessProvider` 是“完整 Harness 自己调用模型”的模式：它会使用基础模型配置作为外部脚本的后端。它不是第二个可替换模型；切换 offline/external/local 只改变后端，Persona 和 Harness 选择保持不变。当前 `offline-fallback` 只能做无模型链路测试，不能执行 OliviaSoul 的多步模型 Harness。

## 启动开发版本地服务

普通玩家测试 Steam 游戏路径时，不需要手写 Node 组装代码：

```powershell
node scripts/configure-modules.mjs config/module-settings.json
node scripts/start-local-service.mjs
```

仓库已经内置 `third_party/olivia-lin` 的 Persona 资产和 `third_party/OliviaSoul/v18-harness` 的开发版 Harness，不需要用户再下载这两个仓库。可复制 `config/user-config.example.json` 到 `secrets/user-config.json` 作为起点；`secrets/` 被 Git 忽略。

默认使用离线 fallback，服务地址为 `http://localhost:27149`。如果选择外部 OpenAI 兼容 provider，可用环境变量配置地址、模型和密钥，例如：

```powershell
$env:LINLI_MODEL_ENDPOINT = 'https://api.deepseek.com'
$env:LINLI_MODEL_NAME = '<选择当前可用的模型名>'
$env:DEEPSEEK_API_KEY = '<只在本机安全环境中设置，不要写入仓库>'
node scripts/start-local-service.mjs
```

也可以使用 `LINLI_MODEL_API_KEY` 代替 `DEEPSEEK_API_KEY`。密钥不要粘贴到聊天、设置 JSON、日志或提交记录中。外部 provider 不可用时，设置中的 `letters.fallback` 可以让流程回到离线实现；是否自动 fallback 仍取决于所选 provider 的能力和错误策略。

启动脚本创建的 SQLite、媒体和日志都位于 `LINLI_DATA_ROOT` 指定的项目外运行目录（默认 `data/`），不会写入 Steam 游戏资源目录。
