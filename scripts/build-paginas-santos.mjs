/**
 * scripts/build-paginas-santos.mjs — páginas estáticas de "santo do dia".
 *
 *   data/santos/<slug>.json (resumo da Wikipédia, CC BY-SA 4.0) + data/liturgia/*.json (em que datas
 *   cada celebração cai) + data/santos-frases.json (frase e pintura, quando há)
 *     --> santos/<slug>/index.html       uma página por celebração com resumo
 *     --> santos/dia/<MM-DD>/index.html  "Santo do dia 1 de outubro: …" (a busca que o Google recebe)
 *     --> santos/index.html              calendário mês a mês
 *     --> sitemap-santos.xml
 *
 * Tudo isso é gerado e fica fora do git (como as páginas de cada dia da Liturgia): rode antes do deploy.
 * Só santos/santos.css é versionado. As datas vêm do calendário real: um memorial que caiu num domingo
 * não aparece naquele ano, e as festas móveis mudam de data — a página mostra as datas em que a
 * celebração de fato aparece.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, pad, hojeLocal, COR_PONTO, COR_CALENDARIO, COR_TITULO, NOME_COR, urlDoDia } from '../liturgiadiaria/render.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://santadoutrina.com';
const NOME_SITE = 'Santa Doutrina';
const DADOS = path.join(RAIZ, 'data');
const PASTA = path.join(RAIZ, 'santos');
const SITEMAP = path.join(RAIZ, 'sitemap-santos.xml');
const DESCRICAO_MAX = 158;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Nome do temporal ("24º Domingo do Tempo Comum"): não é santo nem festa, fica fora do calendário.
const TEMPORAL = /^(?:\d+º Domingo\b|\d+º dia da Oitava|(?:Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado) (?:da \d+ª Semana|depois d|da Oitava|do Tempo do Natal))/;

const lerJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const formatar = (dt, opcoes) => new Date(`${dt}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });
const diaMes = md => `${Number(md.slice(3))} de ${MESES[Number(md.slice(0, 2)) - 1]}`; // "01-10" → "1 de outubro"
const extenso = dt => formatar(dt, { day: 'numeric', month: 'long', year: 'numeric' });
const ano = dt => dt.slice(0, 4);
const urlSanto = slug => `/santos/${slug}/`;
const urlData = md => `/santos/dia/${md}/`;

function cortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}

// ── Dados ────────────────────────────────────────────────────────────────────
export function carregar() {
  const pastaLit = path.join(DADOS, 'liturgia');
  const datas = fs.readdirSync(pastaLit).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
  const dias = new Map(datas.map(dt => [dt, lerJson(path.join(pastaLit, `${dt}.json`))]));
  const porCelebracao = new Map(); // celebração → datas em que aparece
  for (const [dt, dia] of dias) {
    if (!porCelebracao.has(dia.celebracao)) porCelebracao.set(dia.celebracao, []);
    porCelebracao.get(dia.celebracao).push(dt);
  }
  const indiceSantos = lerJson(path.join(DADOS, 'santos', 'indice.json'));
  const frases = lerJson(path.join(DADOS, 'santos-frases.json'));
  const pinturas = new Map(lerJson(path.join(DADOS, 'cards-imagens.json')).imagens.map(i => [i.id, i]));
  const hoje = hojeLocal();

  const santos = [];
  for (const [celebracao, slug] of Object.entries(indiceSantos)) {
    const ocorrencias = porCelebracao.get(celebracao) || [];
    if (!ocorrencias.length) continue; // o verificador da liturgia já acusa isso
    const fixa = new Set(ocorrencias.map(d => d.slice(5))).size === 1;
    // A missa que a página detalha: a próxima vez que a celebração cai; se já passou em todos os anos, a última.
    const principal = ocorrencias.find(d => d >= hoje) || ocorrencias.at(-1);
    // A frase pode estar em "porData" (santo lembrado quando o dia cai num domingo): vale do mesmo jeito.
    const frase = frases.frases[celebracao] || Object.values(frases.porData || {}).find(f => f.nome === celebracao) || null;
    const pintura = frase?.imagem ? pinturas.get(frase.imagem) || null : null;
    santos.push({
      celebracao, slug, ocorrencias, fixa, principal, md: principal.slice(5),
      dia: dias.get(principal), frase, pintura, dados: lerJson(path.join(DADOS, 'santos', `${slug}.json`)),
    });
  }
  santos.sort((a, b) => a.md.localeCompare(b.md) || a.celebracao.localeCompare(b.celebracao, 'pt-BR'));

  // Celebrações do calendário sem página (ficam no índice, sem link). Só as fixas: as móveis sem página
  // são dias da Semana Santa, não santos.
  const semPagina = [];
  for (const [celebracao, ocorrencias] of porCelebracao) {
    if (indiceSantos[celebracao] || TEMPORAL.test(celebracao)) continue;
    const mds = new Set(ocorrencias.map(d => d.slice(5)));
    if (mds.size === 1) semPagina.push({ celebracao, md: [...mds][0], ocorrencias });
  }

  // Santos lembrados em dia comum ou domingo (não são a celebração do dia): entram na página da data.
  const lembrados = new Map(Object.entries(frases.porData || {}).map(([md, f]) => [md, f.nome]));

  return { datas, dias, porCelebracao, santos, semPagina, lembrados, hoje };
}

/** O que cai numa data MM-DD, em qualquer ano: celebrações com página, as sem página e os lembrados. */
export function porData({ santos, semPagina, lembrados, porCelebracao }) {
  const mapa = new Map();
  const entrada = md => { if (!mapa.has(md)) mapa.set(md, { md, santos: [], outras: [], lembrado: null }); return mapa.get(md); };
  for (const s of santos) {
    for (const md of new Set(s.ocorrencias.map(d => d.slice(5)))) {
      entrada(md).santos.push({ santo: s, anos: s.ocorrencias.filter(d => d.slice(5) === md).map(ano) });
    }
  }
  for (const o of semPagina) entrada(o.md).outras.push(o);
  for (const [md, nome] of lembrados) {
    const e = entrada(md);
    if (!e.santos.some(x => x.santo.celebracao === nome)) e.lembrado = { nome, santo: santos.find(s => s.celebracao === nome) || null };
  }
  for (const e of mapa.values()) {
    // Primeiro quem é fixo nesse dia (todo ano), depois as festas móveis que passaram por ele.
    e.santos.sort((a, b) => Number(b.santo.fixa) - Number(a.santo.fixa) || b.anos.length - a.anos.length);
  }
  // Só ganha página a data com ao menos um santo que tem página.
  return [...mapa.values()].filter(e => e.santos.length).sort((a, b) => a.md.localeCompare(b.md));
}

