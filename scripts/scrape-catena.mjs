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
 * Às vezes a fonte fecha um capítulo com a perícope do seguinte (o "Caput 5" de Mt vai até a
 * esmola, Mt 6,1-4): `_capitulo` no mapa ({ "5": { "22": "6" } }) leva a lectio para o capítulo
 * certo, que a lê da fonte crua do anterior e a põe antes das suas (o número da lectio não muda).
 * A tradução (`pt`) é acrescentada depois por outro passo e é preservada aqui quando existe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGLA = { Mt: 'cmt', Mc: 'cmc', Lc: 'clc', Jo: 'cjo' };   // nomes dos arquivos no Corpus Thomisticum (cio é Super Iob!)

const [ev, capArg, ...flags] = process.argv.slice(2);
if (!SIGLA[ev] || !/^\d+$/.test(capArg || '')) {
  console.error('uso: node scripts/scrape-catena.mjs <Mt|Mc|Lc|Jo> <capítulo> [--local]');
  process.exit(2);
}
const cap = String(parseInt(capArg, 10));
const cap2 = cap.padStart(2, '0');
const fonte = path.join(RAIZ, 'data', 'catena-fonte', ev, `${cap2}.html`);
const saida = path.join(RAIZ, 'data', 'catena', ev, `${cap2}.json`);
const mapaArq = path.join(RAIZ, 'data', 'catena-mapa', `${ev}.json`);

// No Corpus Thomisticum um arquivo traz vários capítulos (clc09.html = Lc 9–13; cmt17 = Mt 17–20);
// o nome é o do primeiro capítulo. Sem índice confiável, tenta o arquivo do capítulo pedido e
// desce até achar um que exista e contenha "Caput N". Lc 1–2 estão em clc012 (clc011 é só o cap. 1).
const ARQUIVOS_ESPECIAIS = { Lc: { 1: 'clc012', 2: 'clc012' } };
async function baixarCapitulo() {
  const tentativas = [];
  if (ARQUIVOS_ESPECIAIS[ev]?.[+cap]) tentativas.push(ARQUIVOS_ESPECIAIS[ev][+cap]);
  for (let c = +cap; c >= 1; c--) tentativas.push(`${SIGLA[ev]}${String(c).padStart(2, '0')}`);
  for (const nome of tentativas) {
    const u = `https://www.corpusthomisticum.org/${nome}.html`;
    const r = await fetch(u);
    if (!r.ok) continue;
    const t = await r.text();
    if (t.includes(`<DIV CLASS="C">Caput ${cap}</DIV>`)) return { url: u, html: t };
  }
  return null;
}

