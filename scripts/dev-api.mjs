/**
 * scripts/dev-api.mjs — servidor local: o site estático + os handlers de api/*.js nas rotas /api/<nome>,
 * montados do mesmo jeito que o api-server.mjs da VPS (Request/Response da Web API).
 *
 *   PUSH_ARQUIVO=/tmp/push.json VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… node scripts/dev-api.mjs [porta]
 *
 * Só para desenvolvimento: sem cache, sem HTTPS (service worker e push funcionam em localhost).
 */

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.argv[2]) || 8787;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.xml': 'application/xml', '.txt': 'text/plain' };

const rotas = new Map();
for (const f of await readdir(path.join(RAIZ, 'api'))) {
  if (!f.endsWith('.js') || f.startsWith('_')) continue;
  rotas.set(`/api/${f.slice(0, -3)}`, (await import(pathToFileURL(path.join(RAIZ, 'api', f)))).default);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const handler = rotas.get(url.pathname);
  if (handler) {
    const chunks = [];
    if (!['GET', 'HEAD'].includes(req.method)) for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.host;
    const init = { method: req.method, headers };
    if (chunks.length) { init.body = Buffer.concat(chunks); init.duplex = 'half'; }
    try {
      const r = await handler(new Request(`http://localhost${req.url}`, init));
      res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error('[dev-api]', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // estático: /liturgiadiaria/ → index.html; sem cache para o service worker ver sempre a versão nova
  let arquivo = path.join(RAIZ, decodeURIComponent(url.pathname));
  try {
    if ((await stat(arquivo)).isDirectory()) arquivo = path.join(arquivo, 'index.html');
    const corpo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(corpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('não encontrado');
  }
}).listen(PORTA, () => console.log(`http://localhost:${PORTA}/liturgiadiaria/  rotas: ${[...rotas.keys()].join(' ')}`));
