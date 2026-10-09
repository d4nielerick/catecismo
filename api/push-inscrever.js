/**
 * api/push-inscrever.js — POST /api/push-inscrever  { inscricao: PushSubscription.toJSON() }
 * Guarda a inscrição em /dados/push.json (uma por endpoint). O aviso diário sai de scripts/enviar-push.mjs.
 */

import { alterarInscricoes, inscricaoValida } from './_push.mjs';
import { ipDe, json, limitador, preflight } from './_cors.mjs';

export const config = { runtime: 'edge' };

const permitido = limitador(10, 10 * 60 * 1000);

export default async function handler(req) {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!permitido(ipDe(req))) return json(429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  let corpo;
  try { corpo = await req.json(); } catch { return json(400, { error: 'JSON inválido' }); }
  const nova = inscricaoValida(corpo?.inscricao);
  if (!nova) return json(400, { error: 'Inscrição inválida' });
  try {
    const total = await alterarInscricoes(d => {
      const i = d.inscricoes.findIndex(x => x.endpoint === nova.endpoint);
      if (i >= 0) d.inscricoes[i] = { ...nova, desde: d.inscricoes[i].desde || nova.desde };
      else d.inscricoes.push(nova);
      return d.inscricoes.length;
    });
    return json(200, { ok: true, total });
  } catch (e) {
    console.error('[push-inscrever]', e.message);
    return json(500, { error: 'Não foi possível guardar a inscrição.' });
  }
}
