#!/usr/bin/env node
/**
 * scripts/liga-evangelho.mjs — liga o Evangelho de cada dia ao comentário dos Padres (Catena
 * Aurea, data/catena/) e aos parágrafos do Catecismo que o citam (notas de data/notas.json).
 *
 *   node scripts/liga-evangelho.mjs 2026-09-24 [2026-09-25 …]
 *   node scripts/liga-evangelho.mjs 2026-09-24 +30      # do dia em diante, 30 dias
 *
 * Saída: data/liturgia-comentario/AAAA-MM-DD.json
 *   { data, evangelho, leituras, catena: [{ ev, cap, lectio, versos }], catecismo: [{ numero, comum, direto, frase }], destaques }
 *   - `leituras` é a assinatura das leituras do dia (como nos resumos): se mudarem, o arquivo cai.
 *   - `catena` são ponteiros para data/catena/<ev>/<cap>.json (o texto não é copiado).
 *   - `catecismo`: §§ cujas notas citam o mesmo livro/capítulo com versículo em comum, ordenados
 *     citação direta antes de "Cf.", depois por versículos em comum; `frase` é a frase do § em que a
 *     citação aparece (do nosso catecismo.json), não a abertura do parágrafo.
 *   - `tema` (uma linha em itálico, como o título da leitura patrística no Ofício das Leituras) e
 *     `destaques` (curadoria, ponteiros [{ lectio, i }]) são preservados de uma rodada anterior.
 * Nada aqui usa IA: tudo é cruzamento de referências.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairReferencias } from '../assets/js/biblia-refs.js';
import { refDe, lectionesDoDia, arquivoDaCatena, diasDesde } from './lib-catena.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const SAIDA = path.join(DADOS, 'liturgia-comentario');
const ler = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const args = process.argv.slice(2);
if (!args.length) { console.error('uso: node scripts/liga-evangelho.mjs AAAA-MM-DD [AAAA-MM-DD…] | AAAA-MM-DD +N'); process.exit(2); }
const dias = args[1]?.startsWith('+') ? diasDesde(args[0], parseInt(args[1].slice(1), 10)) : args;

// índice das citações bíblicas das notas do Catecismo: livro → cap → [{ numero, versos }]
const notas = ler(path.join(DADOS, 'notas.json'));
const indice = {};
for (const [par, ns] of Object.entries(notas)) {
  for (const [marcador, txt] of Object.entries(ns)) {
    const direto = !/\bcf\.?/i.test(txt);   // citado, e não só "Cf." (confer)
    for (const r of extrairReferencias(txt)) {
      ((indice[r.abrev] ??= {})[r.cap] ??= []).push({ numero: +par, marcador, direto, versos: r.versos });
    }
  }
}
const paragrafos = new Map(ler(path.join(DADOS, 'catecismo.json')).paragrafos.map(p => [p.numero, p.texto]));
/** A frase do § em que a nota (marcador "(N)") aparece — é o que o Catecismo faz com o versículo,
 *  não a abertura do parágrafo. Sai sem os marcadores de nota. */
function fraseDaNota(texto, marcador) {
  const t = texto.replace(/\s+/g, ' ').trim();
  const pos = t.indexOf(`(${marcador})`);
  if (pos < 0) return null;
  const antes = t.slice(0, pos);
  const ini = Math.max(antes.lastIndexOf('. '), antes.lastIndexOf('! '), antes.lastIndexOf('? '));
  const depois = t.slice(pos);
  const fimRel = depois.search(/[.!?](?=\s|$)/);
  const fim = fimRel < 0 ? t.length : pos + fimRel + 1;
  return t.slice(ini < 0 ? 0 : ini + 2, fim).replace(/\s*\(\d+\)/g, '').replace(/\s+([,.;:!?])/g, '$1').trim();
}

const referenciasDoDia = dia => dia.missas[0].leituras
  .filter(l => !l.alternativa && ['leitura', 'salmo', 'evangelho'].includes(l.tipo))
  .map(l => l.referencia).join(' | ');

fs.mkdirSync(SAIDA, { recursive: true });
for (const dt of dias) {
  const arqDia = path.join(DADOS, 'liturgia', `${dt}.json`);
  if (!fs.existsSync(arqDia)) { console.log(`${dt}: sem leituras`); continue; }
  const dia = ler(arqDia);
  const evangelho = dia.missas[0].leituras.find(l => l.tipo === 'evangelho' && !l.alternativa);
  const alvo = evangelho && refDe(evangelho.referencia);
  if (!alvo) { console.log(`${dt}: referência do Evangelho não reconhecida (${evangelho?.referencia})`); continue; }

  // Catena: lectiones do capítulo que cobrem a perícope do dia
  const arqCat = arquivoDaCatena(DADOS, alvo);
  const catena = (fs.existsSync(arqCat) ? lectionesDoDia(ler(arqCat), alvo) : [])
    .map(l => ({ ev: alvo.ev, cap: +alvo.cap, lectio: l.lectio, versos: l.versos }));

  // Catecismo: §§ cujas notas citam versículos do trecho
  const porParagrafo = new Map();
  for (const { numero, marcador, direto, versos } of indice[alvo.ev]?.[alvo.cap] ?? []) {
    const comum = versos.filter(v => alvo.versos.includes(v));
    if (!comum.length) continue;
    const j = porParagrafo.get(numero) ?? { comum: new Set(), marcador, direto: false };
    comum.forEach(v => j.comum.add(v));
    if (direto && !j.direto) { j.direto = true; j.marcador = marcador; }
    porParagrafo.set(numero, j);
  }
  const catecismo = [...porParagrafo].map(([numero, j]) => ({
    numero, comum: [...j.comum].sort((a, b) => a - b), direto: j.direto,
    frase: fraseDaNota(paragrafos.get(numero) || '', j.marcador),
  }))
    .filter(p => p.frase)
    .sort((a, b) => (b.direto - a.direto) || (b.comum.length - a.comum.length) || (a.numero - b.numero));

  const arq = path.join(SAIDA, `${dt}.json`);
  const anterior = fs.existsSync(arq) ? ler(arq) : null;
  const saida = {
    data: dt,
    evangelho: evangelho.referencia,
    leituras: referenciasDoDia(dia),
    catena,
    catecismo,
    tema: anterior?.leituras === referenciasDoDia(dia) ? (anterior.tema ?? '') : '',
    destaques: anterior?.leituras === referenciasDoDia(dia) ? (anterior.destaques ?? []) : [],
  };
  fs.writeFileSync(arq, JSON.stringify(saida, null, 2) + '\n');
  console.log(`${dt} ${evangelho.referencia.padEnd(16)} catena: ${catena.map(c => `l.${c.lectio}`).join(' ') || '—'}   catecismo: ${catecismo.map(p => `§${p.numero}`).join(' ') || '—'}${catena.length ? '' : '   (sem capítulo da Catena baixado)'}`);
}
