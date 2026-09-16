/**
 * scripts/build-paginas-liturgia.mjs — uma página HTML pronta por dia da Liturgia Diária.
 *
 *   liturgiadiaria/index.html (modelo) + data/liturgia/AAAA-MM-DD.json
 *     --> liturgiadiaria/AAAA-MM-DD/index.html   (título, descrição, dados estruturados e leituras já no HTML)
 *     --> sitemap-liturgia.xml                   (listado no robots.txt)
 *
 * O desenho vem de liturgiadiaria/render.mjs, o mesmo módulo da página: o que o Google lê é o que o
 * navegador mostra, e o JavaScript redesenha por cima sem mexer no layout. As páginas são geradas
 * (não vão para o git): rode antes de cada deploy. As imagens de compartilhamento vêm de
 * scripts/build-og-liturgia.py. verifica-liturgia.mjs confere que o modelo continua encaixando.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, VERSO, NOME_COR, cabecalhoDoDia, conteudoDoDia, abasHtml, diasHtml, urlDoDia,
} from '../liturgiadiaria/render.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://santadoutrina.cloud';
const NOME_SITE = 'Catecismo da Igreja Católica';
const MODELO = path.join(RAIZ, 'liturgiadiaria', 'index.html');
const DADOS = path.join(RAIZ, 'data', 'liturgia');
const PASTA = path.join(RAIZ, 'liturgiadiaria');
const SITEMAP = path.join(RAIZ, 'sitemap-liturgia.xml');
const DESCRICAO_MAX = 158;

export const lerModelo = () => fs.readFileSync(MODELO, 'utf8');
export const lerIndice = () => JSON.parse(fs.readFileSync(path.join(DADOS, 'indice.json'), 'utf8'));
export const listarDias = () => fs.readdirSync(DADOS).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
export const lerDia = dt => JSON.parse(fs.readFileSync(path.join(DADOS, `${dt}.json`), 'utf8'));

const formatar = (dt, opcoes) => new Date(`${dt}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });
const numerica = dt => dt.split('-').reverse().join('/');

function cortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}

export function descricaoDoDia(dt, dia) {
  const leituras = dia.missas[0].leituras
    .filter(l => !l.alternativa && l.referencia && ['leitura', 'salmo', 'evangelho'].includes(l.tipo));
  const refs = leituras.map(l => (l.tipo === 'evangelho' ? `Evangelho ${l.referencia}` : l.referencia)).join('; ');
  const evangelho = leituras.find(l => l.tipo === 'evangelho');
  const inicio = evangelho
    ? evangelho.texto.split('\n').filter(l => !VERSO.test(l)).join(' ').replace(/\s+/g, ' ').trim()
    : '';
  const quando = formatar(dt, { day: 'numeric', month: 'long', year: 'numeric' });
  const celebracao = dia.celebracao ? ` (${dia.celebracao})` : '';
  return cortar(`Leituras da missa de ${quando}${celebracao}: ${refs}. ${inicio}`.trim(), DESCRICAO_MAX);
}

function trocar(html, de, para) {
  const achou = typeof de === 'string' ? html.includes(de) : de.test(html);
  if (!achou) throw new Error(`modelo liturgiadiaria/index.html mudou: não achei ${de}`);
  return html.replace(de, () => para);
}

const meta = (html, atributo, nome, valor) =>
  trocar(html, new RegExp(`(<meta ${atributo}="${nome}"\\s+content=")[^"]*(")`), `<meta ${atributo}="${nome}" content="${esc(valor)}"`);

export function paginaDoDia(modelo, dt, dia, indice) {
  const cab = cabecalhoDoDia(dt, dia);
  const { html: leituras, blocos } = conteudoDoDia(dia);
  const url = `${SITE}${urlDoDia(dt)}`;
  const imagem = `${SITE}/liturgiadiaria/og/${dt}.jpg`;
  const titulo = `Liturgia Diária ${numerica(dt)}: ${dia.celebracao}`;
  const descricao = descricaoDoDia(dt, dia);
  const quando = formatar(dt, { day: 'numeric', month: 'long', year: 'numeric' });

  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': url, url, name: titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: { '@type': 'WebSite', name: NOME_SITE, url: `${SITE}/` },
        primaryImageOfPage: { '@type': 'ImageObject', url: imagem, width: 1200, height: 630 },
        breadcrumb: { '@id': `${url}#trilha` },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#trilha`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: NOME_SITE, item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Liturgia Diária', item: `${SITE}/liturgiadiaria/` },
          { '@type': 'ListItem', position: 3, name: quando, item: url },
        ],
      },
    ],
  };
  const jsonLd = JSON.stringify(dados, null, 2).replace(/<\//g, '<\\/').replace(/\n/g, '\n  ');

  let h = modelo;
  h = trocar(h, '<html lang="pt-BR">', `<html lang="pt-BR"${cab.corDia ? ` style="--lp-cor-dia: ${cab.corDia}; --lp-cor-titulo: ${cab.corTitulo}"` : ''}>`);
  h = trocar(h, /<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`);
  h = meta(h, 'name', 'description', descricao);
  h = trocar(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  h = meta(h, 'property', 'og:title', titulo);
  h = meta(h, 'property', 'og:description', descricao);
  h = meta(h, 'property', 'og:type', 'article');
  h = meta(h, 'property', 'og:url', url);
  h = meta(h, 'property', 'og:image', imagem);
  h = meta(h, 'name', 'twitter:title', titulo);
  h = meta(h, 'name', 'twitter:description', descricao);
  h = meta(h, 'name', 'twitter:image', imagem);
  h = trocar(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n  ${jsonLd}\n  </script>`);

  h = trocar(h, '<span class="lp-titulo-data" id="lp-titulo-data" aria-hidden="true"></span><span class="lp-so-leitor" id="lp-titulo-leitor"></span>',
    `<span class="lp-titulo-data" id="lp-titulo-data" aria-hidden="true">${cab.dataCurta}</span><span class="lp-so-leitor" id="lp-titulo-leitor"> de ${esc(cab.dataLonga)}</span>`);
  h = trocar(h, '<p class="lp-data" id="lp-data">Carregando…</p>', `<p class="lp-data" id="lp-data">${esc(cab.linha)}</p>`);
  h = trocar(h, '<span class="cor-dot" id="lp-cor-dot"></span>',
    `<span class="cor-dot" id="lp-cor-dot"${cab.corPonto ? ` style="background: ${cab.corPonto}"` : ''}></span>`);
  h = trocar(h, '<span class="tempo-badge" id="lp-tempo"></span>', `<span class="tempo-badge" id="lp-tempo">${esc(cab.tempo)}</span>`);
  h = trocar(h, '<p class="nome-dia" id="lp-nome-dia"></p>', `<p class="nome-dia" id="lp-nome-dia">${esc(cab.nome)}</p>`);
  if (NOME_COR[cab.cor]) {
    h = trocar(h, '<span class="lp-fita" id="lp-fita" role="img" hidden>',
      `<span class="lp-fita" id="lp-fita" role="img" data-cor="${cab.cor}" aria-label="Cor litúrgica do dia: ${NOME_COR[cab.cor]}" title="Cor litúrgica: ${NOME_COR[cab.cor]}">`);
  }
  h = trocar(h, '<nav class="lp-tabs" id="lp-tabs" aria-label="Leituras"></nav>',
    `<nav class="lp-tabs" id="lp-tabs" aria-label="Leituras">${abasHtml(blocos)}</nav>`);
  h = trocar(h, '<p class="loading">Buscando leituras do dia…</p>', leituras.trim());
  h = trocar(h, '<nav class="lp-dias" id="lp-dias" aria-label="Outros dias"></nav>',
    `<nav class="lp-dias" id="lp-dias" aria-label="Outros dias">${diasHtml(dt, indice)}</nav>`);
  return h;
}

export function sitemapLiturgia(datas) {
  const url = (loc, extra = '') => `  <url>\n    <loc>${SITE}${loc}</loc>${extra}\n  </url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/liturgiadiaria/', '\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>'),
    ...datas.map(dt => url(urlDoDia(dt))),
    '</urlset>',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const modelo = lerModelo();
  const indice = lerIndice();
  const datas = listarDias();
  for (const nome of fs.readdirSync(PASTA)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(nome)) fs.rmSync(path.join(PASTA, nome), { recursive: true, force: true });
  }
  let bytes = 0;
  for (const dt of datas) {
    const html = paginaDoDia(modelo, dt, lerDia(dt), indice);
    fs.mkdirSync(path.join(PASTA, dt), { recursive: true });
    fs.writeFileSync(path.join(PASTA, dt, 'index.html'), html);
    bytes += html.length;
  }
  fs.writeFileSync(SITEMAP, sitemapLiturgia(datas));
  console.log(`liturgiadiaria: ${datas.length} páginas (${datas[0]} a ${datas.at(-1)}, ${Math.round(bytes / datas.length / 1024)}KB em média) + sitemap-liturgia.xml`);
}
