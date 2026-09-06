# 已知问题

## LINLI-PLAY-001：本地上传曲目无法接管原生 WebPlayer

- **状态**：Phase 4 音乐体验的跨层阻塞；Phase 2 接入基础不受其阻塞，暂缓继续猜测式试错
- **首次确认**：2026-09-06
- **影响**：曲库中的上传 MIDI 可以上传、生成并显示，但点击“演奏”后桌面不进入演奏，也没有本地曲目声音。
- **对照结果**：同一客户端、同一网关、同一时间，预设曲目可以正常进入演奏并产生 `webPlayerControl` 时间事件。

### 复现步骤

1. 启动本地网关和已经接入补丁的 0.0.9.627 客户端。
2. 打开“曲库 → 我的上传”。
3. 对已生成的 `linli-performance-10s.mid` 点击一次“演奏”。
4. 等待约 5 秒。

### 已验证不能解释问题的外围因素

- MIDI 文件过短：使用约 10 秒 MIDI 仍失败。
- 上传、生成和任务轮询：均成功，曲目能在“我的上传”显示。
- HTTPS 页面访问 `127.0.0.1` 的 mixed content：已改为 `http://localhost`。
- URL 扩展名：已提供 `.mp4` URL，并保留无后缀兼容。
- HTTP 媒体协议基础能力：已实现 `HEAD`、单段 `Range 206`、`Content-Range` 和 `Accept-Ranges`。
- TOD 键值：已按 0.0.9.627 原生日志使用 `TOD1200 / TOD1730 / TOD2000`。
- `play` 桥接形状：日志确认原生收到包含完整 `song` 对象的 `cmd: "play"`。

### 关键证据

2026-09-06 14:34:00 的 `Olivia.log` 同时记录了：

- `sendWebPlayerControlCmd` 收到上传曲目的完整 `play` 对象；
- 对象中包含 `.mp4` 的 `http://localhost:27149/...` 地址和三组正确 TOD 键；
- 随后没有任何新的本地媒体加载事件。

同期 `work/runtime/gateway-capture.log` 只有网关启动行，没有收到任何 `/toy/midi/media/` 请求。预设曲目播放时则会产生正常的 `webPlayerControl` 时间事件。

### 暂停原因

当前剩余嫌疑集中在原生 `WebPlayerManager/WebPlayerClient` 对自定义曲目对象的内部校验或媒体源选择逻辑，例如数字曲目 ID、`nameKey` 命名规则、当前曲目状态替换流程，或者原生层只接受在线曲目资源格式。没有原生层反汇编或可观测的媒体加载回调前，继续修改前端字段无法可靠判断因果。

### 恢复入口

恢复此问题时，优先进行只读分析：

1. 反汇编或提取 `NutStudioUI.dll` 中 `sendWebPlayerControlCmd` 到 `WebPlayerManager/WebPlayerClient` 的调用和错误分支。
2. 对比一份官方 `play` 对象与本地对象在原生层解析后的字段，重点检查 `id`、`nameKey`、`source`、`performanceType` 和 TOD 选择。
3. 增加原生层可观测性后，再做单字段 A/B 实验；不要再次让用户重复多轮盲测。

本问题不影响信件功能、上传生成链路、预设曲库显示和本地领域核心。它也不是 Phase 3 信件可靠性工作的技术前置条件。后续可以先完成 Phase 3，再在 Phase 4 音乐体验中以原生 WebPlayer 只读分析为前提恢复调查。
