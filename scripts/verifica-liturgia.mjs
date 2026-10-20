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
import { PADRE_NA_NOTA } from './lib-cic.mjs';
import path from 'node:path';
import { buildDia, listarFonte, lerFonte, indiceDe, SAIDA, RE, cabecalho } from './build-liturgia.mjs';
import { lerModelo, lerIndice, listarDias, lerDia, paginaDoDia, sitemapLiturgia } from './build-paginas-liturgia.mjs';
import { referenciasDoDia } from '../liturgiadiaria/render.mjs';
import { lerAutores, capitulosPublicados, paginaDoCapitulo, sitemapCatena } from './build-paginas-catena.mjs';
import { conferirTrechos } from './lib-trechos.mjs';

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
  // Coerência nome × cor (a cor é calculada por corDoDia; isto pega regressão na tabela ou na regra).
  [/Semana do Tempo Comum$/, d => d.cor === 'verde', 'cor verde'],
  [/^Quarta-feira de Cinzas$|da Quaresma$|depois das Cinzas$/, d => d.cor === (d.celebracao === '4º Domingo da Quaresma' ? 'rosa' : 'roxo'), 'cor roxa (Laetare rósea)'],
  [/do Advento$/, d => d.cor === (d.celebracao === '3º Domingo do Advento' ? 'rosa' : 'roxo'), 'cor roxa (Gaudete rósea)'],
  [/mártir/i, d => d.cor === 'vermelho', 'cor vermelha'],
  [/fiéis defuntos/i, d => ['roxo', 'preto'].includes(d.cor), 'cor roxa ou preta'],
  [/Oitava do Natal$/, d => d.cor === 'branco', 'cor branca'],
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
      [`<link rel="canonical" href="https://santadoutrina.com/liturgiadiaria/${dt}/">`, 'canonical'],
      ['<script type="application/ld+json">', 'dados estruturados'],
      ['class="leitura-card', 'leituras no HTML'],
      [`og/${dt}.jpg`, 'imagem de compartilhamento'],
    ].filter(([trecho]) => !html.includes(trecho)).map(([, nome]) => nome);
    if (/Carregando…|Buscando leituras/.test(html)) falta.push('texto de carregamento sobrou');
    if (falta.length) erros.push(`página ${dt}: ${falta.join(', ')}`);
  }
  if ((sitemapLiturgia(dias).match(/<loc>/g) || []).length !== dias.length + 1) erros.push('sitemap-liturgia.xml incompleto');
}

// Resumos das leituras (scripts/grava-resumos.mjs): cobrem as leituras atuais do dia, têm o tamanho
// combinado, citam as referências e não trazem nomes próprios que não estão nas leituras.
{
  const RESUMOS = path.join(SAIDA, '..', 'liturgia-resumos');
  const COMUNS = new Set(['Salmo', 'Evangelho', 'Senhor', 'Deus', 'Reino', 'Filho', 'Homem', 'Espírito', 'Pai', 'Palavra', 'Lei', 'Criador']);
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const arq of fs.existsSync(RESUMOS) ? fs.readdirSync(RESUMOS).filter(f => f.endsWith('.json')) : []) {
    const r = JSON.parse(fs.readFileSync(path.join(RESUMOS, arq), 'utf8'));
    const destino = path.join(SAIDA, `${r.data}.json`);
    if (!fs.existsSync(destino)) { erros.push(`resumo ${r.data}: dia sem leituras`); continue; }
    const dia = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (r.leituras !== referenciasDoDia(dia)) erros.push(`resumo ${r.data}: as leituras do dia mudaram (refaça o resumo)`);
    const palavras = r.texto.split(/\s+/).length;
    if (palavras < 40 || palavras > 110) erros.push(`resumo ${r.data}: ${palavras} palavras (esperado 40–110)`);
    const leituras = norm(dia.missas.flatMap(m => m.leituras).map(l => l.texto).join(' '));
    const semRefs = r.texto.replace(/\([^)]*\)/g, '');
    for (const nome of new Set(semRefs.match(/\p{Lu}[\p{Ll}]+/gu) || [])) {
      if (!COMUNS.has(nome) && !leituras.includes(norm(nome))) erros.push(`resumo ${r.data}: "${nome}" não aparece nas leituras`);
    }
  }
}

