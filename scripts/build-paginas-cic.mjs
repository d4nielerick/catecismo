#!/usr/bin/env node
/**
 * scripts/build-paginas-cic.mjs — o Catecismo da Igreja Católica em páginas prontas para ler e
 * para o Google: um endereço por parágrafo e um por tema do índice analítico.
 *
 *   data/catecismo.json (§§ com parte/seção/capítulo/artigo) + data/notas.json (notas de rodapé)
 *   + data/indice_analitico.json (temas → subtemas → §§) + data/relacoes.json + data/saopiox.json
 *   + data/liturgia-comentario/*.json (dias da Liturgia que citam cada §)
 *     --> cic/index.html              (as quatro partes, seção por seção, com os §§ de cada artigo)
 *     --> cic/<n>/index.html          (§ 1 … § 2865)
 *     --> cic/tema/index.html         (os temas, por letra)
 *     --> cic/tema/<slug>/index.html  ("O que o Catecismo diz sobre …")
 *     --> sitemap-cic.xml
 *
 * O app em / continua sendo a busca; estas páginas são a leitura e a porta de entrada pelo Google
 * (o app abre tudo por #paragrafo-N, que o Google não indexa). Tudo isso é gerado (fora do git):
 * rode antes de cada deploy. O texto é o de data/catecismo.json, nunca editado aqui.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../liturgiadiaria/render.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://santadoutrina.com';
const NOME_SITE = 'Santa Doutrina';
const DADOS = path.join(RAIZ, 'data');
const PASTA = path.join(RAIZ, 'cic');
const SITEMAP = path.join(RAIZ, 'sitemap-cic.xml');
const DESCRICAO_MAX = 158;

const lerJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const existe = p => fs.existsSync(p);
export const urlDoParagrafo = n => `/cic/${n}/`;
export const urlDoTema = slug => `/cic/tema/${slug}/`;

function cortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}
const semNotas = t => t.replace(/\s*\(\d+\)/g, '').replace(/\s+([,.;:!?»])/g, '$1').replace(/\s+/g, ' ').trim();
const primeiraFrase = t => semNotas(t).split(/(?<=[.!?»])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ«])/)[0];
export const slugDe = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Os títulos da estrutura vêm em caixa alta na fonte ("A PROFISSÃO DA FÉ"); aqui ficam em caixa de
// frase, com os nomes próprios mais comuns do Catecismo de volta à maiúscula.
const PROPRIOS = new Set(['deus', 'jesus', 'cristo', 'espírito', 'santo', 'igreja', 'maria', 'pai', 'filho', 'senhor', 'israel',
  'escritura', 'sagrada', 'tradição', 'eucaristia', 'pedro', 'paulo', 'trindade', 'adão', 'eva', 'abraão', 'moisés', 'evangelho',
  'novo', 'antigo', 'testamento', 'católica', 'apostólica', 'salvador', 'virgem', 'criador', 'verbo', 'reino', 'cristã', 'mandamento',
  'penitência', 'reconciliação', 'batismo', 'confirmação', 'ordem', 'matrimônio', 'unção', 'enfermos', 'pontífice', 'romano', 'redentor']);
export function nomeDe(s) {
  if (!s) return '';
  const base = s.trim().toLowerCase();
  let primeira = true;
  return base.replace(/[a-záéíóúâêôãõçü]+/g, (p, i) => {
    const antes = base.slice(0, i).trimEnd();
    const abre = primeira || /[«(–—:.]$/.test(antes) || antes.endsWith('« ');
    primeira = false;
    return (abre || PROPRIOS.has(p)) ? p.charAt(0).toUpperCase() + p.slice(1) : p;
  });
}

// ── Leitura dos dados ─────────────────────────────────────────────────────────

export function carregar() {
  const paragrafos = lerJson(path.join(DADOS, 'catecismo.json')).paragrafos;
  const notas = lerJson(path.join(DADOS, 'notas.json'));
  const indice = lerJson(path.join(DADOS, 'indice_analitico.json'));
  const relacoes = existe(path.join(DADOS, 'relacoes.json')) ? lerJson(path.join(DADOS, 'relacoes.json')) : { cic_para_piox: {} };
  const piox = new Map(lerJson(path.join(DADOS, 'saopiox.json')).perguntas.map(q => [q.numero, q]));

  // temas: slug único, só os que apontam para algum §
  const temas = [];
  const slugs = new Map();
  for (const t of indice) {
    // subtema também traz remissão colada ("Inferno vide Inferno", "… (Vide Deveres dos Pais)"): fica só o nome
    const subtemas = t.subtemas.filter(s => s.paragrafos?.length)
      .map(s => ({ ...s, nome: s.nome.replace(/\s*(?:-\s+|\()?\bvide\b.*$/i, '').trim() }));
    if (!subtemas.length) continue;
    // "Advento vide também: espera consumação", "Bom conforme bem": o nome é só a cabeça; o resto vira "ver também"
    const [nome, veja] = t.nome.split(/\s+(?:-\s+)?(?:vide(?:\s+também)?|conforme)\s*:?\s*/i);
    let slug = slugDe(nome) || `tema-${t.id}`;
    if (slugs.has(slug)) slug = `${slug}-${t.id}`;
    slugs.set(slug, t.id);
    temas.push({ id: t.id, nome: nome.trim(), veja: veja?.trim() || '', slug, subtemas });
  }
  // § → [{ tema, subtema }]
  const temasDoParagrafo = new Map();
  for (const t of temas) for (const s of t.subtemas) for (const n of s.paragrafos) {
    if (!temasDoParagrafo.has(n)) temasDoParagrafo.set(n, []);
    temasDoParagrafo.get(n).push({ tema: t, subtema: s.nome });
  }
  // § → dias da Liturgia Diária que o citam (comentário do Evangelho, das outras leituras ou dos Padres)
  const diasDoParagrafo = new Map();
  const pastaCom = path.join(DADOS, 'liturgia-comentario');
  for (const arq of existe(pastaCom) ? fs.readdirSync(pastaCom).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : []) {
    const c = lerJson(path.join(pastaCom, arq));
    const citados = new Map();
    for (const p of c.catecismo || []) citados.set(p.numero, c.evangelho);
    for (const g of c.outrasLeituras || []) for (const p of g.catecismo) if (!citados.has(p.numero)) citados.set(p.numero, g.referencia);
    for (const p of c.padres || []) if (!citados.has(p.numero)) citados.set(p.numero, c.evangelho);
    for (const [n, ref] of citados) {
      if (!diasDoParagrafo.has(n)) diasDoParagrafo.set(n, []);
      diasDoParagrafo.get(n).push({ data: c.data, referencia: ref });
    }
  }
  return { paragrafos, notas, temas, temasDoParagrafo, diasDoParagrafo, relacoes, piox };
}

