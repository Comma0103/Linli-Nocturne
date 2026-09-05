import { createServer } from 'node:http';

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function createLocalGateway({ letterService }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'OPTIONS') return sendJson(response, 204, {});
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true, service: 'linli-nocturne' });
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
