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