/** A estrutura do Catecismo: partes → seções → capítulos → artigos, cada um com seu primeiro e último §. */
export function estrutura(paragrafos) {
  const partes = [];
  const achar = (lista, nome, n) => {
    let x = lista.find(i => i.nome === nome);
    if (!x) { x = { nome, de: n, ate: n, filhos: [] }; lista.push(x); }
    x.ate = n;
    return x;
  };
  for (const p of paragrafos) {
    const parte = achar(partes, p.parte, p.numero);
    const secao = achar(parte.filhos, p.secao, p.numero);
    const cap = achar(secao.filhos, p.capitulo, p.numero);
    achar(cap.filhos, p.artigo, p.numero);
  }
  return partes;
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const jsonLd = dados => `<script type="application/ld+json">${JSON.stringify(dados).replace(/</g, '\\u003c')}</script>`;
const organizacao = {
  '@type': 'Organization', '@id': `${SITE}/#organizacao`, name: NOME_SITE, url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/assets/img/liturgia-icone-512.png`, width: 512, height: 512 },
};
const LIVRO = { '@type': 'Book', '@id': `${SITE}/cic/#livro`, name: 'Catecismo da Igreja Católica', inLanguage: 'pt-BR', url: `${SITE}/cic/` };
const trilha = (url, itens) => ({
  '@type': 'BreadcrumbList', '@id': `${url}#trilha`,
  itemListElement: itens.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});
const trilhaHtml = itens => `<nav class="ca-trilha" aria-label="Você está em">${itens.map(([nome, href]) => (href ? `<a href="${href}">${esc(nome)}</a>` : `<span aria-current="page">${esc(nome)}</span>`)).join('<span class="ca-trilha-sep" aria-hidden="true">›</span>')}</nav>`;

function documento({ titulo, descricao, url, dados, corpo, classe = '' }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(descricao)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/assets/catecismo-logo.webp">
  <meta property="og:site_name" content="Catecismo da Igreja Católica · ${NOME_SITE}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <link rel="apple-touch-icon" href="/assets/favicon.png">
  <meta name="theme-color" content="#fcfaf7">
  <link rel="preload" href="/assets/fonts/inria-serif-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/inria-serif-400-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/main.css">
  <link rel="stylesheet" href="/catena/catena.css">
  <link rel="stylesheet" href="/cic/cic.css">
  ${jsonLd(dados)}
  <script defer src="https://umami.danielerick.com/script.js" data-website-id="28c35f85-bd1b-4ea9-8f52-fc98d33b4974"></script>
</head>
<body class="ca cic ${classe}">
${corpo}
</body>
</html>
`;
}

const rodapeHtml = () => `
  <footer class="ca-rodape">
    <p>Texto do <i>Catecismo da Igreja Católica</i> (Libreria Editrice Vaticana), na tradução publicada em
      <a href="https://www.vatican.va/archive/cathechism_po/index_new/prima-pagina-cic_po.html" target="_blank" rel="noopener">vatican.va</a>,
      com a grafia adaptada ao português do Brasil. Os temas vêm do índice analítico da edição oficial.</p>
    <p class="ca-rodape-links"><a href="/">Buscar no Catecismo</a> · <a href="/cic/">Índice</a> · <a href="/cic/tema/">Temas</a> · <a href="/saopiox/">Catecismo de São Pio X</a> · <a href="/liturgiadiaria/">Liturgia Diária</a></p>
  </footer>`;

/** O texto do §: um <p> por linha da fonte, citações inteiras em «…» viram <blockquote>, e cada
 *  marcador "(N)" vira a chamada da nota N (sem link quando a nota não chegou da fonte). */
function textoHtml(p, notasDoPar) {
  const marcador = (m, n) => (notasDoPar[n]
    ? `<sup class="cic-chamada"><a href="#nota-${n}" id="ref-${n}" aria-label="nota ${n}">${n}</a></sup>`
    : `<sup class="cic-chamada">${n}</sup>`);
  return p.texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const html = esc(l).replace(/\s*\((\d+)\)/g, marcador);
    return /^«[\s\S]*»[.,;]?(\s*<sup[\s\S]*)?$/.test(html) ? `<blockquote>${html}</blockquote>` : `<p>${html}</p>`;
  }).join('\n      ');
}

const formatar = dt => new Date(`${dt}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

export function paginaDoParagrafo(p, d, { anterior = null, seguinte = null } = {}) {
  const url = `${SITE}${urlDoParagrafo(p.numero)}`;
  const lugar = [p.parte, p.secao, p.capitulo, p.artigo].filter(Boolean).map(nomeDe);
  const contexto = lugar.at(-1) || 'Catecismo da Igreja Católica';
  const titulo = cortar(`§ ${p.numero} do Catecismo da Igreja Católica — ${contexto}`, 90);
  const descricao = cortar(semNotas(p.texto), DESCRICAO_MAX);
  const notasDoPar = d.notas[String(p.numero)] || {};
  const temas = d.temasDoParagrafo.get(p.numero) || [];
  const dias = (d.diasDoParagrafo.get(p.numero) || []).slice(-8).reverse();
  const piox = (d.relacoes.cic_para_piox?.[String(p.numero)] || []).map(n => d.piox.get(n)).filter(Boolean).slice(0, 3);
  const trilhaItens = [['Início', `${SITE}/`], ['Catecismo', `${SITE}/cic/`], ...lugar.map(n => [n, `${SITE}/cic/#${slugDe(n)}`]), [`§ ${p.numero}`, url]];
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#artigo`, mainEntityOfPage: { '@id': url }, url,
        headline: `§ ${p.numero} do Catecismo da Igreja Católica`, alternativeHeadline: contexto,
        description: descricao, inLanguage: 'pt-BR', isAccessibleForFree: true,
        isPartOf: LIVRO, position: p.numero,
        about: temas.slice(0, 6).map(t => t.tema.nome),
        publisher: { '@id': `${SITE}/#organizacao` },
      },
      organizacao,
      trilha(url, trilhaItens),
    ],
  };
  const notasHtml = Object.keys(notasDoPar).length ? `
    <section class="cic-notas" aria-label="Notas">
      <h2 class="cic-sub">Notas</h2>
      <ol class="cic-notas-lista">${Object.entries(notasDoPar).sort((a, b) => +a[0] - +b[0]).map(([n, t]) => `
        <li id="nota-${n}" value="${n}">${esc(t)} <a href="#ref-${n}" class="cic-volta" aria-label="voltar ao texto">↩</a></li>`).join('')}
      </ol>
    </section>` : '';
  const temasHtml = temas.length ? `
    <section class="cic-bloco" aria-label="Temas">
      <h2 class="cic-sub">No índice analítico</h2>
      <ul class="cic-lista">${temas.map(t => `
        <li><a href="${urlDoTema(t.tema.slug)}">${esc(t.tema.nome)}</a>${t.subtema && t.subtema !== t.tema.nome ? ` <span class="cic-suave">› ${esc(t.subtema)}</span>` : ''}</li>`).join('')}
      </ul>
    </section>` : '';
  const diasHtml = dias.length ? `
    <section class="cic-bloco" aria-label="Na Liturgia Diária">
      <h2 class="cic-sub">Na Liturgia Diária</h2>
      <p class="cic-suave">Este parágrafo acompanha as leituras da missa nestes dias:</p>
      <ul class="cic-lista">${dias.map(x => `
        <li><a href="/liturgiadiaria/${x.data}/">${esc(formatar(x.data))}</a> <span class="cic-suave">· ${esc(x.referencia)}</span></li>`).join('')}
      </ul>
    </section>` : '';
  const pioxHtml = piox.length ? `
    <section class="cic-bloco" aria-label="No Catecismo de São Pio X">
      <h2 class="cic-sub">No Catecismo de São Pio X</h2>${piox.map(q => `
      <p class="cic-piox"><b>${q.numero}. ${esc(q.pergunta)}</b> ${esc(cortar(q.resposta, 260))} <a href="/saopiox/">Ler no Catecismo de São Pio X →</a></p>`).join('')}
    </section>` : '';
  const nav = `
  <nav class="ca-capitulos" aria-label="Parágrafos vizinhos">
    ${anterior ? `<a href="${urlDoParagrafo(anterior.numero)}" rel="prev">← § ${anterior.numero}</a>` : '<span></span>'}
    <a href="/#paragrafo-${p.numero}">Abrir no buscador</a>
    ${seguinte ? `<a href="${urlDoParagrafo(seguinte.numero)}" rel="next">§ ${seguinte.numero} →</a>` : '<span></span>'}
  </nav>`;
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml(trilhaItens.map(([n, h], i) => [n, i === trilhaItens.length - 1 ? null : h.replace(SITE, '')]))}
    <p class="ca-sobretitulo">Catecismo da Igreja Católica</p>
    <h1 class="ca-titulo">§ ${p.numero}</h1>
  </header>
  <main class="ca-corpo">
    <article class="cic-par" lang="pt-BR">
      ${textoHtml(p, notasDoPar)}
    </article>${notasHtml}${temasHtml}${diasHtml}${pioxHtml}
  </main>${nav}${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'cic-paragrafo' });
}

