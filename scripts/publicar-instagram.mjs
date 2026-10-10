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
const dia = `${brasilia.year}-${brasilia.month}-${brasilia.day}`;
const estado = (() => { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return {}; } })();
if (!agora && (+brasilia.hour < HORA || estado.ultimo === dia)) process.exit(0);

const arqLegenda = path.join(RAIZ, 'liturgiadiaria', 'instagram', `${dia}.json`);
if (!fs.existsSync(arqLegenda)) { console.log(`${dia}: sem card gerado (rode build-instagram-liturgia.py e faça o deploy)`); process.exit(0); }
const { legenda } = JSON.parse(fs.readFileSync(arqLegenda, 'utf8'));
const imagem = `${SITE}/${dia}.jpg`;
if (ensaio) { console.log(imagem, '\n', legenda); process.exit(0); }

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
fs.writeFileSync(ESTADO, JSON.stringify({ ...estado, ultimo: dia }, null, 2));
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
  fs.writeFileSync(ESTADO, JSON.stringify({ ...estado }, null, 2));   // falhou: tenta de novo na próxima hora
  console.error(`${dia} ${brasilia.hour}h · falhou: ${e.message}`);
  process.exit(1);
}
