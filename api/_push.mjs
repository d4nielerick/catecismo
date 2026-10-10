/**
 * _push.mjs — Web Push sem dependência: VAPID (RFC 8292) e a criptografia do conteúdo (RFC 8291,
 * aes128gcm — RFC 8188), só com node:crypto. Em produção não há node_modules, por isso à mão.
 *
 * Chaves (container catecismo-api):
 *   VAPID_PUBLIC_KEY   ponto P-256 sem compressão (65 bytes) em base64url — a mesma de data/push.json
 *   VAPID_PRIVATE_KEY  escalar privado (32 bytes) em base64url — só no servidor
 *   VAPID_SUBJECT      "https://santadoutrina.com" ou "mailto:…" (o serviço de push avisa aí se algo der errado)
 *   PUSH_ARQUIVO       onde ficam as inscrições (padrão /dados/push.json)
 *
 * Gerar um par novo: node -e 'import("./api/_push.mjs").then(m => console.log(m.gerarChaves()))'
 */

import { createECDH, createPrivateKey, createCipheriv, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const b64url = buf => Buffer.from(buf).toString('base64url');
export const deB64url = s => Buffer.from(String(s), 'base64url');

/** Par VAPID novo, já no formato das variáveis de ambiente. */
export function gerarChaves() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return {
    chavePublica: b64url(Buffer.concat([Buffer.from([4]), deB64url(pub.x), deB64url(pub.y)])),
    chavePrivada: priv.d,
  };
}

function chavesDoAmbiente() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não definidas');
  const ponto = deB64url(pub);
  if (ponto.length !== 65 || ponto[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida (esperado ponto de 65 bytes)');
  return { pub, priv, x: b64url(ponto.subarray(1, 33)), y: b64url(ponto.subarray(33, 65)) };
}

/** Cabeçalho Authorization para o serviço de push do `endpoint` (JWT ES256, vale 12 h). */
export function cabecalhoVapid(endpoint, agora = Date.now()) {
  const { pub, priv, x, y } = chavesDoAmbiente();
  const chave = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x, y, d: priv }, format: 'jwk' });
  const parte = o => b64url(JSON.stringify(o));
  const dados = `${parte({ typ: 'JWT', alg: 'ES256' })}.${parte({
    aud: new URL(endpoint).origin,
    exp: Math.floor(agora / 1000) + 12 * 3600,
    sub: process.env.VAPID_SUBJECT || 'https://santadoutrina.com',
  })}`;
  // ieee-p1363: r||s cru, como o JWT pede (e não DER)
  const assinatura = sign('sha256', Buffer.from(dados), { key: chave, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${dados}.${b64url(assinatura)}, k=${pub}`;
}

const TAM_REGISTRO = 4096;   // um registro só: o aviso tem poucas centenas de bytes

/**
 * Cifra `texto` para a inscrição (RFC 8291). `opcoes` só serve ao teste com o vetor da RFC:
 * salt e chave privada fixos em vez de aleatórios.
 * @returns {Buffer} corpo pronto: salt(16) | rs(4) | idlen(1) | chave pública efêmera(65) | cifrado
 */
export function cifrar(texto, { p256dh, auth }, opcoes = {}) {
  const uaPublica = deB64url(p256dh);
  const segredoAuth = deB64url(auth);
  if (uaPublica.length !== 65 || segredoAuth.length !== 16) throw new Error('chaves da inscrição inválidas');
  const ecdh = createECDH('prime256v1');
  if (opcoes.chavePrivada) ecdh.setPrivateKey(opcoes.chavePrivada); else ecdh.generateKeys();
  const asPublica = ecdh.getPublicKey();
  const segredo = ecdh.computeSecret(uaPublica);
  const salt = opcoes.salt || randomBytes(16);

  const info = (rotulo, ...partes) => Buffer.concat([Buffer.from(`${rotulo}\0`), ...partes]);
  const ikm = Buffer.from(hkdfSync('sha256', segredo, segredoAuth, info('WebPush: info', uaPublica, asPublica), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: aes128gcm'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: nonce'), 12));

  const claro = Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])]);   // 0x02: último registro
  if (claro.length + 16 > TAM_REGISTRO) throw new Error('aviso grande demais');
  const cifra = createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([cifra.update(claro), cifra.final(), cifra.getAuthTag()]);

  const cabecalho = Buffer.alloc(21);
  salt.copy(cabecalho, 0);
  cabecalho.writeUInt32BE(TAM_REGISTRO, 16);
  cabecalho[20] = asPublica.length;
  return Buffer.concat([cabecalho, asPublica, cifrado]);
}

/**
 * Envia `payload` (objeto → JSON) para uma inscrição. Devolve { status, morta }:
 * 404 e 410 significam que a inscrição não existe mais e deve sair do arquivo.
 */
export async function enviar(inscricao, payload, { ttl = 12 * 3600, topico } = {}) {
  const corpo = cifrar(JSON.stringify(payload), inscricao.keys);
  const headers = {
    'Authorization': cabecalhoVapid(inscricao.endpoint),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(corpo.length),
    'TTL': String(ttl),
    'Urgency': 'high',   // com 'normal' a Apple segura o aviso enquanto o iPhone está parado (de madrugada)
  };
  // o serviço guarda só o último aviso do mesmo tópico; a Apple recusa o cabeçalho (400 BadWebPushTopic)
  if (topico && !new URL(inscricao.endpoint).hostname.endsWith('push.apple.com')) headers.Topic = topico;
  const r = await fetch(inscricao.endpoint, { method: 'POST', headers, body: corpo, signal: AbortSignal.timeout(15000) });
  await r.arrayBuffer().catch(() => {});
  return { status: r.status, morta: r.status === 404 || r.status === 410 };
}

// ---- arquivo de inscrições ------------------------------------------------------------------

const ARQUIVO = () => process.env.PUSH_ARQUIVO || '/dados/push.json';
let fila = Promise.resolve();   // uma gravação de cada vez

export async function lerInscricoes() {
  try {
    const d = JSON.parse(await readFile(ARQUIVO(), 'utf8'));
    return { inscricoes: Array.isArray(d.inscricoes) ? d.inscricoes : [], ultimoEnvio: d.ultimoEnvio || null };
  } catch { return { inscricoes: [], ultimoEnvio: null }; }
}

async function gravar(dados) {
  const arq = ARQUIVO();
  await mkdir(dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(dados));
  await rename(tmp, arq);   // troca atômica
}

/** Lê, transforma e grava, sem duas gravações ao mesmo tempo. `f` recebe os dados e devolve o que quiser. */
export function alterarInscricoes(f) {
  const tarefa = fila.then(async () => {
    const dados = await lerInscricoes();
    const resultado = await f(dados);
    await gravar(dados);
    return resultado;
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

/** Uma inscrição válida vinda do navegador? Devolve só os campos que interessam. */
export function inscricaoValida(x) {
  const endpoint = x?.endpoint, p256dh = x?.keys?.p256dh, auth = x?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\/[^\s]{1,1500}$/.test(endpoint)) return null;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  try {
    if (deB64url(p256dh).length !== 65 || deB64url(auth).length !== 16) return null;
  } catch { return null; }
  return { endpoint, keys: { p256dh, auth }, desde: new Date().toISOString() };
}
