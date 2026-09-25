#!/usr/bin/env node
/**
 * scripts/catena-mapa.mjs — marca o intervalo de versículos de lectiones da Catena Aurea.
 *
 *   node scripts/catena-mapa.mjs Lc 9 6=28-36 7=37-43 8=44-45
 *
 * Grava em data/catena-mapa/<Ev>.json e atualiza `versos` em data/catena/<Ev>/<cap>.json. Falha
 * se o intervalo não fizer sentido (a < 1, b < a, salto para trás em relação à lectio anterior).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [ev, capArg, ...pares] = process.argv.slice(2);
if (!/^(Mt|Mc|Lc|Jo)$/.test(ev || '') || !/^\d+$/.test(capArg || '') || !pares.length) {
  console.error('uso: node scripts/catena-mapa.mjs <Mt|Mc|Lc|Jo> <cap> <lectio>=<a>-<b> …');
  process.exit(2);
}
const cap = String(parseInt(capArg, 10));
const mapaArq = path.join(RAIZ, 'data', 'catena-mapa', `${ev}.json`);
const catArq = path.join(RAIZ, 'data', 'catena', ev, `${cap.padStart(2, '0')}.json`);
if (!fs.existsSync(catArq)) { console.error(`${path.relative(RAIZ, catArq)} não existe: rode node scripts/scrape-catena.mjs ${ev} ${cap}`); process.exit(1); }

const mapa = fs.existsSync(mapaArq) ? JSON.parse(fs.readFileSync(mapaArq, 'utf8')) : { _: 'Catena Aurea (Corpus Thomisticum): intervalo de versículos de cada lectio, por capítulo. Curado à mão a partir dos lemas; a fonte não traz os números.' };
mapa[cap] ??= {};
const catena = JSON.parse(fs.readFileSync(catArq, 'utf8'));
for (const par of pares) {
  const m = par.match(/^(\d+)=(\d+)-(\d+)$/);
  if (!m) { console.error(`"${par}": use <lectio>=<a>-<b>`); process.exit(1); }
  const [, l, a, b] = m.map(Number);
  const item = catena.find(x => x.lectio === l);
  if (!item) { console.error(`lectio ${l} não existe em ${ev} ${cap}`); process.exit(1); }
  if (a < 1 || b < a) { console.error(`lectio ${l}: intervalo ${a}-${b} inválido`); process.exit(1); }
  const antes = mapa[cap][String(l - 1)];
  if (antes && a < antes[1]) { console.error(`lectio ${l}: começa em ${a}, antes do fim da lectio ${l - 1} (${antes[1]})`); process.exit(1); }
  mapa[cap][String(l)] = [a, b];
  item.versos = [a, b];
}
// capítulos e lectiones em ordem numérica
const ordenado = { _: mapa._ };
for (const c of Object.keys(mapa).filter(k => k !== '_').sort((x, y) => +x - +y)) {
  ordenado[c] = Object.fromEntries(Object.entries(mapa[c]).sort((x, y) => +x[0] - +y[0]));
}
fs.writeFileSync(mapaArq, JSON.stringify(ordenado, null, 2) + '\n');
fs.writeFileSync(catArq, JSON.stringify(catena, null, 2) + '\n');
const faltam = catena.filter(x => !x.versos).map(x => x.lectio);
console.log(`${ev} ${cap}: ${pares.length} lectio(nes) mapeada(s)${faltam.length ? `; ainda sem mapa: ${faltam.join(', ')}` : '; capítulo completo'}`);