// ── Pedaços de HTML ──────────────────────────────────────────────────────────
const CREDITO_WIKIPEDIA = 'Texto da <a href="https://pt.wikipedia.org/" target="_blank" rel="noopener">Wikipédia</a>, a enciclopédia livre, sob a licença <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY-SA 4.0</a>.';

const fitaHtml = cor => NOME_COR[cor] ? `
  <span class="sd-fita" data-cor="${cor}" role="img" aria-label="Cor litúrgica: ${NOME_COR[cor]}" title="Cor litúrgica: ${NOME_COR[cor]}">
    <svg viewBox="0 0 30 68" preserveAspectRatio="none" aria-hidden="true">
      <path class="sd-fita-fundo" d="M0 -1H30V68L15 56L0 68Z"/>
      <path class="sd-fita-costura" d="M3.5 -1V61L15 51.5L26.5 61V-1"/>
    </svg>
  </span>` : '';

const seloHtml = dia => dia ? `
      <p class="tempo-wrap"><span class="cor-dot" style="background: ${COR_PONTO[dia.cor] || 'transparent'}"></span><span class="tempo-badge">${esc(dia.tempo)}${NOME_COR[dia.cor] ? ` · cor ${NOME_COR[dia.cor]}` : ''}</span></p>` : '';

const trilhaHtml = (...itens) => `
    <nav class="sd-trilha" aria-label="Você está em"><a href="/liturgiadiaria/">Liturgia Diária</a> › <a href="/santos/">Santo do dia</a>${itens.map(i => ` › ${i}`).join('')}</nav>`;

/** Leituras da missa principal de um dia: "1ª Leitura: Jó 19,21-27 · Salmo: … · Evangelho: …". */
const leiturasDoDia = dia => dia.missas[0].leituras
  .filter(l => !l.alternativa && l.referencia && ['leitura', 'salmo', 'evangelho'].includes(l.tipo));

