/**
 * api/pergunta.js — hub de perguntas ao Catecismo.
 *
 * Recebe só a pergunta. Os §§ são escolhidos aqui, pela recuperação local
 * (_recuperar.mjs), e o texto deles sai do catecismo.json do servidor — o
 * cliente não manda texto nenhum, então o endpoint não serve de proxy para o
 * modelo.
 *
 * O modelo tem um papel estreito: dizer o que os §§ recebidos ensinam, citando
 * cada afirmação, ou admitir que eles não respondem. Citação a § que não foi
 * enviado é removida; resposta sem nenhuma citação válida vira "não encontrei".
 *
 * Guardas de custo, nesta ordem: cache por pergunta normalizada, limite por IP,
 * teto diário global. O cache e o contador vão para o tmp do container — sobrevivem
 * a `docker restart`, e nunca ficam dentro da pasta que o Caddy serve.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recuperar, textoDoParagrafo } from './_recuperar.mjs';

const MODELO = 'grok-4-1-fast-non-reasoning';
const PARAGRAFOS_ENVIADOS = 10;
const MAX_CHARS_PARAGRAFO = 1200;

const LIMITE_POR_IP = 6;                  // perguntas novas por janela
const JANELA_IP_MS = 10 * 60 * 1000;
const TETO_DIARIO = 400;                  // chamadas ao modelo por dia, somando todos
const MAX_CACHE = 3000;

const ARQUIVO_ESTADO = join(tmpdir(), 'catecismo-perguntas.json');

// ── Estado persistente (best-effort) ─────────────────────────────────────────

const hoje = () => new Date().toISOString().slice(0, 10);

let estado = { dia: hoje(), chamadas: 0, cache: {} };
try {
  const salvo = JSON.parse(readFileSync(ARQUIVO_ESTADO, 'utf8'));
  if (salvo && typeof salvo.cache === 'object') estado = salvo;
} catch { /* primeira execução */ }

let _gravacao = null;
function gravarDepois() {
  clearTimeout(_gravacao);
  _gravacao = setTimeout(() => {
    try { writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado)); } catch { /* sem disco: segue em memória */ }
  }, 2000);
}

function contarChamada() {
  if (estado.dia !== hoje()) { estado.dia = hoje(); estado.chamadas = 0; }
  estado.chamadas++;
  gravarDepois();
}

const tetoAtingido = () => estado.dia === hoje() && estado.chamadas >= TETO_DIARIO;

// ── Limite por IP (em memória; o teto diário é quem protege de verdade) ───────

