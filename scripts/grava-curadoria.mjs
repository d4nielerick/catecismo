#!/usr/bin/env node
/**
 * scripts/grava-curadoria.mjs — grava o tema e os destaques do comentário do Evangelho de cada dia.
 *
 *   node scripts/grava-curadoria.mjs curadoria.json
 *
 * curadoria.json = [{ data, tema, destaques: [{ lectio, i }] }]
 *   - `tema`: uma linha, em itálico na página, como o título da leitura patrística no Ofício das
 *     Leituras ("O medo do pecador e a pergunta de Herodes"). Só nomeia o assunto do que foi
 *     escolhido; nada de interpretação própria. 4–12 palavras, sem ponto final.
 *   - `destaques`: 2 a 4 ponteiros para itens da Catena (lectio da perícope do dia, índice do
 *     item), todos já traduzidos. Autores variados quando der; 30–120 palavras cada.
 *   - `padres` (opcional): [{ autor, numero }] — no máximo 2 §§ do Catecismo cujas notas citam um
 *     Padre que comenta o Evangelho de hoje, e que falam do mesmo assunto (escolher lendo, com
 *     `node scripts/padres-no-catecismo.mjs AAAA-MM-DD`). A frase é tirada do próprio Catecismo.
 * Roda liga-evangelho antes se o arquivo do dia não existir. Recusa ponteiro para item inexistente,
 * fora das lectiones do dia, ou sem tradução.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { citacoesDoPadre } from './lib-cic.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const ler = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const arq = process.argv[2];
if (!arq || !fs.existsSync(arq)) { console.error('uso: node scripts/grava-curadoria.mjs curadoria.json'); process.exit(2); }

const erros = [];
let notas, paragrafos;
let gravados = 0;
for (const c of ler(arq)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data || '')) { erros.push(`"${c.data}": data inválida`); continue; }
  const arqCom = path.join(DADOS, 'liturgia-comentario', `${c.data}.json`);
  if (!fs.existsSync(arqCom)) execFileSync('node', [path.join(RAIZ, 'scripts', 'liga-evangelho.mjs'), c.data], { stdio: 'ignore' });
  if (!fs.existsSync(arqCom)) { erros.push(`${c.data}: sem comentário (dia sem leituras?)`); continue; }
  const com = ler(arqCom);
  const tema = String(c.tema || '').trim().replace(/\.$/, '');
  const nPal = tema.split(/\s+/).filter(Boolean).length;
  if (nPal < 3 || nPal > 14) { erros.push(`${c.data}: tema com ${nPal} palavras (esperado 4–12)`); continue; }
  const destaques = c.destaques || [];
  if (destaques.length < 1 || destaques.length > 4) { erros.push(`${c.data}: ${destaques.length} destaque(s) (esperado 2–4)`); continue; }
  const lectiones = new Set(com.catena.map(x => x.lectio));
  const ref = com.catena[0];
  const cat = ref ? ler(path.join(DADOS, 'catena', ref.ev, `${String(ref.cap).padStart(2, '0')}.json`)) : [];
  let ok = true;
  for (const d of destaques) {
    if (!lectiones.has(d.lectio)) { erros.push(`${c.data}: lectio ${d.lectio} não é da perícope do dia (${[...lectiones].join(', ')})`); ok = false; break; }
    const item = cat.find(l => l.lectio === d.lectio)?.itens?.[d.i];
    if (!item) { erros.push(`${c.data}: l.${d.lectio} #${d.i} não existe`); ok = false; break; }
    if (!item.pt) { erros.push(`${c.data}: l.${d.lectio} #${d.i} sem tradução`); ok = false; break; }
  }
  if (!ok) continue;
  const padres = [];
  for (const p of c.padres || []) {
    const lects = cat.filter(l => lectiones.has(l.lectio));
    if (!lects.some(l => l.itens.some(it => it.autor === p.autor && it.pt))) { erros.push(`${c.data}: ${p.autor} não comenta (traduzido) o Evangelho de hoje`); ok = false; break; }
    notas ??= ler(path.join(DADOS, 'notas.json'));
    paragrafos ??= new Map(ler(path.join(DADOS, 'catecismo.json')).paragrafos.map(x => [x.numero, x.texto]));
    const cit = citacoesDoPadre(p.autor, notas, paragrafos).find(x => x.numero === p.numero);
    if (!cit) { erros.push(`${c.data}: as notas do § ${p.numero} não citam ${p.autor}`); ok = false; break; }
    padres.push({ autor: p.autor, numero: p.numero, frase: cit.frase });
  }
  if (!ok || padres.length > 2) { if (ok) erros.push(`${c.data}: mais de 2 padres`); continue; }
  com.padres = padres;
  com.tema = tema;
  com.destaques = destaques.map(d => ({ lectio: d.lectio, i: d.i }));
  fs.writeFileSync(arqCom, JSON.stringify(com, null, 2) + '\n');
  gravados++;
}
if (erros.length) { console.error(`✗ ${erros.length} problema(s):\n  ${erros.join('\n  ')}`); process.exit(1); }
console.log(`✅ curadoria gravada em ${gravados} dia(s)`);
