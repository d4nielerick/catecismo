/**
 * api/_xai.mjs — chamada ao modelo da xAI com prazo total e reforço.
 *
 * Medido de dentro do container catecismo-api: conexão e TLS abrem em ~30 ms,
 * a resposta normal chega em 0,6–3 s e, de vez em quando, nenhum byte de
 * resposta vem por 30 s — inclusive com conexão nova e IPv4 forçado. A espera
 * é do lado da xAI, não da rede do servidor.
 *
 * Repetir só depois de o prazo estourar custava o prazo inteiro. Aqui, se a
 * resposta não chega em `reforcoMs`, sai uma segunda chamada idêntica e vale a
 * que responder primeiro; a outra é cancelada. Nunca mais de duas. Falha
 * passageira (429, 5xx, rede) dispara o reforço na hora; erro de verdade
 * (400, 401) falha na hora, sem reforço.
 */

const URL_MODELO = 'https://api.x.ai/v1/chat/completions';
export const MODELO = 'grok-4-1-fast-non-reasoning';

const passageira = (err) =>
  err.name === 'TimeoutError' || err.name === 'AbortError'
  || /^modelo (429|5\d\d)/.test(err.message) || /fetch failed/.test(err.message);

async function chamarUmaVez(apiKey, { sistema, usuario, maxTokens, temperatura = 0.1, emJson = false }, signal) {
  const resp = await fetch(URL_MODELO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELO,
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
      max_tokens: maxTokens,
      temperature: temperatura,
      ...(emJson ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`modelo ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const dados = await resp.json();
  return { texto: dados.choices?.[0]?.message?.content ?? '', uso: dados.usage || {} };
}

/**
 * @param {string} apiKey
 * @param {{ sistema: string, usuario: string, maxTokens: number, temperatura?: number,
 *           emJson?: boolean, prazoMs: number, reforcoMs: number }} opcoes
 * @returns {Promise<{ texto: string, uso: object }>}
 */
export function chamarModelo(apiKey, opcoes) {
  const { prazoMs, reforcoMs } = opcoes;

  return new Promise((resolve, reject) => {
    const controles = [];
    let emVoo = 0;
    let reforcou = false;
    let fim = false;

    const encerrar = (fn, valor) => {
      if (fim) return;
      fim = true;
      clearTimeout(tReforco);
      clearTimeout(tPrazo);
      for (const c of controles) c.abort(); // cancela a que perdeu
      fn(valor);
    };

    const disparar = () => {
      const c = new AbortController();
      controles.push(c);
      emVoo++;
      chamarUmaVez(apiKey, opcoes, c.signal).then(
        (r) => encerrar(resolve, r),
        (err) => {
          emVoo--;
          if (fim) return;
          if (!passageira(err)) return encerrar(reject, err);
          if (!reforcou) return reforcar(`falha passageira (${err.message})`);
          if (emVoo === 0) encerrar(reject, err);
        },
      );
    };

    const reforcar = (motivo) => {
      if (reforcou || fim) return;
      reforcou = true;
      clearTimeout(tReforco);
      console.error(`[xai] ${motivo}; disparando reforço`);
      disparar();
    };

    const tPrazo = setTimeout(() => {
      encerrar(reject, Object.assign(new Error(`sem resposta em ${prazoMs} ms`), { name: 'TimeoutError' }));
    }, prazoMs);
    const tReforco = setTimeout(() => reforcar(`sem resposta em ${reforcoMs} ms`), reforcoMs);
    disparar();
  });
}
