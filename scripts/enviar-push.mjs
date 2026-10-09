/**
 * scripts/enviar-push.mjs — manda o aviso "Evangelho de hoje" para quem ligou os avisos no app.
 *
 *   node scripts/enviar-push.mjs           # às 6h de Brasília, uma vez por dia (o cron chama de hora em hora)
 *   node scripts/enviar-push.mjs --agora   # ignora a hora e o registro do dia (teste)
 *
 * Por que de hora em hora: o cron da VPS roda no fuso de Berlim, que tem horário de verão, e o
 * cron do Ubuntu não aceita fuso por tarefa. Então a tarefa roda toda hora e é este script que
 * decide: só manda se em Brasília já passou das 6h e ainda não mandou hoje (ultimoEnvio no arquivo).
 *
 * Inscrições e o registro do último envio: PUSH_ARQUIVO (padrão /dados/push.json). As que o
 * serviço de push devolve 404/410 são apagadas. Precisa de VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alterarInscricoes, enviar, lerInscricoes } from '../api/_push.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HORA_DO_AVISO = 6;
const FUSO = 'America/Sao_Paulo';
const agora = process.argv.includes('--agora');

const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const dia = `${partes.year}-${partes.month}-${partes.day}`;
const hora = Number(partes.hour);

if (!agora && hora < HORA_DO_AVISO) process.exit(0);
const { inscricoes, ultimoEnvio } = await lerInscricoes();
if (!agora && ultimoEnvio === dia) process.exit(0);
if (!inscricoes.length) { console.log(`${dia}: nenhuma inscrição`); process.exit(0); }

let leituras;
try { leituras = JSON.parse(readFileSync(path.join(RAIZ, 'data', 'liturgia', `${dia}.json`), 'utf8')); }
catch { console.error(`${dia}: sem data/liturgia/${dia}.json — aviso não enviado`); process.exit(1); }
const evangelho = leituras.missas?.[0]?.leituras?.find(l => l.tipo === 'evangelho');
const corpo = [evangelho?.referencia, leituras.celebracao].filter(Boolean).join(' · ');

const payload = { titulo: 'Evangelho de hoje', corpo, url: '/liturgiadiaria/', tag: `evangelho-${dia}` };

// marca o dia antes de mandar: se algo cair no meio, o log acusa e ninguém recebe duas vezes
await alterarInscricoes(d => { d.ultimoEnvio = dia; });

const mortas = new Set();
let enviadas = 0, falhas = 0;
const LOTE = 20;
for (let i = 0; i < inscricoes.length; i += LOTE) {
  await Promise.all(inscricoes.slice(i, i + LOTE).map(async ins => {
    try {
      const { status, morta } = await enviar(ins, payload, { topico: 'evangelho' });
      if (morta) mortas.add(ins.endpoint);
      else if (status >= 200 && status < 300) enviadas++;
      else { falhas++; console.error(`  ${status} ${new URL(ins.endpoint).host}`); }
    } catch (e) { falhas++; console.error(`  erro ${new URL(ins.endpoint).host}: ${e.message}`); }
  }));
}
if (mortas.size) await alterarInscricoes(d => { d.inscricoes = d.inscricoes.filter(x => !mortas.has(x.endpoint)); });

console.log(`${dia} ${String(hora).padStart(2, '0')}h · ${corpo} · enviadas ${enviadas} · falhas ${falhas} · removidas ${mortas.size}`);
process.exit(falhas && !enviadas ? 1 : 0);
