#!/usr/bin/env node
/**
 * scripts/saude-liturgia.mjs — vigia da Liturgia Diária no ar. Roda na VPS (no host, não no
 * container) de hora em hora e avisa no Telegram só quando algo muda: falha nova, falha que
 * continua (lembrete a cada 20 h) e falha resolvida. Sem IA: cada conferência é sim ou não.
 *
 *   node scripts/saude-liturgia.mjs            # confere e avisa
 *   node scripts/saude-liturgia.mjs --ensaio   # confere e imprime, sem avisar nem gravar estado
 *   node scripts/saude-liturgia.mjs --teste    # manda uma mensagem de teste ao Telegram
 *
 * Confere: containers de pé; a página /liturgiadiaria/ (hoje.html) com o Evangelho de hoje e o
 * comentário; a página e o JSON do dia; card e áudio de hoje acessíveis; home, Pio X e /cic/;
 * hoje.html renovado na última 1 h 30; depois das 7 h de Brasília, o post e o Reel do Instagram e
 * o push de hoje nos logs; linhas de erro novas nos logs dos crons; certificado com mais de 14
 * dias; e pelo menos 7 dias de conteúdo pela frente (o resumo semanal mostra o fôlego inteiro).
 *
 * Estado: SAUDE_ESTADO (padrão /var/lib/saude-liturgia.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { SITE, hojeBrasilia, avisar, docker, folegoDoConteudo, dataCurta } from './lib-vigia.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESTADO = process.env.SAUDE_ESTADO || '/var/lib/saude-liturgia.json';
const LOGS = {
  instagram: '/var/log/instagram-liturgia.log',
  push: '/var/log/push-liturgia.log',
  'página de hoje': '/var/log/pagina-hoje.log',
};
const CONTAINERS = ['catecismo-api', 'caddy', 'umami'];
const ensaio = process.argv.includes('--ensaio');

if (process.argv.includes('--teste')) {
  const ok = await avisar('Vigia da Liturgia: mensagem de teste. Os avisos chegam aqui.');
  process.exit(ok ? 0 : 1);
}

const { dia: hoje, hora } = hojeBrasilia();
const falhas = new Map();      // id → mensagem; persistentes (avisa de novo se continuarem)
const avulsos = [];            // linhas de erro novas nos logs: avisa uma vez
const falha = (id, msg) => falhas.set(id, msg);
const lerJson = arq => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; } };

async function buscar(rota, { metodo = 'GET' } = {}) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(`${SITE}${rota}`, { method: metodo, redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'vigia-liturgia' } });
      const texto = metodo === 'GET' ? await r.text() : '';
      if (r.ok || tentativa) return { status: r.status, texto };
    } catch (e) {
      if (tentativa) return { status: e.name === 'TimeoutError' ? 'tempo esgotado' : e.message, texto: '' };
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

// 1. containers
for (const nome of CONTAINERS) {
  let rodando = 'ausente';
  try { rodando = docker('inspect', '-f', '{{.State.Running}}', nome); } catch { /* ausente */ }
  if (rodando !== 'true') falha(`container:${nome}`, `container ${nome} parado (${rodando})`);
}

// 2. leituras de hoje nos dados
const dados = lerJson(path.join(RAIZ, 'data', 'liturgia', `${hoje}.json`));
const evangelho = dados?.missas?.[0]?.leituras?.find(l => l.tipo === 'evangelho' && !l.alternativa)?.referencia;
if (!dados) falha('dados', `sem data/liturgia/${hoje}.json`);
const temComentario = fs.existsSync(path.join(RAIZ, 'data', 'liturgia-comentario', `${hoje}.json`));
const temAudio = fs.existsSync(path.join(RAIZ, 'data', 'liturgia-audio', hoje, 'evangelho.mp3'));

// 3. páginas no ar
{
  const r = await buscar('/liturgiadiaria/');
  if (r.status !== 200) falha('pagina:hoje', `/liturgiadiaria/ respondeu ${r.status}`);
  else {
    if (!r.texto.includes(hoje)) falha('pagina:hoje', `/liturgiadiaria/ não mostra ${dataCurta(hoje)} (hoje.html velho?)`);
    else if (evangelho && !r.texto.includes(evangelho)) falha('pagina:hoje', `/liturgiadiaria/ sem o Evangelho de hoje (${evangelho})`);
    if (temComentario && !r.texto.includes('lp-comentario')) falha('pagina:comentario', '/liturgiadiaria/ sem o comentário dos Padres');
  }
}
{
  const r = await buscar(`/liturgiadiaria/${hoje}/`);
  if (r.status !== 200) falha('pagina:dia', `/liturgiadiaria/${hoje}/ respondeu ${r.status}`);
  else if (evangelho && !r.texto.includes(evangelho)) falha('pagina:dia', `/liturgiadiaria/${hoje}/ sem o Evangelho (${evangelho})`);
}
const rotas = [
  [`/data/liturgia/${hoje}.json`, 'JSON do dia'],
  [`/liturgiadiaria/instagram/${hoje}.jpg`, 'card do Instagram'],
  ...(temAudio ? [[`/data/liturgia-audio/${hoje}/evangelho.mp3`, 'áudio do Evangelho']] : []),
  ['/', 'home do Catecismo'],
  ['/saopiox/', 'São Pio X'],
  ['/cic/1/', 'página do § 1'],
];
for (const [rota, nome] of rotas) {
  const r = await buscar(rota, { metodo: 'HEAD' });
  if (r.status !== 200) falha(`rota:${rota}`, `${nome} (${rota}) respondeu ${r.status}`);
}

