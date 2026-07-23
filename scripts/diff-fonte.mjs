#!/usr/bin/env node
/**
 * diff-fonte.mjs
 *
 * Compara, § a §, data/catecismo.json (texto atualmente publicado, com
 * §§ truncados por um scrape antigo) contra data/fonte-vaticano.json
 * (texto oficial extraído diretamente de vatican.va), e produz um
 * relatório de diferenças em data/diff-fonte-relatorio.json.
 *
 * Classificação por §:
 *   - identico:   textos idênticos após normalização de comparação.
 *   - leve:       mesmo conteúdo, diferenças só de pontuação/espaçamento
 *                 (similaridade >= 0.98).
 *   - truncado:   o texto atual é um prefixo aproximado do da fonte, e a
 *                 fonte é pelo menos 15% maior.
 *   - divergente: resto (diferenças de conteúdo).
 *
 * Uso: node scripts/diff-fonte.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const CATECISMO_PATH = path.join(REPO_ROOT, 'data', 'catecismo.json');
const FONTE_PATH = path.join(REPO_ROOT, 'data', 'fonte-vaticano.json');
const OUT_PATH = path.join(REPO_ROOT, 'data', 'diff-fonte-relatorio.json');

const LEVE_THRESHOLD = 0.98;
const TRUNCADO_PREFIX_SIMILARITY = 0.95;
const TRUNCADO_MIN_GROWTH = 1.15; // fonte deve ser >=15% maior que o atual

// ---------------------------------------------------------------------------
// Normalização para comparação (não altera os textos armazenados, só a
// visão usada para comparar).
// ---------------------------------------------------------------------------

const QUOTE_DOUBLE_RE = /[“”„‟«»"]/g;
const QUOTE_SINGLE_RE = /[‘’‚‛`´']/g;
const DASH_RE = /[‐‑‒–—―−]/g;

function normalizeForCompare(texto) {
  let s = texto;
  s = s.replace(QUOTE_DOUBLE_RE, '"');
  s = s.replace(QUOTE_SINGLE_RE, "'");
  s = s.replace(DASH_RE, '-');
  // Unifica marcadores de nota: "(1)" vs "( 1 )" vs "(1 )" etc.
  s = s.replace(/\(\s*(\d{1,3})\s*\)/g, '($1)');
  // Colapsa todo whitespace (incl. quebras de linha entre blocos internos)
  // em um único espaço.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ---------------------------------------------------------------------------
// Levenshtein (distância de edição) com DP em duas linhas — O(n*m) tempo,
// O(min(n,m)) memória.
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Garante que `b` é a mais curta, para minimizar memória.
  if (b.length > a.length) [a, b] = [b, a];

  const bl = b.length;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Classificação de um par (atual, fonte)
// ---------------------------------------------------------------------------

function classificar(numero, textoAtualRaw, textoFonteRaw) {
  const atual = normalizeForCompare(textoAtualRaw);
  const fonte = normalizeForCompare(textoFonteRaw);

  if (atual === fonte) {
    return { categoria: 'identico' };
  }

  const lenAtual = atual.length;
  const lenFonte = fonte.length;
  const lenDiff = Math.abs(lenAtual - lenFonte);
  const closeInLength = lenDiff <= Math.max(30, 0.1 * Math.max(lenAtual, lenFonte, 1));

  // "leve": só se os tamanhos forem próximos (diferenças de pontuação /
  // espaçamento não mudam substancialmente o tamanho do texto).
  if (closeInLength) {
    const sim = similarity(atual, fonte);
    if (sim >= LEVE_THRESHOLD) {
      return { categoria: 'leve', similaridade: sim };
    }
  }

  // "truncado": fonte bem maior, e o atual é aproximadamente um prefixo dela.
  if (lenFonte >= lenAtual * TRUNCADO_MIN_GROWTH && lenAtual > 0) {
    let prefixSim;
    if (fonte.startsWith(atual)) {
      prefixSim = 1;
    } else {
      const prefixFonte = fonte.slice(0, lenAtual);
      prefixSim = similarity(atual, prefixFonte);
    }
    if (prefixSim >= TRUNCADO_PREFIX_SIMILARITY) {
      return {
        categoria: 'truncado',
        tamanhoAtual: lenAtual,
        tamanhoFonte: lenFonte,
        prefixSimilaridade: prefixSim,
      };
    }
  }

  // "divergente": calcula similaridade geral só para os casos que sobraram,
  // para poder ranquear os piores casos no relatório.
  const sim = similarity(atual, fonte);
  return { categoria: 'divergente', similaridade: sim };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(CATECISMO_PATH)) {
    console.error(`ERRO FATAL: ${CATECISMO_PATH} não encontrado.`);
    process.exit(1);
  }
  if (!fs.existsSync(FONTE_PATH)) {
    console.error(`ERRO FATAL: ${FONTE_PATH} não encontrado. Rode antes scripts/scrape-cic-vaticano.mjs.`);
    process.exit(1);
  }

  const catecismo = JSON.parse(fs.readFileSync(CATECISMO_PATH, 'utf8'));
  const fonte = JSON.parse(fs.readFileSync(FONTE_PATH, 'utf8'));

  const catByNum = new Map(catecismo.paragrafos.map((p) => [p.numero, p]));
  const fonteByNum = new Map(fonte.paragrafos.map((p) => [p.numero, p]));

  const numerosFonte = [...fonteByNum.keys()].sort((a, b) => a - b);

  const categorias = {
    identico: [],
    leve: [],
    truncado: [],
    divergente: [],
  };
  const semCorrespondente = [];

  for (const numero of numerosFonte) {
    const pAtual = catByNum.get(numero);
    const pFonte = fonteByNum.get(numero);
    if (!pAtual) {
      semCorrespondente.push(numero);
      continue;
    }
    const resultado = classificar(numero, pAtual.texto || '', pFonte.texto || '');
    if (resultado.categoria === 'identico') {
      categorias.identico.push({ numero });
    } else if (resultado.categoria === 'leve') {
      categorias.leve.push({ numero, similaridade: round(resultado.similaridade) });
    } else if (resultado.categoria === 'truncado') {
      categorias.truncado.push({
        numero,
        tamanhoAtual: resultado.tamanhoAtual,
        tamanhoFonte: resultado.tamanhoFonte,
        crescimentoPercentual: round(
          ((resultado.tamanhoFonte - resultado.tamanhoAtual) / resultado.tamanhoAtual) * 100,
          1
        ),
      });
    } else {
      categorias.divergente.push({
        numero,
        similaridade: round(resultado.similaridade),
        tamanhoAtual: (pAtual.texto || '').length,
        tamanhoFonte: (pFonte.texto || '').length,
      });
    }
  }

  // Números presentes no catecismo.json mas ausentes na fonte (não deveria
  // acontecer, dado que ambos cobrem 1-2865, mas verificamos mesmo assim).
  const extrasNoCatecismo = catecismo.paragrafos
    .map((p) => p.numero)
    .filter((n) => !fonteByNum.has(n));

  categorias.truncado.sort((a, b) => a.numero - b.numero);
  categorias.leve.sort((a, b) => a.numero - b.numero);
  categorias.divergente.sort((a, b) => a.numero - b.numero);

  const totalComparado = numerosFonte.length;
  const somaCategorias =
    categorias.identico.length +
    categorias.leve.length +
    categorias.truncado.length +
    categorias.divergente.length +
    semCorrespondente.length;

  const piores15 = [...categorias.divergente]
    .sort((a, b) => a.similaridade - b.similaridade)
    .slice(0, 15)
    .map((d) => {
      const pAtual = catByNum.get(d.numero);
      const pFonte = fonteByNum.get(d.numero);
      return {
        numero: d.numero,
        similaridade: d.similaridade,
        trechoAtual: (pAtual.texto || '').slice(0, 140),
        trechoFonte: (pFonte.texto || '').slice(0, 140),
      };
    });

  const relatorio = {
    geradoEm: new Date().toISOString(),
    totalParagrafosFonte: fonte.paragrafos.length,
    totalParagrafosCatecismo: catecismo.paragrafos.length,
    totalComparado,
    contagens: {
      identico: categorias.identico.length,
      leve: categorias.leve.length,
      truncado: categorias.truncado.length,
      divergente: categorias.divergente.length,
      semCorrespondenteNoCatecismo: semCorrespondente.length,
    },
    somaBatendoComTotal: somaCategorias === totalComparado,
    extrasNoCatecismoAusentesNaFonte: extrasNoCatecismo,
    semCorrespondenteNoCatecismo: semCorrespondente,
    truncados: categorias.truncado,
    leves: categorias.leve,
    divergentes: categorias.divergente,
    identicos: categorias.identico.map((c) => c.numero),
    piores15Divergentes: piores15,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(relatorio, null, 2) + '\n', 'utf8');

  // -------------------------------------------------------------------
  // Resumo no console
  // -------------------------------------------------------------------
  console.log('=== Relatório de diferenças: catecismo.json vs fonte-vaticano.json ===\n');
  console.log(`Total de §§ na fonte:      ${fonte.paragrafos.length}`);
  console.log(`Total de §§ no catecismo:  ${catecismo.paragrafos.length}`);
  console.log(`Total comparado:           ${totalComparado}`);
  console.log(`Soma das categorias == total comparado? ${somaCategorias === totalComparado ? 'SIM' : 'NÃO — ' + somaCategorias}`);
  console.log('');
  console.log(`identico:    ${categorias.identico.length}`);
  console.log(`leve:        ${categorias.leve.length}`);
  console.log(`truncado:    ${categorias.truncado.length}`);
  console.log(`divergente:  ${categorias.divergente.length}`);
  if (semCorrespondente.length) console.log(`sem correspondente no catecismo.json: ${semCorrespondente.length} -> ${semCorrespondente.join(', ')}`);
  if (extrasNoCatecismo.length) console.log(`extras no catecismo.json ausentes na fonte: ${extrasNoCatecismo.length} -> ${extrasNoCatecismo.join(', ')}`);

  console.log(`\n--- §§ truncados (${categorias.truncado.length}) ---`);
  console.log(categorias.truncado.map((t) => t.numero).join(', ') || '(nenhum)');

  console.log(`\n--- 15 piores casos "divergente" (menor similaridade) ---`);
  for (const d of piores15) {
    console.log(`\n§${d.numero} (similaridade ${d.similaridade})`);
    console.log(`  atual:  ${JSON.stringify(d.trechoAtual)}`);
    console.log(`  fonte:  ${JSON.stringify(d.trechoFonte)}`);
  }

  console.log(`\nSaída: ${OUT_PATH}`);
}

function round(n, digits = 4) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

main();
