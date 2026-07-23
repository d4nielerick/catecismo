/**
 * scripts/scrape-notas-vaticano.mjs — extrai as NOTAS DE RODAPÉ das páginas
 * do CIC em vatican.va (usa o cache local de HTML; SEM rede).
 *
 * Contexto: scrape-cic-vaticano.mjs corta cada página no primeiro <hr> para
 * pegar só os parágrafos — descartando as notas, que ficam DEPOIS do <hr>.
 * As notas são numeradas continuamente POR ARQUIVO (capítulo): a nota N de um
 * arquivo corresponde ao marcador "(N)" no texto de algum parágrafo daquele
 * arquivo. Este script parseia essas notas e grava data/fonte-notas-vaticano.json
 * = { "arquivo.html": { "N": "texto da nota" } } (bruto, reprodutível).
 * build-notas.mjs depois casa nota→parágrafo.
 *
 * Uso: node scripts/scrape-notas-vaticano.mjs   (cache em ../cache-vaticano)
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodeEntities, stripTags, normalizeSpaces } from './lib-html.mjs';

const CACHE_DIR = path.join('..', 'cache-vaticano');
const OUT = 'data/fonte-notas-vaticano.json';

// marcadores de fim das notas (rodapé/navegação após as notas, se houver)
const CORTE_RODAPE = /(?:©|Copyright|Índice geral|\[\s*Index|top\b)/i;

const SEP = ''; // delimitador de bloco (a partir de <p>/</p>/<br>)

/** Da página inteira, devolve os SEGMENTOS de texto (um por bloco <p>) da
 *  seção após o último <hr>. Cada nota costuma ser um bloco; segmentos que não
 *  começam por número são continuação da nota anterior. Robusto a OCR (nota sem
 *  ponto tipo "2 Cf.") porque não depende de sequência estrita nem do ponto. */
function segmentosNotas(html) {
  const partes = html.split(/<hr[^>]*>/i);
  if (partes.length < 2) return [];
  let tail = partes[partes.length - 1];
  tail = tail.replace(/<\/p>|<p[^>]*>|<br\s*\/?>/gi, SEP);
  let flat = stripTags(decodeEntities(tail));
  const corte = flat.search(CORTE_RODAPE);
  if (corte > 200) flat = flat.slice(0, corte);
  return flat.split(SEP).map(normalizeSpaces).filter(Boolean);
}

/** Monta {N: texto} a partir dos segmentos. Um segmento iniciado por
 *  "N." ou "N " (1–3 dígitos) abre a nota N; os demais concatenam à atual.
 *  Aceita furos e números fora de ordem (não morre num número danificado). */
function parseNotas(segmentos) {
  const notas = {};
  let atual = null;
  for (const seg of segmentos) {
    const m = seg.match(/^(\d{1,3})\s*\.?\s+(.+)$/);
    if (m) {
      atual = m[1];
      notas[atual] = m[2].trim();
    } else if (atual) {
      notas[atual] = normalizeSpaces(`${notas[atual]} ${seg}`);
    }
  }
  return notas;
}

function rangeDoArquivo(nome) {
  const m = nome.match(/(\d+)-(\d+)_po\.html$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

const arquivos = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('_po.html'));
const saida = {};
let totalNotas = 0;
for (const nome of arquivos.sort()) {
  const rng = rangeDoArquivo(nome);
  if (!rng) { console.warn(`sem range no nome, pulando: ${nome}`); continue; }
  const html = fs.readFileSync(path.join(CACHE_DIR, nome), 'latin1');
  const notas = parseNotas(segmentosNotas(html));
  saida[nome] = notas;
  const ns = Object.keys(notas).map(Number);
  totalNotas += ns.length;
  const max = ns.length ? Math.max(...ns) : 0;
  // sanidade: números contíguos 1..max?
  const faltam = [];
  for (let i = 1; i <= max; i++) if (!notas[String(i)]) faltam.push(i);
  console.log(`${nome}  §${rng[0]}-${rng[1]}  notas:${ns.length} (1..${max})${faltam.length ? '  FALTAM ' + faltam.join(',') : ''}`);
}
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(saida, null, 1));
console.log(`\n${arquivos.length} arquivos, ${totalNotas} notas → ${OUT}`);
