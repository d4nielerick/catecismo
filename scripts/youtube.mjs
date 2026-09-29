#!/usr/bin/env node
/**
 * scripts/youtube.mjs — publica os vídeos da Liturgia no canal do YouTube (API de dados v3), sem
 * dependências: OAuth de app para computador (loopback) e envio resumível com fetch.
 *
 *   node scripts/youtube.mjs autoriza          # uma vez: abre o Google, você escolhe o canal e permite
 *   node scripts/youtube.mjs canal             # confere para qual canal a autorização aponta
 *   node scripts/youtube.mjs envia video/2026-10-03-evangelho.mp4 \
 *        --titulo "…" --descricao-arquivo desc.txt [--publicar-em 2026-10-03T05:00:00-03:00] [--short]
 *
 * Segredos fora do repositório: o cliente OAuth fica em ~/.config/liturgia/youtube-client.json
 * (baixado do Google Cloud, projeto liturgia-diaria) e o refresh token no Keychain
 * ("youtube-refresh-token"). Nada disso é impresso.
 *
 * Enquanto o app não passar pela auditoria do Google, a API só aceita vídeos privados: com
 * --publicar-em o vídeo sobe privado com publicação agendada (o YouTube o torna público na hora);
 * se o canal ainda estiver restrito, ele fica privado e o Studio mostra o aviso.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const CLIENTE = path.join(os.homedir(), '.config', 'liturgia', 'youtube-client.json');
const ITEM_KEYCHAIN = 'youtube-refresh-token';
const ESCOPOS = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

const cliente = () => {
  if (!fs.existsSync(CLIENTE)) { console.error(`falta ${CLIENTE} (cliente OAuth "App para computador" do projeto liturgia-diaria)`); process.exit(1); }
  return JSON.parse(fs.readFileSync(CLIENTE, 'utf8')).installed;
};
const lerRefresh = () => {
  try { return execFileSync('security', ['find-generic-password', '-a', os.userInfo().username, '-s', ITEM_KEYCHAIN, '-w']).toString().trim(); }
  catch { console.error('sem autorização: rode node scripts/youtube.mjs autoriza'); process.exit(1); }
};
const gravarRefresh = t => execFileSync('security', ['add-generic-password', '-U', '-a', os.userInfo().username, '-s', ITEM_KEYCHAIN, '-w', t]);

async function tokenDeAcesso() {
  const c = cliente();
  const r = await fetch(c.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: lerRefresh(), grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) { console.error(`token recusado (${j.error}): rode autoriza de novo`); process.exit(1); }
  return j.access_token;
}

async function autoriza() {
  const c = cliente();
  const servidor = http.createServer();
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const redirect = `http://127.0.0.1:${servidor.address().port}`;
  const url = `${c.auth_uri}?${new URLSearchParams({ client_id: c.client_id, redirect_uri: redirect, response_type: 'code', scope: ESCOPOS.join(' '), access_type: 'offline', prompt: 'consent' })}`;
  console.log('Abrindo o Google no navegador. Escolha a conta/canal da Liturgia e clique em Permitir.');
  execFileSync('open', [url]);
  const codigo = await new Promise(ok => servidor.on('request', (req, res) => {
    const q = new URL(req.url, redirect).searchParams;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(q.get('code') ? '<p>Pronto: pode fechar esta aba e voltar ao terminal.</p>' : `<p>Autorização recusada: ${q.get('error')}</p>`);
    ok(q.get('code'));
  }));
  servidor.close();
  if (!codigo) process.exit(1);
  const r = await fetch(c.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: codigo, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirect, grant_type: 'authorization_code' }) });
  const j = await r.json();
  if (!j.refresh_token) { console.error(`sem refresh token (${j.error || 'resposta inesperada'})`); process.exit(1); }
  gravarRefresh(j.refresh_token);
  console.log('Autorização guardada no Keychain.');
  await canal();
}

async function canal() {
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true', { headers: { Authorization: `Bearer ${await tokenDeAcesso()}` } });
  const j = await r.json();
  const ch = j.items?.[0];
  if (!ch) { console.error('nenhum canal nesta conta', j.error?.message || ''); process.exit(1); }
  console.log(`Canal: ${ch.snippet.title} (${ch.snippet.customUrl || ch.id}) · https://www.youtube.com/channel/${ch.id}`);
}

async function envia(arquivo, opcoes) {
  if (!fs.existsSync(arquivo)) { console.error(`não existe: ${arquivo}`); process.exit(1); }
  const tok = await tokenDeAcesso();
  const descricao = opcoes['descricao-arquivo'] ? fs.readFileSync(opcoes['descricao-arquivo'], 'utf8') : (opcoes.descricao || '');
  const status = { privacyStatus: 'private', selfDeclaredMadeForKids: false, embeddable: true };
  if (opcoes['publicar-em']) status.publishAt = new Date(opcoes['publicar-em']).toISOString();
  else if (opcoes.publico) status.privacyStatus = 'public';
  const meta = {
    snippet: {
      title: opcoes.titulo.slice(0, 100), description: descricao.slice(0, 5000),
      tags: ['liturgia diária', 'evangelho do dia', 'leituras da missa', 'liturgia de hoje', 'católico'],
      categoryId: '29',   // Nonprofits & Activism; alternativa: 22 People & Blogs
      defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR',
    },
    status,
  };
  const tam = fs.statSync(arquivo).size;
  const ini = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(tam) },
    body: JSON.stringify(meta),
  });
  if (!ini.ok) { console.error(`YouTube recusou (${ini.status}): ${(await ini.text()).slice(0, 300)}`); process.exit(1); }
  const destino = ini.headers.get('location');
  const r = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(tam) }, body: fs.readFileSync(arquivo) });
  const j = await r.json();
  if (!j.id) { console.error(`envio falhou (${r.status}): ${JSON.stringify(j).slice(0, 300)}`); process.exit(1); }
  console.log(`${path.basename(arquivo)} → https://youtu.be/${j.id}  (${j.status.privacyStatus}${j.status.publishAt ? `, publica em ${j.status.publishAt}` : ''})`);
}

// ── linha de comando ─────────────────────────────────────────────────────────
const [cmd, ...resto] = process.argv.slice(2);
const opcoes = {};
const posicionais = [];
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) {
    const k = resto[i].slice(2);
    if (resto[i + 1] && !resto[i + 1].startsWith('--')) opcoes[k] = resto[++i]; else opcoes[k] = true;
  } else posicionais.push(resto[i]);
}
if (cmd === 'autoriza') await autoriza();
else if (cmd === 'canal') await canal();
else if (cmd === 'envia' && posicionais[0] && opcoes.titulo) await envia(posicionais[0], opcoes);
else { console.error('uso: node scripts/youtube.mjs autoriza | canal | envia <mp4> --titulo "…" [--descricao-arquivo f] [--publicar-em ISO] [--publico]'); process.exit(2); }
