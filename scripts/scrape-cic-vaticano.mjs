#!/usr/bin/env node
/**
 * scrape-cic-vaticano.mjs
 *
 * Baixa o texto oficial em português do Catecismo da Igreja Católica (CIC)
 * diretamente de vatican.va (27 páginas HTML) e extrai os 2.865 parágrafos
 * numerados, produzindo data/fonte-vaticano.json.
 *
 * Node puro, sem dependências externas.
 *
 * Uso: node scripts/scrape-cic-vaticano.mjs
 *
 * Cache em disco: ../cache-vaticano/ (fora do repo, ao lado do clone), para
 * permitir reexecução sem rebaixar as páginas.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(REPO_ROOT, '..', 'cache-vaticano');
const OUT_PATH = path.join(REPO_ROOT, 'data', 'fonte-vaticano.json');

const BASE_URL = 'https://www.vatican.va/archive/cathechism_po/index_new/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_DELAY_MS = 1500;

// Ordem fixa das 27 páginas (prólogo + 26 páginas do corpo), conforme
// verificado manualmente contra o índice do CIC em vatican.va.
const PAGE_SLUGS = [
  'prologo%201-25', // atenção: espaço codificado como %20
  'p1s1c1_26-49',
  'p1s1c2_50-141',
  'p1s1c3_142-184',
  'p1s2_185-197',
  'p1s2c1_198-421',
  'p1s2cap2_422-682',
  'p1s2cap3_683-1065',
  'p2s1cap1_1066-1075',
  'p2s1cap1_1076-1134',
  'p2s1cap2_1135-1209',
  'p2s2cap1_1210-1419',
  'p2s2cap1_1420-1532',
  'p2s2cap3_1533-1666',
  'p2s2cap4_1667-1690',
  'p3-intr_1691-1698',
  'p3s1cap1_1699-1876',
  'p3s1cap2_1877-1948',
  'p3s1cap3_1949-2051',
  'p3s2-intr_2052-2082',
  'p3s2cap1_2083-2195',
  'p3s2cap2_2196-2557',
  'p4-intr_2558-2565',
  'p4s1cap1_2566-2649',
  'p4s1cap2_2650-2696',
  'p4s1cap3_2697-2758',
  'p4s2_2759-2865',
];

// ---------------------------------------------------------------------------
// Decodificador de entidades HTML (latinas nomeadas + numéricas decimais/hex)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '', // hífen discricionário: invisível, remove-se sem inserir espaço
  Aacute: 'Á', aacute: 'á',
  Acirc: 'Â', acirc: 'â',
  Agrave: 'À', agrave: 'à',
  Atilde: 'Ã', atilde: 'ã',
  Auml: 'Ä', auml: 'ä',
  Aring: 'Å', aring: 'å',
  AElig: 'Æ', aelig: 'æ',
  Ccedil: 'Ç', ccedil: 'ç',
  Eacute: 'É', eacute: 'é',
  Ecirc: 'Ê', ecirc: 'ê',
  Egrave: 'È', egrave: 'è',
  Euml: 'Ë', euml: 'ë',
  Iacute: 'Í', iacute: 'í',
  Icirc: 'Î', icirc: 'î',
  Igrave: 'Ì', igrave: 'ì',
  Iuml: 'Ï', iuml: 'ï',
  Ntilde: 'Ñ', ntilde: 'ñ',
  Oacute: 'Ó', oacute: 'ó',
  Ocirc: 'Ô', ocirc: 'ô',
  Ograve: 'Ò', ograve: 'ò',
  Otilde: 'Õ', otilde: 'õ',
  Ouml: 'Ö', ouml: 'ö',
  Oslash: 'Ø', oslash: 'ø',
  Uacute: 'Ú', uacute: 'ú',
  Ucirc: 'Û', ucirc: 'û',
  Ugrave: 'Ù', ugrave: 'ù',
  Uuml: 'Ü', uuml: 'ü',
  Yacute: 'Ý', yacute: 'ý',
  ordf: 'ª',
  ordm: 'º',
  deg: '°',
  sect: '§',
  para: '¶',
  middot: '·',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m
    );
}

function stripTags(str) {
  // <br> é quebra de linha visual dentro de um mesmo bloco (ex.: listas com
  // "– item1<br />– item2"); vira espaço para não colar palavras/itens ao
  // remover a tag (normalizeSpaces depois colapsa para um único espaço).
  return str.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
}

function normalizeSpaces(str) {
  return str.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Download com cache em disco
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheFileFor(slug) {
  // Nome de arquivo em disco: sem o %20 codificado (usa espaço real), igual
  // ao nome de arquivo remoto original.
  const decodedSlug = decodeURIComponent(slug);
  return path.join(CACHE_DIR, `${decodedSlug}_po.html`);
}

async function fetchPage(slug) {
  const file = cacheFileFor(slug);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    return buf.toString('utf8');
  }

  const url = `${BASE_URL}${slug}_po.html`;
  process.stderr.write(`Baixando ${url} ...\n`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  // A página declara charset=iso-8859-1, mas todo o conteúdo é ASCII puro
  // (acentos vêm como entidades HTML); decodificar como latin1 é seguro e
  // preserva qualquer byte alto inesperado sem lançar erro.
  const html = Buffer.from(buf).toString('latin1');

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, html, 'utf8');

  await sleep(REQUEST_DELAY_MS);
  return html;
}

// ---------------------------------------------------------------------------
// Parser de uma página: extrai marcadores §N e o conteúdo entre eles
// ---------------------------------------------------------------------------

const TAG_BOUNDARY_RE = /<\/?(?:p|blockquote)(?:\s[^>]*)?>/gi;

/**
 * Verifica se um trecho de texto (já decodificado, sem tags) é um
 * intertítulo estrutural que deve ser excluído do corpo do parágrafo.
 *
 * Regra do enunciado: texto com ≥80% de letras maiúsculas (títulos de
 * parte/seção/capítulo/artigo, ex.: "PRIMEIRA PARTE: A PROFISSÃO DA FÉ",
 * "ARTIGO 5: O QUINTO MANDAMENTO", "QUAL O SIGNIFICADO DA PALAVRA
 * LITURGIA?").
 */
