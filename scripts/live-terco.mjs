#!/usr/bin/env node
/**
 * scripts/live-terco.mjs — live diária do Terço da Misericórdia no YouTube (Liturgia Diária), às 15h e às 3h de Brasília.
 * Roda no host da VPS pelo cron, aos 50 min de toda hora (o cron segue o fuso de Berlim; o script decide pela hora de Brasília):
 *
 *   50 * * * * cd /opt/mediaserver/catecismo && node scripts/live-terco.mjs >> /var/log/live-terco.log 2>&1
 *
 * Se a próxima hora cheia em Brasília é uma das HORAS: cria a transmissão agendada para HH:00 (aparece como "Em breve" e
 * avisa os inscritos), põe a capa, liga ao stream fixo do canal e, às HH:00, transmite o vídeo pronto com o ffmpeg
 * (-re, sem recodificar). A transmissão começa sozinha quando o sinal chega e termina sozinha no fim do vídeo.
 *
 *   node scripts/live-terco.mjs --agora     # transmite já (teste), sem esperar a hora
 *   node scripts/live-terco.mjs --agora --nao-listado   # teste: só quem tem o link vê
 *   node scripts/live-terco.mjs --ensaio    # só mostra o que faria
 *
 * Credenciais: YT_CREDENCIAIS (padrão /opt/mediaserver/apoio-dados/youtube.json, o mesmo do publicar-youtube.mjs).
 * Vídeo e capa: LIVE_DIR (padrão /opt/mediaserver/lives/), fora do rsync do site. A chave do stream nunca é impressa.
 * Exige o canal liberado para lives (youtube.com/features).
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { hojeBrasilia, avisar } from './lib-vigia.mjs';

const HORAS = [15, 3];
const DIR = process.env.LIVE_DIR || '/opt/mediaserver/lives';
const VIDEO = `${DIR}/terco-misericordia-live.mp4`;
const CAPA = `${DIR}/capa-misericordia.jpg`;
const DESCRICAO = `${DIR}/descricao-misericordia.txt`;
const ESTADO = `${DIR}/estado.json`;
const YT = process.env.YT_CREDENCIAIS || '/opt/mediaserver/apoio-dados/youtube.json';
const agora = process.argv.includes('--agora'), ensaio = process.argv.includes('--ensaio');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const espera = ms => new Promise(r => setTimeout(r, ms));

// próxima hora cheia em Brasília
const prox = new Date(Math.ceil(Date.now() / 3600e3) * 3600e3);
const { hora } = hojeBrasilia(prox);
if (!agora && !HORAS.includes(hora)) process.exit(0);
const inicio = agora ? new Date(Date.now() + 60e3) : prox;
const titulo = hora === 3 ? 'Terço da Misericórdia · 3h da madrugada · Jesus, eu confio em vós'
  : 'Terço da Misericórdia · 15h, a Hora da Misericórdia · Jesus, eu confio em vós';
if (ensaio) { log('ensaio:', titulo, 'início', inicio.toISOString(), fs.existsSync(VIDEO) ? 'vídeo ok' : 'SEM VÍDEO'); process.exit(0); }

async function token() {
  const c = JSON.parse(fs.readFileSync(YT, 'utf8'));
  const r = await (await fetch(c.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST',
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }) })).json();
  if (!r.access_token) throw new Error(`token recusado (${r.error})`);
  return r.access_token;
}

async function principal() {
  const tok = await token();
  const api = async (metodo, rota, q, corpo, tipo = 'application/json') => {
    const r = await fetch(`https://www.googleapis.com/${rota}?${new URLSearchParams(q)}`, { method: metodo,
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': tipo }, body: corpo && (tipo === 'application/json' ? JSON.stringify(corpo) : corpo) });
    const j = r.status === 204 ? {} : await r.json();
    if (j.error) throw new Error(`${rota}: ${j.error.message}`);
    return j;
  };
  // stream fixo (uma chave para todas as lives), guardado no estado
  const est = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : {};
  let stream = est.stream && (await api('GET', 'youtube/v3/liveStreams', { part: 'cdn', id: est.stream })).items?.[0];
  if (!stream) {
    stream = await api('POST', 'youtube/v3/liveStreams', { part: 'snippet,cdn,contentDetails' },
      { snippet: { title: 'Terço (VPS)' }, cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' }, contentDetails: { isReusable: true } });
    est.stream = stream.id; fs.writeFileSync(ESTADO, JSON.stringify(est));
  }
  const b = await api('POST', 'youtube/v3/liveBroadcasts', { part: 'snippet,status,contentDetails' }, {
    snippet: { title: titulo, description: fs.readFileSync(DESCRICAO, 'utf8'), scheduledStartTime: inicio.toISOString() },
    status: { privacyStatus: process.argv.includes('--nao-listado') ? 'unlisted' : 'public', selfDeclaredMadeForKids: false },
    contentDetails: { enableAutoStart: true, enableAutoStop: true, enableDvr: true, recordFromStart: true, latencyPreference: 'normal' } });
  log('transmissão criada', `https://youtu.be/${b.id}`, titulo);
  await api('POST', 'youtube/v3/liveBroadcasts/bind', { part: 'id', id: b.id, streamId: stream.id });
  try { await api('POST', 'upload/youtube/v3/thumbnails/set', { videoId: b.id }, fs.readFileSync(CAPA), 'image/jpeg'); }
  catch (e) { log('capa não aplicada:', e.message); }
  const ing = stream.cdn.ingestionInfo;
  await espera(Math.max(0, inicio - Date.now() - 15e3));
  log('transmitindo');
  const ff = spawn('ffmpeg', ['-v', 'error', '-re', '-i', VIDEO, '-c', 'copy', '-f', 'flv', `${ing.ingestionAddress}/${ing.streamName}`], { stdio: ['ignore', 'inherit', 'inherit'] });
  const cod = await new Promise(r => ff.on('close', r));
  if (cod !== 0) throw new Error(`ffmpeg saiu com ${cod}`);
  log('fim da transmissão', `https://youtu.be/${b.id}`);
}

try { await principal(); }
catch (e) {
  log('FALHOU', e.message);
  await avisar(`⚠️ Live do Terço da Misericórdia (${String(hora).padStart(2, '0')}h) falhou: ${e.message}`);
  process.exit(1);
}
