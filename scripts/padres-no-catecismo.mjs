#!/usr/bin/env node
/**
 * scripts/padres-no-catecismo.mjs — para a curadoria: lista, para cada Padre que comenta o Evangelho
 * do dia (destaques primeiro), os §§ do Catecismo cujas notas o citam, com a frase em que aparece.
 *
 *   node scripts/padres-no-catecismo.mjs 2026-11-01
 *
 * Escolha (lendo!) no máximo 1–2 §§ que tratem do mesmo assunto do comentário de hoje e grave com
 * grava-curadoria.mjs (`padres: [{ autor, numero }]`). Se nenhum casa de verdade, não grave nada:
 * Padre citado pelo Catecismo sobre outro assunto confunde mais do que ajuda.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { citacoesDoPadre } from './lib-cic.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const ler = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const dt = process.argv[2];
const com = ler(path.join(DADOS, 'liturgia-comentario', `${dt}.json`));
const ref = com.catena?.[0];
if (!ref) { console.log('sem Catena neste dia'); process.exit(0); }
const cap = ler(path.join(DADOS, 'catena', ref.ev, `${String(ref.cap).padStart(2, '0')}.json`));
const lects = new Set(com.catena.map(c => c.lectio));
const itens = cap.filter(l => lects.has(l.lectio)).flatMap(l => l.itens.map((it, i) => ({ ...it, lectio: l.lectio, i }))).filter(it => it.pt);
const dest = new Set((com.destaques || []).map(d => `${d.lectio}/${d.i}`));
const autores = [...new Set([...itens.filter(it => dest.has(`${it.lectio}/${it.i}`)), ...itens].map(it => it.autor))];
const notas = ler(path.join(DADOS, 'notas.json'));
const paragrafos = new Map(ler(path.join(DADOS, 'catecismo.json')).paragrafos.map(p => [p.numero, p.texto]));
const nomes = ler(path.join(DADOS, 'catena-autores.json'));
console.log(`${dt} · ${com.evangelho} · tema: ${com.tema || '—'}\n`);
for (const autor of autores) {
  const cs = citacoesDoPadre(autor, notas, paragrafos);
  if (!cs.length) continue;
  const hoje = itens.filter(it => it.autor === autor);
  console.log(`== ${nomes[autor]?.nome || autor} (${autor})${hoje.some(it => dest.has(`${it.lectio}/${it.i}`)) ? ' — em destaque' : ''}`);
  console.log(`   hoje: ${hoje.map(it => it.pt).join(' ').slice(0, 400)}…`);
  for (const c of cs) console.log(`   § ${c.numero}: ${c.frase.slice(0, 180)}  [${c.nota.slice(0, 70)}]`);
  console.log();
}
