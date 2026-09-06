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
