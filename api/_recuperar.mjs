/**
 * api/_recuperar.mjs — recuperação local para o hub de perguntas.
 *
 * Quem pergunta não usa o vocabulário do Catecismo: pergunta "posso comungar
 * sem me confessar?" e a resposta está em "pecado grave" e "Reconciliação".
 * Por isso a busca combina três sinais, todos locais e sem custo de API:
 *
 *   1. BM25 sobre o texto dos §§, com radical (confessar ≈ confessei);
 *   2. o índice analítico — curadoria humana que já liga temas a §§;
 *   3. o léxico de conceitos — ponte entre palavra comum e verbete.
 *
 * Por cima, um fator de coordenação: numa pergunta com mais de um conceito,
 * o § que cobre todos vence o que repete um só.
 *
 * Só números de § saem daqui. O texto enviado ao modelo é sempre lido do
 * catecismo.json no servidor, nunca vindo do cliente: assim o endpoint não
 * serve de proxy genérico para o modelo.
 *
 * O prefixo "_" mantém o arquivo fora das rotas (api-server.mjs lista as suas).
 * Qualidade medida por scripts/avalia-recuperacao.mjs.
 */

import { readFileSync } from 'node:fs';

const ler = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/** Quantos §§ vão ao modelo. O avaliador mede exatamente este corte — se
 *  medisse outro, o teste passaria com um § que a produção nunca envia. */
export const PARAGRAFOS_POR_PERGUNTA = 12;

// ── Normalização ──────────────────────────────────────────────────────────────

const norm = (s = '') =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavras de pergunta e as que aparecem em quase todo §. "igreja" é conteúdo,
// mas casa com o tema "Igreja" do índice e afoga qualquer outra pergunta. As de
// primeira pessoa ("tenho", "estou") são o jeito de perguntar, não o assunto:
// "tenho" sozinho puxava "Tenho sede" para uma pergunta sobre mágoa.
const VAZIAS = new Set((
  'a ao aos as com como da das de do dos e ela ele em entre era essa esse esta este eu ' +
  'faz fazer foi ha isso isto ja la lhe mais mas me meu minha muito muita na nas nao no nos ' +
  'nossa nosso num numa o os ou para pela pelo pode podem posso por porque pra qual quais ' +
  'quando que quem se sem ser seu sua sao so sobre tambem tem ter todo toda tu um uma ' +
  'voce vou ate apos antes depois onde ainda devo deve devemos preciso precisa existe ' +
  'igreja catolica catolico catolicos catecismo ensina ensinamento diz dizer significa ' +
  'significado explica explique fala falar sentido ok certo errado verdade gostaria saber ' +
  'gente pessoa pessoas coisa coisas acontece posicao permitido permitida ' +
  'tenho estou sou fui quero queria sinto acho faco fiz alguem'
).split(' '));

// Do mais longo ao mais curto: a primeira terminação que couber é a retirada.
const SUFIXOS = [
  'amentos', 'imentos', 'amento', 'imento', 'mente', 'acoes', 'icoes',
  'aram', 'eram', 'iram', 'avam', 'amos', 'emos', 'imos', 'ando', 'endo', 'indo',
  'ados', 'idos', 'adas', 'idas', 'coes', 'soes', 'cao', 'sao',
  'ado', 'ido', 'ada', 'ida', 'ar', 'er', 'ir', 'ei', 'ou', 'am', 'em',
  'es', 'os', 'as', 's', 'o', 'a', 'e',
];

/**
 * Radical: tira a terminação e limita a 6 letras. Um corte fixo em 5 letras
 * juntava "confissão" com "confirmação" — e a pergunta sobre confissão
 * devolvia só crisma. Com o sufixo fora primeiro, os dois se separam.
 *
 * O que sobra precisa de 5 letras: com 4, "mentir" virava "ment" (e colidia
 * com "mente") enquanto "mentira" virava "mentir" — os dois nem se achavam.
 */
export function radical(w) {
  for (const s of SUFIXOS) {
    if (w.endsWith(s) && w.length - s.length >= 5) { w = w.slice(0, -s.length); break; }
  }
  return w.slice(0, 6);
}

