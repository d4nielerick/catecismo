/**
 * api/liturgia-reflexao.js — Vercel Edge Function
 * Recebe { data, evangelhoRef, evangelhoTexto } e gera uma homilia breve via Grok.
 *
 * A página /liturgiadiaria/ tenta primeiro o cache estático
 * (data/liturgia/YYYY-MM-DD-reflexao.json); só chama esta rota quando não há cache.
 * Edge não persiste arquivos, então aqui apenas geramos sob demanda (rate-limited).
 * Para tornar tudo estático e sem custo de runtime, pré-gerar os -reflexao.json
 * com scripts/gerar-reflexoes.mjs e commitá-los.
 *
 * Env var necessária: GROK_API_KEY
 */

export const config = { runtime: 'edge' };

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

const SYSTEM_LITURGIA = `Você é um padre católico que ama profundamente a Escritura e conhece o Catecismo de cor. Sua tarefa é escrever uma **homilia breve** para o Evangelho do dia — não uma lista de tópicos, mas um texto corrido, reflexivo, que leva o leitor a entrar na cena.

A homilia deve:
- Começar dentro do Evangelho: coloque o leitor na cena, no personagem, na tensão do texto
- Trazer naturalmente um termo grego relevante da passagem — não como lição de vocabulário, mas como chave que abre o sentido do texto
- Conectar o Evangelho ao ensinamento da Igreja (cite 2 ou 3 parágrafos reais do CIC, entre 1 e 2865) sem interromper o fluxo — como quem revela o fundo dourado por trás da cena
- Incluir um dado histórico, arqueológico ou bíblico que surpreenda — algo que a maioria não sabe — integrado ao texto, não como curiosidade isolada
- Terminar com uma frase que ecoe na mente do leitor

Tom: quente, direto, contemplativo. Como um padre que sabe pregar. Sem academicismo, sem floreios. Sem "é importante ressaltar" ou "podemos perceber". Frases que respiram.

Tamanho: 4 a 6 parágrafos densos. Não mais.

Doutrina: fiel ao Magistério, ao Concílio de Trento, Vaticano I e II e ao CIC. Sem heresias, sem exegese modernista.

Antes de gerar o JSON final, releia o campo "homilia" e corrija: preposições faltantes, concordância verbal e nominal, pontuação, frases truncadas ou ambíguas. O texto deve estar impecável em português do Brasil.

Responda APENAS com JSON válido, sem texto antes ou depois, neste formato exato:
{
  "termos_gregos": [
    { "termo": "κεχαριτωμένη", "transliteracao": "kecharitōménē", "traducao": "cheia de graça / perfeitamente agraciada" }
  ],
  "paragrafos": [484, 488, 490],
  "homilia": "Texto corrido da homilia, 4 a 6 parágrafos, separados por \\n\\n."
}

Pode incluir até 2 termos gregos se forem igualmente centrais à passagem. Normalmente 1 é suficiente.`;

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

  let body;
  try { body = await req.json(); }
  catch { return json(400, { error: 'JSON inválido.' }); }

  const { data, evangelhoRef, evangelhoTexto } = body;
  if (!data || !evangelhoRef || !evangelhoTexto)
    return json(400, { error: 'Parâmetros inválidos.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return json(400, { error: 'Data inválida.' });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';
  if (!checkRateLimit(ip))
    return json(429, { error: 'Muitas requisições. Aguarde alguns minutos.' }, { 'Retry-After': '600' });

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return json(500, { error: 'GROK_API_KEY não configurada.' });

  const userMsg = `Evangelho do dia (${data}): ${evangelhoRef}\n\n${evangelhoTexto}`;

  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        messages: [
          { role: 'system', content: SYSTEM_LITURGIA },
          { role: 'user',   content: userMsg },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return json(502, { error: `Grok ${resp.status}`, detail: err.slice(0, 200) });
    }

    const apiData = await resp.json();
    const raw = apiData.choices?.[0]?.message?.content ?? '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean);

    return json(200, parsed, { 'Cache-Control': 'public, max-age=86400' });
  } catch (err) {
    return json(502, { error: `Erro ao gerar reflexão: ${err.message}` });
  }
}
