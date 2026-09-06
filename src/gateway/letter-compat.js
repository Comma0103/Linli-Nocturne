// 0.0.9.627 的前端使用严格数字比较；协议证据见 docs/frontend-audit.md。
// 这些枚举只属于游戏兼容边界，领域服务和 SQLite 继续使用字符串状态。
const CLIENT_LETTER_STATUS = Object.freeze({ pending: 1, processing: 3, replied: 4, failed: 5 });

function toSeconds(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function clientLetter(letter, videoReplyService = null, mediaOrigin = '') {
  const letterStatus = CLIENT_LETTER_STATUS[letter.status];
  if (letterStatus === undefined) throw new TypeError('Unknown letter state');
  const replied = letter.status === 'replied';
  const video = replied ? videoReplyService?.getActive(letter.id) : null;
  return {
    letterId: letter.id,
    content: letter.body,
    summary: letter.body.length > 20 ? `${letter.body.slice(0, 20)}...` : letter.body,
    material: null,
    letterStatus,
    auditStatus: 2, // 本地接受的信件；模型失败不是审核拒绝。
    replyType: replied ? 1 : 0,
    replyText: replied ? letter.reply : null,
    replyVideoUrl: video ? `${mediaOrigin}/letter/video/media/${video.assetId}.mp4` : null,
    isRead: replied ? (letter.read_at ? 1 : 0) : 1,
    createdAt: toSeconds(letter.created_at),
    repliedAt: replied ? toSeconds(letter.replied_at) : null,
    error: letter.status === 'failed' ? letter.last_error : null,
  };
}
