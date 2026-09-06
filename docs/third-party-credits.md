# 第三方项目引用与复用说明

Linli Nocturne（林离·余音）会借鉴并适配以下公开项目：

项目核心只依赖统一的 provider/Harness 契约。下面列出的项目是可替换的实现或参考来源；用户也可以接入其他符合契约的 Harness。

## OliviaSoul

- 项目：<https://github.com/yilangren/OliviaSoul>
- 用途：通过外部路径复用 `v18-harness` 的信件预检、记忆组装、正文生成、尾端检查和必要重写流程。
- 接入方式：`OliviaSoulHarnessProvider` 以参数数组调用 `v18-harness/run-live.ps1`，作为通用 `HarnessProvider` 插槽的一个实现；Linli Nocturne 不复制其运行时数据库、真实信件、API Key 或 `_probe/` 产物。
- 版本边界：调用方必须指向包含 `run-live.ps1`、`scripts/`、`harness/` 和 `林离人设.md` 的 v18 Harness 目录。

## olivia-lin

- 项目：<https://github.com/1Dreamer666/olivia-lin>
- 用途：参考人格资料、书信技艺、离线人格引擎、分级记忆思路和人格验收用例。
- 接入方式：`FilePersonaProvider` 可以按用户配置读取其公开人格资料，或由其他 Harness/PersonaProvider 复用其书信规则；不把其 Python 源码、人格文件、私有语料或可执行文件复制进本仓库。

上述项目的作者、版本和目录结构以各自仓库为准。若未来要把外部项目文件直接打包进 Linli Nocturne 的发行物，会在发布前补齐对应的许可证、版权声明和来源清单。

## FFmpeg / FFprobe

视频回信的默认检查器调用用户环境中已有的 FFprobe，合成媒体测试调用 FFmpeg；本仓库不分发二进制文件。发行版若改为捆绑或分发这些工具，必须单独补齐对应版本和许可证声明。
