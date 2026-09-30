/**
 * _apoio.mjs — registro das doações (Stripe) que alimenta a barra de progresso do menu da Liturgia.
 *
 * Guarda só valor (centavos), data e um hash curto do id da sessão (para não contar o mesmo aviso
 * duas vezes). Nenhum nome, e-mail ou dado de pagamento passa por aqui.
 *
 * Variáveis de ambiente (container catecismo-api):
 *   APOIO_ARQUIVO   onde gravar o registro (precisa sobreviver a deploy e a recriação do container)
 *   APOIO_META      meta mensal em reais (padrão 150)
 *   STRIPE_WEBHOOK_SECRET  segredo de assinatura do webhook (whsec_…) — só no servidor
 *   APOIO_ACEITA_TESTE=1   conta também pagamentos do modo de teste (só para testar)
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ARQUIVO = () => process.env.APOIO_ARQUIVO || '/dados/apoio.json';
const FUSO = 'America/Sao_Paulo';

let fila = Promise.resolve();   // uma gravação de cada vez

async function ler() {
  try { return JSON.parse(await readFile(ARQUIVO(), 'utf8')); }
  catch { return { eventos: [] }; }
}

async function gravar(dados) {
  const arq = ARQUIVO();
  await mkdir(dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(dados));
  await rename(tmp, arq);   // troca atômica: nunca fica um arquivo pela metade
}

/** 'AAAA-MM' no fuso de Brasília. */
export const mesDe = (data) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' })
  .format(data).slice(0, 7);

/** Soma um pagamento confirmado. Devolve false se esse id já tinha sido contado. */
export function registrar({ id, centavos, quando = new Date() }) {
  const h = createHash('sha256').update(String(id)).digest('hex').slice(0, 16);
  const tarefa = fila.then(async () => {
    const dados = await ler();
    if (dados.eventos.some(e => e.h === h)) return false;
    dados.eventos.push({ h, v: centavos, t: quando.toISOString() });
    await gravar(dados);
    return true;
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

/** Total do mês corrente e número de doações. */
export async function resumoDoMes(agora = new Date()) {
  const { eventos } = await ler();
  const mes = mesDe(agora);
  const doMes = eventos.filter(e => mesDe(new Date(e.t)) === mes);
  const centavos = doMes.reduce((s, e) => s + e.v, 0);
  const meta = Number(process.env.APOIO_META) || 150;
  return {
    mes,
    meta,
    arrecadado: Math.round(centavos) / 100,
    doacoes: doMes.length,
    atualizado: eventos.length ? eventos[eventos.length - 1].t : null,
  };
}

/** Confere o cabeçalho Stripe-Signature ("t=…,v1=…") contra o corpo cru. */
export function assinaturaValida(corpo, cabecalho, segredo, tolerancia = 300, agora = Date.now()) {
  if (!cabecalho || !segredo) return false;
  const partes = Object.fromEntries(cabecalho.split(',').map(p => p.split('=')).filter(p => p.length === 2));
  const t = Number(partes.t);
  if (!t || Math.abs(agora / 1000 - t) > tolerancia) return false;
  const esperado = createHmac('sha256', segredo).update(`${t}.${corpo}`).digest();
  return cabecalho.split(',').filter(p => p.startsWith('v1=')).some(p => {
    const dado = Buffer.from(p.slice(3), 'hex');
    return dado.length === esperado.length && timingSafeEqual(dado, esperado);
  });
}