function leiturasHtml(dt, dia, { titulo }) {
  const lista = leiturasDoDia(dia).map(l => `<li><span class="sd-rotulo">${esc(l.rotulo)}</span> ${esc(l.referencia)}</li>`).join('');
  return `
    <section class="sd-leituras" aria-labelledby="sd-leituras-titulo">
      <h2 id="sd-leituras-titulo">${esc(titulo)}</h2>
      ${dia.complemento ? `<p class="sd-complemento">${esc(dia.complemento)}</p>` : ''}
      <ul class="sd-lista-leituras">${lista}</ul>
      <a class="sd-link" href="${urlDoDia(dt)}">Ler as leituras completas de ${esc(extenso(dt))} →</a>
    </section>`;
}

function artigosHtml(dados) {
  const varios = dados.artigos.length > 1;
  return dados.artigos.map(a => `
      <article class="sd-artigo">
        ${a.imagem ? `<img class="sd-artigo-img" src="${esc(a.imagem.src)}" width="${a.imagem.largura}" height="${a.imagem.altura}" alt="${esc(a.titulo)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
        ${varios ? `<h3>${esc(a.titulo)}</h3>` : ''}
        ${a.resumo.map(p => `<p>${esc(p)}</p>`).join('\n        ')}
        <a class="sd-link" href="${esc(a.url)}" target="_blank" rel="noopener">Ler o artigo completo na Wikipédia ↗</a>
      </article>`).join('');
}

function pinturaHtml(s, { lazy = false } = {}) {
  if (!s.pintura) return '';
  const credito = s.pintura.recriacao
    ? `Pintura do acervo da Liturgia Diária, recriação ${esc(s.pintura.recriacao)}.`
    : 'Pintura do acervo da Liturgia Diária.';
  return `
    <figure class="sd-pintura">
      <img src="/assets/img/cards/${s.pintura.id}.webp" width="1280" height="960" alt="${esc(s.pintura.titulo)}, pintura"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'}>
      ${s.frase ? `<blockquote class="sd-frase"><p>“${esc(s.frase.frase)}”</p></blockquote>` : ''}
      <figcaption>${s.frase ? `<span class="sd-fonte">${esc(s.frase.nome)}, <em>${esc(s.frase.fonte)}</em>.</span> ` : ''}<span class="sd-credito-pintura">${credito}</span></figcaption>
    </figure>`;
}

const rodapeHtml = ({ wikipedia }) => `
  <footer class="sd-rodape">
    ${wikipedia ? `<p class="sd-credito">${CREDITO_WIKIPEDIA}</p>` : ''}
    <p class="sd-credito">As leituras e o calendário são da <a href="/liturgiadiaria/">Liturgia Diária</a> · <a href="/">${NOME_SITE}</a></p>
  </footer>`;

// ── Documento ────────────────────────────────────────────────────────────────
function documento({ titulo, descricao, url, imagem, imagemTipo = 'image/jpeg', tipo = 'article', jsonLd, cor, corpo }) {
  const estilo = COR_CALENDARIO[cor] ? ` style="--sd-cor: ${COR_CALENDARIO[cor]}; --sd-cor-titulo: ${COR_TITULO[cor]}"` : '';
  const ld = JSON.stringify(jsonLd, null, 2).replace(/<\//g, '<\\/').replace(/\n/g, '\n  ');
  return `<!DOCTYPE html>
<html lang="pt-BR"${estilo}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}">
  <link rel="canonical" href="${url}">

  <meta property="og:title"       content="${esc(titulo)}">
  <meta property="og:description" content="${esc(descricao)}">
  <meta property="og:type"        content="${tipo}">
  <meta property="og:url"         content="${url}">
  <meta property="og:image"       content="${imagem}">
  <meta property="og:image:type"  content="${imagemTipo}">
  <meta property="og:site_name"   content="Liturgia Diária · ${NOME_SITE}">
  <meta property="og:locale"      content="pt_BR">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(titulo)}">
  <meta name="twitter:description" content="${esc(descricao)}">
  <meta name="twitter:image"       content="${imagem}">

  <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/liturgia-icone-32.png?v=3">
  <link rel="apple-touch-icon" href="/assets/img/liturgia-icone-180.png?v=3">
  <meta name="theme-color" content="#fcfaf7">
  <link rel="preload" href="/assets/fonts/inria-serif-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/inria-serif-400-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/main.css">
  <link rel="stylesheet" href="/santos/santos.css">

  <script type="application/ld+json">
  ${ld}
  </script>
  <script defer src="https://umami.danielerick.com/script.js" data-website-id="28c35f85-bd1b-4ea9-8f52-fc98d33b4974"></script>