/** "espera consumação", "advento Natal quaresma": a fonte não separa os termos; acha os temas que existem
 *  (a sequência mais longa primeiro) e deixa como texto o que não casar. */
function vejaHtml(veja, temas) {
  const porSlug = new Map(temas.map(t => [t.slug, t]));
  const palavras = veja.replace(/[,;]/g, ' ').split(/\s+/).filter(p => p && !/^(e|ou)$/i.test(p));
  const partes = [];
  let solto = [];
  const fecha = () => { if (solto.length) partes.push(esc(solto.join(' '))); solto = []; };
  for (let i = 0; i < palavras.length;) {
    let achou = null;
    for (let j = Math.min(palavras.length, i + 5); j > i && !achou; j--) {
      const t = porSlug.get(slugDe(palavras.slice(i, j).join(' ')));
      if (t) achou = { t, texto: palavras.slice(i, j).join(' '), fim: j };
    }
    if (!achou) { solto.push(palavras[i++]); continue; }
    fecha();
    partes.push(`<a href="${urlDoTema(achou.t.slug)}">${esc(achou.texto)}</a>`);
    i = achou.fim;
  }
  fecha();
  return partes.join(', ');
}

export function paginaDoTema(t, d) {
  const url = `${SITE}${urlDoTema(t.slug)}`;
  const nomeLimpo = t.nome;
  const porNumero = new Map(d.paragrafos.map(p => [p.numero, p]));
  const total = new Set(t.subtemas.flatMap(s => s.paragrafos)).size;
  const titulo = `O que o Catecismo diz sobre ${nomeLimpo} — ${total === 1 ? '1 parágrafo' : `${total} parágrafos`}`;
  const primeiro = porNumero.get(t.subtemas[0].paragrafos[0]);
  const descricao = cortar(`${nomeLimpo} no Catecismo da Igreja Católica: ${t.subtemas.map(s => s.nome).slice(0, 4).join('; ')}. ${primeiro ? primeiraFrase(primeiro.texto) : ''}`, DESCRICAO_MAX);
  const trilhaItens = [['Início', `${SITE}/`], ['Catecismo', `${SITE}/cic/`], ['Temas', `${SITE}/cic/tema/`], [nomeLimpo, url]];
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': `${url}#pagina`, url, name: titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: LIVRO, about: nomeLimpo,
        hasPart: t.subtemas.flatMap(s => s.paragrafos).filter((n, i, a) => a.indexOf(n) === i).slice(0, 50).map(n => ({ '@type': 'Article', url: `${SITE}${urlDoParagrafo(n)}`, headline: `§ ${n}` })),
        publisher: { '@id': `${SITE}/#organizacao` },
      },
      organizacao,
      trilha(url, trilhaItens),
    ],
  };
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml(trilhaItens.map(([n, h], i) => [n, i === trilhaItens.length - 1 ? null : h.replace(SITE, '')]))}
    <p class="ca-sobretitulo">Catecismo da Igreja Católica · índice analítico</p>
    <h1 class="ca-titulo">${esc(nomeLimpo)}</h1>
    <p class="ca-lide">${total === 1 ? 'Um parágrafo' : `${total} parágrafos`} do Catecismo ${t.subtemas.length > 1 ? `em ${t.subtemas.length} entradas` : 'nesta entrada'} do índice analítico. Cada trecho abre o parágrafo inteiro, com as notas e os temas ligados.${t.veja ? ` Ver também: ${vejaHtml(t.veja, d.temas)}.` : ''}</p>
  </header>
  <main class="ca-corpo">${t.subtemas.map(s => `
    <section class="cic-subtema">
      <h2 class="cic-sub">${esc(s.nome)}</h2>${s.paragrafos.map(n => porNumero.get(n)).filter(Boolean).map(p => `
      <p class="cic-trecho"><a href="${urlDoParagrafo(p.numero)}" class="cic-num">§ ${p.numero}</a><span>${esc(cortar(primeiraFrase(p.texto), 220))}</span></p>`).join('')}
    </section>`).join('')}
  </main>${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'cic-tema' });
}

