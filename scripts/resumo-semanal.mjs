#!/usr/bin/env node
/**
 * scripts/resumo-semanal.mjs — resumo da semana da Liturgia Diária no Telegram (segunda de
 * manhã, cron da VPS no host). Sem IA: números do Umami, do push e do Instagram, e até quando
 * cada conteúdo está pronto, com o que precisa ser feito antes de acabar.
 *
 *   node scripts/resumo-semanal.mjs            # monta e manda
 *   node scripts/resumo-semanal.mjs --ensaio   # monta e imprime
 *
 * Umami: lê o banco pelo container umami-db (só SELECT). Push: PUSH_ARQUIVO (padrão
 * /opt/mediaserver/apoio-dados/push.json). Instagram: IG_LITURGIA_TOKEN do ambiente ou de
 * /opt/mediaserver/.env (nunca impresso). "Fora de Lorena" tira as visitas do próprio Daniel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hojeBrasilia, avisar, folegoDoConteudo, dataCurta } from './lib-vigia.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUSH = process.env.PUSH_ARQUIVO || '/opt/mediaserver/apoio-dados/push.json';
const ENV = '/opt/mediaserver/.env';
const ensaio = process.argv.includes('--ensaio');
const { dia: hoje } = hojeBrasilia();
const fmt = n => Number(n || 0).toLocaleString('pt-BR');
const variacao = (a, b) => (b ? ` (${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%)` : '');
const secoes = [];

// ── Umami ────────────────────────────────────────────────────────────────────
function sql(consulta) {
  const saida = execFileSync('docker', ['exec', '-i', 'umami-db', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -v ON_ERROR_STOP=1'],
    { input: consulta, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return saida.trim().split('\n').filter(Boolean).map(l => l.split('|'));
}
try {
  const semana = (de, ate) => `e.created_at >= now() - interval '${de} days' and e.created_at < now() - interval '${ate} days'`;
  const fora = `coalesce(s.city, '') <> 'Lorena'`;
  const base = `from website_event e join session s on s.session_id = e.session_id and s.website_id = e.website_id`;
  const liturgia = `e.url_path like '/liturgiadiaria%'`;
  const [[sesA, pvA, litA, litForaA]] = sql(`select count(distinct e.session_id) filter (where e.event_type = 1),
      count(*) filter (where e.event_type = 1),
      count(distinct e.session_id) filter (where e.event_type = 1 and ${liturgia}),
      count(distinct e.session_id) filter (where e.event_type = 1 and ${liturgia} and ${fora})
    ${base} where ${semana(7, 0)};`);
  const [[sesB, , litB, litForaB]] = sql(`select count(distinct e.session_id) filter (where e.event_type = 1),
      count(*) filter (where e.event_type = 1),
      count(distinct e.session_id) filter (where e.event_type = 1 and ${liturgia}),
      count(distinct e.session_id) filter (where e.event_type = 1 and ${liturgia} and ${fora})
    ${base} where ${semana(14, 7)};`);
  const paginas = sql(`select e.url_path, count(distinct e.session_id) n ${base}
    where ${semana(7, 0)} and e.event_type = 1 and ${fora} group by 1 order by 2 desc limit 5;`);
  const origens = sql(`select coalesce(nullif(e.referrer_domain, ''), '(direto)'), count(distinct e.session_id) n ${base}
    where ${semana(7, 0)} and e.event_type = 1 and ${fora} and e.referrer_domain not like '%santadoutrina%' group by 1 order by 2 desc limit 4;`);
  const eventos = sql(`select e.event_name, count(*), count(distinct e.session_id) filter (where ${fora}) ${base}
    where ${semana(7, 0)} and e.event_type = 2 and e.event_name in ('compartilhar', 'push-ativar', 'pwa-instalado', 'apoio-abrir') group by 1;`);
  const ev = Object.fromEntries(eventos.map(([n, total, foraN]) => [n, { total: +total, fora: +foraN }]));
  const linhasEv = [['compartilhar', 'compartilhamentos'], ['push-ativar', 'avisos ligados'], ['pwa-instalado', 'app instalado'], ['apoio-abrir', 'abriram o apoio']]
    .filter(([k]) => ev[k]).map(([k, nome]) => `${nome}: ${ev[k].total} (${ev[k].fora} de fora de Lorena)`);
  secoes.push([
    'Visitas (7 dias)',
    `• site: ${fmt(sesA)} visitas${variacao(+sesA, +sesB)} · ${fmt(pvA)} páginas`,
    `• Liturgia: ${fmt(litA)} visitas${variacao(+litA, +litB)} · fora de Lorena ${fmt(litForaA)}${variacao(+litForaA, +litForaB)}`,
    paginas.length && `• mais vistas: ${paginas.map(([p, n]) => `${p} ${n}`).join(' · ')}`,
    origens.length && `• de onde vêm: ${origens.map(([o, n]) => `${o} ${n}`).join(' · ')}`,
    linhasEv.length ? `• ${linhasEv.join(' · ')}` : '• nenhum compartilhamento nem aviso ligado',
  ].filter(Boolean).join('\n'));
} catch (e) {
  secoes.push(`Visitas: não consegui ler o Umami (${String(e.message).split('\n')[0]})`);
}

// ── Push ─────────────────────────────────────────────────────────────────────
try {
  const p = JSON.parse(fs.readFileSync(PUSH, 'utf8'));
  const novos = p.inscricoes.filter(i => i.desde && Date.now() - new Date(i.desde) < 7 * 864e5).length;
  secoes.push(`Avisos das 6h: ${p.inscricoes.length} inscrito(s)${novos ? `, ${novos} novo(s) na semana` : ''} · último envio ${dataCurta(p.ultimoEnvio)}`);
} catch { /* sem arquivo */ }

