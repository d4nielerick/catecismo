/**
 * normalize.js
 * Converte o JSON bruto (catecismo_final_corrigido.json) para a estrutura
 * esperada pelo buscador: { paragrafos: [ { numero, texto, parte, secao, capitulo, artigo } ] }
 *
 * Uso: node normalize.js
 * Saída: data/catecismo.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUT  = join(__dirname, 'assets', 'catecismo_final_corrigido.json');
const OUTPUT = join(__dirname, 'data', 'catecismo.json');

const raw = JSON.parse(readFileSync(INPUT, 'utf-8'));

// Strips leading "N. " prefix from paragraph text
function stripLeadingNumber(text) {
  return text.replace(/^\d+\.\s*/, '').trim();
}

// Removes duplicated suffix artefact in some part titles
// e.g. "TERCEIRA PARTE: A VIDA EM CRISTOA VIDA EM CRISTO" → "TERCEIRA PARTE: A VIDA EM CRISTO"
function dedupSuffix(s) {
  for (let len = Math.floor(s.length / 2); len >= 3; len--) {
    const suffix = s.slice(-len);
    if (s.slice(0, -len).endsWith(suffix)) {
      return s.slice(0, s.length - len);
    }
  }
  return s;
}

// Paragraphs §1–§25 are the Prólogo of the Catechism. The raw JSON has a
// table-of-contents block at the top that emits out-of-place Parte/Seção
// entries before the real content starts; those entries would corrupt the
// context of Prologue paragraphs. The fix: always track structural state
// (so the real Part 1 context is correct by the time §26 is reached), but
// override with "PRÓLOGO" when outputting §1–§25.
const PROLOGO_MAX_NUM = 25;

let currentParte    = '';
let currentSecao    = '';
let currentCapitulo = '';
let currentArtigo   = '';

const paragrafos = [];
const seen = new Set(); // deduplicate by paragraph number

for (const item of raw) {
  switch (item.Tipo) {
    case 'Parte':
      currentParte    = dedupSuffix(item.text.trim());
      currentSecao    = '';
      currentCapitulo = '';
      currentArtigo   = '';
      break;

    case 'Seção':
      currentSecao    = item.text.trim();
      currentCapitulo = '';
      currentArtigo   = '';
      break;

    case 'Capítulo':
      currentCapitulo = item.text.trim();
      currentArtigo   = '';
      break;

    case 'Artigo':
      currentArtigo = item.text.trim();
      break;

    case 'Parágrafo': {
      const numero = parseInt(item.Ponto, 10);
      if (!Number.isFinite(numero)) break;

      // Skip duplicate numbers (footnotes and mis-tagged items reuse low numbers;
      // genuine source-data numbering errors are handled by keeping the first hit)
      if (seen.has(numero)) break;
      seen.add(numero);

      const ehPrologo = numero <= PROLOGO_MAX_NUM;

      paragrafos.push({
        numero,
        texto:    stripLeadingNumber(item.text),
        parte:    ehPrologo ? 'PRÓLOGO'    : currentParte,
        secao:    ehPrologo ? ''           : currentSecao,
        capitulo: ehPrologo ? ''           : currentCapitulo,
        artigo:   ehPrologo ? ''           : currentArtigo,
      });
      break;
    }

    default:
      break;
  }
}

// Sort by paragraph number
paragrafos.sort((a, b) => a.numero - b.numero);

// ── Sanity report ────────────────────────────────────────────────────────────
const nums     = paragrafos.map(p => p.numero);
const min      = Math.min(...nums);
const max      = Math.max(...nums);
const noParted = paragrafos.filter(p => !p.parte);

console.log(`Parágrafos normalizados : ${paragrafos.length}`);
console.log(`Intervalo               : §${min} – §${max}`);
console.log(`Sem parte               : ${noParted.length}`);

const partes = [...new Set(paragrafos.map(p => p.parte))];
console.log(`\nPartes detectadas (${partes.length}):`);
partes.forEach(p => {
  const count = paragrafos.filter(x => x.parte === p).length;
  console.log(`  ${count.toString().padStart(4)} §  →  ${p}`);
});

// ── Write output ─────────────────────────────────────────────────────────────
mkdirSync(join(__dirname, 'data'), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify({ paragrafos }, null, 2), 'utf-8');

const sizeKB = (JSON.stringify({ paragrafos }).length / 1024).toFixed(1);
console.log(`\nSalvo em: ${OUTPUT}  (${sizeKB} KB)`);