/** Palavras de conteúdo, normalizadas e sem as vazias. */
export function palavras(texto) {
  return norm(texto).split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !VAZIAS.has(w) && !/^\d+$/.test(w));
}

export const termos = (texto) => palavras(texto).map(radical);

// ── Carga e índices (uma vez por processo) ────────────────────────────────────

let _base = null;

function base() {
  if (_base) return _base;

  const { paragrafos } = ler('../data/catecismo.json');
  const indice = ler('../data/indice_analitico.json');
  const { termos: lexicoBruto = {} } = ler('../data/lexico-conceitos.json');
  const { nomes = {} } = ler('../data/remissoes.json');

  const porNumero = new Map(paragrafos.map((p) => [p.numero, p]));

  // BM25: frequência por §, e em quantos §§ cada radical aparece.
  const docs = new Map();
  const df = new Map();
  let somaTam = 0;
  for (const p of paragrafos) {
    const ts = termos(`${p.texto} ${p.artigo || ''}`);
    const tf = new Map();
    for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.set(p.numero, { tf, tam: ts.length });
    somaTam += ts.length;
  }

  // Índice analítico como lista de "entradas": nome do tema + nome do subtema,
  // cada uma com seus §§. O nome do tema vem limpo, sem a cauda "vide também".
  const entradas = [];
  const paragrafosPorTema = new Map(); // nome normalizado → Set de §§
  for (const tema of indice) {
    const nomeTema = nomes[tema.id] || tema.nome;
    const chave = norm(nomeTema);
    if (!paragrafosPorTema.has(chave)) paragrafosPorTema.set(chave, new Set());
    for (const sub of tema.subtemas || []) {
      if (!sub.paragrafos?.length) continue;
      for (const n of sub.paragrafos) paragrafosPorTema.get(chave).add(n);
      entradas.push({
        radicais: new Set(termos(`${nomeTema} ${sub.nome}`)),
        tema: new Set(termos(nomeTema)),
        paragrafos: sub.paragrafos,
      });
    }
  }

  const lexico = Object.entries(lexicoBruto).map(([k, temas]) => ({ chave: norm(k), temas }));

  _base = {
    porNumero, docs, df, entradas, paragrafosPorTema, lexico,
    vocab: [...df.keys()],
    N: paragrafos.length,
    tamMedio: somaTam / paragrafos.length,
  };
  return _base;
}

// ── Léxico ────────────────────────────────────────────────────────────────────

/**
 * Palavra da pergunta que casa com a chave do léxico, ou null. Chave de várias
 * palavras ("pena de morte") casa como frase; de uma só, por prefixo tolerante
 * à flexão ("rezam" casa com "rezar", "padres" com "padre").
 */
function casaChave(chave, ws, frase) {
  if (chave.includes(' ')) return frase.includes(` ${chave} `) ? chave : null;
  if (chave.length < 4) return ws.includes(chave) ? chave : null;
  for (const w of ws) {
    if (w.length < 4) continue;
    const n = Math.max(4, Math.min(w.length, chave.length) - 2);
    if (w.slice(0, n) === chave.slice(0, n)) return w;
  }
  return null;
}

// ── Pontuação ─────────────────────────────────────────────────────────────────

const K1 = 1.2;
const B = 0.75;

const idfDe = (b, df) => Math.log(1 + (b.N - df + 0.5) / (df + 0.5));

/**
 * Cada radical da pergunta vira um conceito junto com as formas do corpus que
 * o prolongam: "morre" alcança "morrer". Exige 5 letras em comum, para não
 * voltar a juntar "mente" com "mentir".
 */
function conceitoDe(b, r) {
  const formas = r.length >= 5
    ? b.vocab.filter((k) => k.length >= 5 && (k.startsWith(r) || r.startsWith(k)))
    : [];
  if (!formas.includes(r)) formas.push(r);
  // df da união aproximado pela soma: superestima, e erra para o lado de dar
  // menos peso — nunca inventa raridade.
  const df = Math.min(b.N, formas.reduce((a, k) => a + (b.df.get(k) || 0), 0));
  return { r, formas, idf: idfDe(b, df), existe: df > 0, fraco: false, viaLexico: new Set() };
}

