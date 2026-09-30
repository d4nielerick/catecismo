/**
 * api/apoio.js — GET /api/apoio
 * Devolve { mes, meta, arrecadado, doacoes, atualizado } do mês corrente, para a barra do menu.
 */

import { resumoDoMes } from './_apoio.mjs';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  const dados = await resumoDoMes();
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' },
  });
}