const porIp = new Map();
function ipLiberado(ip) {
  const agora = Date.now();
  if (porIp.size > 2000) {
    for (const [k, v] of porIp) if (agora - v.inicio > JANELA_IP_MS) porIp.delete(k);
  }
  const e = porIp.get(ip);
  if (!e || agora - e.inicio > JANELA_IP_MS) { porIp.set(ip, { n: 1, inicio: agora }); return true; }
  if (e.n >= LIMITE_POR_IP) return false;
  e.n++;
  return true;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const SISTEMA = `Você ajuda a encontrar o que o Catecismo da Igreja Católica ensina, usando apenas os parágrafos do Catecismo que recebe.

Regras:
1. Use SOMENTE os parágrafos fornecidos. Nada de conhecimento próprio, outras fontes, opinião ou exemplos inventados.
2. Se os parágrafos não respondem à pergunta, responda apenas: NAO_ENCONTRADO
3. Se respondem, escreva de 2 a 4 frases curtas em português do Brasil dizendo o que o Catecismo ensina, próximo das palavras do texto. Termine cada frase com o parágrafo que a sustenta, assim: [§1385].
4. Não aconselhe, não julgue a situação de quem pergunta e não faça papel de sacerdote. Em pergunta pessoal, diga só o que o Catecismo ensina.
5. Sem títulos, listas, negrito ou saudação.`;

// ── Utilitários ───────────────────────────────────────────────────────────────

const json = (corpo, status = 200, extra = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

/** Chave do cache: sem acento, caixa, pontuação nem espaço repetido. */
const chaveDe = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();

const trechoDe = (texto, n = 180) =>
  texto.length > n ? texto.slice(0, texto.lastIndexOf(' ', n)) + '…' : texto;

function guardarNoCache(chave, resposta) {
  const nomes = Object.keys(estado.cache);
  if (nomes.length >= MAX_CACHE) delete estado.cache[nomes[0]]; // o mais antigo
  estado.cache[chave] = resposta;
  gravarDepois();
}

/**
 * Monta a resposta final a partir do texto do modelo. Só sobrevivem citações
 * a §§ que foram de fato enviados; sem nenhuma, a resposta não se sustenta.
 */
function montar(textoModelo, enviados) {
  const permitidos = new Set(enviados);
  const relacionados = (citados) => enviados
    .filter((n) => !citados.includes(n))
    .slice(0, 5)
    .map((n) => ({ numero: n, trecho: trechoDe(textoDoParagrafo(n)) }));

  const bruto = (textoModelo || '').trim();
  if (!bruto || /NAO_ENCONTRADO/.test(bruto)) {
    return { tipo: 'nao-encontrado', relacionados: relacionados([]) };
  }

  const citados = [];
  const texto = bruto
    .replace(/\[§\s*(\d+)\]/g, (m, n) => {
      const num = Number(n);
      if (!permitidos.has(num)) return '';
      if (!citados.includes(num)) citados.push(num);
      return `[§${num}]`;
    })
    .replace(/\*\*/g, '')
    .replace(/[ \t]+([.,;])/g, '$1')
    .trim();

  if (!citados.length) return { tipo: 'nao-encontrado', relacionados: relacionados([]) };

  return {
    tipo: 'resposta',
    texto,
    citados: citados.map((n) => ({ numero: n, trecho: trechoDe(textoDoParagrafo(n)) })),
    relacionados: relacionados(citados),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let pergunta;
  try {
    ({ pergunta } = await req.json());
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  pergunta = typeof pergunta === 'string' ? pergunta.replace(/\s+/g, ' ').trim() : '';
  if (pergunta.length < 6 || pergunta.length > 300) {
    return json({ error: 'Escreva uma pergunta entre 6 e 300 caracteres.' }, 400);
  }

  const chave = chaveDe(pergunta);
  if (estado.cache[chave]) return json({ ...estado.cache[chave], cache: true });

  const enviados = recuperar(pergunta, PARAGRAFOS_ENVIADOS).map((r) => r.numero);
  if (!enviados.length) {
    const vazio = { tipo: 'nao-encontrado', relacionados: [] };
    guardarNoCache(chave, vazio);
    return json(vazio);
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
          ?? req.headers.get('x-real-ip') ?? 'desconhecido';
  if (!ipLiberado(ip)) {
    return json({ error: 'Muitas perguntas seguidas. Aguarde alguns minutos.' }, 429, { 'Retry-After': '600' });
  }
  if (tetoAtingido()) {
    return json({ error: 'O limite de perguntas de hoje foi atingido. Volte amanhã.' }, 503);
  }

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return json({ error: 'Serviço indisponível.' }, 503);

  const contexto = enviados
    .map((n) => `§${n}: ${textoDoParagrafo(n).slice(0, MAX_CHARS_PARAGRAFO)}`)
    .join('\n\n');

  try {
    contarChamada();
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO,
        messages: [
          { role: 'system', content: SISTEMA },
          { role: 'user', content: `Parágrafos do Catecismo:\n\n${contexto}\n\n---\nPergunta: ${pergunta}` },
        ],
        max_tokens: 350,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error('[pergunta] modelo', resp.status, (await resp.text()).slice(0, 300));
      return json({ error: 'Não foi possível responder agora. Tente novamente.' }, 502);
    }

    const dados = await resp.json();
    const uso = dados.usage || {};
    console.log(`[pergunta] ${uso.prompt_tokens ?? '?'}+${uso.completion_tokens ?? '?'} tokens · ${estado.chamadas}/${TETO_DIARIO} hoje`);

    const resposta = montar(dados.choices?.[0]?.message?.content, enviados);
    guardarNoCache(chave, resposta);
    return json(resposta);
  } catch (err) {
    console.error('[pergunta]', err.message);
    return json({ error: 'Não foi possível responder agora. Tente novamente.' }, 500);
  }
}

// Exposto para teste local sem chamar o modelo.
export { montar as _montar };
