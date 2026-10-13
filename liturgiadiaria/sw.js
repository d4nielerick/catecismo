/**
 * sw.js — service worker da Liturgia Diária (escopo /liturgiadiaria/).
 *
 * Para quê: abrir e ler sem internet (a casca do site e as leituras dos próximos dias ficam no
 * aparelho) e deixar o site instalável. Nada de IA nem de rastreio aqui.
 *
 * Estratégias (só GET do próprio site; /api/, áudio e outros domínios passam direto):
 *  · páginas e JS/CSS ........ rede primeiro (o servidor não guarda cache dessas; assim nunca se
 *                              mistura HTML novo com JS velho) e, sem rede, a cópia guardada;
 *  · /data/** ............... guarda e atualiza por trás (abre na hora, atualiza para a próxima);
 *                              indice.json vai pela rede primeiro (o calendário muda com o ano);
 *  · fontes e imagens ....... a cópia guardada primeiro.
 *
 * Avisos (Web Push): `push` mostra a notificação que scripts/enviar-push.mjs manda às 6h,
 * `notificationclick` abre (ou foca) a Liturgia e `pushsubscriptionchange` refaz a inscrição.
 *
 * Para trocar tudo (mudou a lista da casca, por exemplo), suba a VERSAO.
 */

const VERSAO = 'v3';   // v3: dados revalidam (cache: 'no-cache'); o servidor guarda /data/ por 30 dias e um dia corrigido não chegava ao aparelho
const CASCA = `lit-${VERSAO}-casca`;
const DADOS = `lit-${VERSAO}-dados`;
const MIDIA = `lit-${VERSAO}-midia`;
const ATUAIS = new Set([CASCA, DADOS, MIDIA]);
const MAX_DADOS = 160;   // arquivos de dados guardados (dias, resumos, santos…)
const MAX_MIDIA = 90;    // imagens (pinturas dos cards)
const DIAS_A_FRENTE = 7; // quantos dias o aparelho já deixa prontos

const CASCA_ARQUIVOS = [
  '/liturgiadiaria/',
  '/liturgiadiaria/liturgiadiaria.js',
  '/liturgiadiaria/liturgiadiaria.css',
  '/liturgiadiaria/render.mjs',
  '/liturgiadiaria/menu.mjs',
  '/liturgiadiaria/metricas.mjs',
  '/liturgiadiaria/pwa.mjs',
  '/liturgiadiaria/icones-leituras.mjs',
  '/liturgiadiaria/leitor-audio.mjs',
  '/liturgiadiaria/tour.mjs',
  '/liturgiadiaria/compartilhar.mjs',
  '/liturgiadiaria/imagem-do-dia.mjs',
  '/liturgiadiaria/manifest.webmanifest',
  '/assets/css/main.css',
  '/assets/js/vendor/lenis.mjs',
  '/assets/fonts/inria-serif-400.woff2',
  '/assets/fonts/inria-serif-400-italic.woff2',
  '/assets/fonts/inria-serif-700.woff2',
  '/assets/img/liturgia-icone-192.png?v=3',
  '/assets/img/liturgia-icone-512.png?v=3',
  '/data/liturgia/indice.json',
  '/data/santos/indice.json',
  '/data/santos-frases.json',
  '/data/cards-imagens.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CASCA);
    // um arquivo que falhe não derruba a instalação: entra o que der
    await Promise.all(CASCA_ARQUIVOS.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome.startsWith('lit-') && !ATUAIS.has(nome)) await caches.delete(nome);
    await self.clients.claim();
  })());
});

/** Mantém no máximo `max` arquivos, descartando os mais antigos. */
async function aparar(cache, max) {
  const chaves = await cache.keys();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - max))) await cache.delete(k);
}

async function redePrimeiro(req, nome, { tempo = 0, reserva } = {}) {
  const cache = await caches.open(nome);
  const rede = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; });
  rede.catch(() => {});   // se perder a corrida contra o tempo e falhar depois, ninguém reclama
  try {
    if (!tempo) return await rede;
    return await Promise.race([rede, new Promise((_, no) => setTimeout(no, tempo, new Error('lento')))]);
  } catch (erro) {
    const guardado = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (guardado) return guardado;
    if (reserva) { const r = await (await caches.open(nome)).match(reserva); if (r) return r; }
    if (tempo) return rede;   // sem cópia nenhuma: espera a rede, mesmo lenta
    throw erro;
  }
}

