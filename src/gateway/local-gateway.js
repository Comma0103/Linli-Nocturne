import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { clientMidiJob, clientMidiPage, midiJobIds, midiPageParams } from './midi-compat.js';
import { clientLetter } from './letter-compat.js';

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': response.getHeader('access-control-allow-origin') ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': response.getHeader('access-control-allow-headers') ?? 'content-type,authorization',
    vary: 'Origin',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function compatResponse(data) { return { code: 0, message: 'success', data }; }

function htmlEscape(value) { return String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function publicVideoJob(job) { if (!job) return null; const { mediaPath, ...visible } = job; return visible; }

function videoPage(videos, letters, origin) {
  const rows = videos.map(video => `<article><h3>${htmlEscape(video.letterId)}</h3><p>${htmlEscape(video.fileName)} · ${Math.round(video.metadata.duration ?? 0)} 秒</p><video controls preload="metadata" src="${origin}/letter/video/media/${encodeURIComponent(video.assetId)}.mp4"></video><form method="post" action="/letter/video/delete/${encodeURIComponent(video.letterId)}"><button>删除当前视频</button></form></article>`).join('\n');
  const options = letters.filter(letter => letter.status === 'replied').map(letter => `<option value="${htmlEscape(letter.id)}">${htmlEscape(letter.id)} · ${htmlEscape(letter.body.slice(0, 30))}</option>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>林离·余音：视频回信</title><style>body{font:16px sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem}article{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}video{display:block;max-width:100%;max-height:420px;margin:1rem 0}label{display:block;margin:.5rem 0}select,input,button{font:inherit;padding:.3rem}</style><h1>视频回信</h1><p>这里只管理已经完成文字回复的信件。导入 MP4 后可以预览、替换或删除。</p><form id="upload"><label>选择信件 <select name="letterId" required>${options || '<option value="">暂无已回复信件</option>'}</select></label><label>MP4 文件 <input name="file" type="file" accept="video/mp4,.mp4" required></label><button>导入或替换</button></form><p id="status"></p>${rows || '<p>还没有视频回信。</p>'}<script>document.querySelector('#upload').addEventListener('submit',async e=>{e.preventDefault();const f=e.target.file.files[0];const id=e.target.letterId.value.trim();const s=document.querySelector('#status');s.textContent='处理中…';const r=await fetch('/letter/video/upload/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':f.type||'video/mp4','x-file-name':f.name},body:f});const j=await r.json();s.textContent=r.ok?'导入成功，请刷新页面。':(j.message||j.error||'导入失败');if(r.ok)location.reload()});</script>`;
}

export function createLocalGateway({ letterService, musicService = null, midiJobService = null, videoReplyService = null, userProfile = {}, mediaLogger = null }) {
  return createServer(async (request, response) => {
    try {
      response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
      response.setHeader('access-control-allow-headers', request.headers['access-control-request-headers'] ?? 'content-type,authorization');
      const url = new URL(request.url, 'http://localhost');
      const origin = `${url.protocol}//${request.headers.host}`;
      if (request.method === 'OPTIONS') return sendJson(response, 204, {});
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true, service: 'linli-nocturne' });
      if (request.method === 'POST' && url.pathname === '/toy/signIn') return sendJson(response, 200, compatResponse({ uid: userProfile.uid ?? 'linli-local', status: 2, isNew: false, modelGatewayToken: null, userInfo: userProfile }));
      if (request.method === 'GET' && url.pathname === '/toy/getUserInfo') return sendJson(response, 200, compatResponse({ uid: userProfile.uid ?? 'linli-local', status: 2, userInfo: userProfile }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/send') {
        const body = await readJson(request);
        const letter = letterService.send({ recipient: body.person ?? body.recipient, body: body.content ?? body.body });
        return sendJson(response, 200, compatResponse({ letterId: letter.id, remainingToday: letterService.remainingToday(letter.recipient) }));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/list') {
        const letters = letterService.list().map(letter => clientLetter(letter, videoReplyService, origin));
        return sendJson(response, 200, compatResponse({ list: letters, hasMore: false, nextCursor: 0, total: letters.length, remainingToday: letterService.remainingToday() }));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/detail') {
        const id = url.searchParams.get('letterId') ?? url.searchParams.get('letter_id');
        const letter = letterService.detail(id);
        if (!letter) return sendJson(response, 404, { code: 404, message: 'letter_not_found' });
        if (letter.status === 'replied' && !letter.read_at) letterService.markRead(id);
        return sendJson(response, 200, compatResponse(clientLetter(letterService.detail(id), videoReplyService, origin)));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/unread_count') return sendJson(response, 200, compatResponse({ unreadCount: letterService.unreadCount() }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/share') return sendJson(response, 200, compatResponse({ shareId: (await readJson(request)).letterId }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/resend') return sendJson(response, 409, { code: 409, message: 'only_failed_letters_can_be_resent' });
      if (videoReplyService && request.method === 'GET' && url.pathname === '/letters/videos') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return response.end(videoPage(videoReplyService.listActive(), letterService.list(), origin));
      }
      const videoUpload = url.pathname.match(/^\/letter\/video\/upload\/([^/]+)$/u);
      if (videoReplyService && request.method === 'PUT' && videoUpload) {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > videoReplyService.maxBytes) { const error = new Error('video_too_large'); error.code = 'video_too_large'; throw error; } chunks.push(chunk); }
        const result = await videoReplyService.importBuffer({ letterId: decodeURIComponent(videoUpload[1]), buffer: Buffer.concat(chunks), fileName: request.headers['x-file-name'] ?? 'reply.mp4' });
        return sendJson(response, 200, { job: publicVideoJob(result) });
      }
      const videoJob = url.pathname.match(/^\/letter\/video\/status\/([^/]+)$/u);
      if (videoReplyService && request.method === 'GET' && videoJob) return sendJson(response, 200, { job: publicVideoJob(videoReplyService.getJob(decodeURIComponent(videoJob[1]))) });
      if (videoReplyService && request.method === 'GET' && url.pathname === '/letter/video/list') return sendJson(response, 200, { jobs: videoReplyService.listJobs(url.searchParams.get('letterId') ?? '') .map(publicVideoJob) });
      const videoDelete = url.pathname.match(/^\/letter\/video\/delete\/([^/]+)$/u);
      if (videoReplyService && request.method === 'POST' && videoDelete) return sendJson(response, 200, { deleted: videoReplyService.delete(decodeURIComponent(videoDelete[1])) });
      const videoMedia = url.pathname.match(/^\/letter\/video\/media\/([^/]+?)(?:\.mp4)?$/u);
      if (videoReplyService && videoMedia && (request.method === 'GET' || request.method === 'HEAD')) {
        const video = videoReplyService.mediaPath(decodeURIComponent(videoMedia[1]));
        if (!video) return sendJson(response, 404, { error: 'video_not_found' });
        let bytes;
        try { bytes = await readFile(video); } catch { return sendJson(response, 404, { error: 'video_not_found' }); }
        const headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
        const range = request.headers.range;
        let status = 200; let body = bytes;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
          if (!match || (!match[1] && !match[2])) { response.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` }); return response.end(); }
          const suffix = match[1] ? null : Number(match[2]);
          const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - suffix);
          let end = match[1] && match[2] ? Number(match[2]) : bytes.length - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start) { response.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` }); return response.end(); }
          end = Math.min(end, bytes.length - 1); body = bytes.subarray(start, end + 1); status = 206; headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
        }
        headers['content-length'] = body.length;
        response.writeHead(status, headers); return request.method === 'HEAD' ? response.end() : response.end(body);
      }
      if (request.method === 'GET' && url.pathname === '/toy/searchPlaylist') {
        if (!musicService) return sendJson(response, 200, compatResponse({ list: [], hasMore: false, nextCursor: 0, total: 0 }));
        const list = musicService.compatPlaylist();
        return sendJson(response, 200, compatResponse({ list, hasMore: false, nextCursor: 0, total: list.length }));
      }
      if (midiJobService && request.method === 'POST' && url.pathname === '/toy/genObjectUploadUrl') {
        const body = await readJson(request);
        return sendJson(response, 200, compatResponse(midiJobService.createUpload({ filename: body.filename, uploadUrl: `${url.protocol}//${request.headers.host}` })));
      }
      const upload = url.pathname.match(/^\/toy\/midi\/upload\/([^/]+)$/u);
      if (midiJobService && request.method === 'PUT' && upload) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        midiJobService.receiveUpload(decodeURIComponent(upload[1]), Buffer.concat(chunks));
        return sendJson(response, 200, { ok: true });
      }
      if (midiJobService && request.method === 'POST' && url.pathname === '/toy/midi/generate') {
        const body = await readJson(request);
        const job = midiJobService.generate({ ...body, midiUrl: body.midi_url ?? body.midiUrl, mediaBaseUrl: `${url.protocol}//${request.headers.host}` });
        return sendJson(response, 200, compatResponse(clientMidiJob(job)));
      }
      if (midiJobService && request.method === 'GET' && url.pathname === '/toy/midi/getGenerateResult') return sendJson(response, 200, compatResponse(clientMidiJob(midiJobService.get(url.searchParams.get('job_id') ?? url.searchParams.get('jobId')))));
      if (midiJobService && request.method === 'GET' && url.pathname === '/toy/midi/listJobs') return sendJson(response, 200, compatResponse(clientMidiPage(midiJobService.list(midiPageParams(url.searchParams)))));
      if (midiJobService && request.method === 'GET' && url.pathname === '/toy/midi/batchGetResult') {
        const ids = midiJobIds(url.searchParams);
        // A few 0.0.9.627 builds drop array query parameters while in lite
        // mode. Returning the newest tasks keeps the client history usable;
        // explicit IDs still take precedence when they are present.
        const list = ids.length ? midiJobService.batch(ids).list : midiJobService.list({ pageSize: 20 }).list;
        return sendJson(response, 200, compatResponse({ results: list.map(clientMidiJob), ...midiJobService.dailyUsage() }));
      }
      if (midiJobService && request.method === 'POST' && url.pathname === '/toy/midi/cancelGenerate') {
        const body = await readJson(request);
        return sendJson(response, 200, compatResponse(clientMidiJob(midiJobService.cancel(body.job_id ?? body.jobId))));
      }
      if (midiJobService && request.method === 'POST' && url.pathname === '/toy/midi/deleteJob') {
        const body = await readJson(request);
        return sendJson(response, 200, compatResponse({ deleted: midiJobService.delete(body.job_id ?? body.jobId) }));
      }
      if (midiJobService && request.method === 'POST' && url.pathname === '/toy/midi/importShareCode') return sendJson(response, 409, { code: 409, message: 'midi_share_code_not_supported' });
      if (midiJobService && request.method === 'GET' && url.pathname === '/toy/searchUserSongs') return sendJson(response, 200, compatResponse(midiJobService.listUserSongs(midiPageParams(url.searchParams))));
      const media = url.pathname.match(/^\/toy\/midi\/media\/([^/]+?)(?:\.mp4)?$/u);
      if (midiJobService && media && (request.method === 'GET' || request.method === 'HEAD')) {
        const bytes = midiJobService.mediaBytes(media[1]);
        if (!bytes) {
          mediaLogger?.({ method: request.method, pathname: url.pathname, range: request.headers.range ?? null, status: 404, contentType: null, bytes: 0 });
          return sendJson(response, 404, { error: 'media_not_found' });
        }
        const contentType = midiJobService.mediaContentType ?? 'audio/wav';
        const range = request.headers.range;
        let status = 200;
        let body = bytes;
        const headers = { 'content-type': contentType, 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' };
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
          if (!match || (!match[1] && !match[2])) {
            response.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` });
            mediaLogger?.({ method: request.method, pathname: url.pathname, range, status: 416, contentType, bytes: 0 });
            return response.end();
          }
          const suffixLength = match[1] ? null : Number(match[2]);
          let start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - suffixLength);
          // A suffix range bytes=-N means the final N bytes. The end is still
          // the final byte of the resource, not N-1.
          let end = match[2] ? (match[1] ? Number(match[2]) : bytes.length - 1) : bytes.length - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start) {
            response.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` });
            mediaLogger?.({ method: request.method, pathname: url.pathname, range, status: 416, contentType, bytes: 0 });
            return response.end();
          }
          end = Math.min(end, bytes.length - 1);
          body = bytes.subarray(start, end + 1);
          status = 206;
          headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
        }
        headers['content-length'] = body.length;
        mediaLogger?.({ method: request.method, pathname: url.pathname, range: range ?? null, status, contentType, bytes: body.length });
        response.writeHead(status, headers);
        return request.method === 'HEAD' ? response.end() : response.end(body);
      }
      if (request.method === 'POST' && url.pathname === '/toy/addToPlaylist') {
        if (!musicService) return sendJson(response, 503, { code: 503, message: 'music_service_unavailable' });
        const body = await readJson(request);
        const itemType = Number(body.itemType ?? body.item_type);
        const itemId = String(body.itemId ?? body.item_id ?? body.id ?? body.songId ?? body.song_id ?? body.performanceId ?? body.performance_id ?? '').trim();
        if (!Number.isInteger(itemType) || !itemId) return sendJson(response, 400, { code: 400, message: 'playlist_item_incomplete' });
        return sendJson(response, 200, compatResponse(musicService.addCompatPlaylistItem({ ...body, itemType, itemId })));
      }
      if (request.method === 'POST' && url.pathname === '/toy/delFromPlaylist') {
        if (!musicService) return sendJson(response, 503, { code: 503, message: 'music_service_unavailable' });
        const body = await readJson(request);
        const deleted = musicService.removeCompatPlaylistItem(Number(body.itemType ?? body.item_type), String(body.itemId ?? body.item_id ?? ''));
        return sendJson(response, 200, compatResponse({ ...body, deleted }));
      }
      if (request.method === 'POST' && url.pathname === '/letter/send') return sendJson(response, 200, letterService.send(await readJson(request)));
      if (request.method === 'GET' && url.pathname === '/letter/send/list') return sendJson(response, 200, { letters: letterService.list() });
      if (request.method === 'GET' && url.pathname === '/letter/send/unread_count') return sendJson(response, 200, { count: letterService.unreadCount() });
      const detail = url.pathname.match(/^\/letter\/send\/detail\/([^/]+)$/);
      if (request.method === 'GET' && detail) return sendJson(response, 200, letterService.detail(detail[1]) ?? {});
      if (request.method === 'POST' && url.pathname === '/letter/process') return sendJson(response, 200, await letterService.processNext());
      return sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      const status = error.code === 'daily_limit' ? 429 : error.code === 'video_too_large' ? 413 : error.code === 'video_job_conflict' ? 409 : error.code === 'letter_not_found' ? 404 : error.code === 'letter_not_replied' ? 409 : String(error.code ?? '').startsWith('video_') ? 400 : error instanceof SyntaxError ? 400 : 500;
      sendJson(response, status, { error: error.code ?? 'internal_error', message: error.message });
    }
  });
}
