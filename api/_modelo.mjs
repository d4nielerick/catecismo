/**
 * api/_modelo.mjs — chamada ao modelo (Claude, da Anthropic) com prazo total e reforço.
 *
 * Medido de dentro do container catecismo-api: conexão e TLS abrem em ~30 ms,
 * a resposta normal chega em 0,6–3 s e, de vez em quando, nenhum byte de
 * resposta vem por 30 s — inclusive com conexão nova e IPv4 forçado. A espera
 * foi do lado da xAI (provedor anterior), não da rede do servidor.
 *
 * Repetir só depois de o prazo estourar custava o prazo inteiro. Aqui, se a
 * resposta não chega em `reforcoMs`, sai uma segunda chamada idêntica e vale a
 * que responder primeiro; a outra é cancelada. Nunca mais de duas. Falha
 * passageira (429, 5xx, rede) dispara o reforço na hora; erro de verdade
 * (400, 401) falha na hora, sem reforço.
 */

const URL_MODELO = 'https://api.anthropic.com/v1/messages';
export const MODELO = 'claude-haiku-5-5'; // o mais barato da linha; basta para resumir e responder com trechos conferidos

const passageira = (err) =>
  err.name === 'TimeoutError' || err.name === 'AbortError'
  || /^modelo (429|5\d\d)/.test(err.message) || /fetch failed/.test(err.message);

// O Haiku 5.5 pensa por padrão e o pensamento conta no max_tokens: com ele ligado, o redator gastou
// os 1210 tokens todos pensando e o JSON saiu cortado. Aqui o pensamento fica desligado (vale em
// esforço baixo) e sobra folga só pelo tokenizador, ~30% maior que o do 4.5. `temperatura` fica na
// assinatura para não mexer nos chamadores, mas não é enviada: o modelo rejeita (400) valor diferente do padrão.
const folga = (maxTokens) => Math.ceil(maxTokens * 1.3) + 100;

async function chamarUmaVez(apiKey, { sistema, usuario, maxTokens, emJson = false }, signal) {
  const resp = await fetch(URL_MODELO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELO,
      system: emJson ? `${sistema}\n\nResponda somente com o objeto JSON, sem texto antes ou depois.` : sistema,
      messages: [{ role: 'user', content: usuario }],
      max_tokens: folga(maxTokens),
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`modelo ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const dados = await resp.json();
  if (dados.stop_reason === 'refusal') console.error('[modelo] recusou a pergunta');
  else if (dados.stop_reason === 'max_tokens') console.error('[modelo] cortado em max_tokens');
  const texto = (dados.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  // Mesmos nomes de antes (prompt_tokens/completion_tokens): o registro em pergunta.js lê esses.
  return { texto, uso: { prompt_tokens: dados.usage?.input_tokens, completion_tokens: dados.usage?.output_tokens } };
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
      console.error(`[modelo] ${motivo}; disparando reforço`);
      disparar();
    };

    const tPrazo = setTimeout(() => {
      encerrar(reject, Object.assign(new Error(`sem resposta em ${prazoMs} ms`), { name: 'TimeoutError' }));
    }, prazoMs);
    const tReforco = setTimeout(() => reforcar(`sem resposta em ${reforcoMs} ms`), reforcoMs);
    disparar();
  });
}