async function guardarEAtualizar(e, req) {
  const cache = await caches.open(DADOS);
  const guardado = await cache.match(req);
  const rede = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { cache.put(req, r.clone()).then(() => aparar(cache, MAX_DADOS)); } return r; }).catch(() => null);
  if (guardado) { e.waitUntil(rede); return guardado; }
  return (await rede) || new Response('null', { status: 504, headers: { 'Content-Type': 'application/json' } });
}

async function copiaPrimeiro(req, nome, max) {
  const cache = await caches.open(nome);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const r = await fetch(req);
  if (r.ok && r.status === 200) { cache.put(req, r.clone()).then(() => aparar(cache, max)); }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/data/liturgia-audio/') || req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    if (!p.startsWith('/liturgiadiaria/')) return;
    // a página de um dia sem cópia guardada abre a casca, que lê a data do endereço
    e.respondWith(redePrimeiro(req, CASCA, { tempo: 3500, reserva: '/liturgiadiaria/' }));
    return;
  }
  if (p === '/data/liturgia/indice.json' || p === '/data/push.json') { e.respondWith(redePrimeiro(req, DADOS, { tempo: 2500 })); return; }
  if (p.startsWith('/data/')) { e.respondWith(guardarEAtualizar(e, req)); return; }
  if (/\.(?:woff2|png|webp|jpg|jpeg|svg)$/.test(p)) { e.respondWith(copiaPrimeiro(req, MIDIA, MAX_MIDIA)); return; }
  if (/\.(?:js|mjs|css|webmanifest)$/.test(p)) { e.respondWith(redePrimeiro(req, CASCA)); return; }
});

/** A página pede para deixar os próximos dias prontos (leituras, resumo, trechos, comentário). */
self.addEventListener('message', e => {
  if (e.data?.tipo !== 'aquecer' || !/^\d{4}-\d{2}-\d{2}$/.test(e.data.hoje || '')) return;
  e.waitUntil((async () => {
    const cache = await caches.open(DADOS);
    const base = new Date(`${e.data.hoje}T12:00:00Z`);
    for (let i = 0; i < DIAS_A_FRENTE; i++) {
      const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
      for (const pasta of ['liturgia', 'liturgia-resumos', 'liturgia-trechos', 'liturgia-comentario']) {
        const u = `/data/${pasta}/${d}.json`;
        try { if (!(await cache.match(u))) { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await cache.put(u, r); } } catch { /* sem rede: fica para a próxima */ }
      }
    }
    await aparar(cache, MAX_DADOS);
  })());
});

// ---- avisos ------------------------------------------------------------------------------------

const ICONE = '/assets/img/liturgia-icone-192.png?v=3';
const API = /(^|\.)santadoutrina\.com$/.test(location.hostname) || location.hostname === 'localhost' ? '/api' : 'https://santadoutrina.com/api';

self.addEventListener('push', e => {
  let aviso = {};
  try { aviso = e.data?.json() || {}; } catch { aviso = { corpo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(aviso.titulo || 'Evangelho de hoje', {
    body: aviso.corpo || '',
    icon: ICONE,
    badge: ICONE,
    tag: aviso.tag || 'evangelho',
    data: { url: aviso.url || '/liturgiadiaria/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || '/liturgiadiaria/', location.origin).href;
  e.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = abas.find(c => new URL(c.url).pathname.startsWith('/liturgiadiaria/'));
    if (aberta) { await aberta.focus(); if (aberta.url !== destino && 'navigate' in aberta) await aberta.navigate(destino).catch(() => {}); return; }
    await self.clients.openWindow(destino);
  })());
});

// o navegador trocou a inscrição por conta própria: refaz com a mesma chave e avisa o servidor
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    let chave = e.oldSubscription?.options?.applicationServerKey;
    if (!chave) {
      const { chave_publica } = await (await fetch('/data/push.json')).json();
      chave = Uint8Array.from(atob(chave_publica.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    }
    const nova = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    await fetch(`${API}/push-inscrever`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inscricao: nova.toJSON() }) });
    if (e.oldSubscription && e.oldSubscription.endpoint !== nova.endpoint) {
      await fetch(`${API}/push-cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: e.oldSubscription.endpoint }) }).catch(() => {});
    }
  })());
});