// ── Instagram ────────────────────────────────────────────────────────────────
const tokenIg = process.env.IG_LITURGIA_TOKEN
  || (fs.existsSync(ENV) && fs.readFileSync(ENV, 'utf8').match(/^IG_LITURGIA_TOKEN=["']?([^"'\n]+)/m)?.[1]);
if (tokenIg) {
  const API = 'https://graph.instagram.com/v23.0';
  const get = async (rota, params) => {
    const r = await fetch(`${API}${rota}?${new URLSearchParams({ ...params, access_token: tokenIg })}`);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || r.status);
    return j;
  };
  try {
    const conta = await get('/me', { fields: 'followers_count,media_count' });
    const { data: midias = [] } = await get('/me/media', { fields: 'id,timestamp,media_type,media_product_type,caption', limit: '30' });
    const semana = midias.filter(m => Date.now() - new Date(m.timestamp) < 7 * 864e5);
    const comNumeros = [];
    for (const m of semana) {
      try {
        const { data } = await get(`/${m.id}/insights`, { metric: 'reach,views,saved,shares' });
        const v = Object.fromEntries(data.map(x => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? 0]));
        comNumeros.push({ ...m, ...v });
      } catch { comNumeros.push(m); }
    }
    const soma = k => comNumeros.reduce((s, m) => s + (m[k] || 0), 0);
    const melhor = [...comNumeros].sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
    const tipo = m => (m.media_product_type === 'REELS' ? 'Reel' : 'card');
    const dataBr = m => new Date(m.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
    secoes.push([
      'Instagram @liturgia_hoje',
      `• ${fmt(conta.followers_count)} seguidores · ${semana.length} posts na semana`,
      `• alcance ${fmt(soma('reach'))} · visualizações ${fmt(soma('views'))} · salvos ${fmt(soma('saved'))} · compartilhados ${fmt(soma('shares'))}`,
      melhor?.reach && `• melhor: ${tipo(melhor)} de ${dataBr(melhor)} (alcance ${fmt(melhor.reach)}): "${(melhor.caption || '').split('\n')[0].slice(0, 70)}"`,
    ].filter(Boolean).join('\n'));
  } catch (e) {
    secoes.push(`Instagram: não consegui ler (${e.message})`);
  }
}

// ── Fôlego do conteúdo ───────────────────────────────────────────────────────
const COMO = {
  'card do Instagram': 'rodar build-instagram-liturgia.py e subir',
  Reel: 'gerar os Reels dos dias com áudio e subir',
  resumo: 'escrever os resumos (grava-resumos.mjs)',
  trechos: 'escolher os trechos (grava-trechos.mjs)',
  'comentário dos Padres': 'rodar a janela (skill liturgia-janela)',
  áudio: 'gerar o áudio (build-audio-liturgia.mjs)',
  leituras: 'pôr as leituras do ano novo em data/liturgia-fonte/',
};
const folego = folegoDoConteudo(RAIZ, hoje);
const curtos = folego.filter(f => f.dias < 30);
secoes.push([
  'Conteúdo pronto até',
  ...folego.map(f => `${f.dias < 14 ? '⚠️' : f.dias < 30 ? '•' : '✓'} ${f.nome}: ${f.ate ? `${dataCurta(f.ate)} (${f.dias} dias)` : 'falta hoje'}`),
  curtos.length ? `\nA fazer:\n${curtos.sort((a, b) => a.dias - b.dias).map(f => `• ${f.nome}: ${COMO[f.nome]}`).join('\n')}` : '\nNada a fazer nas próximas 4 semanas.',
].join('\n'));

const texto = `Liturgia Diária · semana até ${dataCurta(hoje)}\n\n${secoes.join('\n\n')}`;
const ok = await avisar(texto, { ensaio });
console.log(`${hoje} · resumo semanal ${ensaio ? 'impresso' : ok ? 'enviado' : 'FALHOU'}`);
if (!ok) process.exit(1);
