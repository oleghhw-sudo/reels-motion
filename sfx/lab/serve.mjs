#!/usr/bin/env node
// sfx/lab/serve.mjs — сервер прослушки звуков (без зависимостей, node:http).
// Запуск: node sfx/lab/serve.mjs  → http://localhost:5174
//
// Отдаёт: /  (index.html), /manifest.json, /approved.json, /library/<type>/<file>.wav
// Пишет:  POST /api/approved → sfx/approved.json (только по нажатию «Сохранить» в UI),
//         предыдущая версия копируется в sfx/approved.backup.json.
// Слушает только 127.0.0.1. POST принимается только с того же origin (защита от записи чужой вкладкой).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 5174;
const HOST = '127.0.0.1';
const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SFX_DIR = path.resolve(LAB_DIR, '..');
const LIB_DIR = path.join(SFX_DIR, 'library');
const MANIFEST = path.join(SFX_DIR, 'manifest.json');
const APPROVED = path.join(SFX_DIR, 'approved.json');
const BACKUP = path.join(SFX_DIR, 'approved.backup.json');
const MAX_BODY = 1024 * 1024;
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
const TYPES = ['click', 'toggle', 'pop', 'whoosh', 'keystroke', 'tick', 'notify', 'success', 'error', 'reveal', 'glitch', 'swipe', 'impact', 'other'];

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
async function sendFile(res, abs, type) {
  try {
    const buf = await fsp.readFile(abs);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch { send(res, 404, 'not found'); }
}

// Проверка структуры { approved: { <type>: [ {id, sha256, note} ] } } — пишем только то, что прошло валидацию.
function validate(body) {
  if (!body || typeof body !== 'object' || !body.approved || typeof body.approved !== 'object' || Array.isArray(body.approved)) {
    throw new Error('ожидается { approved: { <type>: [...] } }');
  }
  const out = {};
  for (const [type, list] of Object.entries(body.approved)) {
    if (!TYPES.includes(type)) throw new Error(`неизвестный тип «${type}»`);
    if (!Array.isArray(list)) throw new Error(`approved.${type} должен быть массивом`);
    out[type] = list.map((e, i) => {
      if (!e || typeof e.id !== 'string' || !/^[a-z0-9-]+__[a-z0-9-]+$/.test(e.id)) throw new Error(`approved.${type}[${i}].id некорректен`);
      if (typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256)) throw new Error(`approved.${type}[${i}].sha256 некорректен`);
      const note = e.note == null ? '' : String(e.note).slice(0, 2000);
      return { id: e.id, sha256: e.sha256, note };
    });
  }
  return { approved: out, updatedAt: new Date().toISOString() };
}

async function saveApproved(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return send(res, 403, 'origin не разрешён');
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, 'нужен application/json');
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, 'слишком большое тело'); chunks.push(c); }
  let doc;
  try { doc = validate(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (e) { return send(res, 400, 'ошибка: ' + e.message); }
  // Бэкап предыдущей версии, затем атомарная запись (tmp + rename).
  let backedUp = false;
  if (fs.existsSync(APPROVED)) { await fsp.copyFile(APPROVED, BACKUP); backedUp = true; }
  const tmp = APPROVED + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(doc, null, 2) + '\n');
  await fsp.rename(tmp, APPROVED);
  const count = Object.values(doc.approved).reduce((n, l) => n + l.length, 0);
  console.log(`✎ approved.json сохранён: ${count} звуков${backedUp ? ', бэкап → approved.backup.json' : ''}`);
  send(res, 200, JSON.stringify({ ok: true, count, backup: backedUp, updatedAt: doc.updatedAt }), 'application/json; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'POST' && p === '/api/approved') return await saveApproved(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p === '/' || p === '/index.html') return await sendFile(res, path.join(LAB_DIR, 'index.html'), 'text/html; charset=utf-8');
    if (p === '/manifest.json') return await sendFile(res, MANIFEST, 'application/json; charset=utf-8');
    if (p === '/approved.json') return await sendFile(res, APPROVED, 'application/json; charset=utf-8');
    if (p.startsWith('/library/') && p.endsWith('.wav')) {
      const abs = path.resolve(SFX_DIR, '.' + p);
      if (!abs.startsWith(LIB_DIR + path.sep)) return send(res, 403, 'forbidden'); // защита от ../
      return await sendFile(res, abs, 'audio/wav');
    }
    send(res, 404, 'not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'internal error');
  }
});

server.listen(PORT, HOST, () => {
  if (!fs.existsSync(MANIFEST)) console.warn('⚠ нет sfx/manifest.json — сначала node sfx/collect.mjs');
  console.log(`Прослушка: http://localhost:${PORT}  (Ctrl+C — остановить)`);
});
