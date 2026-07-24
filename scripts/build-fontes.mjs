/**
 * scripts/build-fontes.mjs — hospeda os documentos-fonte citados nas notas.
 *
 * Lê data/fontes-manifest.json + o HTML bruto de cada documento (cache em
 * ../cache-fontes/, baixado do vatican.va) e gera páginas estáticas
 * fontes/<slug>.html (bom para SEO) + data/fontes-index.json (para sitemap e
 * para o front linkar as notas → fonte). Créditos à Libreria Editrice Vaticana
 * e link canônico ao vatican.va em toda página.
 *
 * Estrutura das páginas do Vaticano (template "simplepage"): <p> em sequência;
 * seções começam por "N. ", precedidas por um <p> de subtítulo; as notas vêm
 * após um <p> "Notas". Marcadores de nota no corpo são "(N)".
 *
 * Uso: node scripts/build-fontes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodeEntities, stripTags, normalizeSpaces } from './lib-html.mjs';

const CACHE = path.join('..', 'cache-fontes');
const manifest = JSON.parse(fs.readFileSync('data/fontes-manifest.json', 'utf8'));
fs.mkdirSync('fontes', { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** <p> do documento → texto limpo (preserva marcadores "(N)"). */
function paragrafos(html) {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => normalizeSpaces(stripTags(decodeEntities(m[1]))))
    .filter(Boolean);
}

/** Separa os <p> em seções, fecho (data/assinatura) e notas. */
function estruturar(ps) {
  const secoes = [];
  const notas = {};
  const fecho = [];
  let modo = 'corpo';
  let subtituloPendente = null;
  let atual = null;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (/^\[.*\]$/.test(p) || /^(AR|EN|ES|FR|IT|LA|PT)\b.*-/.test(p)) continue; // barra de idiomas
    if (/^Notas$/i.test(p)) { modo = 'notas'; continue; }

    if (modo === 'notas') {
      const m = p.match(/^(\d{1,3})\s*\.?\s+(.+)$/);
      if (m) notas[m[1]] = m[2].trim();
      continue;
    }
    // fecho: "Roma, ..." em diante
    if (/^Roma,|^Dado em Roma|PAPA\b/i.test(p) || modo === 'fecho') { modo = 'fecho'; fecho.push(p); continue; }

    const sec = p.match(/^(\d{1,3})\.\s+(.+)$/);
    if (sec) {
      atual = { num: sec[1], subtitulo: subtituloPendente || '', paragrafos: [sec[2].trim()] };
      secoes.push(atual);
      subtituloPendente = null;
    } else if (atual && !subtituloPendente && ps[i + 1] && /^\d{1,3}\.\s/.test(ps[i + 1])) {
      subtituloPendente = p; // subtítulo da próxima seção
    } else if (!atual && ps[i + 1] && /^\d{1,3}\.\s/.test(ps[i + 1])) {
      subtituloPendente = p; // subtítulo antes da 1ª seção
    } else if (atual) {
      atual.paragrafos.push(p);
    }
  }
  return { secoes, notas, fecho };
}

/** Corpo de um parágrafo: escapa e transforma "(N)" (N ≤ maxNota) em link de nota. */
function corpoComNotas(texto, maxNota) {
  return esc(texto).replace(/\((\d{1,3})\)/g, (m, n) =>
    (+n >= 1 && +n <= maxNota)
      ? `<sup class="fonte-ref"><a href="#nota-${n}">${n}</a></sup>`
      : m);
}

