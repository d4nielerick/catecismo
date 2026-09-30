/**
 * api/apoio-status.js — GET /api/apoio-status?id=123
 * Devolve { status } de um pagamento de apoio (approved, pending, rejected, cancelled…), para o menu
 * fechar o QR e agradecer assim que o Pix for pago.
 */

import { statusDoApoio } from './_mercadopago.mjs';
import { ipDe, json, limitador, preflight } from './_cors.mjs';

export const config = { runtime: 'edge' };

const permitido = limitador(900, 10 * 60 * 1000);   // ~1 consulta a cada 0,7 s por IP

export default async function handler(req, deps = {}) {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'GET') return json(405, { error: 'Método não permitido' });
  if (!permitido(ipDe(req))) return json(429, { error: 'Muitas consultas' });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{5,20}$/.test(id)) return json(400, { error: 'id inválido' });
  try {
    const s = await (deps.statusDoApoio || statusDoApoio)(id);
    return s ? json(200, { status: s.status, valor: s.valor }) : json(404, { error: 'não encontrado' });
  } catch (e) {
    console.error('[apoio-status]', e.message);
    return json(502, { error: 'consulta falhou' });
  }
}
