# 已内置的第三方资产

为了让普通用户只下载 Linli Nocturne 就能进行开发版测试，仓库内提供实际运行需要的公开资产。第三方内容保留在独立目录，不混入核心实现；用户仍可通过设置替换为其他 Persona、Harness 或本地模型。

## olivia-lin

- 来源：<https://github.com/1Dreamer666/olivia-lin>
- 固定来源提交：`d1ab8277521ca59d294d0fa0162a350ba61447d9`
- 内置内容：Persona 文件、书信技艺、公开记忆、示例/评测用例和离线人格引擎所需的源文件。
- 许可证：GNU AGPL v3，全文见 `third_party/olivia-lin/LICENSE`。

## OliviaSoul v18 Harness

- 来源：<https://github.com/yilangren/OliviaSoul>
- 固定来源提交：`2ffe7f1c2f73d0c3b00c25258e0ce93b8f4b92ad`
- 内置内容：v18 Harness 的公开规则、脚本、Persona 文件和运行所需的 PowerShell/CJS 文件。
- 适配器：`src/letters/model-adapter.js` 中的 `OliviaSoulHarnessProvider`。
- 许可证状态：来源仓库当前快照未包含 LICENSE 文件。它只作为当前开发版用户已授权的本地复用资产保留；公开发行前必须取得作者许可，或改为由用户自行提供该目录。

仓库不会内置 API Key、真实信件、运行时数据库、`_probe/` 结果、游戏资源或专有 DLL。