function pagina(doc, est) {
  const maxNota = Math.max(0, ...Object.keys(est.notas).map(Number));
  const canonical = `https://santadoutrina.cloud/fontes/${doc.slug}`;
  const desc = `${doc.titulo} — ${doc.subtitulo}. Texto integral (${doc.tipo}, ${doc.data}).`;
  const secoesHtml = est.secoes.map((s) => `
      <section id="s${s.num}" class="fonte-secao">
        <h2><span class="fonte-num">${s.num}.</span> ${esc(s.subtitulo)}</h2>
        ${s.paragrafos.map((p) => `<p>${corpoComNotas(p, maxNota)}</p>`).join('\n        ')}
      </section>`).join('\n');
  const notasHtml = Object.entries(est.notas).map(([n, t]) =>
    `<li id="nota-${n}" value="${n}">${esc(t)}</li>`).join('\n          ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(doc.titulo)} — texto integral | Catecismo da Igreja Católica</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(doc.titulo)} — ${esc(doc.subtitulo)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://santadoutrina.cloud/assets/catecismo-logo.webp">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="/assets/css/main.css">
  <script defer src="https://umami.danielerick.com/script.js" data-website-id="28c35f85-bd1b-4ea9-8f52-fc98d33b4974"></script>
  <style>
    .fonte-doc { max-width: 720px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; font-family: var(--font-serif, 'EB Garamond', serif); color: var(--color-text, #2a2118); line-height: 1.7; }
    .fonte-voltar { font-family: var(--font-sans, 'Inter', sans-serif); font-size: .85rem; }
    .fonte-voltar a { color: var(--color-accent, #663300); text-decoration: none; }
    .fonte-tipo { font-family: var(--font-sans, 'Inter', sans-serif); font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; color: var(--color-accent, #663300); margin-top: 1.5rem; }
    .fonte-doc h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); margin: .2rem 0 .3rem; }
    .fonte-sub { font-style: italic; font-size: 1.15rem; opacity: .85; }
    .fonte-meta { font-family: var(--font-sans, 'Inter', sans-serif); font-size: .8rem; opacity: .7; margin-top: .4rem; }
    .fonte-origem { font-family: var(--font-sans, 'Inter', sans-serif); font-size: .78rem; background: rgba(102,51,0,.06); border-radius: 8px; padding: .6rem .9rem; margin: 1.2rem 0 2rem; }
    .fonte-origem a { color: var(--color-accent, #663300); }
    .fonte-secao { margin: 2rem 0; }
    .fonte-secao h2 { font-size: 1.15rem; font-family: var(--font-sans, 'Inter', sans-serif); font-weight: 600; margin-bottom: .6rem; }
    .fonte-num { color: var(--color-accent, #663300); }
    .fonte-ref { font-size: .7em; }
    .fonte-ref a { color: var(--color-accent, #663300); text-decoration: none; padding: 0 .1em; }
    .fonte-fecho { margin-top: 2rem; font-style: italic; opacity: .8; }
    .fonte-notas { margin-top: 3rem; border-top: 1px solid rgba(0,0,0,.12); padding-top: 1rem; }
    .fonte-notas h2 { font-family: var(--font-sans, 'Inter', sans-serif); font-size: 1rem; }
    .fonte-notas ol { font-family: var(--font-sans, 'Inter', sans-serif); font-size: .82rem; line-height: 1.5; color: var(--color-text, #2a2118); opacity: .9; padding-left: 1.4rem; }
    .fonte-notas li { margin: .3rem 0; }
  </style>
</head>
<body>
  <main class="fonte-doc">
    <p class="fonte-voltar"><a href="/">← Catecismo da Igreja Católica</a></p>
    <header>
      <p class="fonte-tipo">${esc(doc.tipo)}</p>
      <h1>${esc(doc.titulo)}</h1>
      <p class="fonte-sub">${esc(doc.subtitulo)}</p>
      <p class="fonte-meta">${esc(doc.autoria)} · ${esc(doc.data)}</p>
    </header>
    <p class="fonte-origem">Texto oficial: <a href="${doc.url}" rel="nofollow noopener" target="_blank">vatican.va</a> · © Libreria Editrice Vaticana. Reproduzido para leitura junto ao Catecismo.</p>
    <article>
${secoesHtml}
      ${est.fecho.length ? `<footer class="fonte-fecho">${est.fecho.map(esc).join('<br>')}</footer>` : ''}
    </article>
    ${maxNota ? `<section class="fonte-notas"><h2>Notas</h2><ol>\n          ${notasHtml}\n        </ol></section>` : ''}
  </main>
</body>
</html>`;
}

const index = [];
for (const doc of manifest) {
  const html = fs.readFileSync(path.join(CACHE, doc.arquivo), 'latin1');
  const est = estruturar(paragrafos(html));
  // diretório por doc → URL limpa /fontes/<slug> (try_files {path}/index.html no Caddy)
  fs.mkdirSync(path.join('fontes', doc.slug), { recursive: true });
  fs.writeFileSync(path.join('fontes', doc.slug, 'index.html'), pagina(doc, est));
  index.push({ slug: doc.slug, titulo: doc.titulo, tipo: doc.tipo });
  console.log(`fontes/${doc.slug}.html — ${est.secoes.length} seções, ${Object.keys(est.notas).length} notas, fecho:${est.fecho.length}`);
}
fs.writeFileSync('data/fontes-index.json', JSON.stringify(index, null, 1));
console.log(`\n${manifest.length} documento(s) → fontes/ + data/fontes-index.json`);
