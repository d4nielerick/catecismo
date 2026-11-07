/**
 * scripts/lib-vigia.mjs — peças comuns do vigia (saude-liturgia.mjs) e do resumo semanal
 * (resumo-semanal.mjs). Rodam na VPS, fora dos containers, para avisar mesmo quando o
 * catecismo-api cai.
 *
 * Telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID do ambiente ou, na falta, os mesmos do
 * container catecismo-api (docker inspect funciona com ele parado). O token nunca é impresso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SITE = process.env.SITE || 'https://santadoutrina.com';

export function hojeBrasilia(base = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(base).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: +p.hour };
}

export const somaDias = (dt, n) => {
  const d = new Date(`${dt}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function credenciais() {
  let token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) return { token, chat };
  try {
    for (const linha of docker('inspect', 'catecismo-api', '--format', '{{range .Config.Env}}{{println .}}{{end}}').split('\n')) {
      const i = linha.indexOf('=');
      const [k, v] = [linha.slice(0, i), linha.slice(i + 1)];
      if (k === 'TELEGRAM_BOT_TOKEN') token ||= v;
      if (k === 'TELEGRAM_CHAT_ID') chat ||= v;
    }
  } catch { /* sem docker ou sem container */ }
  return { token, chat };
}

/** Manda texto puro (sem parse_mode) ao Telegram. Com ensaio, só imprime. */
export async function avisar(texto, { ensaio = false } = {}) {
  if (ensaio) { console.log(`--- Telegram (ensaio) ---\n${texto}\n---`); return true; }
  const { token, chat } = credenciais();
  if (!token || !chat) { console.error('Telegram: token ou chat ausente'); return false; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true }),
  }).catch(e => ({ ok: false, status: e.message }));
  if (!r.ok) console.error(`Telegram: falhou (${r.status})`);
  return r.ok;
}

/**
 * Até onde cada conteúdo da Liturgia está pronto, contando dias seguidos a partir de hoje.
 * Devolve [{ nome, ate, dias }]; `ate` é o último dia coberto (null se hoje já falta).
 */
export function folegoDoConteudo(raiz, hoje) {
  const fontes = [
    ['leituras', dt => path.join(raiz, 'data', 'liturgia', `${dt}.json`)],
    ['card do Instagram', dt => path.join(raiz, 'liturgiadiaria', 'instagram', `${dt}.json`)],
    ['Reel', dt => path.join(raiz, 'liturgiadiaria', 'instagram', 'reels', `${dt}.mp4`)],
    ['resumo', dt => path.join(raiz, 'data', 'liturgia-resumos', `${dt}.json`)],
    ['trechos', dt => path.join(raiz, 'data', 'liturgia-trechos', `${dt}.json`)],
    ['comentário dos Padres', dt => path.join(raiz, 'data', 'liturgia-comentario', `${dt}.json`)],
    ['áudio', dt => path.join(raiz, 'data', 'liturgia-audio', dt, 'evangelho.mp3')],
  ];
  return fontes.map(([nome, arq]) => {
    let n = 0;
    while (n < 800 && fs.existsSync(arq(somaDias(hoje, n)))) n++;
    return { nome, dias: n, ate: n ? somaDias(hoje, n - 1) : null };
  });
}

export const dataCurta = (dt, ref = hojeBrasilia().dia) =>
  (dt ? `${dt.slice(8, 10)}/${dt.slice(5, 7)}${dt.slice(0, 4) !== ref.slice(0, 4) ? '/' + dt.slice(0, 4) : ''}` : '—');
