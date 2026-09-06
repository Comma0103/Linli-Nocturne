# RenderJob 状态机

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> validating
  validating --> failed: 输入无效
  validating --> rendering
  rendering --> produced: 产出媒体
  rendering --> retry_wait: 可重试错误
  retry_wait --> rendering
  rendering --> failed: 不可重试错误
  produced --> published
  produced --> failed: 校验失败
  published --> archived
  queued --> cancelled
  validating --> cancelled
  rendering --> cancelled
```

每个任务包含 `id`、`kind`、`inputAssetIds`、`rendererId`、`rendererVersion`、`status`、`progress`、`errorCode`、`attempt`、`createdAt` 和 `updatedAt`。渲染器不得直接修改业务表，只能提交事件和媒体产物；这样音频实现可以替换成定制演奏视频或 3D 手指同步实现，而不会改变信件和歌单模型。文字回信、视频回信和定制演奏可以共用这套任务生命周期，但由各自的领域服务负责输入和业务状态。

## 渲染器接口方向

- `AudioRenderer`: MIDI -> WAV/MP3 + timing manifest。
- `VideoRenderer`: 定制演奏的 audio + scene -> MP4/WebM + manifest。
- `VideoGenerator`: 视频回信上下文 + 角色/场景/音频输入 -> 视频回信 MP4/WebM + manifest；它与 `videoImporter` 完全分离。
- `Future3DRenderer`: MIDI + timing manifest + character rig -> hand/camera/action tracks。

`VideoGenerator` 必须通过独立注册表选择实现。第一版可以提供确定性的本地 fallback，用于验证排队、处理中、成功、失败、取消、重启恢复、媒体保存、格式检查和查询；它只验证技术链路，不代表已经达到正式视频回信的角色表现质量。

`timing manifest` 保存音符、踏板、节拍和渲染时间轴，是后续实现精确手指同步的稳定扩展点。
