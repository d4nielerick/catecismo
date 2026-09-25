#!/usr/bin/env node
/**
 * scripts/janela-liturgia.mjs — relatório do que falta nos próximos dias para a Liturgia Diária
 * ficar completa: comentário do Evangelho (Catena + Catecismo), áudio, resumo e trechos.
 *
 *   node scripts/janela-liturgia.mjs               # hoje + 30 dias
 *   node scripts/janela-liturgia.mjs --dias 60
 *   node scripts/janela-liturgia.mjs --de 2026-10-01 --dias 14
 *   node scripts/janela-liturgia.mjs --lemas       # também imprime o começo de cada lectio sem
 *                                                  # intervalo de versículos (para mapear à mão)
 *   node scripts/janela-liturgia.mjs --json        # saída em JSON (para a skill)
 *
 * Não muda nada: só lê data/ e diz o que fazer. Os comandos que resolvem cada pendência estão em
 * .claude/skills/liturgia-janela/SKILL.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refDe, lectionesDoDia, diasDesde } from './lib-catena.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'data');
const ler = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const existe = p => fs.existsSync(p);

const args = process.argv.slice(2);
const opc = (nome, padrao) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : padrao; };
const hoje = new Date(); hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
const de = opc('--de', hoje.toISOString().slice(0, 10));
const nDias = parseInt(opc('--dias', '30'), 10);
const LEMAS = args.includes('--lemas');
const JSON_OUT = args.includes('--json');

const dias = diasDesde(de, nDias);

const AUDIO = ['primeira-leitura', 'salmo', 'segunda-leitura', 'evangelho'];   // nomes de data/liturgia-audio/<dia>/

const relatorio = { de, dias: nDias, porDia: [], capitulosFaltando: new Set(), lectionesSemMapa: new Map(), traducoesPendentes: [], curadoriaPendente: [], audioFaltando: [], resumoFaltando: [], trechosFaltando: [] };

for (const dt of dias) {
  const arq = path.join(DADOS, 'liturgia', `${dt}.json`);
  if (!existe(arq)) { relatorio.porDia.push({ dt, semLeituras: true }); continue; }
  const dia = ler(arq);
  const ev = dia.missas[0].leituras.find(l => l.tipo === 'evangelho' && !l.alternativa);
  const alvo = ev && refDe(ev.referencia);
  const linha = { dt, evangelho: ev?.referencia, catena: '—', catecismo: 0, audio: '—', resumo: existe(path.join(DADOS, 'liturgia-resumos', `${dt}.json`)), trechos: existe(path.join(DADOS, 'liturgia-trechos', `${dt}.json`)) };

  // comentário do Evangelho
  const arqCom = path.join(DADOS, 'liturgia-comentario', `${dt}.json`);
  const com = existe(arqCom) ? ler(arqCom) : null;
  if (alvo) {
    const chave = `${alvo.ev}/${alvo.cap.padStart(2, '0')}`;
    const arqCat = path.join(DADOS, 'catena', `${chave}.json`);
    if (!existe(arqCat)) { relatorio.capitulosFaltando.add(`${alvo.ev} ${alvo.cap}`); linha.catena = 'sem capítulo'; }
    else {
      const cap = ler(arqCat);
      const cobre = lectionesDoDia(cap, alvo);
      const semMapa = cap.filter(l => !l.versos);
      if (!cobre.length) {
        linha.catena = semMapa.length ? 'lectio sem mapa' : 'sem lectio';
        if (semMapa.length) relatorio.lectionesSemMapa.set(chave, semMapa.map(l => ({ lectio: l.lectio, inicio: l.itens[0]?.latim.slice(0, 220) })));
      } else {
        const pend = cobre.flatMap(l => l.itens.map((it, i) => (it.pt ? null : { ev: alvo.ev, cap: +alvo.cap, lectio: l.lectio, i, autor: it.autor, obra: it.obra, latim: it.latim })).filter(Boolean));
        pend.forEach(p => { if (!relatorio.traducoesPendentes.some(q => q.ev === p.ev && q.cap === p.cap && q.lectio === p.lectio && q.i === p.i)) relatorio.traducoesPendentes.push(p); });
        const curado = com && com.destaques?.length && com.tema;
        linha.catena = pend.length ? `${pend.length} sem tradução` : curado ? 'ok' : 'sem curadoria';
        if (!pend.length && !curado) relatorio.curadoriaPendente.push({ dt, evangelho: ev.referencia, lectiones: cobre.map(l => l.lectio), temComentario: !!com });
        if (!com) linha.catena += ' (rode liga-evangelho)';
      }
    }
    linha.catecismo = com?.catecismo?.length ?? 0;
  }

  // áudio: só as leituras que existem no dia
  const quais = AUDIO.filter(q => (q === 'segunda-leitura' ? dia.missas[0].leituras.filter(l => l.tipo === 'leitura' && !l.alternativa).length > 1 : true));
  const comVoz = quais.filter(q => existe(path.join(DADOS, 'liturgia-audio', dt, `${q}.json`)));
  linha.audio = comVoz.length === quais.length ? 'ok' : comVoz.length ? `${comVoz.length}/${quais.length}` : '—';
  if (comVoz.length < quais.length) relatorio.audioFaltando.push(dt);
  if (!linha.resumo) relatorio.resumoFaltando.push(dt);
  if (!linha.trechos) relatorio.trechosFaltando.push(dt);
  relatorio.porDia.push(linha);
}

relatorio.capitulosFaltando = [...relatorio.capitulosFaltando];
relatorio.lectionesSemMapa = Object.fromEntries(relatorio.lectionesSemMapa);

if (JSON_OUT) { console.log(JSON.stringify(relatorio, null, 2)); process.exit(0); }

console.log(`Janela: ${de} + ${nDias} dias\n`);
console.log('dia         evangelho        comentário            §§  áudio  resumo trechos');
for (const l of relatorio.porDia) {
  if (l.semLeituras) { console.log(`${l.dt}  (sem leituras)`); continue; }
  console.log(`${l.dt}  ${(l.evangelho || '').padEnd(16)} ${l.catena.padEnd(21)} ${String(l.catecismo).padStart(2)}  ${l.audio.padEnd(6)} ${l.resumo ? 'ok' : '—'}     ${l.trechos ? 'ok' : '—'}`);
}
console.log('\nPendências:');
if (relatorio.capitulosFaltando.length) console.log(`  · capítulos da Catena a baixar: ${relatorio.capitulosFaltando.join(', ')}   → node scripts/scrape-catena.mjs <Ev> <cap>`);
for (const [chave, ls] of Object.entries(relatorio.lectionesSemMapa)) {
  console.log(`  · ${chave}: lectiones sem intervalo de versículos: ${ls.map(l => l.lectio).join(', ')}   → node scripts/catena-mapa.mjs ${chave.replace('/', ' ')} <lectio>=<a>-<b> …`);
  if (LEMAS) ls.forEach(l => console.log(`      lectio ${l.lectio}: ${l.inicio}…`));
}
if (relatorio.traducoesPendentes.length) console.log(`  · ${relatorio.traducoesPendentes.length} comentário(s) da Catena sem tradução   → node scripts/catena-traducao.mjs pendentes ${de} +${nDias}`);
if (relatorio.curadoriaPendente.length) console.log(`  · ${relatorio.curadoriaPendente.length} dia(s) sem tema/destaques: ${relatorio.curadoriaPendente.map(c => c.dt).join(', ')}   → node scripts/grava-curadoria.mjs <arquivo>`);
if (relatorio.audioFaltando.length) console.log(`  · ${relatorio.audioFaltando.length} dia(s) sem áudio completo: ${relatorio.audioFaltando.slice(0, 8).join(', ')}${relatorio.audioFaltando.length > 8 ? '…' : ''}   → node scripts/build-audio-liturgia.mjs <dia> todas --gemini`);
if (relatorio.resumoFaltando.length) console.log(`  · ${relatorio.resumoFaltando.length} dia(s) sem resumo: ${relatorio.resumoFaltando.slice(0, 8).join(', ')}${relatorio.resumoFaltando.length > 8 ? '…' : ''}`);
if (relatorio.trechosFaltando.length) console.log(`  · ${relatorio.trechosFaltando.length} dia(s) sem trechos dos cards: ${relatorio.trechosFaltando.slice(0, 8).join(', ')}${relatorio.trechosFaltando.length > 8 ? '…' : ''}`);
const tudo = !relatorio.capitulosFaltando.length && !Object.keys(relatorio.lectionesSemMapa).length && !relatorio.traducoesPendentes.length && !relatorio.curadoriaPendente.length && !relatorio.audioFaltando.length && !relatorio.resumoFaltando.length && !relatorio.trechosFaltando.length;
if (tudo) console.log('  nenhuma: a janela está completa.');