</head>
<body>
${fitaHtml(cor)}
<div class="sd-pagina">${corpo}
</div>
</body>
</html>
`;
}

const trilhaLd = (url, itens) => ({
  '@type': 'BreadcrumbList', '@id': `${url}#trilha`,
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: NOME_SITE, item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Liturgia Diária', item: `${SITE}/liturgiadiaria/` },
    { '@type': 'ListItem', position: 3, name: 'Santo do dia', item: `${SITE}/santos/` },
    ...itens.map((it, k) => ({ '@type': 'ListItem', position: 4 + k, name: it.name, item: it.item })),
  ],
});

// ── Página do santo ──────────────────────────────────────────────────────────
const imagemDe = s => s.pintura
  ? { url: `${SITE}/assets/img/cards/${s.pintura.id}.webp`, tipo: 'image/webp', largura: 1280, altura: 960 }
  : { url: `${SITE}/liturgiadiaria/og/${s.principal}.jpg`, tipo: 'image/jpeg', largura: 1200, altura: 630 };

/** "Celebrado em 1 de outubro" ou, nas festas móveis, "em 2026, 5 de abril; em 2027, 28 de março". */
export function quandoHtml(s) {
  if (s.fixa) return `Celebrado em ${diaMes(s.md)}`;
  return `Festa móvel: ${s.ocorrencias.map(d => `em ${ano(d)}, ${formatar(d, { day: 'numeric', month: 'long' })}`).join('; ')}`;
}

// "Vida" é para santo; festa do Senhor ou de Nossa Senhora tem "história".
const vidaOuHistoria = s => /^(?:São|Santa|Santo|Santos|Bem-aventurad)/.test(s.celebracao) ? 'vida' : 'história';

export function tituloDoSanto(s) {
  const quando = s.fixa ? `santo do dia ${diaMes(s.md)}` : `celebração de ${extenso(s.principal)}`;
  return `${s.celebracao}: ${quando} — ${vidaOuHistoria(s)}${s.frase ? ', frase' : ''} e leituras da missa`;
}

export function descricaoDoSanto(s) {
  const inicio = s.dados.artigos[0].resumo[0].replace(/\s+/g, ' ').trim();
  const quando = s.fixa ? `Santo do dia ${diaMes(s.md)}` : extenso(s.principal);
  return cortar(`${quando}: ${s.celebracao}. ${inicio}`, DESCRICAO_MAX);
}

