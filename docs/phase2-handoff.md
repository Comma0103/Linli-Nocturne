# Linli Nocturne（林离·余音）Phase 2 收尾与 Phase 3 交接

> 本文是当前阶段唯一的完整交接文档。它记录截至 2026-09-06 的代码、测试、实机观察、已知阻塞和下一阶段启动方式。新 Task/Thread 应先读本文，再按文末 Prompt 工作，不要依赖旧对话中的口头结论。

## 1. 项目定位与不可变约束

Linli Nocturne 是建立在原版《BSide: Olivia Lin》Steam 游戏本体之上的本地插件与兼容层。代码仓库为 `https://github.com/Comma0103/Linli-Nocturne`，默认分支是 `main`。项目名称固定为“林离·余音 / Linli Nocturne”。展示性文案使用简体中文，不添加地域限制。

最终愿景包括：恢复信件入口、文字回信、视频回信、用户上传 MIDI、本地音频与游戏内曲库、即兴创作，以及可扩展到 3D 手指/琴键/镜头/动作同步。Phase 2 只负责安全接入、网关契约、基础曲库与原版客户端连接；真正的 3D 演奏和完整模型体验属于后续阶段。

工程规则：默认按原游戏每日 3 封信、每封 5 分钟延迟；bypass 默认关闭但必须保留开关。回信同时支持外部模型 API 与完全本地模型的接口方向。补丁必须先识别版本和原装基线、创建游戏目录外备份，未知版本或第三方修改必须停止。不得把用户没有实际做过的点击、重启、听到声音或 UI 结果写成事实。不得把原版资源、私有信件、用户媒体、API Key 或修改后的专有 DLL 提交到仓库。

## 2. Phase 2 总体结论

Phase 2 已达到“可交接的阶段性完成”，不是“所有最终愿景完成”，也不是可直接面向普通用户发布的 release。领域服务、协议、补丁规划、备份回滚、离线入口和官方预设曲目的 Steam 实机链路已有实现与测试；本地上传曲目仍无法接管原生 WebPlayer，这是明确登记的 P0 阻塞 `LINLI-PLAY-001`，本阶段暂时封存，不再用猜测式修改消耗测试时间。

### 2.1 已完成并有证据

- [x] Phase 0 调研、需求、架构和 UI 流程文档已建立。
- [x] Phase 1 SQLite、本地网关、信件规则、离线降级模型接口、RenderJob、MIDI 解析、Tempo/延音踏板提取、本地 WAV 渲染和歌单基础已实现。
- [x] 0.0.9.627 版本白名单、7 个基线文件 SHA-256 校验、原装/第三方修改/未知状态识别已实现。
- [x] 游戏目录外备份、哈希清单、失败自动回滚和只读安装计划已实现；安装 CLI 默认只读，写入需 `--apply --confirm=Linli-Nocturne`。
- [x] 原版前端接口审计、兼容路由、CORS 预检、MIDI 上传/生成/轮询/批量查询/取消/删除和用户曲目游标分页已实现并有回归测试。
- [x] 用户曲目分页会先筛选 `finished`，失败任务不会污染容量、总数和游标；历史任务可从 SQLite 元数据恢复，媒体 URL 按当前网关地址重建。
- [x] 离线曲库入口、古典/ACG/轻音乐等预设页签和“我的上传”显示链路已在用户当前安装样本中观察到；预设曲库官方曲目可正常演奏。
- [x] 用户上传 MIDI 可上传、生成、在“我的上传”显示，并可加入音乐桌面；“加播单”与“演奏”是不同操作。
- [x] 官方预设曲目 Steam 实机验收通过：用户报告选择预设曲目后桌面人物进入钢琴演奏、进度正常推进且功能正常。
- [x] 本次收尾修正：媒体单段 Range 的后缀区间 `bytes=-N` 已修正；安装器结果去除巨大二进制字段并记录写后 SHA-256，避免 JSON 序列化异常和验收结果失真。
- [x] 当前自动化测试基线：`pnpm test` 应为 42 项通过（以本次提交实际输出为准）。

### 2.2 明确未完成或不能宣称完成

