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
 *   - `outrasLeituras`: o mesmo para a 1ª leitura, o salmo (numeração hebraica) e a 2ª leitura,
 *     sem repetir os §§ do Evangelho; cada § leva `ref` (versículos citados), `texto` e `local`.
 *   - `tema` (uma linha em itálico, como o título da leitura patrística no Ofício das Leituras) e
 *     `destaques` (curadoria, ponteiros [{ lectio, i }]) são preservados de uma rodada anterior.
 * Nada aqui usa IA: tudo é cruzamento de referências.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairReferencias } from '../assets/js/biblia-refs.js';
import { refDe, lectionesDoDia, arquivoDaCatena, diasDesde } from './lib-catena.mjs';
import { fraseDaNota } from './lib-cic.mjs';

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
const referenciasDoDia = dia => dia.missas[0].leituras
  .filter(l => !l.alternativa && ['leitura', 'salmo', 'evangelho'].includes(l.tipo))
  .map(l => l.referencia).join(' | ');


const semNotas = t => t.replace(/\s*\(\d+\)/g, '').replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
const localDe = p => [p.parte, p.secao, p.capitulo, p.artigo].filter(Boolean)
  .map(x => x.charAt(0) + x.slice(1).toLowerCase()).slice(-2).join(' › ');
const infoParagrafo = new Map(ler(path.join(DADOS, 'catecismo.json')).paragrafos.map(p => [p.numero, p]));

/** "Lc 12,35-38" com os versículos em comum (faixas contínuas juntas). */
function refCurta(abrev, cap, versos) {
  const fx = [];
  for (const v of versos) { const u = fx.at(-1); if (u && v === u[1] + 1) u[1] = v; else fx.push([v, v]); }
  return `${abrev} ${cap},${fx.map(([a, b]) => a === b ? a : `${a}-${b}`).join('.')}`;
}

/** §§ cujas notas citam versículos de uma referência ({ abrev, cap, versos }). */
function citacoes(alvo) {
  const porParagrafo = new Map();
  for (const { numero, marcador, direto, versos } of indice[alvo.abrev]?.[alvo.cap] ?? []) {
    const comum = versos.filter(v => alvo.versos.includes(v));
    if (!comum.length) continue;
    const j = porParagrafo.get(numero) ?? { comum: new Set(), marcador, direto: false };
    comum.forEach(v => j.comum.add(v));
    if (direto && !j.direto) { j.direto = true; j.marcador = marcador; }
    porParagrafo.set(numero, j);
  }
  return [...porParagrafo].map(([numero, j]) => {
    const comum = [...j.comum].sort((a, b) => a - b);
    const info = infoParagrafo.get(numero);
    return {
      numero, comum, direto: j.direto,
      ref: refCurta(alvo.abrev, alvo.cap, comum),
      frase: fraseDaNota(paragrafos.get(numero) || '', j.marcador),
      texto: semNotas(info?.texto || ''),
      local: info ? localDe(info) : '',
    };
  })
    .filter(p => p.frase)
    .sort((a, b) => (b.direto - a.direto) || (b.comum.length - a.comum.length) || (a.numero - b.numero));
}

/** Referência de uma leitura para o índice das notas. O salmo vem como "Sl 84(85),…": as notas do
 *  Catecismo usam a numeração hebraica, a que está entre parênteses. */
function refDaLeitura(l) {
  const r = l.referencia.replace(/^Sl\s+\d+\((\d+)\)/, 'Sl $1').replace(/\s*\(R\..*$/, '');
  const [x] = extrairReferencias(r);
  return x && { abrev: x.abrev, cap: x.cap, versos: x.versos };
}

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

  // Catecismo: §§ cujas notas citam versículos do trecho (Evangelho) e das outras leituras
  const catecismo = citacoes({ abrev: alvo.ev, cap: alvo.cap, versos: alvo.versos });
  const ROTULO = { leitura: '1ª Leitura', salmo: 'Salmo' };
  let nLeitura = 0;
  const vistos = new Set(catecismo.map(p => p.numero));   // nenhum § repetido entre as leituras do dia
  const outrasLeituras = dia.missas[0].leituras
    .filter(l => !l.alternativa && (l.tipo === 'leitura' || l.tipo === 'salmo'))
    .map(l => {
      const rotulo = l.tipo === 'leitura' ? (++nLeitura === 1 ? '1ª Leitura' : '2ª Leitura') : ROTULO.salmo;
      const ref = refDaLeitura(l);
      const lista = ref ? citacoes(ref).filter(p => !vistos.has(p.numero)).slice(0, 3) : [];
      lista.forEach(p => vistos.add(p.numero));
      return { rotulo, referencia: l.referencia, catecismo: lista };
    })
    .filter(x => x.catecismo.length);

  const arq = path.join(SAIDA, `${dt}.json`);
  const anterior = fs.existsSync(arq) ? ler(arq) : null;
  const saida = {
    data: dt,
    evangelho: evangelho.referencia,
    leituras: referenciasDoDia(dia),
    catena,
    catecismo,
    outrasLeituras,
    // `padres` (curadoria, grava-curadoria.mjs): § do Catecismo que cita um Padre dos destaques
    padres: anterior?.leituras === referenciasDoDia(dia) ? (anterior.padres ?? []) : [],
    tema: anterior?.leituras === referenciasDoDia(dia) ? (anterior.tema ?? '') : '',
    destaques: anterior?.leituras === referenciasDoDia(dia) ? (anterior.destaques ?? []) : [],
  };
  fs.writeFileSync(arq, JSON.stringify(saida, null, 2) + '\n');
  console.log(`${dt} ${evangelho.referencia.padEnd(16)} catena: ${catena.map(c => `l.${c.lectio}`).join(' ') || '—'}   catecismo: ${catecismo.map(p => `§${p.numero}`).join(' ') || '—'}   leituras: ${outrasLeituras.flatMap(x => x.catecismo.map(p => `§${p.numero}`)).join(' ') || '—'}${catena.length ? '' : '   (sem capítulo da Catena baixado)'}`);
}
