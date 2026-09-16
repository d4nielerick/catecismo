/**
 * scripts/verifica-liturgia.mjs — guard-rail de CI da Liturgia Diária.
 *
 * 1. Reprodutibilidade: data/liturgia/AAAA-MM-DD.json == buildDia(data/liturgia-fonte/…) e
 *    indice.json cobre exatamente os dias da fonte (edição à mão da saída faz falhar).
 * 2. Preservação: nenhuma linha de texto da fonte fica sem destino na saída.
 * 3. Estrutura: a missa principal de todo dia tem evangelho; domingo tem 2ª leitura; nenhum
 *    cabeçalho ("SEGUNDA LEITURA", "Aclamação ao Evangelho", "Palavra do Senhor"…) vaza para o texto.
 * 4. Calendário × leituras: o nome calculado por lib-calendario-liturgico.mjs bate com as
 *    leituras que a fonte traz (ex.: "Ascensão do Senhor" ⇒ At 1,1-11; domingo comum ⇒ verde).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildDia, listarFonte, lerFonte, indiceDe, SAIDA, RE, cabecalho } from './build-liturgia.mjs';
import { lerModelo, lerIndice, listarDias, lerDia, paginaDoDia, sitemapLiturgia } from './build-paginas-liturgia.mjs';

const semEspaco = s => (s || '').replace(/\s+/g, '');
const tem = (dia, tipo, ...trechos) => dia.missas
  .flatMap(m => m.leituras)
  .some(s => s.tipo === tipo && trechos.some(t => semEspaco(s.referencia).includes(t)));

const CONFERE = [
  [/^Ascensão do Senhor$/, d => tem(d, 'leitura', 'At1,1-11'), '1ª leitura At 1,1-11'],
  [/^Domingo de Pentecostes$/, d => tem(d, 'leitura', 'At2,1-11'), 'leitura At 2,1-11'],
  [/^Epifania do Senhor$/, d => tem(d, 'evangelho', 'Mt2,1-12'), 'evangelho Mt 2,1-12'],
  [/^Batismo do Senhor$/, d => tem(d, 'leitura', 'Is42,1-4.6-7', 'Is55,1-11', 'Is40,1-5'), '1ª leitura Is 42, 55 ou 40'],
  [/^São José, esposo/, d => tem(d, 'evangelho', 'Mt1,16', 'Lc2,41-51'), 'evangelho Mt 1,16… ou Lc 2,41-51a'],
  [/^Anunciação do Senhor$/, d => tem(d, 'evangelho', 'Lc1,26-38'), 'evangelho Lc 1,26-38'],
  [/^Natividade de São João Batista$/, d => tem(d, 'evangelho', 'Lc1,57-66'), 'evangelho Lc 1,57-66.80'],
  [/^São Pedro e São Paulo/, d => tem(d, 'evangelho', 'Mt16,13-19'), 'evangelho Mt 16,13-19'],
  [/^Assunção de Nossa Senhora$/, d => tem(d, 'evangelho', 'Lc1,39-56'), 'evangelho Lc 1,39-56'],
  [/^Exaltação da Santa Cruz$/, d => tem(d, 'evangelho', 'Jo3,13-17'), 'evangelho Jo 3,13-17'],
  [/^Todos os Santos$/, d => tem(d, 'evangelho', 'Mt5,1-12'), 'evangelho Mt 5,1-12a'],
  [/^Imaculada Conceição/, d => tem(d, 'evangelho', 'Lc1,26-38'), 'evangelho Lc 1,26-38'],
  [/^Natal do Senhor$/, d => tem(d, 'evangelho', 'Jo1,1-18'), 'evangelho Jo 1,1-18'],
  [/Domingo do Tempo Comum$/, d => d.cor === 'verde', 'cor verde'],
  [/Domingo (do Advento|da Quaresma)$/, d => ['roxo', 'rosa'].includes(d.cor), 'cor roxa ou rósea'],
  [/^(Sagrada Família|Santíssima Trindade|Nosso Senhor Jesus Cristo, Rei)/, d => d.cor === 'branco', 'cor branca'],
];

const erros = [];
const arquivos = listarFonte();
let nLeituras = 0;

for (const f of arquivos) {
  const { dia, perdidas } = buildDia(lerFonte(f));
  const destino = path.join(SAIDA, `${dia.data}.json`);
  if (!fs.existsSync(destino) || fs.readFileSync(destino, 'utf8') !== JSON.stringify(dia)) {
    erros.push(`${dia.data}: data/liturgia diverge do build (rode node scripts/build-liturgia.mjs)`);
  }
  if (perdidas.length) erros.push(`${dia.data}: ${perdidas.length} linha(s) da fonte sem destino — "${perdidas[0].slice(0, 60)}"`);

  const principal = dia.missas[0].leituras;
  if (!principal.some(s => s.tipo === 'evangelho')) erros.push(`${dia.data}: missa principal sem evangelho`);
  if (new Date(`${dia.data}T12:00:00Z`).getUTCDay() === 0 && !principal.some(s => s.rotulo === '2ª Leitura')) {
    erros.push(`${dia.data}: domingo sem 2ª leitura`);
  }

  for (const s of dia.missas.flatMap(m => m.leituras)) {
    nLeituras++;
    // "Início do Evangelho de Jesus Cristo, Filho de Deus" é o próprio Mc 1,1: não conta como incipit vazado.
    const vazou = s.texto.split('\n').find(l => RE.fim.test(l) || cabecalho(l) || RE.dica.test(l) || RE.missa.test(l)
      || /^(?:†\s*)?Proclamação do Evangelho\b/i.test(l)
      || /^Leitura d[aoe]s? (?:Livro|Carta|Profecia|Atos|Primeir|Segund|Terceir)/i.test(l));
    if (vazou) erros.push(`${dia.data} ${s.rotulo}: cabeçalho dentro do texto — "${vazou.slice(0, 60)}"`);
  }

  for (const [re, confere, esperado] of CONFERE) {
    if (re.test(dia.celebracao) && !confere(dia)) erros.push(`${dia.data}: "${dia.celebracao}" não bate com a fonte (esperado ${esperado})`);
  }
}

const datas = arquivos.map(f => f.slice(0, 10));
const saidas = fs.readdirSync(SAIDA).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
if (saidas.length !== datas.length) erros.push(`data/liturgia tem ${saidas.length} dias; a fonte tem ${datas.length}`);
if (fs.readFileSync(path.join(SAIDA, 'indice.json'), 'utf8') !== JSON.stringify(indiceDe(datas))) {
  erros.push('data/liturgia/indice.json desatualizado (rode node scripts/build-liturgia.mjs)');
}
const { marcos } = indiceDe(datas);
for (const [nome, porAno] of [['1º Domingo do Advento', 1], ['Natal do Senhor', 1], ['Santíssimo Corpo e Sangue de Cristo', 1]]) {
  const anos = new Set(datas.map(d => d.slice(0, 4))).size;
  const n = marcos.filter(m => m.nome === nome).length;
  if (n !== anos * porAno) erros.push(`indice.json: "${nome}" aparece ${n} vez(es) em ${anos} ano(s)`);
}

// Resumos da Wikipédia (scripts/build-santos.mjs): toda celebração do índice existe no calendário
// e tem arquivo com texto e link.
const SANTOS = path.join(SAIDA, '..', 'santos');
const celebracoes = new Set(saidas.map(f => JSON.parse(fs.readFileSync(path.join(SAIDA, f), 'utf8')).celebracao));
const santos = JSON.parse(fs.readFileSync(path.join(SANTOS, 'indice.json'), 'utf8'));
const fonteSantos = JSON.parse(fs.readFileSync(path.join(SAIDA, '..', 'santos-fonte.json'), 'utf8'));
if (JSON.stringify(Object.keys(santos)) !== JSON.stringify(Object.keys(fonteSantos))) {
  erros.push('data/santos/indice.json desatualizado (rode node scripts/build-santos.mjs)');
}
for (const [celebracao, s] of Object.entries(santos)) {
  if (!celebracoes.has(celebracao)) erros.push(`santos: "${celebracao}" não é o nome de nenhum dia da liturgia`);
  const arq = path.join(SANTOS, `${s}.json`);
  const ok = fs.existsSync(arq) && JSON.parse(fs.readFileSync(arq, 'utf8')).artigos
    .every(a => a.resumo.length && /^https:\/\/pt\.wikipedia\.org\//.test(a.url));
  if (!ok) erros.push(`santos: ${s}.json ausente ou sem resumo/link`);
}

// Páginas de cada dia (scripts/build-paginas-liturgia.mjs): o modelo continua encaixando em todos os
// dias e cada página sai com título, canonical, dados estruturados e as leituras no HTML.
{
  const modelo = lerModelo();
  const indiceLit = lerIndice();
  const dias = listarDias();
  for (const dt of dias) {
    let html;
    try { html = paginaDoDia(modelo, dt, lerDia(dt), indiceLit); }
    catch (e) { erros.push(`página ${dt}: ${e.message}`); break; }
    const falta = [
      [`<link rel="canonical" href="https://santadoutrina.cloud/liturgiadiaria/${dt}/">`, 'canonical'],
      ['<script type="application/ld+json">', 'dados estruturados'],
      ['class="leitura-card', 'leituras no HTML'],
      [`og/${dt}.jpg`, 'imagem de compartilhamento'],
    ].filter(([trecho]) => !html.includes(trecho)).map(([, nome]) => nome);
    if (/Carregando…|Buscando leituras/.test(html)) falta.push('texto de carregamento sobrou');
    if (falta.length) erros.push(`página ${dt}: ${falta.join(', ')}`);
  }
  if ((sitemapLiturgia(dias).match(/<loc>/g) || []).length !== dias.length + 1) erros.push('sitemap-liturgia.xml incompleto');
}

if (erros.length) {
  console.error(`✗ liturgia: ${erros.length} problema(s)`);
  console.error(erros.slice(0, 40).map(e => `  ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✅ liturgia OK: ${datas.length} dias (${datas[0]} a ${datas.at(-1)}) reprodutíveis, ${nLeituras} leituras,`);
console.log('   texto da fonte preservado, sem cabeçalhos vazados, calendário conferido com as leituras.');