- [ ] **`LINLI-PLAY-001`：上传曲目无法接管原生 WebPlayer。** 前端发出带完整 `song` 对象的本地曲目 `play`，原生桥也收到；但本地媒体没有成为当前媒体源，旧预设曲目继续产生时间事件，桌面不进入演奏且没有本地声音。上传短 MIDI、长 MIDI、重启和 `.mp4`/HEAD/Range 兼容尝试都未解决。不能把 `songPlayStart` 埋点或“停止”按钮当作成功证据。
- [ ] 原生上传曲目需要原生 WebPlayer 的只读分析或更细粒度加载回调，才能继续定位；不要再盲改 `<video>` 为 `<audio>`，那条路曾导致桌面黑屏并已恢复原版。
- [ ] 安装器目前是受保护的基础执行器，不是最终安装器：没有进程锁检测、完整事务日志、安装后全量基线验证和卸载命令；最新离线用户曲目增量补丁也尚未证明已完全整合到从 pristine 基线运行的单一发布流程。
- [ ] 信件 HTTP 处理是手动 `POST /letter/process`，没有后台队列、失败重试、并发锁或完整外部/本地模型实现；当前 fallback 只是可测试的降级实现。不要宣称“自动文字回信”已经完成。
- [ ] 视频回信导入、即兴作曲、真实 3D 手指/琴键/镜头/动作同步、普通用户安装器和 release 尚未完成。
- [ ] 当前只验证过客户端 `0.0.9.627`；向下兼容尚未建立证据。
- [ ] 右侧音乐桌面中历史 UUID 条目可能显示 `Invalid Date` 或空媒体，这是旧在线数据/歌单兼容债务，不等于官方预设曲目播放失败。

## 3. 代码与运行位置

仓库：`D:\Aesthetic\code\Linli-Nocturne`

游戏测试目录：`D:\Program Files (x86)\Steam\steamapps\common\BSide Olivia Lin Test`

真实游戏日志：`C:\Users\jwl42\AppData\Roaming\miHoYo\Olivia-steam\logs\Olivia.log`。不要把 Temp 下旧的 `Olivia.log` 当作完整运行日志。仓库 `work/` 被 `.gitignore` 忽略，只是本地网关、SQLite、媒体和日志的运行目录，不能据此判断远端缺文件。

原版备份（只读参考，不要提交）：`C:\Users\jwl42\AppData\Roaming\OliviaSoul\client-backups\` 下的 `7cc61827b436631c58cbb32677e7b169.feapp.dat`、`webplayer-0.0.9.627.dat`、`NutStudioUI-0.0.9.627.dll`、`NutContainerPlugin-0.0.9.627.dll`。用户移动硬盘的预设 MIDI 归档位于 `Aesthetic（美学）/Study/Saving Data/B-Side Olivia Lin`，盘符可能变化；不要把用户归档复制进仓库或 release。

关键模块：

- `src/gateway/local-gateway.js`：本地 HTTP/CORS、MIDI 媒体 HEAD/Range、信件和曲库兼容路由。
- `src/music/midi-job-service.js`：MIDI 任务、WAV/MP4 媒体、SQLite 元数据、用户曲目分页。
- `src/letters/letter-service.js`、`src/letters/model-adapter.js`：信件规则和可替换模型接口。
- `src/patcher/install-plan.js`、`install-executor.js`、`backup-manager.js`、`installation-provenance.js`：版本、基线、备份、回滚和受保护安装。
- `scripts/patch-current-user-songs.mjs`：当前已修改前端样本上的离线用户曲目增量补丁；不要误认为它等于 pristine 安装器的完整发布流程。

## 4. 验证方式与证据边界

在仓库根目录执行：

```powershell
pnpm install
pnpm test
```

只读检查原版/当前安装状态：

```powershell
node scripts/plan-install.mjs "D:\Program Files (x86)\Steam\steamapps\common\BSide Olivia Lin Test" "D:\Aesthetic\Linli-Nocturne-Backups"
```

只有计划输出 `canApply: true`、游戏已退出、版本为 `0.0.9.627` 且状态为 `pristine` 时，才允许在独立备份目录上进一步验证；禁止直接对用户当前安装做试错。Steam 实机验证必须由用户明确报告实际观察结果，新 Task 不得假定用户已点击或听到声音。

## 5. Phase 3 建议起点（不要越级实现）

第一里程碑应先处理信件领域的可靠性，而不是回头重复 `LINLI-PLAY-001`：

1. 统一信件和 MIDI 的“当天”边界为同一时区/可注入时钟，并补跨午夜测试。
2. 为 Letter 增加明确的 `pending / processing / replied / failed` 状态、幂等领取、失败重试和最大尝试次数；保留 `POST /letter/process` 作为开发调试入口，同时设计后台 worker 接口。
3. 将 `ModelAdapter` 拆成外部 API Provider、本地 Provider、离线 fallback 三类，配置、超时、重试和隐私策略写入文档；先用 fake provider 做单元测试。
4. 在不依赖真实模型的情况下完成文字回信端到端测试，再设计视频回信导入的资产校验和 UI 状态。
5. 只有上述基础稳定后，才进入 Phase 4 的曲库体验和 Phase 5 即兴创作；`LINLI-PLAY-001` 另开只读原生调查任务，拥有日志/反汇编证据后再修改。

## 6. 可直接粘贴到新 Task/Thread 的 Prompt

```text
你正在接手 GitHub 仓库 https://github.com/Comma0103/Linli-Nocturne 的后续开发。项目名称是 Linli Nocturne（林离·余音），默认分支 main，代码和展示文案使用简体中文，不添加任何地域限制。请先读取仓库中的 docs/phase2-handoff.md，再读取 README.md、docs/requirements.md、docs/architecture.md、docs/known-issues.md 和相关源码；不要依赖旧聊天记录中的未经证实结论。

