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

console.error('uso: node scripts/catena-traducao.mjs pendentes AAAA-MM-DD +N | grava traducoes.json');
process.exit(2);