// Trechos dos cards de compartilhar (data/liturgia-trechos/): cobrem as leituras atuais do dia,
// cada um existe palavra por palavra na sua leitura (só o que está no texto) e cabe no card.
// A pintura imposta a uma leitura precisa existir no acervo (data/cards-imagens.json).
const ACERVO = JSON.parse(fs.readFileSync(path.join(SAIDA, '..', 'cards-imagens.json'), 'utf8')).imagens;
{
  const IMG = path.join(SAIDA, '..', '..', 'assets', 'img', 'cards');
  for (const im of ACERVO) {
    for (const f of [`${im.id}.webp`, `mini/${im.id}.webp`]) {
      if (!fs.existsSync(path.join(IMG, f))) erros.push(`acervo: falta assets/img/cards/${f}`);
    }
    if (!im.titulo || !im.tempos?.length) erros.push(`acervo ${im.id}: sem título ou sem tempos`);
  }
  const TRECHOS = path.join(SAIDA, '..', 'liturgia-trechos');
  const ids = new Set(ACERVO.map(im => im.id));
  for (const arq of fs.existsSync(TRECHOS) ? fs.readdirSync(TRECHOS).filter(f => f.endsWith('.json')) : []) {
    const t = JSON.parse(fs.readFileSync(path.join(TRECHOS, arq), 'utf8'));
    const destino = path.join(SAIDA, `${t.data}.json`);
    if (!fs.existsSync(destino)) { erros.push(`trechos ${t.data}: dia sem leituras`); continue; }
    const dia = JSON.parse(fs.readFileSync(destino, 'utf8'));
    for (const e of conferirTrechos(t, dia, ids)) erros.push(`trechos ${t.data} ${e}`);
  }
}

// Frases dos santos do dia (data/santos-frases.json): toda frase tem fonte, a pintura existe no acervo
// e a celebração existe em algum dia do calendário.
{
  const arq = path.join(SAIDA, '..', 'santos-frases.json');
  if (fs.existsSync(arq)) {
    const { frases, porData = {} } = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const ids = new Set(ACERVO.map(im => im.id));
    const celebracoes = new Set(datas.map(d => JSON.parse(fs.readFileSync(path.join(SAIDA, `${d}.json`), 'utf8')).celebracao));
    for (const [cel, f] of Object.entries(frases)) {
      if (!f.frase?.trim() || !f.fonte?.trim()) erros.push(`santos-frases "${cel}": sem frase ou sem fonte`);
      if (f.imagem && !ids.has(f.imagem)) erros.push(`santos-frases "${cel}": pintura "${f.imagem}" não existe no acervo`);
      if (!celebracoes.has(cel)) erros.push(`santos-frases "${cel}": nenhuma celebração com esse nome no calendário`);
    }
    // santos lembrados em dia comum: chave "MM-DD"
    for (const [md, f] of Object.entries(porData)) {
      if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(md)) erros.push(`santos-frases porData "${md}": data não é MM-DD`);
      if (!f.nome?.trim() || !f.frase?.trim() || !f.fonte?.trim()) erros.push(`santos-frases porData "${md}": sem nome, frase ou fonte`);
      if (f.imagem && !ids.has(f.imagem)) erros.push(`santos-frases porData "${md}": pintura "${f.imagem}" não existe no acervo`);
    }
  }
}

