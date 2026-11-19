#!/usr/bin/env node
/**
 * baixa-oracoes-missa.mjs — orações próprias do dia (coleta, sobre as oferendas, depois da comunhão)
 * e antífonas de entrada e de comunhão, para o Modo Missa (/liturgiadiaria/missa/).
 *
 * Fonte: API aberta liturgia.up.railway.app (projeto Dancrf/liturgia-diaria), que reproduz o
 * Missal Romano na tradução da CNBB. O Modo Missa mostra o crédito "© Edições CNBB" junto de cada
 * oração (decisão do Daniel, 19/11/2026; pedido de autorização em docs/email-cnbb-modo-missa.md).
 *
 *   node scripts/baixa-oracoes-missa.mjs 2026-11-22 +14   # do dia indicado até 14 dias depois
 */
import { mkdir, writeFile, access } from 'node:fs/promises';

const [inicio = new Date().toISOString().slice(0, 10), mais = '+7'] = process.argv.slice(2);
const dias = parseInt(mais, 10) || 0;
const pasta = new URL('../data/liturgia-oracoes/', import.meta.url);
await mkdir(pasta, { recursive: true });

const [a, m, d] = inicio.split('-').map(Number);
for (let i = 0; i <= dias; i++) {
  const dt = new Date(Date.UTC(a, m - 1, d + i));
  const iso = dt.toISOString().slice(0, 10);
  const arq = new URL(`${iso}.json`, pasta);
  try { await access(arq); console.log(iso, 'já existe'); continue; } catch {}
  const url = `https://liturgia.up.railway.app/v2/?dia=${dt.getUTCDate()}&mes=${dt.getUTCMonth() + 1}&ano=${dt.getUTCFullYear()}`;
  const r = await fetch(url);
  if (!r.ok) { console.error(iso, 'falhou', r.status); continue; }
  const j = await r.json();
  const o = j.oracoes || {};
  const saida = {
    data: iso,
    fonte: 'Missal Romano, tradução da CNBB (via liturgia.up.railway.app)',
    coleta: o.coleta || null,
    oferendas: o.oferendas || null,
    comunhao: o.comunhao || null,
    antifonas: { entrada: j.antifonas?.entrada || null, comunhao: j.antifonas?.comunhao || null },
  };
  await writeFile(arq, JSON.stringify(saida, null, 1) + '\n');
  console.log(iso, 'ok');
}
