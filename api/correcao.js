/**
 * api/correcao.js — Vercel Edge Function
 * Recebe { paragrafo, descricao } e encaminha a correção para o Telegram.
 * (Serverless da Vercel não persiste arquivos; por isso encaminhamos em vez de gravar.)
 *
 * Env vars necessárias na Vercel:
 *   TELEGRAM_BOT_TOKEN — token do bot
 *   TELEGRAM_CHAT_ID   — chat que recebe as correções
 */

export const config = { runtime: 'edge' };

// ── Rate limiting in-memory (por IP, por instância) ──────────────────────────
const LIMIT_REQUESTS  = 5;
const LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_IPS         = 500;
const _rateMap        = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  if (_rateMap.size > MAX_IPS) {
    for (const [k, v] of _rateMap)
      if (now - v.windowStart > LIMIT_WINDOW_MS) _rateMap.delete(k);
  }
  const entry = _rateMap.get(ip);
  if (!entry || now - entry.windowStart > LIMIT_WINDOW_MS) {
    _rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= LIMIT_REQUESTS) return false;
  entry.count++;
  return true;
}

function json(status, data, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';
  if (!checkRateLimit(ip))
    return json(429, { error: 'Muitas requisições. Aguarde alguns minutos.' }, { 'Retry-After': '600' });

  let body;
  try { body = await req.json(); }
  catch { return json(400, { error: 'JSON inválido.' }); }

  const { paragrafo, descricao } = body;
  if (paragrafo === undefined || paragrafo === null || !descricao || typeof descricao !== 'string')
    return json(400, { error: 'Parâmetros inválidos.' });

  const desc = descricao.trim().slice(0, 1000);
  if (!desc) return json(400, { error: 'Descrição vazia.' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return json(500, { error: 'Destino não configurado.' });

  // Texto puro (sem parse_mode) para não quebrar com _ * [ etc. nas descrições.
  const texto = `Correção — Catecismo\nReferência: ${String(paragrafo)}\n\n${desc}`;

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
    });
    if (!r.ok) {
      const e = await r.text();
      return json(502, { error: 'Falha ao encaminhar.', detail: e.slice(0, 200) });
    }
    return json(200, { ok: true }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
