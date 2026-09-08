# Phase 4-2：曲库、歌单和模块选择入口

## 目标

让用户上传的曲目稳定出现在“我的上传”曲库，并能按原版接口加入或移出歌单；同时让用户能够看懂当前选择的播放器、渲染器和编码器，并通过 `config/user-config.json` 选择可用实现。

本里程碑不处理 `LINLI-PLAY-001`，不修改 Steam 专有文件，不实现视频回信、定制演奏或 3D Renderer。模块选择只允许注册表中已有的实现，不能把某一个实现写死成唯一实现。

状态：基础实现已具备，待按本文件统一验收和补齐用户路径记录。

## 当前实现边界

- `/toy/searchUserSongs` 只返回已完成的 MIDI 任务，支持分页和原版曲目字段；失败、取消和处理中任务不会进入曲库。
- `/toy/searchPlaylist`、`/toy/addToPlaylist` 和 `/toy/delFromPlaylist` 提供原版歌单读取、加入和移除；SQLite 是歌单事实源，重复加入按 `(itemType, itemId)` 幂等处理。
- `config/user-config.json` 的 `music.renderer`、`music.playbackAdapter` 和 `music.encoder` 会在本地服务启动时经过注册表校验，并装配到 MIDI 任务服务。
- `music.encoder` 的扩展名和 MIME 契约继续由编码器声明；曲库使用任务实际生成的媒体 URL，不自行猜测格式。

## 设计

1. 曲库只消费 `finished` 任务；任务生命周期和输入恢复由 [Phase 4-1](./phase4-1-music-settings-and-media.md) 负责，不能在曲库层重复建立状态机。
2. 歌单保留原版 `itemType/itemId` 兼容字段，同时保存本地曲目名称、媒体 URL、时长和演奏类型；加入和移除操作通过网关统一转换 snake_case/camelCase 输入。
3. 模块入口以注册表元数据和用户配置为准。配置加载时拒绝未知模块和敏感字段；启动时解析具体 Renderer、PlaybackAdapter 和 Encoder，失败要返回可读错误。
4. 配置文件是当前开发版的选择入口；本里程碑不提前引入新的 GUI 或运行时改写 API。最终普通用户设置页属于 Phase 7，但本里程碑要保持配置字段和模块目录稳定可复用。

## 验收标准

1. 一个已完成上传任务能在 `/toy/searchUserSongs` 出现，失败、取消和处理中任务不会出现；分页总数和游标稳定。
2. 用户曲目能通过原版加入歌单接口保存，重复加入不产生重复项，移除后查询不到；服务重启后歌单仍存在。
3. WAV/MP4 曲目在曲库和歌单中沿用任务声明的扩展名、媒体 URL 和 MIME 契约。
4. `user-config.json` 能选择已注册 Renderer、PlaybackAdapter 和 Encoder；未知选择、敏感字段和无效配置会被拒绝。
5. 模块选择变更在本地服务重启后生效，不影响信件模块和已完成的 Phase 3 链路。
6. `pnpm test`、网关兼容测试和 `git diff --check` 通过；不把配置文件验收当作 Steam 实机播放验收。

## 已有自动化证据与待验收项

- 已有测试覆盖用户曲目分页、失败任务过滤、歌单增删、重启后的 SQLite 持久化、WAV/MP4 媒体契约和模块选择解析；本轮补充了歌单重启及重复加入幂等验收。
- 仍需在本里程碑收尾时统一记录用户配置示例与曲库/歌单操作路径；Steam 中上传曲目能否真正接管原生 WebPlayer 仍由 Phase 4-3/4-4 单独调查和验收。
