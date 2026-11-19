#!/usr/bin/env node
/**
 * scripts/publicar-youtube.mjs — publica os Reels do @liturgia_hoje como Shorts no canal do YouTube
 * "Liturgia Diária" (@liturgia-santa-doutrina). Roda na VPS de hora em hora, logo depois do
 * publicar-instagram.mjs, e só sobe um vídeo depois que o Instagram já o publicou (estado do Instagram em
 * IG_ESTADO): o Reel do dia (reels/<dia>.mp4) e o Reel extra (reels/<dia>-2.mp4), uma vez cada.
 *
 *   node scripts/publicar-youtube.mjs            # sobe o que o Instagram já publicou hoje e ainda não subiu
 *   node scripts/publicar-youtube.mjs --ensaio   # só mostra o que subiria (título e descrição)
 *   YT_DIA=2026-11-22 node scripts/publicar-youtube.mjs --ensaio
 *
 * Título: a 1ª linha da legenda do Instagram (a frase do Evangelho com a referência) + #Shorts.
 * Descrição: a legenda inteira + o link da liturgia do dia.
 *
 * Credenciais em YT_CREDENCIAIS (padrão /dados/youtube.json: client_id, client_secret, refresh_token),
 * copiadas do Mac com `node scripts/youtube.mjs vps`. Nunca impressas. Estado em YT_ESTADO
 * (padrão /dados/youtube-estado.json). Enquanto o app do Google não passar pela auditoria da API do
 * YouTube, o vídeo sobe como público mas o YouTube o trava como privado: aí é tornar público no Studio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'liturgiadiaria', 'instagram');
const CREDENCIAIS = process.env.YT_CREDENCIAIS || '/dados/youtube.json';
const ESTADO = process.env.YT_ESTADO || '/dados/youtube-estado.json';
const ESTADO_IG = process.env.IG_ESTADO || '/dados/instagram.json';
const ensaio = process.argv.includes('--ensaio');

const brasilia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
const dia = process.env.YT_DIA || `${brasilia.year}-${brasilia.month}-${brasilia.day}`;
const ler = (arq, padrao = {}) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const estado = ler(ESTADO);
const estadoIG = ler(ESTADO_IG);

// O que há para subir hoje: o Reel do dia e o extra, cada um só depois de sair no Instagram
const videos = [];
const legendaDia = ler(path.join(PASTA, `${dia}.json`), null)?.legenda;
if (fs.existsSync(path.join(PASTA, 'reels', `${dia}.mp4`)) && legendaDia)
  videos.push({ chave: 'reel', arquivo: path.join(PASTA, 'reels', `${dia}.mp4`), legenda: legendaDia, saiuNoIG: estadoIG.reel === dia });
const extra = ler(path.join(PASTA, 'reels', `${dia}-2.json`), null);
if (extra && fs.existsSync(path.join(PASTA, 'reels', `${dia}-2.mp4`)))
  videos.push({ chave: 'reel2', arquivo: path.join(PASTA, 'reels', `${dia}-2.mp4`), legenda: extra.legenda, titulo: extra.titulo, saiuNoIG: estadoIG.reel2 === dia });

const pendentes = videos.filter(v => (ensaio || v.saiuNoIG) && estado[v.chave] !== dia);
if (!pendentes.length) process.exit(0);

function titulo(v) {
  const base = (v.titulo || v.legenda.split('\n').find(l => l.trim()) || 'Evangelho do dia').trim().replace(/\s+/g, ' ');
  const marca = ' #Shorts';
  return (base.length + marca.length <= 100 ? base : base.slice(0, 100 - marca.length - 1).replace(/\s+\S*$/, '') + '…') + marca;
}
const descricao = v => `${v.legenda.trim()}\n\nAs leituras de hoje: https://santadoutrina.com/liturgiadiaria/${dia}/\n\n#liturgiadiaria #evangelhododia #shorts`.slice(0, 5000);

if (ensaio) {
  for (const v of pendentes) console.log(`${v.chave} (${path.basename(v.arquivo)}${v.saiuNoIG ? '' : ', ainda não saiu no Instagram'})\n  título: ${titulo(v)}\n  descrição: ${descricao(v).slice(0, 160).replace(/\n/g, ' ⏎ ')}…`);
  process.exit(0);
}

const cred = ler(CREDENCIAIS, null);
if (!cred?.refresh_token) { console.error(`${dia}: sem credenciais do YouTube em ${CREDENCIAIS} (no Mac: node scripts/youtube.mjs vps)`); process.exit(1); }

async function tokenDeAcesso() {
  const r = await fetch(cred.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`autorização do YouTube recusada (${j.error}); no Mac: node scripts/youtube.mjs autoriza && node scripts/youtube.mjs vps`);
  return j.access_token;
}

async function enviar(v, tok) {
  const tam = fs.statSync(v.arquivo).size;
  const meta = {
    snippet: {
      title: titulo(v), description: descricao(v),
      tags: ['liturgia diária', 'evangelho do dia', 'evangelho de hoje', 'liturgia de hoje', 'católico', 'shorts'],
      categoryId: '29', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, embeddable: true },
  };
  const ini = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(tam) },
    body: JSON.stringify(meta),
  });
  if (!ini.ok) throw new Error(`YouTube recusou (${ini.status}): ${(await ini.text()).slice(0, 300)}`);
  const r = await fetch(ini.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(tam) }, body: fs.readFileSync(v.arquivo) });
  const j = await r.json();
  if (!j.id) throw new Error(`envio falhou (${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

let falhou = false;
try {
  const tok = await tokenDeAcesso();
  for (const v of pendentes) {
    try {
      const j = await enviar(v, tok);
      estado[v.chave] = dia;
      estado[`${v.chave}Id`] = j.id;
      fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 1));
      console.log(`${new Date().toISOString()} ${dia} ${v.chave}: https://youtube.com/shorts/${j.id} (${j.status?.privacyStatus})`);
    } catch (e) { falhou = true; console.error(`${new Date().toISOString()} ${dia} ${v.chave}: ${e.message}`); }
  }
} catch (e) { falhou = true; console.error(`${new Date().toISOString()} ${dia}: ${e.message}`); }
process.exit(falhou ? 1 : 0);
