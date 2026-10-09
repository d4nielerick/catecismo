/**
 * scripts/build-paginas-catena.mjs — a Catena Aurea por capítulo, em páginas prontas para ler e
 * para o Google ("Lucas 15 comentado pelos Padres da Igreja").
 *
 *   data/catena/<Ev>/<NN>.json (lectiones com itens traduzidos) + data/biblia/<Ev>.json (versículos)
 *   + data/catena-autores.json + data/liturgia-comentario/*.json (dias que leem cada perícope)
 *     --> catena/index.html                 (índice por Evangelho)
 *     --> catena/<ev>/<cap>/index.html      (ev minúsculo: mt, mc, lc, jo)
 *     --> sitemap-catena.xml
 *     --> data/catena-publicados.json       ("lc/15", …: a página do dia só linka o que existe)
 *
 * Só entra o que já está traduzido: nunca sai latim bruto, e uma lectio sem versículos ou sem
 * nenhum item em português fica fora. Tudo isso é gerado (fora do git): rode antes de cada deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, comLema } from '../liturgiadiaria/render.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://santadoutrina.com';
const NOME_SITE = 'Santa Doutrina';
const DADOS = path.join(RAIZ, 'data');
const PASTA = path.join(RAIZ, 'catena');
const SITEMAP = path.join(RAIZ, 'sitemap-catena.xml');
const PUBLICADOS = path.join(DADOS, 'catena-publicados.json');
const DESCRICAO_MAX = 158;

// Ordem canônica dos Evangelhos; só estes têm Catena.
export const EVANGELHOS = {
  Mt: { nome: 'Mateus', pasta: 'mt' },
  Mc: { nome: 'Marcos', pasta: 'mc' },
  Lc: { nome: 'Lucas', pasta: 'lc' },
  Jo: { nome: 'João', pasta: 'jo' },
};
const OBRAS = { 'in Matthaeum': 'Homilias sobre Mateus', 'de Cons. Evang': 'Da concordância dos Evangelistas', 'in Lucam': 'Homilias sobre Lucas', 'in Ioannem': 'Homilias sobre João', 'in Evang': 'Homilias sobre os Evangelhos' };

const lerJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const existe = p => fs.existsSync(p);
export const lerAutores = () => lerJson(path.join(DADOS, 'catena-autores.json'));
const formatar = (dt, opcoes) => new Date(`${dt}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });
export const urlDoCapitulo = (ev, cap) => `/catena/${EVANGELHOS[ev].pasta}/${+cap}/`;
export const refDaLectio = (ev, cap, [a, b]) => `${ev} ${+cap},${a === b ? a : `${a}-${b}`}`;

function cortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}

// ── Leitura dos dados ─────────────────────────────────────────────────────────

/** Os capítulos com alguma lectio publicável, na ordem dos Evangelhos, com só o que vai para a página. */
export function capitulosPublicados() {
  const lista = [];
  for (const ev of Object.keys(EVANGELHOS)) {
    const pasta = path.join(DADOS, 'catena', ev);
    if (!existe(pasta)) continue;
    for (const arq of fs.readdirSync(pasta).filter(f => /^\d{2}\.json$/.test(f)).sort()) {
      const cap = +arq.slice(0, 2);
      const lectiones = lerJson(path.join(pasta, arq))
        .filter(l => Array.isArray(l.versos) && l.itens.some(i => i.pt))
        .map(l => ({
          lectio: l.lectio, versos: l.versos, ref: refDaLectio(ev, cap, l.versos),
          itens: l.itens.filter(i => i.pt).map(({ autor, obra, pt }) => ({ autor, obra, pt })),
          faltam: l.itens.filter(i => !i.pt).length,
        }));
      if (lectiones.length) lista.push({ ev, cap, chave: `${EVANGELHOS[ev].pasta}/${cap}`, lectiones });
    }
  }
  return lista;
}

/** Dias da Liturgia Diária cujo Evangelho comentado usa alguma lectio do capítulo. */
export function diasQueLeem(ev, cap) {
  const pasta = path.join(DADOS, 'liturgia-comentario');
  if (!existe(pasta)) return [];
  const dias = [];
  for (const arq of fs.readdirSync(pasta).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
    const c = lerJson(path.join(pasta, arq));
    const lectiones = (c.catena || []).filter(x => x.ev === ev && +x.cap === +cap).map(x => x.lectio);
    if (!lectiones.length) continue;
    const dia = path.join(DADOS, 'liturgia', `${c.data}.json`);
    dias.push({ data: c.data, evangelho: c.evangelho, tema: c.tema || '', lectiones, celebracao: existe(dia) ? lerJson(dia).celebracao : '' });
  }
  return dias;
}

