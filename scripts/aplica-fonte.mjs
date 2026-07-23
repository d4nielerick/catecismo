/**
 * scripts/aplica-fonte.mjs — substitui o texto de cada § do catecismo.json
 * pelo texto íntegro de data/fonte-vaticano.json (scrape validado de
 * vatican.va), preservando os metadados (parte/secao/capitulo/artigo).
 * Idempotente. Falha se algum § não tiver correspondente na fonte.
 */
import fs from 'node:fs';

const cat   = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));
const fonte = JSON.parse(fs.readFileSync('data/fonte-vaticano.json', 'utf8'));
const mapa  = new Map(fonte.paragrafos.map(p => [p.numero, p.texto]));

let alterados = 0;
for (const p of cat.paragrafos) {
  const novo = mapa.get(p.numero);
  if (!novo) { console.error(`§${p.numero} sem correspondente na fonte`); process.exit(1); }
  if (p.texto !== novo) { p.texto = novo; alterados++; }
}
fs.writeFileSync('data/catecismo.json', JSON.stringify(cat));
console.log(`${alterados} §§ atualizados de ${cat.paragrafos.length}`);
