/** Cabeçalhos CORS das rotas de apoio: o menu roda em liturgia.santadoutrina.com e chama santadoutrina.com/api. */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export const json = (status, corpo, extra = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra } });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Limite simples por IP (em memória): devolve false quando passou do máximo na janela. */
export function limitador(max, janelaMs) {
  const mapa = new Map();
  return (ip, agora = Date.now()) => {
    if (mapa.size > 2000) for (const [k, v] of mapa) if (agora - v.ini > janelaMs) mapa.delete(k);
    const e = mapa.get(ip);
    if (!e || agora - e.ini > janelaMs) { mapa.set(ip, { ini: agora, n: 1 }); return true; }
    return ++e.n <= max;
  };
}

export const ipDe = req => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