function isIntertituloMaiusculas(texto) {
  if (!texto) return false;
  const letras = texto.match(/\p{L}/gu) || [];
  if (letras.length === 0) return false;
  const maiusculas = letras.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase());
  return maiusculas.length / letras.length >= 0.8;
}

/**
 * Extensão necessária (tratamento especial, ver relatório): muitos
 * intertítulos estruturais do CIC em português têm capitalização MISTA e
 * por isso não são cobertos pela regra de maiúsculas acima — ex.:
 *   - subtítulos em algarismo romano ("I. A vida do homem – conhecer e
 *     amar a Deus", "III. Finalidade e destinatários deste catecismo"),
 *     usados 263 vezes como padrão dominante de subdivisão interna dos
 *     capítulos;
 *   - o cabeçalho "Resumindo:" que introduz as caixas de síntese no fim de
 *     cada secção (75 ocorrências);
 *   - rótulos de subseção isolados como "A salvaguarda da paz" ou
 *     "O apelo universal à oração".
 * Sem essa extensão esses textos vazariam para dentro do § anterior (ou,
 * quando anteriores ao primeiro marcador da página, seriam descartados de
 * qualquer forma — mas não podemos assumir isso em geral).
 *
 * Heurística: um <p> cujo conteúdo ORIGINAL (antes de remover tags), tirando
 * um ou mais trechos <b>...</b> (podem ser vários spans separados — a fonte
 * às vezes bolda "I." e o resto do título em dois <b> adjacentes, ex.:
 * "<b>I.</b> <b>«Creio em um só Deus»</b>") e uma eventual nota de rodapé
 * solta fora do negrito (ex.: "...</b> (32)"), não sobra nenhum texto, é
 * tratado como intertítulo — desde que o texto dentro do(s) <b> não seja o
 * próprio marcador numérico (\d+\.?). Verificado manualmente contra as 27
 * páginas: todo <p> nessas condições neste corpus é um título estrutural
 * (nunca corpo de parágrafo numerado, que nunca aparece inteiramente em
 * negrito).
 */