const versiculos = new Map();
/** Versículos [a, b] do capítulo na tradução que o site já usa (data/biblia/). */
export function textoBiblico(ev, cap, [a, b]) {
  if (!versiculos.has(ev)) { const p = path.join(DADOS, 'biblia', `${ev}.json`); versiculos.set(ev, existe(p) ? lerJson(p) : {}); }
  const capitulo = versiculos.get(ev)[String(cap)] || {};
  const lista = [];
  // o JSON da Bíblia traz hífens invisíveis (U+00AD) e asteriscos de nota de rodapé que aqui não levam a nada
  for (let v = a; v <= b; v++) if (capitulo[String(v)]) lista.push({ v, texto: capitulo[String(v)].replace(/\u00ad/g, '').replace(/\s*\*+\s*$/, '').trim() });
  return lista;
}

// ── Texto para o Google ───────────────────────────────────────────────────────

/** "Santo Ambrósio" → "Ambrósio": na descrição, os nomes curtos cabem mais. */
const nomeCurto = nome => nome.replace(/^(São|Santo|Santa)\s+/, '').replace(/,.*$/, '');

/** Autores do capítulo, os mais citados primeiro, sem repetir. */
export function autoresDoCapitulo(capitulo, autores) {
  const contagem = new Map();
  for (const l of capitulo.lectiones) for (const i of l.itens) contagem.set(i.autor, (contagem.get(i.autor) || 0) + 1);
  return [...contagem.entries()].sort((x, y) => y[1] - x[1]).map(([autor]) => autores[autor]?.nome || autor);
}

/** "Lucas 15 comentado pelos Padres da Igreja (Catena Aurea): Ambrósio, Gregório Magno e Cirilo
 *  sobre Lc 15,1-10 — a ovelha carregada nos ombros…", até 158 caracteres. */
export function descricaoDoCapitulo(capitulo, autores, dias) {
  const nome = EVANGELHOS[capitulo.ev].nome;
  const nomes = autoresDoCapitulo(capitulo, autores).map(nomeCurto).filter(n => !/^Glosa/.test(n)).slice(0, 3);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0] || 'os Padres';
  const tema = dias.find(d => d.tema)?.tema;
  const sobre = tema ? tema.charAt(0).toLowerCase() + tema.slice(1) : capitulo.lectiones.map(l => l.ref.replace(/^\w+ /, '')).join('; ');
  const base = `${nome} ${capitulo.cap} comentado pelos Padres da Igreja (Catena Aurea): ${lista} sobre ${tema ? '' : `${capitulo.ev} `}${sobre}.`;
  return cortar(base, DESCRICAO_MAX);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const jsonLd = dados => `<script type="application/ld+json">\n  ${JSON.stringify(dados, null, 2).replace(/<\//g, '<\\/').replace(/\n/g, '\n  ')}\n  </script>`;