let html, url = `https://www.corpusthomisticum.org/${SIGLA[ev]}${cap2}.html`;
if (flags.includes('--local') && fs.existsSync(fonte)) {
  html = fs.readFileSync(fonte, 'utf8');
} else {
  const achado = await baixarCapitulo();
  if (!achado) { console.error(`${ev} ${cap}: nenhum arquivo do Corpus Thomisticum com esse capítulo`); process.exit(1); }
  ({ url, html } = achado);
  // guarda só o capítulo pedido, intocado (o arquivo da fonte traz vários)
  const ini = html.indexOf(`<DIV CLASS="C">Caput ${cap}</DIV>`);
  const fim = html.indexOf('<DIV CLASS="C">Caput ', ini + 10);
  html = html.slice(ini, fim < 0 ? undefined : fim);
  fs.mkdirSync(path.dirname(fonte), { recursive: true });
  fs.writeFileSync(fonte, `<!-- ${url} -->\n${html}`);
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
const mudancas = mapa._capitulo || {};   // { capítulo da fonte: { lectio: capítulo de destino } }

// lectiones de outros capítulos da fonte que pertencem a este, e a tradução que já tinham lá
const vindas = [];
for (const [de, lects] of Object.entries(mudancas)) {
  const aqui = Object.keys(lects).filter(l => lects[l] === cap).map(Number);
  if (!aqui.length) continue;
  const f = path.join(RAIZ, 'data', 'catena-fonte', ev, `${de.padStart(2, '0')}.html`);
  if (!fs.existsSync(f)) { console.error(`${ev} ${cap}: falta a fonte crua de ${ev} ${de} (rode node scripts/scrape-catena.mjs ${ev} ${de})`); process.exit(1); }
  const h = fs.readFileSync(f, 'utf8');
  const i0 = h.indexOf(`<DIV CLASS="C">Caput ${de}</DIV>`), i1 = h.indexOf('<DIV CLASS="C">Caput ', i0 + 10);
  const jsonDe = path.join(RAIZ, 'data', 'catena', ev, `${de.padStart(2, '0')}.json`);
  const traducoesDe = fs.existsSync(jsonDe) ? JSON.parse(fs.readFileSync(jsonDe, 'utf8')) : [];
  vindas.push({ corpo: h.slice(i0, i1 < 0 ? undefined : i1), so: aqui, traducoes: traducoesDe });
}

const lectiones = [];
const RE_LECTIO = /<DIV CLASS="D">Lectio (\d+)<\/DIV>\s*<P TITLE="[^"]*">([\s\S]*?)<\/P>/g;
for (const { corpo: c, so, traducoes } of [...vindas, { corpo, so: null, traducoes: [] }]) {
let m;
RE_LECTIO.lastIndex = 0;
while ((m = RE_LECTIO.exec(c)) !== null) {
  const lectio = parseInt(m[1], 10);
  if (so ? !so.includes(lectio) : mudancas[cap]?.[String(lectio)]) continue;
  const p = m[2].replace(/<A NAME="\d+"><SPAN CLASS="ref">[^<]*<\/SPAN><\/A>/, '');
  const itens = [];
  const RE_ITEM = /([^<>]*?)<I>([\s\S]*?)<\/I>/g;
  let it;
  while ((it = RE_ITEM.exec(p)) !== null) {
    // o rótulo é só o que vem depois do último "et cetera." (resto de lema fora do itálico)
    const rotulo = limpar(it[1]).replace(/^.*et cetera\.?\s*/, '').replace(/^[.,;:\s]+/, '').replace(/[.:]$/, '');
    const latim = limpar(it[2]);
    if (!latim) continue;
    // "Chrysostomus in Matthaeum" → autor "Chrysostomus", obra "in Matthaeum"
    const [, autor, obra] = rotulo.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?:[ .]+(.*))?$/) || [null, rotulo, ''];
    itens.push({ autor: (autor || rotulo).trim(), obra: (obra || '').trim(), latim });
  }
  if (!itens.length) { console.error(`lectio ${lectio}: nenhum item reconhecido`); process.exit(1); }
  const versos = mapa[cap]?.[String(lectio)] ?? null;
  // a tradução já feita fica, desde que o latim não tenha mudado
  const velha = anterior.find(l => l.lectio === lectio) ?? traducoes.find(l => l.lectio === lectio);
  itens.forEach((item, i) => {
    const v = velha?.itens?.[i];
    if (v?.pt && v.latim === item.latim) { item.pt = v.pt; if (v.traducao) item.traducao = v.traducao; }
  });
  lectiones.push({ lectio, versos, itens });
}
}
if (!lectiones.length) { console.error('nenhuma lectio encontrada'); process.exit(1); }

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(lectiones, null, 2) + '\n');
const semVersos = lectiones.filter(l => !l.versos).map(l => l.lectio);
console.log(`${ev} ${cap}: ${lectiones.length} lectiones, ${lectiones.reduce((n, l) => n + l.itens.length, 0)} itens → ${path.relative(RAIZ, saida)}`);
if (semVersos.length) console.log(`  sem intervalo de versículos no mapa (data/catena-mapa/${ev}.json): lectio ${semVersos.join(', ')}`);