export function paginaDoSanto(s, ctx) {
  const { santos, porCelebracao, lembrados } = ctx;
  const url = `${SITE}${urlSanto(s.slug)}`;
  const titulo = tituloDoSanto(s);
  const descricao = descricaoDoSanto(s);
  const imagem = imagemDe(s);
  const k = santos.indexOf(s);
  const ant = santos[(k - 1 + santos.length) % santos.length]; // o calendário dá a volta: depois de dezembro, janeiro
  const prox = santos[(k + 1) % santos.length];

  // Outras celebrações que já caíram neste mesmo dia do mês (em outro ano) e o santo lembrado no dia.
  const outras = [];
  for (const [celebracao, ocorrencias] of porCelebracao) {
    if (celebracao === s.celebracao || TEMPORAL.test(celebracao)) continue;
    const anos = ocorrencias.filter(d => d.slice(5) === s.md).map(ano);
    if (anos.length) outras.push({ celebracao, anos, santo: santos.find(x => x.celebracao === celebracao) || null });
  }
  const lembrado = lembrados.get(s.md);
  if (lembrado && lembrado !== s.celebracao) outras.push({ celebracao: lembrado, anos: [], santo: santos.find(x => x.celebracao === lembrado) || null });
  const nomeLink = o => o.santo ? `<a href="${urlSanto(o.santo.slug)}">${esc(o.celebracao)}</a>` : esc(o.celebracao);
  const outrasHtml = outras.length ? `
    <aside class="sd-outras">
      <p>Neste mesmo dia: ${outras.map(o => `${nomeLink(o)}${o.anos.length ? ` (em ${o.anos.join(', ')})` : ''}`).join('; ')}.</p>
    </aside>` : '';

  const outrosAnos = s.ocorrencias.filter(d => d !== s.principal);
  const outrosAnosHtml = outrosAnos.length ? `
      <p class="sd-outros-anos">Leituras de outros anos: ${outrosAnos.map(d => `<a href="${urlDoDia(d)}">${esc(formatar(d, { day: 'numeric', month: 'short', year: 'numeric' }))}</a>`).join(' · ')}</p>` : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': url, mainEntityOfPage: url, url, headline: titulo, name: s.celebracao, description: descricao, inLanguage: 'pt-BR',
        image: { '@type': 'ImageObject', url: imagem.url, width: imagem.largura, height: imagem.altura },
        isPartOf: { '@type': 'WebSite', name: NOME_SITE, url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: NOME_SITE, url: `${SITE}/` },
        citation: s.dados.artigos.map(a => a.url),
        breadcrumb: { '@id': `${url}#trilha` },
      },
      trilhaLd(url, [{ name: s.celebracao, item: url }]),
    ],
  };

  const corpo = `
  <header class="sd-cabeca">${trilhaHtml(esc(s.celebracao))}
    <p class="sd-marca">Santo do dia</p>
    <h1 class="sd-titulo">${esc(s.celebracao)}</h1>
    <p class="sd-data">${esc(quandoHtml(s))}</p>${seloHtml(s.dia)}
  </header>
${pinturaHtml(s)}
  <section class="sd-vida" aria-labelledby="sd-vida-titulo">
    <h2 id="sd-vida-titulo">Sobre a celebração</h2>${artigosHtml(s.dados)}
    <p class="sd-credito">${CREDITO_WIKIPEDIA}</p>
  </section>
${leiturasHtml(s.principal, s.dia, { titulo: `As leituras da missa de ${extenso(s.principal)}` })}${outrosAnosHtml}${outrasHtml}
  <nav class="sd-dias" aria-label="Outros santos">
    <a class="sd-dia-ant" href="${urlSanto(ant.slug)}" rel="prev">← ${esc(ant.celebracao)}</a>
    <a class="sd-dia-hoje" href="${urlData(s.md)}">Santo do dia ${esc(diaMes(s.md))}</a>
    <a class="sd-dia-prox" href="${urlSanto(prox.slug)}" rel="next">${esc(prox.celebracao)} →</a>
  </nav>${rodapeHtml({ wikipedia: false })}`;

  return documento({ titulo, descricao, url, imagem: imagem.url, imagemTipo: imagem.tipo, jsonLd, cor: s.dia?.cor, corpo });
}

// ── Página da data ───────────────────────────────────────────────────────────
/** "Santa Teresinha do Menino Jesus" ou, se só festas móveis passaram pelo dia, "Domingo de Páscoa (2026)". */
const nomesDoDia = e => {
  const fixos = e.santos.filter(x => x.santo.fixa);
  const lista = fixos.length ? fixos.map(x => x.santo.celebracao) : e.santos.map(x => `${x.santo.celebracao} (${x.anos.join(', ')})`);
  return lista.join(' e ');
};
export const tituloDaData = e => `Santo do dia ${diaMes(e.md)}: ${nomesDoDia(e)}`;

