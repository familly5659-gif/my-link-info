import http from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseMetadata } from './metadata.js';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || resolve(root, '.data'));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const keyPath = resolve(dataDir, 'admin-key');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(24).toString('hex'), { mode: 0o600 });
const adminKey = process.env.ADMIN_KEY || readFileSync(keyPath, 'utf8').trim();
const db = new DatabaseSync(resolve(dataDir, 'links.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, url TEXT NOT NULL, image TEXT NOT NULL, category TEXT NOT NULL, platform TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
const allowed = ['coupang.com', 'toss.im', 'toss.me', 'tossshopping.com', 'threads.com', 'threads.net'];
export function validUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && allowed.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; }
}
function authorized(req) {
  const value = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const expected = Buffer.from(adminKey);
  return value.length === expected.length && timingSafeEqual(value, expected);
}
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 20000) throw new Error('입력 내용이 너무 깁니다.'); }
  try { return JSON.parse(text); } catch { throw new Error('올바른 JSON이 필요합니다.'); }
}

async function metadata(url) {
  for (let i = 0; i < 5; i++) {
    if (!validUrl(url)) throw new Error('지원하는 쇼핑·Threads HTTPS 주소만 사용할 수 있습니다.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'MyLinkInfo/0.1 (link preview)' } });
    if ([301,302,303,307,308].includes(response.status)) { url = new URL(response.headers.get('location'), url).href; await response.body?.cancel(); continue; }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new Error('사이트에서 상품 정보를 제공하지 않습니다. 직접 입력해 주세요.'); }
    const reader = response.body.getReader(); let bytes = 0; const chunks = [];
    try { for (;;) { const {done,value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 1500000) throw new Error('페이지가 너무 큽니다. 직접 입력해 주세요.'); chunks.push(Buffer.from(value)); } } finally { await reader.cancel(); }
    return parseMetadata(Buffer.concat(chunks).toString('utf8'), url);
  }
  throw new Error('리디렉션이 너무 많습니다. 직접 입력해 주세요.');
}
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  try {
    const thumbnail = path.match(/^\/thumbnail\/(\d+)$/);
    if (thumbnail && req.method === 'GET') {
      const record = db.prepare('SELECT image FROM links WHERE id=?').get(Number(thumbnail[1]));
      if (!record?.image) return send(404, {error:'썸네일이 없습니다.'});
      const imageUrl = new URL(record.image);
      const imageHosts = ['cdninstagram.com', 'fbcdn.net', 'coupangcdn.com'];
      if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || imageUrl.port || !imageHosts.some(h => imageUrl.hostname === h || imageUrl.hostname.endsWith('.' + h))) return send(400, {error:'지원하지 않는 이미지 호스트입니다.'});
      const cacheDir = resolve(dataDir, 'thumbnails'); mkdirSync(cacheDir, {recursive:true});
      const cachePath = resolve(cacheDir, createHash('sha256').update(record.image).digest('hex'));
      let image;
      if (existsSync(cachePath)) image = readFileSync(cachePath);
      else {
        const upstream = await fetch(record.image, {redirect:'error', signal:AbortSignal.timeout(10000)});
        if (!upstream.ok || !/^image\/(jpeg|png|webp)(;|$)/i.test(upstream.headers.get('content-type') || '')) { await upstream.body?.cancel(); return send(502, {error:'이미지를 불러올 수 없습니다.'}); }
        const reader = upstream.body.getReader(); const parts = []; let size = 0;
        try { for (;;) { const {done,value} = await reader.read(); if(done)break; size += value.length; if(size > 5000000)throw new Error('이미지가 너무 큽니다.'); parts.push(Buffer.from(value)); } } finally { await reader.cancel(); }
        image = Buffer.concat(parts); writeFileSync(cachePath, image);
      }
      const type = image[0] === 0x89 ? 'image/png' : image[0] === 0xff ? 'image/jpeg' : 'image/webp';
      res.writeHead(200, {'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'}); return res.end(image);
    }
    if (path === '/api/links' && req.method === 'GET') return send(200, db.prepare('SELECT * FROM links ORDER BY id DESC').all());
    if (path.startsWith('/api/')) {
      if (!authorized(req)) return send(401, { error: '관리자 키를 확인해 주세요.' });
      if (path === '/api/auth' && req.method === 'POST') return send(200, { ok: true });
      if (path === '/api/metadata' && req.method === 'POST') { const {url} = await body(req); return send(200, await metadata(url)); }
      const match = path.match(/^\/api\/links\/(\d+)$/);
      if ((path === '/api/links' && req.method === 'POST') || (match && req.method === 'PUT')) {
        const v = await body(req);
        if (!validUrl(v.url) || !v.title?.trim() || v.title.length > 160 || (v.summary || '').length > 1000 || !['살림·주방','디지털','패션·뷰티','라이프'].includes(v.category)) return send(400, { error: '제목, 지원하는 링크, 카테고리를 확인해 주세요.' });
        if (v.image && (!/^https:\/\//.test(v.image) || v.image.length > 2000)) return send(400, { error: '썸네일은 HTTPS 이미지 주소를 입력해 주세요.' });
        const platform = new URL(v.url).hostname.includes('coupang') ? '쿠팡' : new URL(v.url).hostname.includes('toss') ? '토스쇼핑' : 'Threads';
        const values = [v.title.trim(), v.summary || '', v.url, v.image || '', v.category, platform];
        if (match) { const result = db.prepare('UPDATE links SET title=?,summary=?,url=?,image=?,category=?,platform=? WHERE id=?').run(...values, Number(match[1])); if (!result.changes) return send(404, {error:'상품을 찾을 수 없습니다.'}); }
        else db.prepare('INSERT INTO links (title,summary,url,image,category,platform) VALUES (?,?,?,?,?,?)').run(...values);
        return send(200, { ok: true });
      }
      if (match && req.method === 'DELETE') { db.prepare('DELETE FROM links WHERE id=?').run(Number(match[1])); return send(200, {ok:true}); }
      return send(404, { error: '요청을 찾을 수 없습니다.' });
    }
    if (files[path] && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': files[path][1], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      return res.end(readFileSync(resolve(root, 'public', files[path][0])));
    }
    send(404, {error:'페이지를 찾을 수 없습니다.'});
  } catch (e) { send(400, { error: e.message === 'fetch failed' ? '자동 수집에 연결하지 못했습니다. 상품 정보를 직접 입력해 주세요.' : e.message }); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`My Link Info listening on port ${server.address().port}. Admin key file: ${keyPath}`));
