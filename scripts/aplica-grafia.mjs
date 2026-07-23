/**
 * scripts/aplica-grafia.mjs — RECONSTRÓI data/catecismo.json a partir da fonte
 * oficial + a adaptação/correção ortográfica, de forma idêntica ao verificador:
 *   data/catecismo.json.texto[N] = ajustes( pares( fonte-vaticano.texto[N] ) )
 * mantendo os metadados (parte/secao/capitulo/artigo) do catecismo.json.
 *
 * Fontes:
 *   data/grafia-ptbr-pares.json — pares palavra-inteira, caixa preservada
 *   data/grafia-ajustes.json    — ajustes por ocorrência (concordância/errata/OCR)
 *
 * Trava determinística: o vocabulário só pode perder palavras "de" e ganhar
 * palavras "para" (dos dois arquivos), relativo à FONTE. Qualquer outra mudança
 * aborta sem gravar. Reconstruir a partir da fonte torna o resultado idêntico ao
 * que verifica-integridade.mjs reconstrói (reprodutibilidade garantida).
 */
import fs from 'node:fs';
import { aplicaPares, aplicaAjustes, vocabulario } from './lib-grafia.mjs';

const fonte   = JSON.parse(fs.readFileSync('data/fonte-vaticano.json', 'utf8'));
const pares   = JSON.parse(fs.readFileSync('data/grafia-ptbr-pares.json', 'utf8'));
const ajustes = JSON.parse(fs.readFileSync('data/grafia-ajustes.json', 'utf8'));
const cat     = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));

// base = cópia dos textos da fonte
const base = fonte.paragrafos.map(p => ({ numero: p.numero, texto: p.texto }));
const vocabFonte = vocabulario(base);

const contagem = aplicaPares(base, pares);
aplicaAjustes(base, ajustes);

// trava de vocabulário (relativo à fonte)
const depois = vocabulario(base);
const tokens = (s) => s.toLowerCase().match(/[a-záéíóúâêôãõàçü-]+/g) || [];
const permPerder = new Set([...pares.map(p => p.de.toLowerCase()), ...ajustes.flatMap(a => tokens(a.de))]);
const permGanhar = new Set([...pares.map(p => p.para.toLowerCase()), ...ajustes.flatMap(a => tokens(a.para))]);
const perdidasFora = [...vocabFonte].filter(w => !depois.has(w) && !permPerder.has(w));
const ganhasFora   = [...depois].filter(w => !vocabFonte.has(w) && !permGanhar.has(w));
if (perdidasFora.length || ganhasFora.length) {
  console.error('TRAVA: mudanças de vocabulário fora da whitelist!');
  console.error(' perdidas:', perdidasFora.slice(0, 30));
  console.error(' ganhas:', ganhasFora.slice(0, 30));
  process.exit(1);
}

// grava os textos reconstruídos no catecismo.json (preservando metadados)
const novoTexto = new Map(base.map(p => [p.numero, p.texto]));
for (const p of cat.paragrafos) {
  const t = novoTexto.get(p.numero);
  if (t === undefined) { console.error(`§${p.numero} sem correspondente na fonte`); process.exit(1); }
  p.texto = t;
}
fs.writeFileSync('data/catecismo.json', JSON.stringify(cat));

const total = [...contagem.values()].reduce((a, b) => a + b, 0);
console.log(`reconstruído da fonte: ${total} substituições por pares (${contagem.size} ativos) + ${ajustes.length} ajustes.`);
for (const [de, n] of [...contagem].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`  ${de} → ${pares.find(p => p.de === de).para}: ${n}×`);
