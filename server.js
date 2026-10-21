// 부활수업 카드뉴스 공방 — Render용 서버 (외부 패키지 없음, Node 18 이상)
// 필요한 환경변수: ANTHROPIC_API_KEY, HF_API_KEY (또는 HF_API_KEY_ID + HF_API_KEY_SECRET)
// 선택: ACCESS_CODE (설정하면 이 코드를 아는 사람만 AI 글쓰기·이미지 생성을 쓸 수 있음)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const HF_BASE = process.env.HF_BASE_URL || 'https://api.higgsfield.ai';
const HF_MODEL = 'higgsfield-ai/soul/v2/standard';
const PUBLIC = path.join(__dirname, 'public');

// ---------- 공통 ----------
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function codeOk(req) {
  if (!ACCESS_CODE) return true;
  const a = Buffer.from(String(req.headers['x-access-code'] || '')), b = Buffer.from(ACCESS_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function extractJson(text) {
  const t = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch {}
  const s = t.search(/[\[{]/), e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  return null;
}
// 힉스필드 콘솔의 'Copy API key' 값 하나(HF_API_KEY)를 그대로 넣거나, 예전 방식의 ID·Secret 두 개를 넣어도 됨
const HF_KEY = (process.env.HF_API_KEY || '').trim();
const hasHf = () => !!(HF_KEY || (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET));
const hfAuth = () => HF_KEY ? `Key ${HF_KEY.replace(/^Key\s+/i, '')}` : `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`;
const results = new Map(); // request_id -> 완성 이미지 원본 주소

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/config' && req.method === 'GET') {
    return send(res, 200, {
      needCode: !!ACCESS_CODE,
      canWrite: !!process.env.ANTHROPIC_API_KEY,
      canImage: hasHf(),
    });
  }
  if (!codeOk(req)) return send(res, 401, { error: '접근 코드가 맞지 않아요.' });
  if (p === '/api/check-code') return send(res, 200, { ok: true });

  // AI 글쓰기 (Claude API)
  if (p === '/api/write' && req.method === 'POST') {
    const prompt = String((await readBody(req)).prompt || '').slice(0, 8000);
    if (!prompt) return send(res, 400, { error: '요청 내용이 비어 있어요.' });
    if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았어요.' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 3000,
          system: '너는 한국어 인스타그램 카드뉴스 카피라이터다. 요청한 JSON만 출력하고 다른 말은 하지 않는다.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, 502, { error: 'AI 글쓰기 실패: ' + (data?.error?.message || r.status) });
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const json = extractJson(text);
      return json ? send(res, 200, json) : send(res, 502, { error: 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' });
    } catch (e) {
      return send(res, 502, { error: 'AI 서버에 연결하지 못했어요: ' + e.message });
    }
  }

  // 힉스필드 이미지 요청
  if (p === '/api/image' && req.method === 'POST') {
    const prompt = String((await readBody(req)).prompt || '').slice(0, 2000);
    if (!prompt) return send(res, 400, { error: '이미지 프롬프트가 비어 있어요.' });
    if (!hasHf()) return send(res, 503, { error: '서버에 힉스필드 API 키가 설정되지 않았어요.' });
    try {
      const r = await fetch(`${HF_BASE}/${HF_MODEL}`, {
        method: 'POST',
        headers: { Authorization: hfAuth(), 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          prompt: prompt + '. Vertical photo for an Instagram card. Keep the lower 40% calm and uncluttered for text overlay. No text, no letters, no watermark.',
          aspect_ratio: '3:4',
          resolution: '1080p',
          batch_size: 1,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.request_id) {
        const why = data?.detail || data?.message || data?.error || r.status;
        return send(res, 502, { error: '힉스필드 요청 실패: ' + (typeof why === 'string' ? why : JSON.stringify(why)) });
      }
      return send(res, 200, { id: data.request_id });
    } catch (e) {
      return send(res, 502, { error: '힉스필드에 연결하지 못했어요: ' + e.message });
    }
  }

  // 상태 확인 / 완성 이미지 전달
  const m = p.match(/^\/api\/image\/([\w-]{8,80})(\/file)?$/);
  if (m && req.method === 'GET') {
    const id = m[1];
    if (m[2]) {
      const src = results.get(id);
      if (!src) return send(res, 404, { error: '이미지를 찾지 못했어요. 다시 생성해 주세요.' });
      try {
        const r = await fetch(src);
        if (!r.ok) return send(res, 502, { error: '이미지를 받지 못했어요.' });
        res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'private, max-age=3600' });
        return res.end(Buffer.from(await r.arrayBuffer()));
      } catch { return send(res, 502, { error: '이미지를 받는 중 연결이 끊겼어요.' }); }
    }
    try {
      const r = await fetch(`${HF_BASE}/requests/${id}/status`, { headers: { Authorization: hfAuth() } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, 502, { error: '상태 확인 실패: ' + r.status });
      const img = data?.images?.[0]?.url;
      if (data.status === 'completed' && img) results.set(id, img);
      return send(res, 200, { status: data.status, ready: data.status === 'completed' && !!img });
    } catch (e) {
      return send(res, 502, { error: '상태 확인 중 연결이 끊겼어요: ' + e.message });
    }
  }
  return send(res, 404, { error: '없는 주소예요.' });
}

// ---------- 정적 파일 ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('페이지를 찾을 수 없어요.'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(e => send(res, 500, { error: '서버 오류: ' + e.message }));
  } else serveStatic(req, res, url);
}).listen(PORT, () => console.log(`카드뉴스 공방 실행 중: http://localhost:${PORT}`));
