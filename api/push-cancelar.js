/**
 * api/push-cancelar.js — POST /api/push-cancelar  { endpoint }
 * Tira a inscrição de /dados/push.json. O navegador já desfez a inscrição do lado dele; isto só
 * evita que o envio diário bata em um endpoint morto até o serviço devolver 410.
 */

import { alterarInscricoes } from './_push.mjs';
import { ipDe, json, limitador, preflight } from './_cors.mjs';

export const config = { runtime: 'edge' };

const permitido = limitador(10, 10 * 60 * 1000);

export default async function handler(req) {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!permitido(ipDe(req))) return json(429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  let corpo;
  try { corpo = await req.json(); } catch { return json(400, { error: 'JSON inválido' }); }
  const endpoint = corpo?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return json(400, { error: 'Endpoint inválido' });
  try {
    const removida = await alterarInscricoes(d => {
      const antes = d.inscricoes.length;
      d.inscricoes = d.inscricoes.filter(x => x.endpoint !== endpoint);
      return antes !== d.inscricoes.length;
    });
    return json(200, { ok: true, removida });
  } catch (e) {
    console.error('[push-cancelar]', e.message);
    return json(500, { error: 'Não foi possível cancelar.' });
  }
}