export function paginaIndice(partes, temas) {
  const url = `${SITE}/cic/`;
  const titulo = 'Catecismo da Igreja Católica — índice completo, parágrafo por parágrafo';
  const descricao = `As quatro partes do Catecismo da Igreja Católica (a profissão da fé, os sacramentos, a vida em Cristo e a oração), seção por seção, com os 2865 parágrafos e ${temas.length} temas para ler on-line.`;
  const faixa = x => (x.de === x.ate ? `§ ${x.de}` : `§§ ${x.de}–${x.ate}`);
  const item = (x, nivel) => {
    const nome = nomeDe(x.nome);
    const filhos = x.filhos.filter(f => f.nome);
    return `
      <li class="cic-n${nivel}" id="${slugDe(nome)}"><a href="${urlDoParagrafo(x.de)}">${esc(nome)}</a> <span class="cic-suave">${faixa(x)}</span>${filhos.length ? `<ul>${filhos.map(f => item(f, nivel + 1)).join('')}</ul>` : ''}</li>`;
  };
  const trilhaItens = [['Início', `${SITE}/`], ['Catecismo', url]];
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      { ...LIVRO, description: descricao, publisher: { '@id': `${SITE}/#organizacao` } },
      organizacao,
      trilha(url, trilhaItens),
    ],
  };
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml(trilhaItens.map(([n, h], i) => [n, i === trilhaItens.length - 1 ? null : h.replace(SITE, '')]))}
    <p class="ca-sobretitulo">Santa Doutrina</p>
    <h1 class="ca-titulo">Catecismo da Igreja Católica</h1>
    <p class="ca-lide">O texto oficial, em português do Brasil, parágrafo por parágrafo: as quatro partes abaixo, com as seções, os capítulos e os artigos de cada uma. Para procurar uma palavra ou um assunto, use <a href="/">a busca</a>; para ir por tema, o <a href="/cic/tema/">índice analítico</a> tem ${temas.length} entradas.</p>
  </header>
  <main class="ca-corpo">
    <ul class="cic-estrutura">${partes.map(p => item(p, 1)).join('')}
    </ul>
  </main>${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'cic-indice' });
}

