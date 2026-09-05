import { createServer } from 'node:http';
import { clientMidiJob, clientMidiPage, midiJobIds, midiPageParams } from './midi-compat.js';

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

function toSeconds(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function visibleLetter(letter) {
  const replied = letter.status === 'replied';
  return { letterId: letter.id, content: letter.body, summary: letter.body.length > 20 ? `${letter.body.slice(0, 20)}...` : letter.body,
    material: null, letterStatus: replied ? 'replied' : 'llm_processing', auditStatus: 0, replyType: replied ? 1 : 0,
    replyText: replied ? letter.reply : null, replyVideoUrl: null, isRead: replied ? (letter.read_at ? 1 : 0) : 1,
    createdAt: toSeconds(letter.created_at), repliedAt: replied ? toSeconds(letter.replied_at) : null, error: null };
}

export function createLocalGateway({ letterService, musicService = null, midiJobService = null, userProfile = {} }) {
  return createServer(async (request, response) => {
    try {
      response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
      response.setHeader('access-control-allow-headers', request.headers['access-control-request-headers'] ?? 'content-type,authorization');
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'OPTIONS') return sendJson(response, 204, {});
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true, service: 'linli-nocturne' });
      if (request.method === 'POST' && url.pathname === '/toy/signIn') return sendJson(response, 200, compatResponse({ uid: userProfile.uid ?? 'linli-local', status: 2, isNew: false, modelGatewayToken: null, userInfo: userProfile }));
      if (request.method === 'GET' && url.pathname === '/toy/getUserInfo') return sendJson(response, 200, compatResponse({ uid: userProfile.uid ?? 'linli-local', status: 2, userInfo: userProfile }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/send') {
        const body = await readJson(request);
        const letter = letterService.send({ recipient: body.person ?? body.recipient, body: body.content ?? body.body });
        return sendJson(response, 200, compatResponse({ letterId: letter.id, remainingToday: Math.max(0, letterService.limits.dailyLimit - letterService.store.countToday(letter.recipient, new Date(new Date(letter.created_at).setHours(0, 0, 0, 0)).toISOString())) }));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/list') {
        const letters = letterService.list().map(visibleLetter);
        return sendJson(response, 200, compatResponse({ list: letters, hasMore: false, nextCursor: 0, total: letters.length, remainingToday: letterService.remainingToday() }));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/detail') {
        const id = url.searchParams.get('letterId') ?? url.searchParams.get('letter_id');
        const letter = letterService.detail(id);
        if (!letter) return sendJson(response, 404, { code: 404, message: 'letter_not_found' });
        if (letter.status === 'replied' && !letter.read_at) letterService.markRead(id);
        return sendJson(response, 200, compatResponse(visibleLetter(letterService.detail(id))));
      }
      if (request.method === 'GET' && url.pathname === '/toy/letter/unread_count') return sendJson(response, 200, compatResponse({ unreadCount: letterService.unreadCount() }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/share') return sendJson(response, 200, compatResponse({ shareId: (await readJson(request)).letterId }));
      if (request.method === 'POST' && url.pathname === '/toy/letter/resend') return sendJson(response, 409, { code: 409, message: 'only_failed_letters_can_be_resent' });
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
      const media = url.pathname.match(/^\/toy\/midi\/media\/([^/]+)$/u);
      if (midiJobService && request.method === 'GET' && media) {
        const bytes = midiJobService.mediaBytes(media[1]);
        if (!bytes) return sendJson(response, 404, { error: 'media_not_found' });
        response.writeHead(200, { 'content-type': midiJobService.mediaContentType ?? 'audio/wav', 'access-control-allow-origin': '*', 'content-length': bytes.length });
        return response.end(bytes);
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
      const status = error.code === 'daily_limit' ? 429 : error instanceof SyntaxError ? 400 : 500;
      sendJson(response, status, { error: error.code ?? 'internal_error', message: error.message });
    }
  });
}