项目目标：在原版《BSide: Olivia Lin》Steam 本体之上恢复信件、文字/视频回信、MIDI 上传与曲库，并为即兴创作和未来 3D 手指/琴键/镜头/动作同步保留扩展点。当前不是发行版。原游戏默认规则是每天 3 封信、每封 5 分钟延迟，bypass 默认关闭但保留开关；回信必须同时预留外部模型 API 和完全本地模型接口。

Phase 2 已完成基础网关、SQLite/RenderJob、MIDI 解析和 WAV/MP4 媒体、用户曲目分页、版本白名单、SHA-256 基线、外置备份、回滚、前端/DLL 受保护补丁、离线曲库入口，以及官方预设曲目的 Steam 实机演奏验收。当前自动化基线是 pnpm test，预期 42 项通过。先运行测试并检查 git status；不要把 work/、日志、数据库、媒体、游戏资源或专有 DLL 提交。

必须保留并明确标记的阻塞是 LINLI-PLAY-001：本地上传 MIDI 可以上传、生成、显示和加入音乐桌面，但点击“演奏”时原生 WebPlayer 没有切换到本地媒体，旧预设曲目继续发送时间事件，桌面不进入演奏且没有本地声音。官方预设曲目正常。此前尝试过短/长 MIDI、重启、localhost、.mp4、HEAD/Range、TOD1200/TOD1730/TOD2000 和恢复原生 song 对象；不要再次盲目改 video/audio 或要求用户重复无效测试。只有拿到原生 WebPlayer 的只读反汇编、CEF 媒体事件或完整媒体请求证据后，才创建单独诊断任务。

本阶段遗留的其它边界：安装器还不是最终发布安装器（缺进程锁、事务日志、安装后完整验证和卸载命令）；LetterService 目前没有后台 worker、失败重试和真正的外部/本地模型 provider；视频回信、即兴作曲、3D 同步、普通用户安装器和 release 都未完成；只验证过客户端 0.0.9.627。不要宣称自动文字回信或最终愿景已经完成。

请从 Phase 3 的第一个小里程碑开始：统一信件/MIDI 的时区日界线，补跨午夜测试；增加 Letter 的 pending/processing/replied/failed、幂等领取、失败重试和最大尝试次数；用 fake provider 验证外部 API、本地模型和 fallback 的统一接口；再做文字回信端到端测试。每一步先写需求/设计和验收标准，再做小步代码修改、单元测试、网关冒烟测试和文档同步。任何涉及真实游戏目录的操作都必须先退出游戏、只读检查版本/基线、使用游戏目录外备份，并在写入前确认计划可应用；不要直接修改用户安装来试错。

每轮报告都要说明：实际改动文件、测试命令和结果、未完成项、是否需要用户进行真实 Steam 操作。只有用户明确报告实际观察结果后，才能记录实机验收。提交前运行 pnpm test、git diff --check 和 git status；只提交源代码、测试和文档，提交后推送 main 并验证本地 HEAD 与 origin/main 一致。先从文档和代码现状出发，不重做已完成的 Phase 0/1/2 工作，也不要创建与本交接文档重复的长期状态文档。
```

## 7. 收尾验收记录

- 收尾代码修改应通过完整自动化测试后再提交。
- 本文是新 Task 的首要上下文；若 README 或旧 `docs/phase2.md` 与本文冲突，以本文的证据矩阵和限制说明为准。
- 本交接不代表 release，不代表上传曲目演奏已解决，也不代表所有原版在线服务已被完整复刻。