// Evangelho comentado (data/liturgia-comentario/ + data/catena/): cada dia cobre as leituras atuais,
// os destaques apontam para itens traduzidos das lectiones da perícope, os §§ do Catecismo existem,
// e a Catena estruturada é reprodutível a partir da fonte crua (scrape-catena --local).
{
  const COMENT = path.join(SAIDA, '..', 'liturgia-comentario');
  const CATENA = path.join(SAIDA, '..', 'catena');
  const numeros = new Set(JSON.parse(fs.readFileSync(path.join(SAIDA, '..', 'catecismo.json'), 'utf8')).paragrafos.map(p => p.numero));
  const notasCic = JSON.parse(fs.readFileSync(path.join(SAIDA, '..', 'notas.json'), 'utf8'));
  const capitulos = new Map();
  const cap = (ev, c) => {
    const k = `${ev}/${String(c).padStart(2, '0')}`;
    if (!capitulos.has(k)) { const p = path.join(CATENA, `${k}.json`); capitulos.set(k, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null); }
    return capitulos.get(k);
  };
  for (const arq of fs.existsSync(COMENT) ? fs.readdirSync(COMENT).filter(f => f.endsWith('.json')) : []) {
    const c = JSON.parse(fs.readFileSync(path.join(COMENT, arq), 'utf8'));
    const destino = path.join(SAIDA, `${c.data}.json`);
    if (!fs.existsSync(destino)) { erros.push(`comentário ${c.data}: dia sem leituras`); continue; }
    const dia = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (c.leituras !== referenciasDoDia(dia)) erros.push(`comentário ${c.data}: as leituras do dia mudaram (rode node scripts/liga-evangelho.mjs ${c.data})`);
    for (const p of [...(c.catecismo || []), ...(c.outrasLeituras || []).flatMap(g => g.catecismo), ...(c.padres || [])]) {
      if (!numeros.has(p.numero)) erros.push(`comentário ${c.data}: § ${p.numero} não existe`);
      if (!p.frase?.trim()) erros.push(`comentário ${c.data}: § ${p.numero} sem frase`);
    }
    const lectiones = new Set((c.catena || []).map(x => x.lectio));
    for (const d of c.destaques || []) {
      const ref = c.catena?.[0];
      const item = ref && cap(ref.ev, ref.cap)?.find(l => l.lectio === d.lectio)?.itens?.[d.i];
      if (!lectiones.has(d.lectio) || !item) erros.push(`comentário ${c.data}: destaque l.${d.lectio} #${d.i} não existe na perícope`);
      else if (!item.pt) erros.push(`comentário ${c.data}: destaque l.${d.lectio} #${d.i} sem tradução`);
    }
    for (const p of c.padres || []) {
      if (!PADRE_NA_NOTA[p.autor] || !Object.values(notasCic[p.numero] || {}).some(n => PADRE_NA_NOTA[p.autor].test(n))) erros.push(`comentário ${c.data}: as notas do § ${p.numero} não citam ${p.autor}`);
    }
    if (c.destaques?.length && !c.tema?.trim()) erros.push(`comentário ${c.data}: destaques sem tema`);
  }
  // cada capítulo estruturado tem a fonte crua ao lado e todo item traduzido guarda a marca da tradução
  for (const ev of fs.existsSync(CATENA) ? fs.readdirSync(CATENA) : []) {
    for (const f of fs.readdirSync(path.join(CATENA, ev)).filter(f => f.endsWith('.json'))) {
      if (!fs.existsSync(path.join(SAIDA, '..', 'catena-fonte', ev, f.replace('.json', '.html')))) erros.push(`catena ${ev}/${f}: sem a fonte crua em data/catena-fonte/`);
      for (const l of JSON.parse(fs.readFileSync(path.join(CATENA, ev, f), 'utf8'))) {
        for (const [i, it] of l.itens.entries()) {
          if (!it.latim?.trim() || !it.autor) erros.push(`catena ${ev}/${f} l.${l.lectio} #${i}: sem latim ou sem autor`);
          if (it.pt && !it.traducao?.por) erros.push(`catena ${ev}/${f} l.${l.lectio} #${i}: tradução sem a marca de origem`);
        }
      }
    }
  }
}

// Catena Aurea por capítulo (scripts/build-paginas-catena.mjs): o gerador roda em todos os capítulos
// publicáveis e cada página sai com canonical, dados estruturados, só itens traduzidos e nada de latim.
{
  const autores = lerAutores();
  const capitulos = capitulosPublicados();
  for (const c of capitulos) {
    let html;
    try { html = paginaDoCapitulo(c, autores); }
    catch (e) { erros.push(`catena ${c.chave}: ${e.message}`); break; }
    const falta = [
      [`<link rel="canonical" href="https://santadoutrina.com/catena/${c.chave}/">`, 'canonical'],
      ['<script type="application/ld+json">', 'dados estruturados'],
      ['class="ca-lectio"', 'perícopes no HTML'],
    ].filter(([trecho]) => !html.includes(trecho)).map(([, nome]) => nome);
    if (/undefined|lang="la"/.test(html)) falta.push('"undefined" ou latim na página');
    if (falta.length) erros.push(`catena ${c.chave}: ${falta.join(', ')}`);
  }
  if (capitulos.length && (sitemapCatena(capitulos).match(/<loc>/g) || []).length !== capitulos.length + 1) erros.push('sitemap-catena.xml incompleto');
}

if (erros.length) {
  console.error(`✗ liturgia: ${erros.length} problema(s)`);
  console.error(erros.slice(0, 40).map(e => `  ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✅ liturgia OK: ${datas.length} dias (${datas[0]} a ${datas.at(-1)}) reprodutíveis, ${nLeituras} leituras,`);
console.log('   texto da fonte preservado, sem cabeçalhos vazados, calendário conferido com as leituras.');