export function paginaTemas(temas) {
  const url = `${SITE}/cic/tema/`;
  const titulo = 'Temas do Catecismo da Igreja Católica — índice analítico de A a Z';
  const descricao = `${temas.length} temas do índice analítico do Catecismo da Igreja Católica, de Abandono a Zelo: o que o Catecismo diz sobre cada assunto, com os parágrafos em que aparece.`;
  const letra = t => t.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  const grupos = new Map();
  for (const t of [...temas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    const l = letra(t);
    if (!grupos.has(l)) grupos.set(l, []);
    grupos.get(l).push(t);
  }
  const trilhaItens = [['Início', `${SITE}/`], ['Catecismo', `${SITE}/cic/`], ['Temas', url]];
  const dados = { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', '@id': `${url}#pagina`, url, name: titulo, description: descricao, inLanguage: 'pt-BR', isPartOf: LIVRO }, organizacao, trilha(url, trilhaItens)] };
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml(trilhaItens.map(([n, h], i) => [n, i === trilhaItens.length - 1 ? null : h.replace(SITE, '')]))}
    <p class="ca-sobretitulo">Catecismo da Igreja Católica</p>
    <h1 class="ca-titulo">Índice analítico</h1>
    <p class="ca-lide">${temas.length} temas, de A a Z. Cada um reúne os parágrafos do Catecismo que tratam do assunto, nas entradas da edição oficial.</p>
    <p class="cic-letras">${[...grupos.keys()].map(l => `<a href="#${l}">${l}</a>`).join(' ')}</p>
  </header>
  <main class="ca-corpo">${[...grupos].map(([l, lista]) => `
    <section class="cic-letra" id="${l}">
      <h2 class="cic-sub">${l}</h2>
      <ul class="cic-lista cic-colunas">${lista.map(t => `
        <li><a href="${urlDoTema(t.slug)}">${esc(t.nome)}</a></li>`).join('')}
      </ul>
    </section>`).join('')}
  </main>${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'cic-temas' });
}

