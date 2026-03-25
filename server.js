/**
 * server.js — API Node.js para a VPS
 * Porta 3000 (nginx proxy: /api/* → localhost:3000)
 *
 * Endpoints:
 *   POST /api/resumo            — resumo de parágrafos do CIC via Grok
 *   POST /api/liturgia-reflexao — reflexão do Evangelho do dia via Grok (com cache em arquivo)
 *   POST /api/correcao          — registra correção de erro (salva em data/correcoes.json)
 *   GET  /api/correcoes         — lista correções (requer Authorization: Bearer $ADMIN_TOKEN)
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ── Rate limiting ─────────────────────────────────────────────────────────────
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

// ── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_BUSCA = `Você é um assistente especializado no Catecismo da Igreja Católica.
Com base EXCLUSIVAMENTE nos parágrafos fornecidos pelo usuário, escreva um resumo claro e conciso (3–5 frases) do que o Catecismo ensina sobre o tema pesquisado.
Ao final, liste os números dos parágrafos que embasam o resumo, no formato: Parágrafos: §X, §Y, §Z.
Não invente informação — use apenas o que está nos parágrafos fornecidos.
Responda em português do Brasil.`;

const SYSTEM_COLETOR = `Você é um assistente especializado no Catecismo da Igreja Católica.
O usuário selecionou manualmente os parágrafos abaixo para estudo. Com base EXCLUSIVAMENTE nesses trechos, escreva uma síntese coesa (3–5 frases) que integre os ensinamentos presentes neles, identificando os temas em comum.
Ao final, liste os números dos parágrafos usados, no formato: Parágrafos: §X, §Y, §Z.
Não invente informação — use apenas o que está nos parágrafos fornecidos.
Responda em português do Brasil.`;

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendJson(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 64_000) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

async function callGrok(systemPrompt, userMessage, maxTokens = 500) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY não configurada');

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
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Grok ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Handler: /api/resumo ──────────────────────────────────────────────────────
async function handleResumo(req, res, ip) {
  if (!checkRateLimit(ip))
    return sendJson(res, 429, { error: 'Muitas requisições. Aguarde alguns minutos.' }, { 'Retry-After': '600' });

  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'JSON inválido.' }); }

  const { query, paragrafos, modo } = body;
  if (!query || !Array.isArray(paragrafos) || paragrafos.length === 0)
    return sendJson(res, 400, { error: 'Parâmetros inválidos.' });

  const isColetor = modo === 'coletor';
  const contexto  = paragrafos.slice(0, 15).map(p => `§${p.numero}: ${p.texto}`).join('\n\n');
  const userMsg   = isColetor
    ? `Parágrafos selecionados pelo usuário:\n\n${contexto}`
    : `Tema pesquisado: "${query}"\n\nParágrafos do Catecismo:\n\n${contexto}`;

  try {
    const resumo = await callGrok(isColetor ? SYSTEM_COLETOR : SYSTEM_BUSCA, userMsg, 400);
    sendJson(res, 200, { resumo }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    sendJson(res, 502, { error: err.message });
  }
}

// ── Handler: /api/liturgia-reflexao ──────────────────────────────────────────
async function handleLiturgiaReflexao(req, res, ip) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'JSON inválido.' }); }

  const { data, evangelhoRef, evangelhoTexto } = body;
  if (!data || !evangelhoRef || !evangelhoTexto)
    return sendJson(res, 400, { error: 'Parâmetros inválidos.' });

  // Validação básica da data (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return sendJson(res, 400, { error: 'Data inválida.' });

  // ── Cache: tenta ler arquivo já gerado ──────────────────────────────────────
  const cacheFile = path.join(__dirname, 'data', 'liturgia', `${data}-reflexao.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return sendJson(res, 200, cached);
    } catch { /* arquivo corrompido — regenera */ }
  }

  // ── Rate limit só se for gerar (chamada à API) ──────────────────────────────
  if (!checkRateLimit(ip))
    return sendJson(res, 429, { error: 'Muitas requisições. Aguarde alguns minutos.' }, { 'Retry-After': '600' });

  const userMsg = `Evangelho do dia (${data}): ${evangelhoRef}\n\n${evangelhoTexto}`;

  let parsed;
  try {
    const raw = await callGrok(SYSTEM_LITURGIA, userMsg, 1200);
    // Remove possíveis blocos de markdown antes de parsear
    const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    return sendJson(res, 502, { error: `Erro ao gerar reflexão: ${err.message}` });
  }

  // ── Salva cache ─────────────────────────────────────────────────────────────
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(parsed, null, 2), 'utf8');
  } catch { /* falha no cache não impede a resposta */ }

  sendJson(res, 200, parsed);
}

// ── Handler: /api/correcao (POST) ─────────────────────────────────────────────
const CORRECOES_FILE = path.join(__dirname, 'data', 'correcoes.json');

function lerCorrecoes() {
  try { return JSON.parse(fs.readFileSync(CORRECOES_FILE, 'utf8')); }
  catch { return []; }
}

function salvarCorrecoes(lista) {
  fs.mkdirSync(path.dirname(CORRECOES_FILE), { recursive: true });
  fs.writeFileSync(CORRECOES_FILE, JSON.stringify(lista, null, 2), 'utf8');
}

async function handleCorrecao(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: 'JSON inválido.' }); }

  const { paragrafo, descricao } = body;
  if (!paragrafo || !descricao || typeof descricao !== 'string')
    return sendJson(res, 400, { error: 'Parâmetros inválidos.' });

  const descTrimmed = descricao.trim().slice(0, 1000);
  if (!descTrimmed)
    return sendJson(res, 400, { error: 'Descrição vazia.' });

  const entrada = {
    id: Date.now(),
    paragrafo,
    descricao: descTrimmed,
    data: new Date().toISOString(),
  };

  try {
    const lista = lerCorrecoes();
    lista.push(entrada);
    salvarCorrecoes(lista);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: 'Erro ao salvar.' });
  }
}

// ── Handler: /api/correcoes (GET, protegido por token) ────────────────────────
function handleListarCorrecoes(req, res) {
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader  = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!adminToken || token !== adminToken)
    return sendJson(res, 401, { error: 'Não autorizado.' });

  sendJson(res, 200, lerCorrecoes());
}

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim()
           ?? req.socket?.remoteAddress
           ?? 'unknown';
  const url = (req.url ?? '/').split('?')[0];

  try {
    if (req.method === 'POST' && url === '/api/resumo') {
      await handleResumo(req, res, ip);
    } else if (req.method === 'POST' && url === '/api/liturgia-reflexao') {
      await handleLiturgiaReflexao(req, res, ip);
    } else if (req.method === 'POST' && url === '/api/correcao') {
      await handleCorrecao(req, res);
    } else if (req.method === 'GET' && url === '/api/correcoes') {
      handleListarCorrecoes(req, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' });
  }
});

server.listen(PORT, () => {
  console.log(`[catecismo-api] Rodando na porta ${PORT}`);
});
