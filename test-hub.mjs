/**
 * test-hub.mjs — testes do hub de perguntas sem chamar a xAI.
 *
 * Cobre validação, cache, limite por IP, leitura do plano, travas de citação e
 * sustentação, fora do escopo, falha do planejador, nova tentativa e reforço
 * de chamada. O modelo é simulado trocando o fetch global.
 *
 * `node test-hub.mjs`
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Cache e contador do endpoint vão para uma pasta nova a cada execução —
// um cache de execução anterior mudaria o resultado dos testes.
process.env.TMPDIR = mkdtempSync(join(tmpdir(), 'test-hub-'));
let falhas = 0;
const { default: handler, _montar, lerPlano } = await import('./api/pergunta.js');
const req = (body, ip = '1.1.1.1') => new Request('http://x/api/pergunta', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const ok = (nome, cond) => { if (!cond) falhas++; console.log((cond ? '✓ ' : '✗ ') + nome); };

// ── validação e chave
ok('curta demais → 400', (await handler(req({ pergunta: 'oi' }))).status === 400);
ok('não-string → 400', (await handler(req({ pergunta: 42 }))).status === 400);
ok('GET → 405', (await handler(new Request('http://x', { method: 'GET' }))).status === 405);
delete process.env.GROK_API_KEY;
ok('sem GROK_API_KEY → 503', (await handler(req({ pergunta: 'O que é o purgatório?' }, '1.0.0.1'))).status === 503);

// ── lerPlano: nada do planejador passa sem validação
ok('plano válido', JSON.stringify(lerPlano('{"escopo":true,"assunto":"purgatório","termos":["purificação","eleitos"],"hipotese":"A purificação final dos eleitos."}')) === '{"escopo":true,"assunto":"purgatório","termos":["purificação","eleitos"],"hipotese":"A purificação final dos eleitos"}');
ok('plano com lixo em volta ainda lê o JSON', lerPlano('claro! {"escopo":false} fim')?.escopo === false);
ok('plano quebrado → null', lerPlano('não é json') === null);
ok('hipótese lida, limpa e cortada em 300', (() => { const p = lerPlano(JSON.stringify({ hipotese: '<script>x</script> ' + 'a'.repeat(400) })); return p.hipotese.length === 300 && !p.hipotese.includes('<'); })());
ok('hipótese ausente vira texto vazio', lerPlano('{"escopo":true}').hipotese === '');
ok('escopo ausente conta como true', lerPlano('{"assunto":"x"}').escopo === true);
ok('termos: só strings, até 6, sem marcação', (() => { const p = lerPlano('{"termos":["<b>a</b>",1,"b","c","d","e","f","g"]}'); return p.termos.length === 6 && !p.termos[0].includes('<'); })());

// ── montar + travas
const enviados = [1030, 1031, 1032];
const a = _montar('O purgatório é a purificação final dos eleitos [§1031]. Inventado [§9999].', enviados, 'purgatório');
ok('mantém §1031, remove §9999', a.tipo === 'resposta' && a.citados.map((c) => c.numero).join() === '1031' && !a.texto.includes('9999'));
ok('entendimento vai na resposta', a.entendimento === 'purgatório');
ok('frase com § real mas sem apoio no texto sai', (() => { const r = _montar('O purgatório é a purificação final dos eleitos [§1031]. A cremação é proibida em qualquer caso [§1030].', enviados); return r.citados.length === 1 && !r.texto.includes('cremação'); })());
ok('só frases sem apoio → nao-encontrado', _montar('Rezar pelo time é idolatria [§1031].', enviados).tipo === 'nao-encontrado');
ok('NAO_ENCONTRADO → nao-encontrado', _montar('NAO_ENCONTRADO', enviados).tipo === 'nao-encontrado');
ok('texto sem citação → nao-encontrado', _montar('O purgatório existe.', enviados).tipo === 'nao-encontrado');
ok('frases antes da citação, sem citação própria, saem', (() => {
  const r = _montar('O purgatório existe desde sempre. Todos vão para lá. É a purificação final dos eleitos [§1031].', enviados);
  return r.tipo === 'resposta' && !r.texto.includes('Todos vão') && !r.texto.includes('desde sempre') && r.texto.includes('purificação final');
})());
ok('"frase. [§N]" continua valendo para a frase', _montar('É a purificação final dos eleitos. [§1031]', enviados).tipo === 'resposta');

// ── fluxo com modelo simulado
process.env.GROK_API_KEY = 'teste';
let chamadas = { plano: 0, redator: 0 };
let planoSimulado = '{"escopo":true,"assunto":"purgatório purificação final","termos":["purificação","eleitos"]}';
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  if (body.response_format) {
    chamadas.plano++;
    return new Response(JSON.stringify({ choices: [{ message: { content: planoSimulado } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  }
  chamadas.redator++;
  return new Response(JSON.stringify({ choices: [{ message: { content: 'É a purificação final dos eleitos [§1031].' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
};

const r1 = await (await handler(req({ pergunta: 'O que é o Purgatório?!' }, '2.2.2.2'))).json();
ok('responde com §1031 e mostra o entendimento', r1.tipo === 'resposta' && r1.citados[0]?.numero === 1031 && r1.entendimento === 'purgatório purificação final');
const r2 = await (await handler(req({ pergunta: 'o que e o purgatorio' }, '3.3.3.3'))).json();
ok('variação de acento/caixa sai do cache, sem nova chamada', r2.cache === true && chamadas.plano === 1 && chamadas.redator === 1);

planoSimulado = '{"escopo":false,"assunto":"placar","termos":[]}';
const r3 = await (await handler(req({ pergunta: 'Quem ganhou o jogo de ontem?' }, '4.4.4.4'))).json();
ok('fora do escopo → não chama o redator', r3.tipo === 'fora-do-escopo' && chamadas.redator === 1);

planoSimulado = 'isto não é json';
const r4 = await (await handler(req({ pergunta: 'Qual é a purificação final dos eleitos?' }, '5.5.5.5'))).json();
ok('planejador quebrado → segue só com a pergunta e responde', r4.tipo === 'resposta' && r4.entendimento === null);

// ── nova tentativa em falha passageira
const fetchNormal = globalThis.fetch;
const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
planoSimulado = '{"escopo":true,"assunto":"purgatório purificação final","termos":["purificação"]}';
let falhasRedator = 1;
globalThis.fetch = async (url, opts) => {
  if (!JSON.parse(opts.body).response_format && falhasRedator-- > 0) throw timeout();
  return fetchNormal(url, opts);
};
const r5 = await handler(req({ pergunta: 'Existe purificação final dos eleitos?' }, '6.6.6.6'));
ok('redator estoura o prazo uma vez → nova tentativa responde', r5.status === 200 && (await r5.json()).tipo === 'resposta');
falhasRedator = 2;
const r6 = await handler(req({ pergunta: 'Como é a purificação final dos eleitos?' }, '7.7.7.7'));
ok('estoura duas vezes → 502, sem terceira chamada', r6.status === 502 && falhasRedator === 0);
globalThis.fetch = fetchNormal;

planoSimulado = '{"escopo":true,"assunto":"graça","termos":["graça"]}';
const status = [];
for (let i = 0; i < 7; i++) status.push((await handler(req({ pergunta: `pergunta diferente sobre graça número ${i}` }, '9.9.9.9'))).status);
ok('7ª pergunta nova do mesmo IP → 429 (' + status.join(',') + ')', status.slice(0, 6).every((s) => s === 200) && status[6] === 429);

// ── reforço (_xai.mjs): segunda chamada quando a primeira não responde
const { chamarModelo } = await import('./api/_xai.mjs');
const presa = (opts) => new Promise((_, rej) =>
  opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('abortada'), { name: 'AbortError' }))));
{
  const sinais = [];
  let n = 0;
  globalThis.fetch = (_url, opts) => {
    n++; sinais.push(opts.signal);
    if (n === 1) return presa(opts);
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'segunda' } }], usage: {} })));
  };
  const t0 = Date.now();
  const r = await chamarModelo('k', { sistema: 's', usuario: 'u', maxTokens: 1, prazoMs: 2000, reforcoMs: 100 });
  const ms = Date.now() - t0;
  ok(`primeira presa → reforço responde (${ms} ms)`, r.texto === 'segunda' && ms < 800);
  ok('a chamada presa é cancelada, e só houve 2', sinais[0].aborted === true && n === 2);
}
{
  let n = 0;
  globalThis.fetch = (_url, opts) => { n++; return presa(opts); };
  const t0 = Date.now();
  const e = await chamarModelo('k', { sistema: 's', usuario: 'u', maxTokens: 1, prazoMs: 400, reforcoMs: 100 }).catch((x) => x);
  const ms = Date.now() - t0;
  ok(`as duas presas → TimeoutError no prazo, só 2 chamadas (${ms} ms)`, e.name === 'TimeoutError' && n === 2 && ms >= 380 && ms < 900);
}
{
  let n = 0;
  globalThis.fetch = async () => { n++; return new Response('requisição inválida', { status: 400 }); };
  const e = await chamarModelo('k', { sistema: 's', usuario: 'u', maxTokens: 1, prazoMs: 2000, reforcoMs: 100 }).catch((x) => x);
  await new Promise((r) => setTimeout(r, 200));
  ok('erro 400 → falha na hora, sem reforço', /modelo 400/.test(e.message) && n === 1);
}

globalThis.fetch = undefined;
if (falhas) {
  console.error(`❌ ${falhas} teste(s) do hub falharam`);
  process.exit(1);
}
console.log('✅ Hub: validação, cache, limites, plano, travas e reforço verificados.');
process.exit(0); // o endpoint agenda a gravação do cache; não precisa esperar