const organizacao = {
  '@type': 'Organization', '@id': `${SITE}/#organizacao`, name: NOME_SITE, url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/assets/img/liturgia-icone-512.png`, width: 512, height: 512 },
};

const trilha = (url, itens) => ({
  '@type': 'BreadcrumbList', '@id': `${url}#trilha`,
  itemListElement: itens.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

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
  <meta property="og:image" content="${SITE}/liturgiadiaria/og/liturgia.jpg">
  <meta property="og:site_name" content="Catena Aurea · ${NOME_SITE}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/liturgia-icone-32.png?v=3">
  <link rel="apple-touch-icon" href="/assets/img/liturgia-icone-180.png?v=3">
  <meta name="theme-color" content="#fcfaf7">
  <link rel="preload" href="/assets/fonts/inria-serif-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/inria-serif-400-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/main.css">
  <link rel="stylesheet" href="/catena/catena.css">
  ${jsonLd(dados)}
</head>
<body class="ca ${classe}">
${corpo}
</body>
</html>
`;
}

const trilhaHtml = itens => `<nav class="ca-trilha" aria-label="Você está em">${itens.map(([nome, href]) => (href ? `<a href="${href}">${esc(nome)}</a>` : `<span aria-current="page">${esc(nome)}</span>`)).join('<span class="ca-trilha-sep" aria-hidden="true">›</span>')}</nav>`;

const rodapeHtml = () => `
  <footer class="ca-rodape">
    <p>Trechos da <i>Catena Aurea</i> de São Tomás de Aquino (séc. XIII), traduzidos do latim a partir do texto do
      <a href="https://www.corpusthomisticum.org/" target="_blank" rel="noopener">Corpus Thomisticum</a>. Tradução em revisão:
      se encontrar um erro, <a href="/liturgiadiaria/">avise pela Liturgia Diária</a>.</p>
    <p>Versículos na tradução da Bíblia Ave-Maria, a mesma que o site usa nas notas do Catecismo.</p>
    <p class="ca-rodape-links"><a href="/catena/">Catena Aurea</a> · <a href="/liturgiadiaria/">Liturgia Diária</a> · <a href="/">Catecismo da Igreja Católica</a></p>
  </footer>`;

/** Nome do Padre em versalete; o século e quem foi vão no title, e como nota só na primeira vez. */
function padreHtml(item, autores, vistos) {
  const a = autores[item.autor];
  const nome = a?.nome || item.autor;
  const obra = OBRAS[item.obra] || item.obra;
  const primeira = !vistos.has(item.autor);
  vistos.add(item.autor);
  const quem = a ? `${a.nome}, ${a.quando}: ${a.quem}` : item.autor;
  return `<span class="ca-padre" title="${esc(quem)}">${esc(nome)}${obra ? `<span class="ca-padre-obra">, ${esc(obra)}</span>` : ''}</span>`
    + (primeira && a ? `<span class="ca-padre-quando">(${esc(a.quando)})</span>` : '')
    + '.';
}

function lectioSecaoHtml(capitulo, l, autores, vistos) {
  const [a, b] = l.versos;
  const ancora = a === b ? `${a}` : `${a}-${b}`;
  const versos = textoBiblico(capitulo.ev, capitulo.cap, l.versos);
  const evangelho = versos.length
    ? `<blockquote class="ca-evangelho"><p>${versos.map(({ v, texto }) => `<sup class="ca-verso">${v}</sup>${esc(texto)}`).join(' ')}</p></blockquote>`
    : '';
  const n = l.faltam;
  const parcial = n ? `<p class="ca-parcial">Mais ${n === 1 ? 'um comentário desta passagem ainda não foi traduzido' : `${n} comentários desta passagem ainda não foram traduzidos`}.</p>` : '';
  return `
  <section class="ca-lectio" id="${ancora}" aria-labelledby="t-${ancora}">
    <h2 class="ca-lectio-ref" id="t-${ancora}"><a href="#${ancora}">${esc(l.ref)}</a></h2>
    ${evangelho}
    <div class="ca-comentarios">${l.itens.map(i => `
      <p>${padreHtml(i, autores, vistos)} ${comLema(i.pt)}</p>`).join('')}
    </div>${parcial}
  </section>`;
}

function diasHtml(dias) {
  if (!dias.length) return '';
  return `
  <aside class="ca-missa" aria-label="Na missa">
    <h2 class="ca-rotulo">Este capítulo é lido na missa em</h2>
    <ul>${dias.map(d => `
      <li><a href="/liturgiadiaria/${d.data}/">${esc(formatar(d.data, { day: 'numeric', month: 'long', year: 'numeric' }))}</a> <span class="ca-missa-ref">(${esc(d.evangelho)})</span>${d.celebracao ? `<span class="ca-missa-dia"> — ${esc(d.celebracao)}</span>` : ''}</li>`).join('')}
    </ul>
  </aside>`;
}

/** A página de um capítulo. `vizinhos` = { anterior, seguinte } entre os capítulos publicados. */
export function paginaDoCapitulo(capitulo, autores, { dias = diasQueLeem(capitulo.ev, capitulo.cap), anterior = null, seguinte = null } = {}) {
  const nome = EVANGELHOS[capitulo.ev].nome;
  const url = `${SITE}${urlDoCapitulo(capitulo.ev, capitulo.cap)}`;
  const titulo = `${nome} ${capitulo.cap} comentado pelos Padres da Igreja — Catena Aurea`;
  const descricao = descricaoDoCapitulo(capitulo, autores, dias);
  const nomes = autoresDoCapitulo(capitulo, autores);
  const lista = itens => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0]);
  const total = capitulo.lectiones.reduce((s, l) => s + l.itens.length, 0);
  const faltam = capitulo.lectiones.reduce((s, l) => s + l.faltam, 0);
  const trilhaItens = [['Início', `${SITE}/`], ['Catena Aurea', `${SITE}/catena/`], [nome, `${SITE}/catena/#${EVANGELHOS[capitulo.ev].pasta}`], [`Capítulo ${capitulo.cap}`, url]];
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#artigo`, mainEntityOfPage: { '@id': url }, url,
        headline: `${nome} ${capitulo.cap} comentado pelos Padres da Igreja`, alternativeHeadline: 'Catena Aurea de São Tomás de Aquino',
        description: descricao, inLanguage: 'pt-BR', isAccessibleForFree: true,
        about: { '@type': 'Book', name: `Evangelho segundo ${nome}`, hasPart: capitulo.lectiones.map(l => l.ref) },
        author: { '@type': 'Person', name: 'São Tomás de Aquino' },
        contributor: nomes.map(n => ({ '@type': 'Person', name: n })),
        translator: { '@id': `${SITE}/#organizacao` }, publisher: { '@id': `${SITE}/#organizacao` },
      },
      organizacao,
      trilha(url, trilhaItens),
    ],
  };
  const vistos = new Set();
  const nav = (anterior || seguinte) ? `
  <nav class="ca-capitulos" aria-label="Outros capítulos">
    ${anterior ? `<a href="${urlDoCapitulo(anterior.ev, anterior.cap)}" rel="prev">← ${esc(EVANGELHOS[anterior.ev].nome)} ${anterior.cap}</a>` : '<span></span>'}
    <a href="/catena/">Todos os capítulos</a>
    ${seguinte ? `<a href="${urlDoCapitulo(seguinte.ev, seguinte.cap)}" rel="next">${esc(EVANGELHOS[seguinte.ev].nome)} ${seguinte.cap} →</a>` : '<span></span>'}
  </nav>` : '';
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml(trilhaItens.map(([n, h], i) => [n, i === trilhaItens.length - 1 ? null : h.replace(SITE, '')]))}
    <p class="ca-sobretitulo">Catena Aurea de São Tomás de Aquino</p>
    <h1 class="ca-titulo">${esc(nome)} ${capitulo.cap} <span class="ca-titulo-sub">comentado pelos Padres da Igreja</span></h1>
    <p class="ca-lide">${total === 1 ? 'Um comentário' : `${total} comentários`} de ${esc(lista(nomes))}
      sobre ${capitulo.lectiones.length === 1 ? 'a passagem' : 'as passagens'} ${lista(capitulo.lectiones.map(l => `<a href="#${l.versos[0] === l.versos[1] ? l.versos[0] : `${l.versos[0]}-${l.versos[1]}`}">${esc(l.ref)}</a>`))},
      reunidos por São Tomás de Aquino no século XIII e traduzidos do latim.${faltam ? ` ${faltam === 1 ? 'Outro comentário destas passagens ainda está' : `Outros ${faltam} comentários destas passagens ainda estão`} por traduzir.` : ''}</p>
  </header>
  <main class="ca-corpo">${capitulo.lectiones.map(l => lectioSecaoHtml(capitulo, l, autores, vistos)).join('\n')}
  </main>${diasHtml(dias)}${nav}${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'ca-capitulo' });
}

