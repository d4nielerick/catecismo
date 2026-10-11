#!/usr/bin/env node
/**
 * scripts/publicar-instagram.mjs — publica o card do dia no @liturgia_hoje (API do Instagram com
 * login do Instagram). Roda na VPS de hora em hora, como o push: só publica depois das 6h de
 * Brasília e uma vez por dia (registro em IG_ESTADO, padrão /dados/instagram.json).
 *
 *   node scripts/publicar-instagram.mjs            # o card de hoje, se ainda não saiu
 *   node scripts/publicar-instagram.mjs --agora    # ignora a hora e o registro (teste)
 *   node scripts/publicar-instagram.mjs --ensaio   # só mostra o que publicaria
 *
 * Se existir liturgiadiaria/instagram/reels/<dia>.mp4, publica também o Reel do dia (estado separado).
 * O card e a legenda vêm de liturgiadiaria/instagram/<dia>.jpg|.json (build-instagram-liturgia.py);
 * a API busca a imagem pelo endereço público do site. Token: IG_LITURGIA_TOKEN (nunca impresso).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://graph.instagram.com/v23.0';
const SITE = 'https://santadoutrina.com/liturgiadiaria/instagram';
const ESTADO = process.env.IG_ESTADO || '/dados/instagram.json';
const HORA = 6;
const agora = process.argv.includes('--agora');
const ensaio = process.argv.includes('--ensaio');

const brasilia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
const dia = process.env.IG_DIA || `${brasilia.year}-${brasilia.month}-${brasilia.day}`;   // IG_DIA só para ensaio
const estado = (() => { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return {}; } })();
const arqLegenda = path.join(RAIZ, 'liturgiadiaria', 'instagram', `${dia}.json`);
const arqReel = path.join(RAIZ, 'liturgiadiaria', 'instagram', 'reels', `${dia}.mp4`);
const fazCard = fs.existsSync(arqLegenda) && (agora || estado.ultimo !== dia);
const fazReel = fs.existsSync(arqReel) && fs.existsSync(arqLegenda) && (agora || estado.reel !== dia);
if (!agora && +brasilia.hour < HORA) process.exit(0);
if (!fazCard && !fazReel) {
  if (!fs.existsSync(arqLegenda)) console.log(`${dia}: sem card gerado (rode build-instagram-liturgia.py e faça o deploy)`);
  process.exit(0);
}
const { legenda } = JSON.parse(fs.readFileSync(arqLegenda, 'utf8'));
const imagem = `${SITE}/${dia}.jpg`;
const video = `${SITE}/reels/${dia}.mp4`;
if (ensaio) { console.log(fazCard ? imagem : '(card já saiu)', fazReel ? video : '(sem reel)', '\n', legenda); process.exit(0); }

const token = process.env.IG_LITURGIA_TOKEN;
if (!token) { console.error('IG_LITURGIA_TOKEN ausente'); process.exit(1); }
const chamar = async (rota, params = {}, metodo = 'POST') => {
  const u = new URL(`${API}${rota}`);
  const corpo = new URLSearchParams({ ...params, access_token: token });
  const r = metodo === 'GET' ? await fetch(`${u}?${corpo}`) : await fetch(u, { method: 'POST', body: corpo });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${rota}: ${j.error?.message || r.status}`);
  return j;
};

// grava antes de publicar: se o cron repetir no meio, não sai duplicado
let novoEstado = { ...estado };
const gravar = () => fs.writeFileSync(ESTADO, JSON.stringify(novoEstado, null, 2));
let falhou = false;
if (fazCard) {
novoEstado.ultimo = dia; gravar();
try {
  const { id: container } = await chamar('/me/media', { image_url: imagem, caption: legenda });
  for (let i = 0; i < 20; i++) {   // a Meta baixa e processa a imagem antes de deixar publicar
    const { status_code } = await chamar(`/${container}`, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  const { id } = await chamar('/me/media_publish', { creation_id: container });
  console.log(`${dia} ${brasilia.hour}h · publicado (mídia ${id})`);
} catch (e) {
  console.error(`${dia} ${brasilia.hour}h · falhou: ${e.message}`);
  novoEstado.ultimo = estado.ultimo; gravar(); falhou = true;
}
}


// Reel: o Instagram baixa o vídeo do endereço público e processa (pode levar alguns minutos)
if (fazReel) {
  novoEstado.reel = dia; gravar();
  try {
    const { id: container } = await chamar('/me/media', { media_type: 'REELS', video_url: video, caption: legenda, share_to_feed: 'true' });
    for (let i = 0; i < 60; i++) {
      const { status_code } = await chamar(`/${container}`, { fields: 'status_code' }, 'GET');
      if (status_code === 'FINISHED') break;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`reel ${status_code}`);
      await new Promise(r => setTimeout(r, 5000));
    }
    const { id } = await chamar('/me/media_publish', { creation_id: container });
    console.log(`${dia} ${brasilia.hour}h · reel publicado (mídia ${id})`);
  } catch (e) {
    novoEstado.reel = estado.reel; gravar(); falhou = true;
    console.error(`${dia} ${brasilia.hour}h · reel falhou: ${e.message}`);
  }
}
if (falhou) process.exit(1);
