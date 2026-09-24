/**
 * scripts/grava-trechos.mjs — grava os trechos dos cards de compartilhar em
 * data/liturgia-trechos/AAAA-MM-DD.json.
 *
 *   node scripts/grava-trechos.mjs lote.json              # confere e grava
 *   node scripts/grava-trechos.mjs lote.json --conferir   # só confere (não grava nada)
 *
 * lote.json: { "AAAA-MM-DD": { "trechos": { "<referência>": "<trecho>" }, "imagens": { … } }, … }
 * (a referência é a da leitura no dia, como em data/liturgia/AAAA-MM-DD.json; "imagens" é opcional).
 *
 * Cada arquivo guarda também as referências das leituras do dia: se elas mudarem, os trechos deixam
 * de aparecer e verifica-liturgia.mjs aponta. Os trechos são escolhidos fora do site (Claude nesta
 * máquina) e revisados; nada chama IA em tempo de execução. Não grava nada se algum dia tiver erro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenciasDoDia } from '../liturgiadiaria/render.mjs';
import { conferirTrechos } from './lib-trechos.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'data', 'liturgia-trechos');
const soConferir = process.argv.includes('--conferir');

const lote = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ids = new Set(JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'cards-imagens.json'), 'utf8')).imagens.map(i => i.id));

const prontos = [];
const erros = [];
for (const [data, { trechos, imagens }] of Object.entries(lote).sort()) {
  const arq = path.join(RAIZ, 'data', 'liturgia', `${data}.json`);
  if (!fs.existsSync(arq)) { erros.push(`${data}: dia sem leituras`); continue; }
  const dia = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const limpos = Object.fromEntries(Object.entries(trechos || {}).map(([r, t]) => [r, t.replace(/\s+/g, ' ').trim()]));
  const t = { data, leituras: referenciasDoDia(dia), trechos: limpos, ...(imagens ? { imagens } : {}) };
  for (const e of conferirTrechos(t, dia, ids)) erros.push(`${data} ${e}`);
  prontos.push(t);
}

if (erros.length) {
  console.error(`✗ ${erros.length} problema(s) — nada foi gravado:`);
  console.error(erros.map(e => `  ${e}`).join('\n'));
  process.exit(1);
}
if (soConferir) {
  console.log(`✅ ${prontos.length} dia(s) conferido(s), ${prontos.reduce((n, t) => n + Object.keys(t.trechos).length, 0)} trecho(s) — nada gravado (--conferir)`);
  process.exit(0);
}
fs.mkdirSync(SAIDA, { recursive: true });
for (const t of prontos) fs.writeFileSync(path.join(SAIDA, `${t.data}.json`), `${JSON.stringify(t, null, 2)}\n`);
console.log(`data/liturgia-trechos: ${prontos.length} dia(s) gravado(s)`);