export function paginaDaData(e, ctx, lista) {
  const { dias, hoje } = ctx;
  const url = `${SITE}${urlData(e.md)}`;
  const titulo = tituloDaData(e);
  const primeiro = e.santos[0].santo;
  const descricao = cortar(`${titulo}. ${primeiro.dados.artigos[0].resumo[0].replace(/\s+/g, ' ').trim()}`, DESCRICAO_MAX);
  const comPintura = e.santos.find(x => x.santo.pintura)?.santo;
  // A liturgia desta data: a próxima vez que ela chega, em qualquer ano do calendário.
  const datas = [...dias.keys()].filter(d => d.slice(5) === e.md);
  const dt = datas.find(d => d >= hoje) || datas.at(-1);
  const imagem = comPintura ? imagemDe(comPintura) : { url: `${SITE}/liturgiadiaria/og/${dt}.jpg`, tipo: 'image/jpeg', largura: 1200, altura: 630 };
  const k = lista.indexOf(e);
  const ant = lista[(k - 1 + lista.length) % lista.length];
  const prox = lista[(k + 1) % lista.length];

  const cartoes = e.santos.map(({ santo: s, anos }) => `
    <article class="sd-cartao">
      ${s.pintura ? `<a href="${urlSanto(s.slug)}"><img class="sd-cartao-img" src="/assets/img/cards/mini/${s.pintura.id}.webp" width="200" height="150" alt="${esc(s.pintura.titulo)}, pintura" loading="lazy"></a>` : ''}
      <div class="sd-cartao-texto">
        <h2><a href="${urlSanto(s.slug)}">${esc(s.celebracao)}</a></h2>
        <p class="sd-cartao-anos">${s.fixa ? `Celebrado todo ano em ${esc(diaMes(e.md))}` : `Neste dia em ${anos.join(', ')}`}${s.fixa && anos.length < 4 ? ` (no calendário: ${anos.join(', ')})` : ''}</p>
        ${s.frase ? `<p class="sd-cartao-frase">“${esc(s.frase.frase)}”</p>` : ''}
        <p>${esc(cortar(s.dados.artigos[0].resumo[0].replace(/\s+/g, ' ').trim(), 320))}</p>
        <a class="sd-link" href="${urlSanto(s.slug)}">${vidaOuHistoria(s)[0].toUpperCase()}${vidaOuHistoria(s).slice(1)}${s.frase ? ', frase' : ''} e leituras de ${esc(s.celebracao)} →</a>
      </div>
    </article>`).join('');

  const mais = [];
  for (const o of e.outras) mais.push(`${esc(o.celebracao)} (no calendário em ${o.ocorrencias.map(ano).join(', ')})`);
  if (e.lembrado) mais.push(e.lembrado.santo ? `<a href="${urlSanto(e.lembrado.santo.slug)}">${esc(e.lembrado.nome)}</a>` : esc(e.lembrado.nome));
  const maisHtml = mais.length ? `
    <aside class="sd-outras"><p>A Igreja também lembra neste dia: ${mais.join('; ')}.</p></aside>` : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': url, url, name: titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: { '@type': 'WebSite', name: NOME_SITE, url: `${SITE}/` },
        primaryImageOfPage: { '@type': 'ImageObject', url: imagem.url, width: imagem.largura, height: imagem.altura },
        breadcrumb: { '@id': `${url}#trilha` },
      },
      trilhaLd(url, [{ name: diaMes(e.md), item: url }]),
    ],
  };

  const corpo = `
  <header class="sd-cabeca">${trilhaHtml(esc(diaMes(e.md)))}
    <p class="sd-marca">Santo do dia</p>
    <h1 class="sd-titulo sd-titulo-data">${esc(titulo)}</h1>${seloHtml(dias.get(dt))}
  </header>
  <section class="sd-cartoes" aria-label="Santos do dia">${cartoes}
  </section>${maisHtml}
${leiturasHtml(dt, dias.get(dt), { titulo: `As leituras da missa de ${extenso(dt)}` })}
  <nav class="sd-dias" aria-label="Outros dias">
    <a class="sd-dia-ant" href="${urlData(ant.md)}" rel="prev">← ${esc(diaMes(ant.md))}</a>
    <a class="sd-dia-hoje" href="/santos/">Calendário dos santos</a>
    <a class="sd-dia-prox" href="${urlData(prox.md)}" rel="next">${esc(diaMes(prox.md))} →</a>
  </nav>${rodapeHtml({ wikipedia: true })}`;

  return documento({ titulo, descricao, url, imagem: imagem.url, imagemTipo: imagem.tipo, jsonLd, cor: dias.get(dt)?.cor, corpo });
}