/**
 * Os §§ mais prováveis de responder a pergunta, do mais ao menos relevante.
 * @returns {{ numero: number, score: number }[]}
 */
export function recuperar(pergunta, limite = PARAGRAFOS_POR_PERGUNTA) {
  const b = base();
  const ws = [...new Set(palavras(pergunta))];
  const conceitos = [...new Set(ws.map(radical))].map((r) => conceitoDe(b, r));
  if (!conceitos.length) return [];

  const frase = ` ${norm(pergunta).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const scores = new Map();
  const somar = (n, v) => scores.set(n, (scores.get(n) || 0) + v);

  // Quais conceitos cada § cobre, por qualquer um dos três sinais.
  const cobertura = new Map();
  const cobrir = (n, i) => {
    const s = cobertura.get(n);
    if (s) s.add(i); else cobertura.set(n, new Set([i]));
  };

  // Léxico primeiro: palavra com verbete no léxico perde força no texto. É
  // exatamente o caso em que a palavra literal engana — "mágoa" aparece uma
  // vez no Catecismo, em outro sentido, e ganharia de tudo por ser rara.
  const temasDoLexico = [];
  for (const { chave, temas } of b.lexico) {
    const w = casaChave(chave, ws, frase);
    if (!w) continue;
    const i = chave.includes(' ') ? -1 : conceitos.findIndex((c) => c.r === radical(w));
    if (i >= 0) conceitos[i].fraco = true;
    temasDoLexico.push({ temas, i });
  }

  // 1. BM25 no texto. A escala 0..10 vem do placar *sem* o enfraquecimento:
  //    normalizar pelo máximo já enfraquecido desfazia o efeito quando a
  //    palavra do léxico era o único termo — ela voltava a valer 10.
  const bm25 = new Map();
  let maxPleno = 0;
  for (const [numero, { tf, tam }] of b.docs) {
    let s = 0;
    let pleno = 0;
    conceitos.forEach((c, i) => {
      let f = 0;
      for (const k of c.formas) f += tf.get(k) || 0;
      if (!f) return;
      const v = c.idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * tam / b.tamMedio));
      pleno += v;
      s += c.fraco ? 0.3 * v : v;
      cobrir(numero, i);
    });
    if (pleno > maxPleno) maxPleno = pleno;
    if (s > 0) bm25.set(numero, s);
  }
  for (const [n, s] of bm25) somar(n, (s / maxPleno) * 10);

  // 2. Índice analítico. Uma entrada vale pela fração da pergunta que ela cobre,
  //    pesada por idf — "comunhão" rende pouco, "purgatório" rende muito. Tema
  //    com centenas de §§ dilui: não é resposta, é assunto.
  //    Palavra que não existe no Catecismo ("padre") fica fora do denominador:
  //    nenhuma entrada poderia cobri-la, e ela só diluiria as que existem.
  const pesoQ = conceitos.filter((c) => c.existe).reduce((a, c) => a + c.idf, 0) || 1;
  for (const e of b.entradas) {
    let cobre = 0;
    let noTema = false;
    const cobertos = [];
    conceitos.forEach((c, i) => {
      if (!c.formas.some((k) => e.radicais.has(k))) return;
      cobre += c.idf;
      cobertos.push(i);
      if (c.formas.some((k) => e.tema.has(k))) noTema = true;
    });
    if (!cobre) continue;
    const v = 6 * (cobre / pesoQ) * (noTema ? 1 : 0.6) / Math.sqrt(e.paragrafos.length);
    for (const n of e.paragrafos) {
      somar(n, v);
      for (const i of cobertos) cobrir(n, i);
    }
  }

  // 3. Temas do léxico, do mais próximo ao mais distante (a ordem é curadoria).
  for (const { temas, i } of temasDoLexico) {
    temas.forEach((nomeTema, ordem) => {
      const nums = b.paragrafosPorTema.get(norm(nomeTema));
      if (!nums?.size) return;
      const v = (12 / (ordem + 1)) / Math.sqrt(nums.size);
      for (const n of nums) {
        somar(n, v);
        if (i >= 0) { cobrir(n, i); conceitos[i].viaLexico.add(n); }
      }
    });
  }

  // 4. Coordenação. Em "Mulher pode ser padre?", §§ que só repetem "mulher"
  //    venciam o §1577, que trata das duas coisas. Cada conceito pesa pela
  //    raridade; o que o Catecismo não usa e o léxico não liga fica de fora.
  const contam = conceitos
    .map((c, i) => ({ i, peso: c.idf }))
    .filter(({ i }) => conceitos[i].existe || conceitos[i].viaLexico.size);
  const pesoTotal = contam.reduce((a, x) => a + x.peso, 0);
  if (contam.length > 1) {
    for (const [n, s] of scores) {
      const tem = cobertura.get(n);
      const coberto = contam.reduce((a, x) => a + (tem?.has(x.i) ? x.peso : 0), 0);
      scores.set(n, s * (coberto / pesoTotal));
    }
  }

  return [...scores]
    .filter(([n, s]) => s > 0 && b.porNumero.has(n))
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, limite)
    .map(([numero, score]) => ({ numero, score: Math.round(score * 100) / 100 }));
}

/**
 * Várias consultas, um ranking: Reciprocal Rank Fusion. Cada consulta vota nos
 * seus §§ pela posição, 1/(60 + posição), multiplicado pelo peso. É semântica
 * de "ou": rodar "súplica", "pedido" e "bens convenientes" separados e somar
 * votos deixa sinônimo ajudar sem virar exigência — juntos numa consulta só, a
 * coordenação cobraria que o § tivesse todos.
 * @param {{ texto: string, peso?: number }[]} consultas
 */
export function recuperarFundido(consultas, limite = PARAGRAFOS_POR_PERGUNTA) {
  // K pequeno deixa a curva íngreme. Com o K=60 clássico, o 1º e o 40º votavam
  // quase igual (0,016 × 0,010) e o bônus de vizinhança abaixo atropelava a
  // ordem: o §1577, 2º colocado, saía dos 12 enviados.
  const K = 5;
  const PROFUNDIDADE = 40;
  const votos = new Map();
  for (const { texto, peso = 1 } of consultas) {
    if (!texto?.trim()) continue;
    recuperar(texto, PROFUNDIDADE).forEach(({ numero }, i) => {
      votos.set(numero, (votos.get(numero) || 0) + peso / (K + i + 1));
    });
  }
  // Vizinhança: o Catecismo argumenta em blocos de §§ seguidos. Se §2631 e
  // §2632 vieram, o §2633 — "qualquer necessidade pode tornar-se objeto de
  // pedido" — provavelmente completa o raciocínio, mesmo sem repetir as
  // palavras de nenhuma consulta. O vizinho de ±1 recebe metade do voto e o
  // de ±2, um quarto — mas só quem tem ao menos dois §§ votados na janela.
  // Sem essa exigência, vizinho de acerto isolado tirava do corte acertos
  // precisos como o §1577 (ordenação) e o §1866 (pecados capitais).
  const b = base();
  const suavizados = new Map(votos);
  const candidatos = new Set();
  for (const n of votos.keys()) for (let d = -2; d <= 2; d++) if (d && b.porNumero.has(n + d)) candidatos.add(n + d);
  for (const m of candidatos) {
    const vizinhos = [-2, -1, 1, 2].filter((d) => votos.has(m + d));
    if (vizinhos.length < 2) continue;
    const bonus = vizinhos.reduce((a, d) => a + votos.get(m + d) * (Math.abs(d) === 1 ? 0.5 : 0.25), 0);
    suavizados.set(m, (suavizados.get(m) || 0) + bonus);
  }

  return [...suavizados]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, limite)
    .map(([numero, v]) => ({ numero, score: Math.round(v * 1e4) / 1e4 }));
}

/** Texto do § sem os marcadores de nota "(12)" — só gastariam tokens. */
export function textoDoParagrafo(numero) {
  const p = base().porNumero.get(numero);
  return p ? p.texto.replace(/\s*\(\d+\)/g, '') : null;
}
