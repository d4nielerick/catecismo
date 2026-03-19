/**
 * api/resumo.js — Vercel Serverless Function
 * Recebe query + parágrafos relevantes, retorna resumo via Grok.
 */

export const config = { runtime: 'edge' };

// ── Rate limiting in-memory (por IP, por instância Edge) ─────────────────────
const LIMIT_REQUESTS = 5;      // máx. requisições por janela
const LIMIT_WINDOW_MS = 10 * 60 * 1000; // janela de 10 minutos
const MAX_IPS = 500;           // limite de IPs em memória (evita vazamento)

const _rateMap = new Map(); // ip → { count, windowStart }

function checkRateLimit(ip) {
  const now = Date.now();

  // Limpeza periódica para não crescer indefinidamente
  if (_rateMap.size > MAX_IPS) {
    for (const [key, val] of _rateMap) {
      if (now - val.windowStart > LIMIT_WINDOW_MS) _rateMap.delete(key);
    }
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

const SYSTEM_PROMPT_BUSCA = `Você é um assistente especializado no Catecismo da Igreja Católica.
Com base EXCLUSIVAMENTE nos parágrafos fornecidos pelo usuário, escreva um resumo claro e conciso (3–5 frases) do que o Catecismo ensina sobre o tema pesquisado.
Ao final, liste os números dos parágrafos que embasam o resumo, no formato: Parágrafos: §X, §Y, §Z.
Não invente informação — use apenas o que está nos parágrafos fornecidos.
Responda em português do Brasil.`;

const SYSTEM_PROMPT_COLETOR = `Você é um assistente especializado no Catecismo da Igreja Católica.
O usuário selecionou manualmente os parágrafos abaixo para estudo. Com base EXCLUSIVAMENTE nesses trechos, escreva uma síntese coesa (3–5 frases) que integre os ensinamentos presentes neles, identificando os temas em comum.
Ao final, liste os números dos parágrafos usados, no formato: Parágrafos: §X, §Y, §Z.
Não invente informação — use apenas o que está nos parágrafos fornecidos.
Responda em português do Brasil.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Muitas requisições. Aguarde alguns minutos.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '600' },
    });
  }

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key não configurada.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { query, paragrafos, modo } = body;
  if (!query || !Array.isArray(paragrafos) || paragrafos.length === 0) {
    return new Response(JSON.stringify({ error: 'Parâmetros inválidos.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isColetor = modo === 'coletor';
  const systemPrompt = isColetor ? SYSTEM_PROMPT_COLETOR : SYSTEM_PROMPT_BUSCA;

  // Monta contexto com os parágrafos relevantes (máx. 15)
  const contexto = paragrafos
    .slice(0, 15)
    .map(p => `§${p.numero}: ${p.texto}`)
    .join('\n\n');

  const userMessage = isColetor
    ? `Parágrafos selecionados pelo usuário:\n\n${contexto}`
    : `Tema pesquisado: "${query}"\n\nParágrafos do Catecismo:\n\n${contexto}`;

  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: `Erro da API: ${resp.status}`, detail: err }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const texto = data.choices?.[0]?.message?.content ?? '';

    return new Response(JSON.stringify({ resumo: texto }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
