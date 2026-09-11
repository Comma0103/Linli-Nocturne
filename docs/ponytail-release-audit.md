# 封版前 Ponytail 安全优化审查表

日期：2026-09-10  
实验分支：`exp/ponytail-release-optimization`  
分支起点：`0e86bc0e4d8b2dd12160408bc66ffa52fe440ad9`（`origin/main`）

## 审查范围

已阅读 README、`package.json`、两个配置模板、架构/用户配置/模块设置/RenderJob/UI/已知问题/原装安装/Phase 3→4 交接/Phase 4 文档，以及 Phase 3 设计、验收和融合文档；源码、脚本和测试覆盖 `src/app`、`src/config`、`src/core`、`src/gateway`、`src/letters`、`src/music`、`src/storage`、`src/patcher`、`scripts` 和 `tests`。仓库中没有 `AGENTS.md`。未读取或输出私有 `config/user-config.json`。

`git fetch origin` 在本轮因远端连接被重置而失败，但本地 `origin/main` 已解析为目标基线 `0e86bc0`，且分支从该提交创建。

## 候选项和结论

| 等级 | 位置 | 证据和收益 | 行为风险 | 结论 |
| --- | --- | --- | --- | --- |
| 低 | `src/letters/letter-service.js:129` | `execution()` 对同一个信件连续执行两次相同的 `getLetterAttempts()` 查询。 | 返回值不变；只保留一次查询结果。 | 已实施，`73b256f`；增加执行记录回归断言。 |
| 低 | `src/letters/olivia-soul-sqlite-memory.js:45-66` | 长历史回忆使用 `indexOf()` 和 `sources.some()` 扫描旧信；旧信数量为 n 时最坏为 O(n²)。 | 仅改为索引循环和来源 ID 集合，保留排序、去重和上下文上限。 | 已实施，`a71886b`；增加 300 封历史边界测试。操作数由 O(n²) 降为 O(n)，未宣称实测提速。 |
| 低 | `src/gateway/local-gateway.js:129-135` | 视频回信路由先把整个文件读入 Buffer，再做 Range/HEAD 响应，额外内存随文件大小增长。 | 复用已有 `serveMediaFile()`；保留 200/206/416、HEAD、Range、Content-Range、MIME 和 Content-Length，并保留旧空文件响应语义。 | 已实施，`1beb4de`、`9c6320c`；增加视频 HEAD 和空文件回归断言。 |
| 低 | `src/storage/sqlite-store.js:429-455,501-510` | MIDI/视频列表存在分页后的逐行再次查询（N+1 形态）。5,000 条 MIDI 记录、20 个 100 条页面的本地基准从约 35.1 ms 降到约 5.2 ms。 | 仅复用同一查询返回行做字段映射，保留排序、分页和字段格式。 | 已实施，`1552516`；MIDI、视频和网关回归通过。 |
| 低 | `src/music/midi-job-service.js:36,73` | 已完成任务的 `inputs` 内存副本原来永久保留。 | 只在处理 Promise 结束时释放内部副本；上传键、磁盘输入、终态查询和删除语义不变。 | 已实施，`709d496`；增加终态释放断言。 |
| 低 | `src/music/midi-job-service.js:38,144,227-230` | 磁盘媒体原来同时保留文件和 `media` Map 的完整 Buffer。 | 只有无磁盘模式继续使用内存媒体；磁盘模式改为按需读取，不改变媒体内容和 URL。 | 已实施，`7142019`；增加磁盘媒体不缓存断言。 |
| 低 | `src/gateway/local-gateway.js:29-62,184-205` | 持久化 MIDI 媒体经过 `mediaBytes()` 时会为每次请求先读完整文件，Range 播放仍只需其中一段。 | 复用已有文件流和 Range/HEAD 处理；内存媒体继续沿用原有 Buffer 响应，媒体日志字段保持一致；空持久化媒体保留原来的 200/0 字节和 416 Range 语义。 | 已实施，`ba49d34`、`05a52ee`；编码器切换、持久化重启、空媒体、HEAD 和 Range 回归通过。 |
| 仅建议 | `src/music/midi-job-service.js:35,46` | `uploads` 仍可能保留 Buffer；上传键重试依赖它。 | 删除或淘汰会改变重复生成和上传重试语义；当前没有安全的生命周期契约或上限。 | 跳过，需先定义容量/保留策略。 |
| 仅建议 | `src/gateway/local-gateway.js:19-23,110-112,161-163` | JSON、视频上传和 MIDI 上传都先收集完整请求体。 | 增加大小限制会改变可接受输入范围；视频导入还需要现有完整 Buffer 接口。 | 跳过，需产品层确认限制。 |
| 仅建议 | `src/storage/data-transfer.js:50-60` | 数据迁移对路径字段逐行更新，数据量大时会增加迁移时间。 | 改事务或批量更新可能改变快照/回滚边界；无迁移规模测量。 | 跳过，保留当前安全流程。 |
| 仅建议 | `src/music/audio-renderer.js:35-40` | 踏板释放会扫描当前所有延音音符。 | 改为按声道索引需要维护额外状态，可能影响 MIDI 边界语义；无真实 MIDI 热点测量。 | 跳过。 |
| 仅建议 | `src/app/local-app.js:44-54` | `envOptions(env)` 被重复构造多次。 | 只节省少量配置对象创建；合并会扩大启动装配 diff。 | 跳过，无实际收益证据。 |
| 约束 | README、Phase 文档、`third_party/`、真实 Steam 目录 | 文档明确 Phase 4-5 至 4-7、Phase 5-7 仍有未完成项。 | 改 checkbox 会伪造里程碑；修改第三方/真实安装会越界。 | 保持不变。 |

