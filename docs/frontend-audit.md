# 原版前端接口审计

审计对象是 OliviaSoul 在补丁前保存的原版 `feapp.dat`，主脚本为 `assets/main-31595bd3.js`。仓库没有复制该资源，只保存审计结果和实现契约。

## 已确认的 MIDI 流程

原版前端包含完整的“选择文件 → 获取上传地址 → 上传文件 → 创建 MIDI 任务 → 轮询任务 → 播放结果”链路：

| 接口 | 方法 | 用途 | 本地恢复策略 |
|---|---:|---|---|
| `/genObjectUploadUrl` | POST | 获取对象存储上传地址、key 和 headers | 本地网关生成一次性上传地址 |
| `/midi/generate` | POST | 根据 `midiUrl` 创建生成任务 | 接收本地 key，调用本地 MIDI 解析与渲染器 |
| `/midi/getGenerateResult` | GET | 查询单个任务和结果 | 映射到 RenderJob 状态和本地媒体 URL |
| `/midi/listJobs` | GET | 历史任务列表 | 从本地任务存储分页返回 |
| `/midi/cancelGenerate` | POST | 取消任务 | 映射到可取消的本地任务 |
| `/midi/deleteJob` | POST | 删除任务 | 删除任务记录和生成媒体 |
| `/midi/batchGetResult` | GET | 批量查询任务 | 对本地任务做批量查询 |
| `/midi/importShareCode` | POST | 导入分享码 | 后续接入分享码存储；首版可以返回明确的不支持状态 |
| `/searchUserSongs` | GET | 查询用户上传曲目 | 从本地歌单和上传记录返回 |

原版接口每个关键路径在主脚本中出现一次，适合继续沿用当前前端补丁器的“单次替换、数量校验、可重复检测”策略。

## 离线限制

原版前端存在以下限制：离线模式关闭信箱/音乐入口、阻止 HTTP 请求、隐藏 MIDI 上传卡片和用户上传页签，并跳过 MIDI 任务查询。OliviaSoul 的补丁脚本已经证明这些限制可以在前端层解除，但它的本地服务没有提供完整的 MIDI 生成接口，因此“入口出现”和“功能真正可用”是两个独立问题。

林离·余音会把前端开关恢复和本地 MIDI 后端分成两个可测试模块：先恢复入口，再让上传、解析、音频渲染和任务轮询逐项接通。首版结果可以是本地音频和动态画面，任务契约为后续 3D 手指同步视频保留 `timeline`、`handTracks`、`cameraTracks` 和 `motionTracks` 扩展字段。

## 当前审计命令

```powershell
$env:LINLI_ORIGINAL_FEAPP = "$env:APPDATA/OliviaSoul/client-backups/7cc61827b436631c58cbb32677e7b169.feapp.dat"
node scripts/audit-original-frontend.mjs
```

审计结果不会修改游戏目录，也不会把原版资源写入仓库。
