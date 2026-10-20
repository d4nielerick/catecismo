#!/usr/bin/env node
/**
 * scripts/catena-traducao.mjs — lista e grava traduções dos comentários da Catena Aurea.
 *
 *   node scripts/catena-traducao.mjs pendentes 2026-09-24 +30 [> pendentes.json]
 *       JSON com os itens sem `pt` das lectiones que os Evangelhos da janela usam:
 *       [{ ev, cap, lectio, i, autor, obra, latim }]
 *   node scripts/catena-traducao.mjs grava traducoes.json
 *       traducoes.json = [{ ev, cap, lectio, i, latim, pt }] — grava `pt` no item, com a marca
 *       { de: 'latim', por, em, revisado: false }. Recusa se o latim não for exatamente o do item
 *       (proteção contra tradução fora do lugar) ou se `pt` estiver vazio/curto demais.
 *       Campo opcional `por` no arquivo (ex.: "claude-fable-5-1 (sessão)").
 *
 *   node scripts/catena-traducao.mjs capitulo Mt 5 [--lotes pasta 15]
 *       Itens sem `pt` de um capítulo inteiro; com --lotes, grava pasta/lote-1.json, lote-2.json…
 *       (15 itens por lote) e imprime só a contagem.
 *   node scripts/catena-traducao.mjs confere Mt 5
 *       Itens ainda sem tradução e traduções suspeitas (tamanho fora de 0,7–2,5× o latim, aspas
 *       desbalanceadas, latim deixado no texto) — para retraduzir. Sai com código 1 se houver.
 *   node scripts/catena-traducao.mjs estado
 *       Capítulos baixados e itens traduzidos por Evangelho.
 *
 * A tradução em si é feita fora daqui (na sessão, com a skill liturgia-janela). Regras estão na
 * skill: literal e sóbria, sem acrescentar nem resumir; as palavras do Evangelho entre aspas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evangelhoDoDia, lectionesDoDia, arquivoDaCatena, diasDesde } from './lib-catena.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const ler = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const [modo, ...args] = process.argv.slice(2);


if (modo === 'pendentes') {
  const [de, mais] = args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '')) { console.error('uso: node scripts/catena-traducao.mjs pendentes AAAA-MM-DD +N'); process.exit(2); }
  const n = parseInt((mais || '+30').slice(1), 10);
  const vistos = new Set();
  const saida = [];
  for (const dt of diasDesde(de, n)) {
    const alvo = evangelhoDoDia(DADOS, dt)?.alvo;
    if (!alvo) continue;
    const arqCat = arquivoDaCatena(DADOS, alvo);
    if (!fs.existsSync(arqCat)) continue;
    for (const l of lectionesDoDia(ler(arqCat), alvo)) {
      l.itens.forEach((it, i) => {
        const chave = `${alvo.ev}/${alvo.cap}/${l.lectio}/${i}`;
        if (it.pt || vistos.has(chave)) return;
        vistos.add(chave);
        saida.push({ ev: alvo.ev, cap: +alvo.cap, lectio: l.lectio, i, autor: it.autor, obra: it.obra, latim: it.latim });
      });
    }
  }
  console.log(JSON.stringify(saida, null, 2));
  process.exit(0);
}

if (modo === 'grava') {
  const arq = args[0];
  if (!arq || !fs.existsSync(arq)) { console.error('uso: node scripts/catena-traducao.mjs grava traducoes.json'); process.exit(2); }
  const entrada = ler(arq);
  const lista = Array.isArray(entrada) ? entrada : entrada.itens;
  const por = (Array.isArray(entrada) ? null : entrada.por) || 'claude (sessão)';
  const em = new Date().toISOString().slice(0, 10);
  const porArquivo = new Map();
  const erros = [];
  for (const t of lista) {
    const chave = `${t.ev}/${String(t.cap).padStart(2, '0')}`;
    const arqCat = path.join(DADOS, 'catena', `${chave}.json`);
    if (!fs.existsSync(arqCat)) { erros.push(`${chave}: capítulo não existe`); continue; }
    const cat = porArquivo.get(arqCat) ?? porArquivo.set(arqCat, ler(arqCat)).get(arqCat);
    const item = cat.find(l => l.lectio === t.lectio)?.itens?.[t.i];
    if (!item) { erros.push(`${chave} l.${t.lectio} #${t.i}: item não existe`); continue; }
    if (item.latim !== t.latim) { erros.push(`${chave} l.${t.lectio} #${t.i}: o latim não bate com o do item`); continue; }
    const pt = String(t.pt || '').trim();
    if (pt.length < Math.min(20, item.latim.length * 0.4)) { erros.push(`${chave} l.${t.lectio} #${t.i}: tradução vazia ou curta demais`); continue; }
    item.pt = pt;
    item.traducao = { de: 'latim', por, em, revisado: false };
  }
  if (erros.length) { console.error(`✗ ${erros.length} problema(s):\n  ${erros.join('\n  ')}`); process.exit(1); }
  for (const [p, cat] of porArquivo) fs.writeFileSync(p, JSON.stringify(cat, null, 2) + '\n');
  console.log(`✅ ${lista.length} tradução(ões) gravada(s) em ${[...porArquivo.keys()].map(p => path.relative(RAIZ, p)).join(', ')}`);
  process.exit(0);
}

if (modo === 'capitulo') {
  const [ev, capA, flag, pasta, porLote = '15'] = args;
  const arqCat = path.join(DADOS, 'catena', ev || '', `${String(capA || '').padStart(2, '0')}.json`);
  if (!/^(Mt|Mc|Lc|Jo)$/.test(ev || '') || !fs.existsSync(arqCat)) { console.error('uso: node scripts/catena-traducao.mjs capitulo <Mt|Mc|Lc|Jo> <cap> [--lotes pasta 15] (o capítulo precisa estar baixado)'); process.exit(2); }
  const saida = [];
  for (const l of ler(arqCat)) l.itens.forEach((it, i) => { if (!it.pt) saida.push({ ev, cap: +capA, lectio: l.lectio, i, autor: it.autor, obra: it.obra, latim: it.latim }); });
  if (flag !== '--lotes') { console.log(JSON.stringify(saida, null, 2)); process.exit(0); }
  fs.mkdirSync(pasta, { recursive: true });
  const n = parseInt(porLote, 10);
  let k = 0;
  for (let a = 0; a < saida.length; a += n) fs.writeFileSync(path.join(pasta, `lote-${++k}.json`), JSON.stringify(saida.slice(a, a + n), null, 2));
  console.log(`${ev} ${capA}: ${saida.length} itens pendentes em ${k} lote(s) em ${pasta}`);
  process.exit(0);
}

if (modo === 'confere') {
  const [ev, capA] = args;
  const arqCat = path.join(DADOS, 'catena', ev || '', `${String(capA || '').padStart(2, '0')}.json`);
  if (!fs.existsSync(arqCat)) { console.error('uso: node scripts/catena-traducao.mjs confere <Ev> <cap>'); process.exit(2); }
  const problemas = [];
  let total = 0;
  for (const l of ler(arqCat)) l.itens.forEach((it, i) => {
    total++;
    const onde = `l.${l.lectio} #${i}`;
    if (!it.pt) return problemas.push(`${onde}: sem tradução`);
    const r = it.pt.length / Math.max(1, it.latim.length);
    if (it.latim.length > 60 && (r < 0.7 || r > 2.5)) problemas.push(`${onde}: tamanho suspeito (${r.toFixed(2)}× o latim)`);
    if ((it.pt.match(/"/g) || []).length % 2) problemas.push(`${onde}: aspas desbalanceadas`);
    if (/\b(quod|autem|enim|quia|ergo|vero|sicut|dicitur)\b/i.test(it.pt)) problemas.push(`${onde}: sobrou latim no texto`);
  });
  console.log(`${ev} ${capA}: ${total} itens, ${problemas.length} problema(s)${problemas.length ? '\n  ' + problemas.join('\n  ') : ''}`);
  process.exit(problemas.length ? 1 : 0);
}

if (modo === 'estado') {
  const TOTAL = { Mt: 28, Mc: 16, Lc: 24, Jo: 21 };
  for (const [ev, caps] of Object.entries(TOTAL)) {
    const pasta = path.join(DADOS, 'catena', ev);
    const arqs = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter(f => f.endsWith('.json')) : [];
    let n = 0, t = 0;
    const completos = [];
    for (const f of arqs) {
      let nn = 0, tt = 0;
      for (const l of ler(path.join(pasta, f))) for (const it of l.itens) { nn++; if (it.pt) tt++; }
      n += nn; t += tt; if (nn && nn === tt) completos.push(+f.slice(0, 2));
    }
    console.log(`${ev}: ${arqs.length}/${caps} capítulos baixados · ${t}/${n} itens traduzidos · completos: ${completos.sort((a, b) => a - b).join(', ') || '—'}`);
  }
  process.exit(0);
}

console.error('uso: node scripts/catena-traducao.mjs pendentes AAAA-MM-DD +N | capitulo <Ev> <cap> [--lotes pasta N] | grava traducoes.json | confere <Ev> <cap> | estado');
process.exit(2);