/** O índice: o que é a Catena Aurea e os capítulos publicados, por Evangelho. */
export function paginaIndice(capitulos, autores) {
  const url = `${SITE}/catena/`;
  const titulo = 'Catena Aurea em português — os Evangelhos comentados pelos Padres da Igreja';
  const total = capitulos.reduce((s, c) => s + c.lectiones.reduce((t, l) => t + l.itens.length, 0), 0);
  const descricao = cortar(`A Catena Aurea de São Tomás de Aquino traduzida do latim: ${total} comentários de Agostinho, Crisóstomo, Ambrósio, Gregório e outros Padres sobre ${capitulos.length} capítulos dos Evangelhos.`, DESCRICAO_MAX);
  const trilhaItens = [['Início', `${SITE}/`], ['Catena Aurea', url]];
  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': url, url, name: titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: { '@type': 'WebSite', name: NOME_SITE, url: `${SITE}/` },
        hasPart: capitulos.map(c => ({ '@type': 'Article', name: `${EVANGELHOS[c.ev].nome} ${c.cap} comentado pelos Padres da Igreja`, url: `${SITE}${urlDoCapitulo(c.ev, c.cap)}` })),
        breadcrumb: { '@id': `${url}#trilha` },
      },
      organizacao,
      trilha(url, trilhaItens),
    ],
  };
  const porEv = Object.keys(EVANGELHOS).map(ev => [ev, capitulos.filter(c => c.ev === ev)]).filter(([, lista]) => lista.length);
  const corpo = `
  <header class="ca-cabeca">
    ${trilhaHtml([['Início', '/'], ['Catena Aurea', null]])}
    <p class="ca-sobretitulo">São Tomás de Aquino · século XIII</p>
    <h1 class="ca-titulo">Catena Aurea <span class="ca-titulo-sub">os Evangelhos comentados pelos Padres da Igreja</span></h1>
  </header>
  <main class="ca-corpo">
    <section class="ca-apresentacao">
      <p>A <i>Catena Aurea</i> ("cadeia de ouro") é o comentário contínuo aos quatro Evangelhos que São Tomás de Aquino
        compôs entre 1262 e 1268 a pedido do Papa Urbano IV. Tomás não escreveu uma linha de interpretação própria:
        para cada versículo escolheu e encadeou trechos de mais de oitenta Padres da Igreja, gregos e latinos, de
        Orígenes e Crisóstomo a Agostinho, Ambrósio, Jerônimo, Gregório Magno e Beda. O resultado é a leitura que a
        Igreja do primeiro milênio fez do Evangelho, passagem por passagem, na ordem do texto.</p>
      <p>Nunca houve uma tradução integral em português de acesso livre. Aqui ela vai sendo feita capítulo a capítulo,
        a partir do texto latino do <a href="https://www.corpusthomisticum.org/" target="_blank" rel="noopener">Corpus Thomisticum</a>,
        começando pelas passagens que a Liturgia Diária lê na missa. A tradução está em revisão; cada página diz
        quantos comentários da passagem ainda faltam.</p>
    </section>
    ${porEv.map(([ev, lista]) => `
    <section class="ca-evangelho-lista" id="${EVANGELHOS[ev].pasta}" aria-labelledby="h-${EVANGELHOS[ev].pasta}">
      <h2 class="ca-ev-nome" id="h-${EVANGELHOS[ev].pasta}">Evangelho segundo ${esc(EVANGELHOS[ev].nome)}</h2>
      <ul class="ca-caps">${lista.map(c => {
        const n = c.lectiones.reduce((s, l) => s + l.itens.length, 0);
        return `
        <li><a href="${urlDoCapitulo(c.ev, c.cap)}"><span class="ca-cap-num">Capítulo ${c.cap}</span>
          <span class="ca-cap-refs">${esc(c.lectiones.map(l => l.ref.replace(/^\w+ \d+,/, '')).join(' · '))}</span>
          <span class="ca-cap-n">${n === 1 ? 'um comentário' : `${n} comentários`}</span></a></li>`;
      }).join('')}
      </ul>
    </section>`).join('')}
  </main>${rodapeHtml()}`;
  return documento({ titulo, descricao, url, dados, corpo, classe: 'ca-indice' });
}

