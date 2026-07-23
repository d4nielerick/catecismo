/**
 * scripts/verifica-notas.mjs — guard-rail de CI das notas de rodapé.
 *
 * 1. Reprodutibilidade: data/notas.json == buildNotas(fonte-notas-vaticano + catecismo).
 *    (edição manual de notas.json não registrada na fonte faz falhar.)
 * 2. Cobertura mínima: % de marcadores "(N)" no texto com nota não pode cair
 *    abaixo do piso (regressão).
 */
import fs from 'node:fs';
import { buildNotas } from './build-notas.mjs';

const PISO_COBERTURA = 99.0; // % (atual ~99.4)

const fonte = JSON.parse(fs.readFileSync('data/fonte-notas-vaticano.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));
const commit = JSON.parse(fs.readFileSync('data/notas.json', 'utf8'));

const { notas, stats } = buildNotas(fonte, cat);

if (JSON.stringify(notas) !== JSON.stringify(commit)) {
  console.error('✗ data/notas.json diverge da reconstrução (fonte-notas + catecismo). Rode build-notas.mjs.');
  process.exit(1);
}

const pct = 100 * stats.resolvidos / stats.totMarcadores;
if (pct < PISO_COBERTURA) {
  console.error(`✗ cobertura de notas ${pct.toFixed(1)}% abaixo do piso ${PISO_COBERTURA}%`);
  process.exit(1);
}

console.log(`✅ notas OK: reprodutível e ${stats.resolvidos}/${stats.totMarcadores} marcadores resolvidos (${pct.toFixed(1)}%).`);
console.log(`   ${stats.marcadoresSemNota.length} marcadores sem nota (OCR danificado na fonte): ${stats.marcadoresSemNota.join(' ')}`);
