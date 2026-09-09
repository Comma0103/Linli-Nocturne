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
| 低 | `src/gateway/local-gateway.js:129-135` | 视频回信路由先把整个文件读入 Buffer，再做 Range/HEAD 响应，额外内存随文件大小增长。 | 复用已有 `serveMediaFile()`；保留 200/206/416、HEAD、Range、Content-Range、MIME 和 Content-Length。已导入视频不能是空文件。 | 已实施，`1beb4de`；增加视频 HEAD 回归断言。 |
| 仅建议 | `src/storage/sqlite-store.js:429-455,501-510` | MIDI/视频列表存在分页后的逐行再次查询（N+1 形态）。 | 页面上限较小；合并查询会改变快照时机并扩大 SQLite 改动面，未测得实际热点。 | 跳过，等待可重复测量。 |
| 仅建议 | `src/music/midi-job-service.js:35-39,73,144` | `uploads`、`inputs`、`media` 是内存 Map，长时间运行可能保留已完成任务的 Buffer。 | 删除或淘汰会影响重复生成、无磁盘模式和媒体读取语义；当前没有安全的生命周期契约或上限。 | 跳过，需先定义容量/保留策略并测量。 |
| 仅建议 | `src/gateway/local-gateway.js:19-23,110-112,161-163` | JSON、视频上传和 MIDI 上传都先收集完整请求体。 | 增加大小限制会改变可接受输入范围；视频导入还需要现有完整 Buffer 接口。 | 跳过，需产品层确认限制。 |
| 仅建议 | `src/storage/data-transfer.js:50-60` | 数据迁移对路径字段逐行更新，数据量大时会增加迁移时间。 | 改事务或批量更新可能改变快照/回滚边界；无迁移规模测量。 | 跳过，保留当前安全流程。 |
| 仅建议 | `src/music/audio-renderer.js:35-40` | 踏板释放会扫描当前所有延音音符。 | 改为按声道索引需要维护额外状态，可能影响 MIDI 边界语义；无真实 MIDI 热点测量。 | 跳过。 |
| 仅建议 | `src/app/local-app.js:44-54` | `envOptions(env)` 被重复构造多次。 | 只节省少量配置对象创建；合并会扩大启动装配 diff。 | 跳过，无实际收益证据。 |
| 约束 | README、Phase 文档、`third_party/`、真实 Steam 目录 | 文档明确 Phase 4-5 至 4-7、Phase 5-7 仍有未完成项。 | 改 checkbox 会伪造里程碑；修改第三方/真实安装会越界。 | 保持不变。 |

## 验证记录

- 基线：`pnpm test` 133/133，`node --test --test-concurrency=1` 133/133，`git diff --check` 通过。
- 修改后：`pnpm test` 134/134，`node --test --test-concurrency=1` 134/134，`git diff --check` 通过。
- 分支工作区干净，当前分支仅比 `origin/main` 多三个语义提交。
- 未修改 HTTP 路由名称、请求字段、响应字段、状态码、SQLite schema、配置默认值、重试/取消/恢复语义或 Steam 补丁。
- 尚需用户在 Steam 客户端 `0.0.9.627` 人工复测：已有视频回信播放，以及上传 MIDI 从“我的上传”和歌单进入演奏。自动化网关测试不能替代这一步。

## 保护边界

本分支没有修改 `main`、真实 Steam 游戏目录、第三方资产、私有用户配置、API Key、真实用户数据、诊断隐私数据或生成媒体。
