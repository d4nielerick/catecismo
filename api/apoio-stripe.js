/**
 * api/apoio-stripe.js — POST /api/apoio-stripe  { valor: 20 }
 * Cria a sessão do Checkout embutido da Stripe e devolve { id, clientSecret } para a janela de
 * cartão do menu. O registro da doação não passa por aqui: vem pelo webhook (apoio-webhook).
 */

import { criarSessao } from './_stripe.mjs';
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
    return json(200, await (deps.criarSessao || criarSessao)(valor));
  } catch (e) {
    console.error('[apoio-stripe]', e.message);
    return json(502, { error: 'Não foi possível abrir o pagamento agora.' });
  }
}
