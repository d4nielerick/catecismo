/**
 * api/apoio-pix.js — POST /api/apoio-pix  { valor: 20, email?: "..." }
 * Cria um Pix no Mercado Pago e devolve { id, codigo, qr, expira } para o menu mostrar na própria página.
 * A confirmação chega pelo webhook (registro) e pela consulta de /api/apoio-status (tela do menu).
 */

import { criarPix } from './_mercadopago.mjs';
import { ipDe, json, limitador, preflight } from './_cors.mjs';

export const config = { runtime: 'edge' };

const permitido = limitador(8, 10 * 60 * 1000);

export default async function handler(req, deps = {}) {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!permitido(ipDe(req))) return json(429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  let corpo;
  try { corpo = await req.json(); } catch { return json(400, { error: 'JSON inválido' }); }
  const valor = Number(corpo?.valor);
  if (!Number.isInteger(valor) || valor < 1 || valor > 1000) return json(400, { error: 'Valor inválido (R$ 1 a R$ 1000)' });
  try {
    return json(200, await (deps.criarPix || criarPix)(valor, { email: corpo?.email }));
  } catch (e) {
    console.error('[apoio-pix]', e.message);
    return json(502, { error: 'Não foi possível gerar o Pix agora.' });
  }
}