// ── Índice por mês ───────────────────────────────────────────────────────────
export function paginaIndice(ctx, lista) {
  const { santos, semPagina } = ctx;
  const url = `${SITE}/santos/`;
  const titulo = 'Santo do dia: calendário dos santos mês a mês — vida, frase e leituras da missa';
  const descricao = `Os santos e as festas de cada dia do ano, com um resumo da vida de cada um, a frase do santo e as leituras da missa. ${santos.length} celebrações, mês a mês.`;
  const comData = new Set(lista.map(e => e.md));

  const meses = MESES.map((nome, m) => {
    const mm = pad(m + 1);
    const itens = [
      ...santos.filter(s => s.fixa && s.md.startsWith(mm)).map(s => ({ md: s.md, nome: s.celebracao, slug: s.slug })),
      ...semPagina.filter(o => o.md.startsWith(mm)).map(o => ({ md: o.md, nome: o.celebracao })),
    ].sort((a, b) => a.md.localeCompare(b.md) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const li = itens.map(i => {
      const d = Number(i.md.slice(3));
      const dia = comData.has(i.md) ? `<a class="sd-indice-dia" href="${urlData(i.md)}">${d}</a>` : `<span class="sd-indice-dia">${d}</span>`;
      const nome = i.slug ? `<a href="${urlSanto(i.slug)}">${esc(i.nome)}</a>` : `<span class="sd-sem-pagina">${esc(i.nome)}</span>`;
      return `
        <li>${dia} ${nome}</li>`;
    }).join('');
    return `
    <section class="sd-mes" id="${nome}">
      <h2>${nome[0].toUpperCase()}${nome.slice(1)}</h2>
      <ul>${li}
      </ul>
    </section>`;
  }).join('');

  const moveis = santos.filter(s => !s.fixa).sort((a, b) => a.principal.localeCompare(b.principal));
  const moveisHtml = `
    <section class="sd-mes sd-moveis" id="festas-moveis">
      <h2>Festas móveis</h2>
      <ul>${moveis.map(s => `
        <li><a href="${urlSanto(s.slug)}">${esc(s.celebracao)}</a> <span class="sd-indice-anos">${s.ocorrencias.map(d => `${esc(formatar(d, { day: 'numeric', month: 'short' }))} de ${ano(d)}`).join(' · ')}</span></li>`).join('')}
      </ul>
    </section>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': url, url, name: titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: { '@type': 'WebSite', name: NOME_SITE, url: `${SITE}/` },
        breadcrumb: { '@id': `${url}#trilha` },
      },
      trilhaLd(url, []),
    ],
  };

  const corpo = `
  <header class="sd-cabeca">
    <nav class="sd-trilha" aria-label="Você está em"><a href="/liturgiadiaria/">Liturgia Diária</a> › Santo do dia</nav>
    <p class="sd-marca">Liturgia Diária</p>
    <h1 class="sd-titulo">Santo do dia</h1>
    <p class="sd-data">O calendário dos santos, mês a mês: quem a Igreja celebra em cada dia, com a vida, a frase e as leituras da missa.</p>
    <nav class="sd-meses" aria-label="Meses">${MESES.map(m => `<a href="#${m}">${m.slice(0, 3)}</a>`).join('')}</nav>
  </header>
  <div class="sd-indice">${meses}${moveisHtml}
  </div>
  <p class="sd-credito sd-legenda">Os nomes sem link ainda não têm página. As datas seguem o calendário litúrgico do Brasil; um memorial que cai num domingo ou numa solenidade não é celebrado naquele ano.</p>${rodapeHtml({ wikipedia: false })}`;

  return documento({ titulo, descricao, url, imagem: `${SITE}/liturgiadiaria/og/liturgia.jpg`, tipo: 'website', jsonLd, cor: '', corpo });
}

export function sitemapSantos(santos, lista) {
  const url = (loc, extra = '') => `  <url>\n    <loc>${SITE}${loc}</loc>${extra}\n  </url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/santos/', '\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>'),
    ...lista.map(e => url(urlData(e.md))),
    ...santos.map(s => url(urlSanto(s.slug))),
    '</urlset>',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const ctx = carregar();
  const lista = porData(ctx);
  // Só o CSS é versionado: o resto da pasta é refeito do zero.
  for (const nome of fs.readdirSync(PASTA)) {
    if (nome === 'santos.css') continue;
    fs.rmSync(path.join(PASTA, nome), { recursive: true, force: true });
  }
  const gravar = (rel, html) => { fs.mkdirSync(path.dirname(rel), { recursive: true }); fs.writeFileSync(rel, html); };
  for (const s of ctx.santos) gravar(path.join(PASTA, s.slug, 'index.html'), paginaDoSanto(s, ctx));
  for (const e of lista) gravar(path.join(PASTA, 'dia', e.md, 'index.html'), paginaDaData(e, ctx, lista));
  gravar(path.join(PASTA, 'index.html'), paginaIndice(ctx, lista));
  fs.writeFileSync(SITEMAP, sitemapSantos(ctx.santos, lista));
  const semPintura = ctx.santos.filter(s => !s.pintura).length;
  console.log(`santos: ${ctx.santos.length} páginas de santos (${semPintura} sem pintura), ${lista.length} páginas de data, índice + sitemap-santos.xml; ${ctx.semPagina.length} celebrações do calendário sem página`);
}
