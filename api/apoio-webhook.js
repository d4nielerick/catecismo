/**
 * api/apoio-webhook.js — POST /api/apoio-webhook (webhook da Stripe)
 *
 * Recebe checkout.session.completed / checkout.session.async_payment_succeeded, confere a
 * assinatura e soma o valor no registro. Só conta sessão com payment_status "paid". Pagamentos do
 * modo de teste só entram com APOIO_ACEITA_TESTE=1.
 */

import { assinaturaValida, registrar } from './_apoio.mjs';

export const config = { runtime: 'edge' };

const EVENTOS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return resposta(405, { error: 'Método não permitido' });
  const corpo = await req.text();   // o corpo cru: a assinatura é calculada sobre ele
  if (!assinaturaValida(corpo, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return resposta(400, { error: 'Assinatura inválida' });
  }
  let evento;
  try { evento = JSON.parse(corpo); } catch { return resposta(400, { error: 'JSON inválido' }); }
  if (!EVENTOS.has(evento.type)) return resposta(200, { ignorado: evento.type });

  const s = evento.data?.object || {};
  if (s.payment_status !== 'paid') return resposta(200, { ignorado: 'ainda não pago' });
  if (!evento.livemode && process.env.APOIO_ACEITA_TESTE !== '1') return resposta(200, { ignorado: 'modo de teste' });
  if (String(s.currency).toLowerCase() !== 'brl' || !Number.isInteger(s.amount_total) || s.amount_total <= 0) {
    return resposta(200, { ignorado: 'valor inválido' });
  }
  const novo = await registrar({ id: s.id, centavos: s.amount_total });
  return resposta(200, { registrado: novo });
}
