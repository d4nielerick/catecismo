#!/usr/bin/env node
/**
 * scripts/scrape-catena.mjs — Catena Aurea de São Tomás (latim, domínio público) a partir do
 * Corpus Thomisticum, um capítulo de Evangelho por vez.
 *
 *   node scripts/scrape-catena.mjs Lc 9        # baixa e estrutura Lc 9
 *   node scripts/scrape-catena.mjs Lc 9 --local   # só reestrutura a partir do HTML já salvo
 *
 * Saída:
 *   data/catena-fonte/<Ev>/<cap>.html   HTML cru, intocado (a "fonte" — como data/liturgia-fonte/)
 *   data/catena/<Ev>/<cap>.json         [{ lectio, versos, itens: [{ autor, obra, latim, pt? }] }]
 *
 * A fonte organiza cada capítulo em "lectiones" (perícopes) e, dentro de cada uma, os comentários
 * dos Padres na forma "Autor. <I>texto</I>." — o nome do autor (às vezes com a obra: "Chrysostomus
 * in Matthaeum", "Augustinus de Cons. Evang.") vem fora do itálico e o comentário, dentro. Os
 * intervalos de versículos não estão na fonte: vêm de data/catena-mapa/<Ev>.json, curado à mão.
 * A tradução (`pt`) é acrescentada depois por outro passo e é preservada aqui quando existe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGLA = { Mt: 'cmt', Mc: 'cmc', Lc: 'clc', Jo: 'cio' };   // nomes dos arquivos no Corpus Thomisticum

const [ev, capArg, ...flags] = process.argv.slice(2);
if (!SIGLA[ev] || !/^\d+$/.test(capArg || '')) {
  console.error('uso: node scripts/scrape-catena.mjs <Mt|Mc|Lc|Jo> <capítulo> [--local]');
  process.exit(2);
}
const cap = String(parseInt(capArg, 10));
const cap2 = cap.padStart(2, '0');
const url = `https://www.corpusthomisticum.org/${SIGLA[ev]}${cap2}.html`;
const fonte = path.join(RAIZ, 'data', 'catena-fonte', ev, `${cap2}.html`);
const saida = path.join(RAIZ, 'data', 'catena', ev, `${cap2}.json`);
const mapaArq = path.join(RAIZ, 'data', 'catena-mapa', `${ev}.json`);

let html;
if (flags.includes('--local') && fs.existsSync(fonte)) {
  html = fs.readFileSync(fonte, 'utf8');
} else {
  const r = await fetch(url);
  if (!r.ok) { console.error(`${url}: HTTP ${r.status}`); process.exit(1); }
  html = await r.text();
  fs.mkdirSync(path.dirname(fonte), { recursive: true });
  fs.writeFileSync(fonte, html);
}

// ── Estrutura ────────────────────────────────────────────────────────────────
// O arquivo de um capítulo às vezes traz o capítulo seguinte junto (Lc 9 + 10): fica só o pedido.
const iniCap = html.indexOf(`<DIV CLASS="C">Caput ${cap}</DIV>`);
if (iniCap < 0) { console.error(`Caput ${cap} não encontrado em ${url}`); process.exit(1); }
const fimCap = html.indexOf('<DIV CLASS="C">Caput ', iniCap + 10);
const corpo = html.slice(iniCap, fimCap < 0 ? undefined : fimCap);

const limpar = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const mapa = fs.existsSync(mapaArq) ? JSON.parse(fs.readFileSync(mapaArq, 'utf8')) : {};
const anterior = fs.existsSync(saida) ? JSON.parse(fs.readFileSync(saida, 'utf8')) : [];

const lectiones = [];
const RE_LECTIO = /<DIV CLASS="D">Lectio (\d+)<\/DIV>\s*<P TITLE="[^"]*">([\s\S]*?)<\/P>/g;
let m;
while ((m = RE_LECTIO.exec(corpo)) !== null) {
  const lectio = parseInt(m[1], 10);
  const p = m[2].replace(/<A NAME="\d+"><SPAN CLASS="ref">[^<]*<\/SPAN><\/A>/, '');
  const itens = [];
  const RE_ITEM = /([^<>]*?)<I>([\s\S]*?)<\/I>/g;
  let it;
  while ((it = RE_ITEM.exec(p)) !== null) {
    const rotulo = limpar(it[1]).replace(/^[.\s]+/, '').replace(/\.$/, '');
    const latim = limpar(it[2]);
    if (!latim) continue;
    // "Chrysostomus in Matthaeum" → autor "Chrysostomus", obra "in Matthaeum"
    const [, autor, obra] = rotulo.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?:[ .]+(.*))?$/) || [null, rotulo, ''];
    itens.push({ autor: (autor || rotulo).trim(), obra: (obra || '').trim(), latim });
  }
  if (!itens.length) { console.error(`lectio ${lectio}: nenhum item reconhecido`); process.exit(1); }
  const versos = mapa[cap]?.[String(lectio)] ?? null;
  // a tradução já feita fica, desde que o latim não tenha mudado
  const velha = anterior.find(l => l.lectio === lectio);
  itens.forEach((item, i) => {
    const v = velha?.itens?.[i];
    if (v?.pt && v.latim === item.latim) { item.pt = v.pt; if (v.traducao) item.traducao = v.traducao; }
  });
  lectiones.push({ lectio, versos, itens });
}
if (!lectiones.length) { console.error('nenhuma lectio encontrada'); process.exit(1); }

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(lectiones, null, 2) + '\n');
const semVersos = lectiones.filter(l => !l.versos).map(l => l.lectio);
console.log(`${ev} ${cap}: ${lectiones.length} lectiones, ${lectiones.reduce((n, l) => n + l.itens.length, 0)} itens → ${path.relative(RAIZ, saida)}`);
if (semVersos.length) console.log(`  sem intervalo de versículos no mapa (data/catena-mapa/${ev}.json): lectio ${semVersos.join(', ')}`);
