/**
 * _mercadopago.mjs — Checkout Pro do Mercado Pago para as doações da Liturgia Diária.
 *
 * Fluxo: GET /api/apoio-checkout?valor=20 cria uma "preferência" (já com o endereço do aviso) e
 * redireciona a pessoa ao pagamento. Quando o pagamento muda de estado, o Mercado Pago avisa em
 * /api/apoio-mp-webhook com SÓ o número do pagamento; aqui conferimos a assinatura do aviso e
 * consultamos o pagamento na API (com o Access Token) para saber valor e status.
 *
 * Variáveis de ambiente (container catecismo-api, nunca no repositório):
 *   MP_ACCESS_TOKEN    Access Token de produção da aplicação no Mercado Pago
 *   MP_WEBHOOK_SECRET  "chave secreta" das notificações (Webhooks) da aplicação
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';
export const SITE = 'https://liturgia.santadoutrina.com/';
export const URL_AVISO = 'https://santadoutrina.com/api/apoio-mp-webhook';

/** Cria a preferência e devolve o endereço do pagamento (init_point). */
export async function criarPreferencia(reais, { fetchFn = fetch, token = process.env.MP_ACCESS_TOKEN } = {}) {
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente');
  const r = await fetchFn(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 'apoio', title: 'Apoio à Liturgia Diária', description: 'Doação voluntária para manter o site no ar', quantity: 1, unit_price: reais, currency_id: 'BRL' }],
      back_urls: { success: `${SITE}?apoio=obrigado`, pending: `${SITE}?apoio=obrigado`, failure: SITE },
      auto_return: 'approved',
      notification_url: URL_AVISO,
      statement_descriptor: 'LITURGIA',
      external_reference: `apoio-${Date.now()}`,
    }),
  });
  if (!r.ok) throw new Error(`Mercado Pago recusou a preferência (${r.status})`);
  const j = await r.json();
  if (!j.init_point) throw new Error('resposta sem init_point');
  return j.init_point;
}

/**
 * Confere x-signature ("ts=…,v1=…") do aviso. O texto assinado é
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com HMAC-SHA256 e a chave secreta.
 */
export function assinaturaMpValida({ dataId, requestId, assinatura, segredo, tolerancia = 600, agora = Date.now() }) {
  if (!assinatura || !segredo || !dataId) return false;
  const partes = Object.fromEntries(assinatura.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const ts = Number(partes.ts);
  if (!ts || !partes.v1) return false;
  const seg = ts > 1e12 ? ts / 1000 : ts;   // o ts pode vir em segundos ou em milissegundos
  if (Math.abs(agora / 1000 - seg) > tolerancia) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : String(dataId);
  const manifesto = `id:${id};request-id:${requestId || ''};ts:${partes.ts};`;
  const esperado = createHmac('sha256', segredo).update(manifesto).digest();
  const dado = Buffer.from(partes.v1, 'hex');
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

/** Consulta o pagamento na API do Mercado Pago. */
export async function buscarPagamento(id, { fetchFn = fetch, token = process.env.MP_ACCESS_TOKEN } = {}) {
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente');
  const r = await fetchFn(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`consulta do pagamento falhou (${r.status})`);
  return r.json();
}

const DESCRICAO = 'Apoio à Liturgia Diária';
const EMAIL_PADRAO = 'doador-anonimo@santadoutrina.com';
export const emailValido = e => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Cria um pagamento Pix (aparece na própria página) e devolve o código "copia e cola" e o QR em base64. */
export async function criarPix(reais, { email, fetchFn = fetch, token = process.env.MP_ACCESS_TOKEN, agora = Date.now(), chave = crypto.randomUUID() } = {}) {
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente');
  const expira = new Date(agora + 30 * 60 * 1000);
  const r = await fetchFn(`${API}/v1/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': chave },
    body: JSON.stringify({
      transaction_amount: reais,
      description: DESCRICAO,
      payment_method_id: 'pix',
      payer: { email: emailValido(email) ? email : EMAIL_PADRAO },
      notification_url: URL_AVISO,
      external_reference: `apoio-pix-${agora}`,
      date_of_expiration: expira.toISOString().replace('Z', '+00:00'),
    }),
  });
  if (!r.ok) throw new Error(`Mercado Pago recusou o Pix (${r.status})`);
  const j = await r.json();
  const d = j.point_of_interaction?.transaction_data;
  if (!j.id || !d?.qr_code) throw new Error('resposta do Pix sem código');
  return { id: j.id, codigo: d.qr_code, qr: d.qr_code_base64 || null, expira: expira.toISOString() };
}

/** Situação de um pagamento de apoio (só devolve o status: nada de dados do pagador). */
export async function statusDoApoio(id, deps = {}) {
  const pg = await buscarPagamento(id, deps);
  if (pg.description !== DESCRICAO) return null;   // não é um pagamento de apoio
  return { status: pg.status, valor: Number(pg.transaction_amount) };
}