export function sitemapCic(paragrafos, temas) {
  const url = (loc, prioridade) => `  <url><loc>${loc}</loc><changefreq>monthly</changefreq><priority>${prioridade}</priority></url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    url(`${SITE}/cic/`, '0.9'), url(`${SITE}/cic/tema/`, '0.8'),
    ...temas.map(t => url(`${SITE}${urlDoTema(t.slug)}`, '0.7')),
    ...paragrafos.map(p => url(`${SITE}${urlDoParagrafo(p.numero)}`, '0.6')),
  ].join('\n')}
</urlset>
`;
}

// ── Gravação ──────────────────────────────────────────────────────────────────

function gravar(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const d = carregar();
  const partes = estrutura(d.paragrafos);
  // páginas antigas de §§ ou temas que não existem mais somem
  for (const pasta of [PASTA, path.join(PASTA, 'tema')]) {
    if (!existe(pasta)) continue;
    for (const f of fs.readdirSync(pasta)) {
      const inteira = path.join(pasta, f);
      if (!fs.statSync(inteira).isDirectory() || f === 'tema') continue;
      const vale = pasta === PASTA ? d.paragrafos.some(p => String(p.numero) === f) : d.temas.some(t => t.slug === f);
      if (!vale) fs.rmSync(inteira, { recursive: true });
    }
  }
  d.paragrafos.forEach((p, i) => gravar(path.join(PASTA, String(p.numero), 'index.html'),
    paginaDoParagrafo(p, d, { anterior: d.paragrafos[i - 1] || null, seguinte: d.paragrafos[i + 1] || null })));
  for (const t of d.temas) gravar(path.join(PASTA, 'tema', t.slug, 'index.html'), paginaDoTema(t, d));
  gravar(path.join(PASTA, 'index.html'), paginaIndice(partes, d.temas));
  gravar(path.join(PASTA, 'tema', 'index.html'), paginaTemas(d.temas));
  gravar(SITEMAP, sitemapCic(d.paragrafos, d.temas));
  const comDias = [...d.diasDoParagrafo.keys()].length;
  console.log(`cic: ${d.paragrafos.length} parágrafos (${comDias} citados na Liturgia), ${d.temas.length} temas, índice + sitemap-cic.xml`);
}
