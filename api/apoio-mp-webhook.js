/**
 * api/apoio-mp-webhook.js — POST /api/apoio-mp-webhook (notificações do Mercado Pago)
 * Confere a assinatura, consulta o pagamento e, se estiver "approved" em BRL, soma no registro.
 * Só conta pagamento real (live_mode), salvo com APOIO_ACEITA_TESTE=1.
 */

import { registrar } from './_apoio.mjs';
import { assinaturaMpValida, buscarPagamento } from './_mercadopago.mjs';

export const config = { runtime: 'edge' };

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req, deps = {}) {
  if (req.method !== 'POST') return resposta(405, { error: 'Método não permitido' });
  const url = new URL(req.url);
  let corpo = {};
  try { corpo = JSON.parse((await req.text()) || '{}'); } catch { /* o id também vem na URL */ }
  const dataId = url.searchParams.get('data.id') || corpo.data?.id;
  const tipo = url.searchParams.get('type') || corpo.type;
  if (!assinaturaMpValida({ dataId, requestId: req.headers.get('x-request-id'), assinatura: req.headers.get('x-signature'), segredo: process.env.MP_WEBHOOK_SECRET })) {
    return resposta(400, { error: 'Assinatura inválida' });
  }
  if (tipo !== 'payment') return resposta(200, { ignorado: tipo });
  let pg;
  try { pg = await (deps.buscarPagamento || buscarPagamento)(dataId); }
  catch (e) { console.error('[apoio-mp-webhook]', e.message); return resposta(500, { error: 'consulta falhou' }); }   // 5xx: o Mercado Pago tenta de novo
  if (pg.status !== 'approved') return resposta(200, { ignorado: `status ${pg.status}` });
  if (pg.live_mode === false && process.env.APOIO_ACEITA_TESTE !== '1') return resposta(200, { ignorado: 'modo de teste' });
  const valor = Number(pg.transaction_amount);
  if (pg.currency_id !== 'BRL' || !(valor > 0)) return resposta(200, { ignorado: 'valor inválido' });
  const novo = await registrar({ id: `mp_${pg.id}`, centavos: Math.round(valor * 100) });
  return resposta(200, { registrado: novo });
}