export function sitemapCatena(capitulos) {
  const url = (loc, extra = '') => `  <url>\n    <loc>${SITE}${loc}</loc>${extra}\n  </url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/catena/', '\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>'),
    ...capitulos.map(c => url(urlDoCapitulo(c.ev, c.cap))),
    '</urlset>',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const autores = lerAutores();
  const capitulos = capitulosPublicados();
  // limpa só o que é gerado: as pastas dos Evangelhos e o index; catena.css fica
  for (const ev of Object.values(EVANGELHOS)) fs.rmSync(path.join(PASTA, ev.pasta), { recursive: true, force: true });
  fs.mkdirSync(PASTA, { recursive: true });
  let itens = 0;
  capitulos.forEach((c, i) => {
    const html = paginaDoCapitulo(c, autores, { anterior: capitulos[i - 1] || null, seguinte: capitulos[i + 1] || null });
    const pasta = path.join(PASTA, EVANGELHOS[c.ev].pasta, String(c.cap));
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'index.html'), html);
    itens += c.lectiones.reduce((s, l) => s + l.itens.length, 0);
  });
  fs.writeFileSync(path.join(PASTA, 'index.html'), paginaIndice(capitulos, autores));
  fs.writeFileSync(SITEMAP, sitemapCatena(capitulos));
  fs.writeFileSync(PUBLICADOS, `${JSON.stringify(capitulos.map(c => c.chave))}\n`);
  console.log(`catena: ${capitulos.length} capítulos (${capitulos.map(c => c.chave).join(', ')}), ${itens} comentários + index, sitemap-catena.xml e data/catena-publicados.json`);
}
