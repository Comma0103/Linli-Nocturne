# Phase 4-3：原生 WebPlayer 证据调查

## 需求与范围

找出“上传曲目已经生成并出现在曲库，点击演奏后却没有切换到这首曲目”的实际原因，即 [LINLI-PLAY-001](./known-issues.md#linli-play-001本地上传曲目无法接管原生-webplayer)。先解释原生代码在哪一步没有继续，再提出最小修复。

状态（2026-09-09）：只读调查已完成。已闭合原生播放前的关键契约，并完成服务侧修复；Phase 4-4 Steam 0.0.9.627 实机验收已通过。

## 进入条件与复用设计

- 远端 `main` 已核对到 `ad7602df05bf62ee852d72d69c688c22401a24ff`，与本轮开始时本地 HEAD 一致。
- 前序核查复现了任务数字状态、真实启动入口的歌单写入及更换编码器后旧媒体格式三个问题，先在已有网关、`MusicService` 和 `MidiJobService` 中修正；详见 [Phase 4-1](./phase4-1-music-settings-and-media.md) 和 [Phase 4-2](./phase4-2-library-playlist-and-module-entry.md)。它们不构成原生播放根因的证据。
- 复用 `baseline-verifier.js` 的 SHA-256 核对、`frontend-archive.js` 的只读归档解析及已有 `fflate`，不另造基线检查器或解包器。PE 样本检查复用本机已有 LIEF。
- Phase 4-1 的专项验收和 Phase 4-2 的用户界面确认仍按各自文档推进；本里程碑的只读调查已独立完成，不替代 Phase 4-4 的 Steam 实机验收。
- 本次仅在内存读取游戏文件和备份，不加载执行 DLL，不修改 Steam 目录，不启动游戏、不变更补丁或用户配置，不将游戏资源、完整日志或反编译源码提交到仓库。重大修复方案、游戏文件写入及新的实机操作须先向用户确认。

## 调查步骤与验收标准

1. **核对样本。** 记录版本、来源、文件哈希及是否已被修改。复用现有原版备份；未知来源样本不能冒充原版。
2. **还原命令链路。** 分清游戏界面发出的 `play + song` 与内嵌播放器收到的 `play + url`，追踪原生代码如何解析曲目、选择 TOD 媒体、替换当前曲目并调用播放器。每项结论记录具体函数、地址或日志时间。
3. **找到中断位置。** 用同版本的官方曲目与本地曲目作对照。只读反汇编应给出条件与跳转，或由 CEF 媒体事件、完整媒体请求明确显示停在哪一层。字符串、导出符号和“未看到日志”只用于确定调查入口，不能单独认定根因。
4. **提出最小修复。** 有直接证据后，写清修改点、预期变化、回归范围、备份与恢复方式，向用户确认再实施。继续沿用现有接入和媒体协议，不重做播放器。
5. **交接 Phase 4-4。** 提供可重复的证据和明确的待验收动作。只有用户实际确认切换曲目、听到声音、进度推进及进入演奏后，才能记录 Steam 播放/演奏通过。

Phase 4-3 的完成标准是形成可复核的因果链与有证据支持的修复方案，并记录修复验证或尚存阻塞；本次已完成只读证据、服务侧修复和自动化验证，Steam 实机动作交由 Phase 4-4。

## 2026-09-09 已取得的证据

### 样本来源

本机备份位于 `%APPDATA%/OliviaSoul/client-backups/`。原版预期哈希以 [0.0.9.627 基线](../config/client-baseline-0.0.9.627.json) 为准，不从当前游戏目录重新生成基线。

| 样本 | 本次核对结果 | 可支持的结论 |
| --- | --- | --- |
| `webplayer-0.0.9.627.dat` 备份与当前 `resources/webplayer.dat` | 均为 123532 字节，SHA-256 与基线的 `565b5e3e…24a451d` 一致 | 当前 WebPlayer 归档与已保存的原版相同，使用两个 `<video>` 元素；不能继续假定此前 `<audio>` 实验仍在生效 |
| `NutStudioUI-0.0.9.627.dll` 备份 | 1297376 字节，SHA-256 与基线的 `3756767f…9728e1` 一致 | 可作为原版桥接入口的只读分析样本 |
| 当前 `plugins/Studio/NutStudioUI.dll` | SHA-256 为 `294dcfe023c84bc83bdd531d8431bf76b2b7a1fbc0941a250ae8f4cf2ed8fa99`，与原版不同 | 是已修改的安装样本，本次不覆盖它，也不把它当作原版 |
| `NutContainerPlugin-0.0.9.627.dll` 备份 | 498144 字节，SHA-256 与基线的 `53b61d8e…50e31d1` 一致 | 容器原版备份仍可用 |
| 当前 `plugins/Studio/NutWebPlayer.dll` | 116704 字节，SHA-256 为 `81af9a3e1cc2eda0d91884538f59dad843f99de9561e100a0e044970bf546992` | 提供播放器调用入口；现有基线未包含此文件，暂不能认定为未修改原版 |

### 前端与原生入口

- 原版 `feapp.dat` 的 `assets/main-31595bd3.js` 定义 MIDI 数字状态：Pending=1、Running=2、Finished=3、Canceled=4、Failed=5。此项支持前序状态映射修复，与原生播放根因分开记录。
- 原版 `webplayer.dat` 的 `assets/main-95684bf7.js` 中，`function pe(` 从零起算的字符偏移为 9689。它处理播放器命令；`play` 只有在 `url` 是非空字符串时才继续设置媒体源。此处的 `url` 属于内嵌播放器层，不能据此把游戏界面的 `song` 改成裸地址。
- 原版 `NutStudioUI.dll` 文件偏移 `0xC1B00` 可找到 `StudioUI::LiteUIController::onWebQuery_sendWebPlayerControlCmd` 字符串；这只是入口线索，不是已完成的调用链分析。
- 当前 `NutWebPlayer.dll` 导出 `WebPlayerClient::play`（RVA `0x20E0`）与 `preload`（RVA `0x2100`），文件偏移 `0x101B0` 可找到 `playerControlCmd` 字符串。导出表说明可以继续追踪的位置，不能证明本地曲目实际调用到了这里。
- 原版 `NutStudioUI.dll` 的函数 `FUN_180034a80`（函数体包含构建路径 `LiteUIController_WebQuery.cpp` 和符号字符串 `StudioUI::LiteUIController::onWebQuery_sendWebPlayerControlCmd`）是该 WebQuery 入口。它先从 JSON 读取 `cmd`；当 `cmd == "play"` 时提取 `song` 对象并调用内部控制对象虚表偏移 `+0x20` 的槽，然后统一调用 `ContainerBridge::responseQuery`。其余 `pause`、`resume`、`stop`、`updatePosition`、`setVolume`、`setPlayMode` 等命令也走同一个对象；未识别命令才记录 `invalid cmd`。在该函数内没有看到按本地 UUID、`localhost`、扩展名或 TOD 字段拒绝 `play` 的条件。这里确认的是“WebQuery 入口把完整 `song` 交给下一层”，不是“下一层已经成功加载媒体”。
- Qt 元对象分发函数 `FUN_1800627e0(QObject*, int, int, ...)` 的 `param_2 == 0` 分支按方法序号分派；`param_3 == 0x15` 明确调用 `FUN_180034a80`。因此 `sendWebPlayerControlCmd` 的调度路径已经由函数调用证据确认，而不是只凭字符串表推断。该分发函数仍不提供 `vtable+0x20` 的具体目标类型。

### 2026-09-09 静态指令核对

为避免把字符串搜索误当作反汇编，本次在仓库忽略的临时工具目录使用 Capstone 对已核对的 `NutWebPlayer.dll` 导出包装函数做了只读指令核对：

- `WebPlayerClient::play`（RVA `0x20E0`）先读取内部 `WebPlayerClientPrivate` 指针；指针为空时直接返回，否则跳转到内部实现 RVA `0xA360`，并把媒体字符串、偏移和播放选项继续传入。包装函数本身没有按域名或扩展名拒绝 URL 的条件。
- `WebPlayerClient::preload`（RVA `0x2100`）同样先检查内部指针，再跳转到内部实现 RVA `0xA5E0`。
- RVA `0xA360` 的实现会构造 `{cmd:"play", url:传入字符串, offset, loop, mute}`。它随后调用内部广播函数；附近只读字符串包括 `play`、`preload`、`playerControlCmd`、`Player event notified: timeupdate:` 和 `Player event notified: ended`，还保留了 `WebPlayerClientPrivate.cpp` 的构建路径。

### Ghidra Headless 反编译结果

使用官方 Ghidra 12.1.3、JDK 21 和当前安装样本的只读复制建立了 Headless 项目（`NutWebPlayer.dll` 不在现有基线清单中，因此不把该样本称为已验证原版）。Ghidra 对 `RVA 0xA360` 的反编译显示：

- `WebPlayerClient::play` 的包装函数在内部对象有效时跳转到 `0xA360`；`0xA360` 将收到的媒体字符串直接写入 `url`，没有看到按域名、UUID、扩展名或媒体轨道的拒绝分支。
- `0xA360` 调用 `0xAE30`。后者先检查 `this+0x28` 的内部状态、状态中的有效标志以及 `this+0x30` 的 `QCefView` 指针；条件不满足时直接返回。条件满足时创建 `QCefEvent("playerControlCmd")`，把命令参数写入事件，再调用 `QCefView::broadcastEvent`。
- 因此，当前最强的原生假设不是“WebPlayer 看到 localhost 后拒绝”，而是本地曲目路径调用时没有满足内部播放器状态/视图条件，或 `NutStudioUI` 没有把 `song` 继续转换成对这个对象的 `play(url, ...)` 调用。这个结果仍未证明是哪一个上游条件失败。

对同一份、哈希与 0.0.9.627 基线一致的原版 `NutStudioUI.dll` 进行 Headless 反编译后，`FUN_1800627e0` → `FUN_180034a80` 的调用关系和 `FUN_180034a80` 的 `play` 分支证实了另一段链路：前端的 `sendWebPlayerControlCmd` 并不是直接把 URL 交给 CEF，而是先把 `song` JSON 交给一个带虚表的内部播放控制对象。该对象最终进入 `StudioManagerLite::onPlayerPlay`，再由 `playVideo` 执行 TOD 和本地文件检查。

Ghidra 运行时没有加载 `NutCommon.dll`、`QCefView.dll` 等依赖，因此相关调用显示为外部函数或未命名内部函数；这不影响上述本 DLL 内部条件和事件构造的判断，但会限制继续追到 CEF 实际加载回调。

这组指令和 Ghidra 证据把调查入口从“是否存在播放器”缩小到两处可验证边界：`NutStudioUI` 的匿名虚表播放槽，以及 `WebPlayerClientPrivate` 的状态/CEF 视图守卫。当前修复已通过同版本 Steam 实机播放验证，因此不再继续改动 DLL；若未来游戏版本改变，再以这两处边界作为只读复查入口。

### 已有运行日志

复查 `%APPDATA%/miHoYo/Olivia-steam/logs/Olivia.log`，只提取音乐命令字段，不复制信件或整份日志。2026-09-06 以下三条记录均包含本地 27149 端口媒体地址及完整的 `song` 字段：

| 时间（UTC+8） | 本次读取的日志行号 |
| --- | --- |
| 13:40:22.528 | 29740 |
| 13:41:03.090 | 30252 |
| 14:34:00.864 | 32366 |

字段包括 `id`、`nameKey`、`source`、`performanceType`、`videoUrl`、`videoByTodView` 等。日志中的内层 JSON 有转义，检查时必须先还原转义，否则会误判不存在 `song`。

每条命令后 100 行内未匹配到 `WebPlayerManager`、`WebPlayerClient`、`PlaybackView` 或 `playerControlCmd`。这是有限窗口中的观察，不等于证明完整运行期间从未转发。现有 `work/runtime/gateway-capture.log` 也只有启动行，不能仅凭这个文件就认定所有媒体请求均被完整捕获。

扩大到每条命令之后 500 行后，13:40:22 和 13:41:03 两次本地命令后分别持续出现 `currentTime` 事件（第一次从 13:40:35.006 开始，第二次从 13:41:03.283 开始）。这与“新曲目未替换正在活动的播放器”假设一致，但这些事件行没有可可靠关联的资源 ID，因此目前只能记录为强提示，不能证明一定来自旧曲目。

### 官方曲目与本地曲目对照

同一份日志中还找到 8 次官方曲目的 `play` 命令和 3 次本地曲目的命令。两者都通过 `sendWebPlayerControlCmd` 发送 `song`，都包含 `videoUrl`、`videoByTodView` 和 TOD 选择；因此“前端没有发出播放命令”已经可以排除。

| 字段 | 官方曲目样本 | 本地曲目样本 | 当前含义 |
| --- | --- | --- | --- |
| `id` | 数字 ID，例如 `953`、`1051` | UUID，例如 `2fd9b144-…` | 是值得追踪的原生校验差异，但还没有反汇编或回调证据证明它是拒绝条件 |
| `videoUrl` | HTTPS 静态资源，通常带鉴权查询参数 | `http://localhost:27149/toy/midi/media/...` 或 `https://localhost:27150/...` | 原生确实收到本地地址；地址协议、扩展名和鉴权处理仍需在原生调用链确认 |
| `videoByTodView[].url` | 与官方资源对应的 TOD 视频地址 | 与本地媒体地址相同的三组条目 | TOD 结构存在，不能再把“缺少 TOD 条目”当作已证实根因 |
| `nameKey` / `source` / `performanceType` | 官方曲目字段完整 | 本地适配器提供 `nameKey=UUID`、`source=linli-nocturne`、`performanceType=Solo` | 字段语义可能影响原生曲目状态，但目前只能列为待验证差异 |

这个对照曾把调查缩小为“原生如何处理 UUID、回环媒体地址和本地来源字段”；反编译后确认 UUID 本身不是当前阻塞，原生实际使用它拼接本地 UGC 子目录。不能把本地 UUID 改成伪造的官方 ID。

初始的字符串直接交叉引用没有命中，是因为相关名称位于 Qt 元对象/字符串表；随后通过 Qt 元对象分发函数 `FUN_1800627e0` 的方法序号 `0x15` 找到并反编译了 `FUN_180034a80`，再结合 `StudioManagerLite` 的虚表和播放函数闭合了调用链。

## 修复结论与服务侧实现

反编译确认 `StudioManagerLite::onPlayerPlay` 先按原生字面量 `TOD12`、`TOD1730`、`TOD20` 选择条目，再在 `songStoragePath/<id>/<URL basename>` 检查文件存在；检查通过后才进入 `WebPlayerClient::play`。因此本地 HTTP 网关没有收到媒体请求并不是 WebPlayer 拒绝 localhost，而是原生层在文件存在性检查前结束。

项目已完成两项修复：`OliviaLinPlaybackAdapter` 使用原生 TOD 值；`MidiJobService` 在媒体生成成功后通过 `NativeUgcMediaStore` 将文件原子写入上述 UGC 目录。服务会从 Olivia 日志自动发现 `songStoragePath`，也支持 `music.nativeUgcRoot` 或 `LINLI_NATIVE_UGC_ROOT` 明确指定；目录自动创建，写入失败会在任务的 `info.nativePlayback` 中返回可读错误，不修改 DLL。

### 修复验收标准

- 自动化测试确认三组 TOD 字面量、日志路径发现、目录自动创建、原子写入、目录逃逸拦截和删除清理。
- 配置未发现游戏路径时，任务仍可完成本地网关媒体生成，并在 `info.nativePlayback` 返回 `native_ugc_root_not_found` 及处理提示。
- Steam 实机验收仍由 Phase 4-4 完成：生成曲目后，目标目录必须出现 `<歌曲 ID>/<歌曲 ID>.<扩展名>`，客户端必须切换曲目、进入演奏桌面、推进进度并发声。

## 剩余不确定性与下一步

- **Steam 实机验收已完成。** 2026-09-09 客户端成功上传、生成并播放 `linli-performance-10s.mid`；日志确认媒体写入原版 UGC 目录、WebPlayer 收到本地 MP4，进度从 0 推进到 10 秒并自然结束。
- 调查期间 PATH 未找到 `dumpbin`、`llvm-objdump`、`objdump` 等反汇编工具；使用忽略目录中的 Capstone 做指令核对，并用 Ghidra Headless 完成交叉引用和反编译。它们没有加入项目依赖。
- **工具选择记录**：若用户已有 IDA Pro 授权，优先使用 IDA 的自动分析和批处理脚本；否则默认采用免费的 Ghidra Headless Analyzer。两者都能输出可复核的函数、交叉引用和反编译结果；Binary Ninja 仅在已有 Commercial/Ultimate 授权时考虑。当前没有静默下载大型逆向套件，也不把工具安装当作游戏修改授权。
- 若实机验收仍失败，先检查任务 `info.nativePlayback` 和目标目录文件，再决定是否需要新的原生观测；原版样本和只读调查结果应与将来安装补丁明确分开。