## 验证记录

- 基线：`pnpm test` 133/133，`node --test --test-concurrency=1` 133/133，`git diff --check` 通过。
- 修改后（本轮优化阶段）：`pnpm test` 136/136，`node --test --test-concurrency=1` 136/136，`git diff --check` 通过。
- 列表基准：同一进程 5,000 条 MIDI 记录、20 个 100 条页面，逐行再次查询约 35.1 ms；直接 hydrate 查询行约 5.2 ms。该结果只说明本地查询开销下降，不代表所有部署环境的端到端提速。
- 代码改动按独立语义提交；审查文档更新单独提交，最终提交列表以交付时 `git log` 为准。
- 未修改 HTTP 路由名称、请求字段、响应字段、状态码、SQLite schema、重试/取消/恢复语义或（当时）Steam 补丁；后续补丁部署与验收另见下方收尾记录。
- 当时尚需用户在 Steam 客户端 `0.0.9.627` 人工复测的已有视频回信播放、上传 MIDI 从“我的上传”和歌单进入演奏，已在 2026-09-11 最终验收中由用户确认通过。

## 2026-09-11 收尾记录

本分支后续提交 `f51d630`、`c18de54` 分别修复预设歌单元数据/封面回退和 MIDI 每日用量 bypass；完整自动化回归为 `pnpm test` 143/143，串行测试 143/143，`git diff --check` 通过。代码改动仍只在实验分支。

在用户明确授权并确认游戏退出后，验收流程将已验证的 `feapp.dat` 前端补丁部署到真实 Steam `0.0.9.627`，保留外置备份和 SHA-256 记录，未修改 `version.json` 或 `NutStudioUI.dll`。用户随后确认预设歌单旧/新曲目、在线第四套写信、MIDI/歌单演奏和三条合成视频回信播放均通过。

这一部署属于受控验收样本，不等于从 `pristine` 原版目录一次完成的发行安装器已经交付；Phase 4-5 至 4-7、Phase 5-7 以及自动视频生成仍保持未完成。

## 2026-09-11 新用户交付审计

本轮按“远程仓库干净 clone → 安装 → 启动 → 调用功能”的路径复核：

- 使用实验分支的干净 clone 执行 `pnpm install --frozen-lockfile`，锁文件通过，依赖可安装。
- 不创建任何本地配置时启动服务，`/health`、`/toy/signIn`、信件列表、曲单、用户曲目、MIDI 任务和视频回信管理页均返回预期响应；加入歌单和发送信件的网关请求也通过。
- 复制 `config/user-config.example.json` 后再次启动；将 `letters.dailyLimitBypass` 临时设为 `true`，离线人格回信完整生成，正文、状态和剩余额度字段符合协议。默认关闭 bypass 时保留每日额度和五分钟等待，这是模板的预期行为。
- 当前源码通过 `pnpm test` 143/143、`node --test --test-concurrency=1` 143/143、全部 JavaScript/Python 语法检查和 Markdown 相对链接检查；版本库未跟踪私有配置、数据目录、日志、媒体或 API Key。

审计过程中补了两处会影响新用户路径的交付问题：`src/app/local-app.js` 现在先取得数据目录锁、再绑定端口，重复启动不会短暂占用端口；README 和用户配置文档明确列出默认 MIDI MP4 编码、视频回信导入所需的 FFmpeg/FFprobe 及可覆盖路径。新增锁竞争回归测试后，完整测试数从 142 增至 143。

### Ponytail 全仓扫描结论

本次扫描了依赖、注册表、适配器、脚本、存储和网关。可插拔模块、媒体 Range 处理、SQLite/ZIP 迁移和原版协议适配都有多处真实调用或兼容性约束，没有发现可以在不改变功能边界的前提下安全删除的依赖、接口或文件；已有“仅建议”项继续保留，不为追求更短代码牺牲可替换性和恢复语义。`Lean already. Ship.`

## 保护边界

本分支代码没有修改 `main`、第三方资产、私有用户配置、API Key、真实用户数据、诊断隐私数据或生成媒体。真实 Steam 目录仅在用户授权的受控验收部署中替换了已备份、已校验的 `feapp.dat`；该部署不属于代码提交，也不改变主分支状态。