// 4. hoje.html renovado pelo cron
{
  const arq = path.join(RAIZ, 'liturgiadiaria', 'hoje.html');
  const idade = fs.existsSync(arq) ? (Date.now() - fs.statSync(arq).mtimeMs) / 60000 : Infinity;
  if (idade > 90) falha('hoje.html', `hoje.html sem renovar há ${Number.isFinite(idade) ? Math.round(idade / 60) + ' h' : 'sempre (não existe)'}`);
}

// 5. o que os crons de hoje deixaram nos logs
const linhasDeHoje = arq => (fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(l => l.startsWith(`${hoje} `)) : []);
if (hora >= 7) {
  const ig = linhasDeHoje(LOGS.instagram);
  if (fs.existsSync(path.join(RAIZ, 'liturgiadiaria', 'instagram', `${hoje}.json`)) && !ig.some(l => / · publicado /.test(l)))
    falha('instagram:card', `card de hoje não saiu no Instagram${ig.find(l => /· falhou/.test(l)) ? ': ' + ig.find(l => /· falhou/.test(l)).split('· falhou: ')[1] : ''}`);
  if (fs.existsSync(path.join(RAIZ, 'liturgiadiaria', 'instagram', 'reels', `${hoje}.mp4`)) && !ig.some(l => /reel publicado/.test(l)))
    falha('instagram:reel', `Reel de hoje não saiu${ig.find(l => /reel falhou/.test(l)) ? ': ' + ig.find(l => /reel falhou/.test(l)).split('reel falhou: ')[1] : ''}`);
  if (!linhasDeHoje(LOGS.push).some(l => /enviadas/.test(l))) falha('push', 'o aviso das 6h (push) não saiu hoje');
}

// 6. linhas de erro novas nos logs (desde a última rodada)
const estado = lerJson(ESTADO) || { falhas: {}, logs: {} };
const novoEstado = { falhas: {}, logs: {} };
for (const [nome, arq] of Object.entries(LOGS)) {
  if (!fs.existsSync(arq)) continue;
  const tam = fs.statSync(arq).size;
  const desde = estado.logs?.[arq] ?? tam;          // primeira rodada: só daqui para frente
  novoEstado.logs[arq] = tam;
  if (tam <= desde) continue;
  const fd = fs.openSync(arq, 'r');
  const buf = Buffer.alloc(Math.min(tam - desde, 64 * 1024));
  fs.readSync(fd, buf, 0, buf.length, tam - buf.length);
  fs.closeSync(fd);
  const erros = buf.toString('utf8').split('\n').filter(l => /error|erro|falhou|ausente|no such container|cannot|refused/i.test(l));
  for (const l of erros.slice(-3)) avulsos.push(`log ${nome}: ${l.slice(0, 200)}`);
}

// 7. certificado
await new Promise(resolve => {
  const host = new URL(SITE).hostname;
  const s = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
    const dias = (new Date(s.getPeerCertificate().valid_to) - Date.now()) / 864e5;
    if (dias < 14) falha('certificado', `certificado de ${host} vence em ${Math.floor(dias)} dias`);
    s.end(); resolve();
  });
  s.on('error', e => { falha('certificado', `TLS de ${host}: ${e.message}`); resolve(); });
  s.on('timeout', () => { s.destroy(); resolve(); });
});

// 8. fôlego mínimo do conteúdo
for (const f of folegoDoConteudo(RAIZ, hoje)) {
  if (f.nome === 'Reel') continue;   // opcional: o resumo semanal acompanha
  if (f.dias < 7) falha(`folego:${f.nome}`, `${f.nome}: ${f.dias ? 'só até ' + dataCurta(f.ate) : 'falta hoje'}`);
}

// avisos
const agora = Date.now();
const novas = [], continuam = [], resolvidas = [];
for (const [id, msg] of falhas) {
  const antes = estado.falhas?.[id];
  if (!antes) { novas.push(msg); novoEstado.falhas[id] = { desde: agora, avisado: agora, msg }; }
  else {
    const lembrar = agora - antes.avisado > 20 * 3600e3;
    if (lembrar) continuam.push(`${msg} (desde ${new Date(antes.desde).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })})`);
    novoEstado.falhas[id] = { ...antes, msg, avisado: lembrar ? agora : antes.avisado };
  }
}
for (const [id, antes] of Object.entries(estado.falhas || {})) if (!falhas.has(id)) resolvidas.push(antes.msg);

const partes = [];
if (novas.length) partes.push(`Problema:\n${novas.map(m => `• ${m}`).join('\n')}`);
if (avulsos.length) partes.push(`Erro nos logs:\n${avulsos.map(m => `• ${m}`).join('\n')}`);
if (continuam.length) partes.push(`Continua:\n${continuam.map(m => `• ${m}`).join('\n')}`);
if (resolvidas.length) partes.push(`Resolvido:\n${resolvidas.map(m => `• ${m}`).join('\n')}`);

const linha = `${hoje} ${hora}h · ${falhas.size ? `${falhas.size} falha(s): ${[...falhas.values()].join(' | ')}` : 'ok'}${avulsos.length ? ` · ${avulsos.length} erro(s) novos no log` : ''}`;
console.log(linha);
const entregue = partes.length ? await avisar(`Liturgia Diária · vigia\n\n${partes.join('\n\n')}`, { ensaio }) : true;
// se o Telegram falhou, não grava: a próxima rodada vê tudo de novo como novo e tenta outra vez
if (!ensaio && entregue) {
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(novoEstado, null, 2));
}