function isIntertituloNegritoTotal(rawPieceTrimmed) {
  if (!/<b>/i.test(rawPieceTrimmed)) return false;

  const boldSpans = rawPieceTrimmed.match(/<b>[\s\S]*?<\/b>/gi) || [];
  if (boldSpans.length === 0) return false;

  const semSpans = rawPieceTrimmed.replace(/<b>[\s\S]*?<\/b>/gi, '');
  const sobra = normalizeSpaces(stripTags(decodeEntities(semSpans)));
  // O que sobrar fora do(s) <b> só pode ser uma nota de rodapé solta (ex.:
  // "(32)") e/ou pontuação separadora entre spans em negrito (ex.: o "-"
  // solto em "<b>III. Maria </b>-<b> ícone escatológico da Igreja</b>").
  const resto = sobra
    .replace(/\(\d{1,3}\)/g, '')
    .replace(/[-–—:,]/g, '')
    .replace(/\s+/g, '');
  if (resto) return false;

  const textoNegrito = boldSpans
    .map((seg) => seg.replace(/^<b>/i, '').replace(/<\/b>$/i, ''))
    .map((seg) => normalizeSpaces(stripTags(decodeEntities(seg))))
    .join(' ')
    .trim();
  if (!textoNegrito) return false;
  if (/^\d{1,4}\.?\s*$/.test(textoNegrito)) return false; // é um marcador, não título

  return true;
}

function isIntertitulo(rawPieceTrimmed, textoDecodificado) {
  return isIntertituloNegritoTotal(rawPieceTrimmed) || isIntertituloMaiusculas(textoDecodificado);
}

/**
 * Processa o HTML de uma página (já cortado antes do primeiro <hr>) e
 * retorna a lista de { numero, texto, especial } encontrados nela, na
 * ordem em que aparecem no documento.
 */
function parsePage(html, slug, especiais) {
  // Localiza todos os <b>...</b> (não aninhados; o CIC não aninha <b>).
  const btagRe = /<b>((?:(?!<\/b>)[\s\S])*?)<\/b>/g;
  const markers = [];
  let m;
  while ((m = btagRe.exec(html))) {
    const innerStripped = normalizeSpaces(stripTags(decodeEntities(m[1])));
    const match = innerStripped.match(/^(\d{1,4})\.?\s*$/);
    if (match) {
      markers.push({ num: parseInt(match[1], 10), start: m.index, end: btagRe.lastIndex });
    }
  }

  const results = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const contentStart = marker.end;
    const contentEnd = i + 1 < markers.length ? markers[i + 1].start : html.length;
    let chunk = html.slice(contentStart, contentEnd);

    // Corrige o caso em que o ponto final do marcador ficou FORA do <b>
    // (ex.: "<b>139</b><i>. </i>texto..." ou "<b>295</b> texto..." sem ponto
    // algum). Remove só o ponto solto do início do chunk, preservando
    // eventuais tags/whitespace que vieram antes dele.
    const before = chunk;
    chunk = chunk.replace(/^(\s*(?:<[^>]+>\s*)*)\.\s*/, '$1');
    if (chunk !== before) {
      especiais.push(
        `§${marker.num} (${slug}): ponto final do marcador estava fora do <b>, removido do início do texto`
      );
    }

    const pieces = chunk.split(TAG_BOUNDARY_RE);
    const linhas = [];
    for (const rawPiece of pieces) {
      // Remove espaços reais e &nbsp; solto nas bordas antes de checar se a
      // peça é inteiramente um <b>...</b> (o &nbsp; ainda não foi
      // decodificado neste ponto, então precisa ser tratado à parte).
      const rawTrimmed = rawPiece
        .replace(/^(?:\s|&nbsp;)+/i, '')
        .replace(/(?:\s|&nbsp;)+$/i, '');
      const decoded = decodeEntities(rawPiece);
      const semTags = stripTags(decoded);
      const texto = normalizeSpaces(semTags);
      if (!texto) continue;
      if (isIntertitulo(rawTrimmed, texto)) {
        especiais.push(`§${marker.num} (${slug}): intertítulo estrutural excluído: "${texto.slice(0, 60)}"`);
        continue;
      }
      linhas.push(texto);
    }

    const textoFinal = linhas.join('\n').trim();
    results.push({ numero: marker.num, texto: textoFinal });
  }

  return results;
}

