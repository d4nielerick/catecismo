/**
 * api/apoio-checkout.js — GET /api/apoio-checkout?valor=20
 * Cria o pagamento no Mercado Pago e redireciona a pessoa para ele. Valor: inteiro de R$ 1 a R$ 1000.
 */

import { criarPreferencia, SITE } from './_mercadopago.mjs';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Método não permitido', { status: 405 });
  const valor = Number(new URL(req.url).searchParams.get('valor'));
  if (!Number.isInteger(valor) || valor < 1 || valor > 1000) return Response.redirect(SITE, 302);
  try {
    return Response.redirect(await criarPreferencia(valor), 302);
  } catch (e) {
    console.error('[apoio-checkout]', e.message);
    return Response.redirect(SITE, 302);   // nunca deixa a pessoa numa tela de erro
  }
}