function cutBeforeFirstHr(html) {
  const hrMatch = html.match(/<hr\s*\/?>/i);
  return hrMatch ? html.slice(0, hrMatch.index) : html;
}

// ---------------------------------------------------------------------------
// Reconciliação global de numeração (corrige erros de digitação da própria
// fonte vatican.va, ex.: "2117." impresso em vez de "2217.")
// ---------------------------------------------------------------------------

function hammingDistanceSameLength(a, b) {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function reconcileSequence(pageResults, especiais) {
  const paragrafos = [];
  let expected = 1;
  for (const { slug, items } of pageResults) {
    for (const item of items) {
      let numero = item.numero;
      if (numero !== expected) {
        const foundStr = String(numero);
        const expectedStr = String(expected);
        if (hammingDistanceSameLength(foundStr, expectedStr) === 1) {
          especiais.push(
            `§${expected} (${slug}): fonte imprime "${numero}." por engano (erro de digitação do vatican.va); corrigido para ${expected} pela sequência`
          );
          numero = expected;
        } else {
          throw new Error(
            `Falha de reconciliação de numeração: esperava §${expected}, encontrado §${item.numero} em ${slug}. ` +
              `Não é um erro de dígito único plausível — inspecionar manualmente.`
          );
        }
      }
      paragrafos.push({ numero, texto: item.texto });
      expected++;
    }
  }
  return paragrafos;
}

// ---------------------------------------------------------------------------
// Validações embutidas
// ---------------------------------------------------------------------------

function validar(paragrafos) {
  const erros = [];

  const numeros = paragrafos.map((p) => p.numero);
  const numerosSet = new Set(numeros);
  if (numerosSet.size !== numeros.length) {
    erros.push('Há números de § duplicados na saída.');
  }
  for (let n = 1; n <= 2865; n++) {
    if (!numerosSet.has(n)) erros.push(`§${n} está faltando.`);
  }
  if (numeros.length !== 2865) {
    erros.push(`Total de parágrafos = ${numeros.length}, esperado 2865.`);
  }

  for (const p of paragrafos) {
    if (!p.texto || !p.texto.trim()) {
      erros.push(`§${p.numero} está vazio.`);
    }
  }

  const byNum = new Map(paragrafos.map((p) => [p.numero, p]));
  for (const p of paragrafos) {
    const next = p.numero + 1;
    if (next > 2865) continue;
    const re = new RegExp(`(^|[^0-9])${next}\\.(\\s|$)`);
    if (re.test(p.texto)) {
      erros.push(`§${p.numero} parece conter o marcador do § seguinte (§${next}) vazado em seu texto.`);
    }
  }

  if (erros.length > 0) {
    console.error('\nFALHAS DE VALIDAÇÃO:');
    for (const e of erros) console.error(`  - ${e}`);
    throw new Error(`${erros.length} falha(s) de validação encontradas.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const especiais = [];
  const pageResults = [];

  for (const slug of PAGE_SLUGS) {
    const rawHtml = await fetchPage(slug);
    const html = cutBeforeFirstHr(rawHtml);
    const items = parsePage(html, slug, especiais);
    pageResults.push({ slug, items });
  }

  const paragrafos = reconcileSequence(pageResults, especiais);
  validar(paragrafos);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ paragrafos }, null, 2) + '\n', 'utf8');

  console.log(`OK: ${paragrafos.length} parágrafos extraídos e validados.`);
  console.log(`Saída: ${OUT_PATH}`);
  if (especiais.length > 0) {
    console.log(`\n${especiais.length} tratamento(s) especial(is) durante o parsing:`);
    for (const e of especiais) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
