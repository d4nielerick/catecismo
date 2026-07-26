/**
 * scripts/build-catromano.mjs — gera a página /fontes/catecismo-romano/ com as
 * passagens do Catecismo Romano (Trento) citadas nas notas do CIC, em tradução
 * de trabalho para o português (o latim é DP mas só existe em OCR danificado; a
 * tradução PT do Frei Leopoldo é protegida — por isso, tradução própria a partir
 * do McHugh–Callan inglês (DP), com link para o fac-símile latino).
 *
 * Entrada: data/catromano.json (gerado das traduções revisadas).
 * Saída: fontes/catecismo-romano/index.html.
 * Uso: node scripts/build-catromano.mjs
 */
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/catromano.json', 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const canonical = 'https://santadoutrina.cloud/fontes/catecismo-romano/';

// agrupa por parte, preservando a ordem
const partes = [];
for (const p of data.passagens) {
  let g = partes.find((x) => x.parte === p.parte);
  if (!g) { g = { parte: p.parte, itens: [] }; partes.push(g); }
  g.itens.push(p);
}

const passagensHtml = partes.map((g) => `
      <h2 class="cr-parte">${esc(g.parte)}</h2>
      ${g.itens.map((p) => `
      <article id="${p.anchor}" class="cr-passagem">
        <p class="cr-ref">Catecismo Romano · ${esc(p.parte.replace(/ —.*/, ''))}, ${esc(p.capitulo)}, §${esc(p.paragrafo)}
          <span class="cr-cic">(citado em §${p.cic.join(', §')} do Catecismo)</span></p>
        <h3>${esc(p.titulo)}</h3>
        <p class="cr-texto">${esc(p.pt)}</p>
      </article>`).join('\n')}`).join('\n');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catecismo Romano (de Trento) — passagens citadas | Catecismo da Igreja Católica</title>
  <meta name="description" content="Passagens do Catecismo Romano (Concílio de Trento, 1566) citadas nas notas do Catecismo da Igreja Católica, em tradução de trabalho para o português.">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="Catecismo Romano (de Trento) — passagens citadas">
  <meta property="og:description" content="Passagens do Catecismo do Concílio de Trento citadas no Catecismo da Igreja Católica, traduzidas para o português.">
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
    .fonte-doc { max-width: 720px; margin: 2rem auto; padding: 2.5rem 2.2rem 4rem; background: var(--color-bg, #FAF8F3); border-radius: var(--radius-lg, 16px); box-shadow: var(--shadow-md, 0 4px 24px rgba(0,0,0,.12)); font-family: var(--font-serif, 'EB Garamond', serif); color: var(--color-text, #2C2C2C); font-size: 1.05rem; line-height: 1.85; }
    @media (max-width: 760px) { .fonte-doc { margin: 0.75rem; padding: 1.5rem 1.2rem 3rem; } }
    .fonte-voltar { font-family: var(--font-sans,'Inter',sans-serif); font-size: .85rem; }
    .fonte-voltar a { color: var(--color-accent-dk,#a0811e); text-decoration: none; }
    .fonte-tipo { font-family: var(--font-sans,'Inter',sans-serif); font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; color: var(--color-accent-dk,#a0811e); margin-top: 1.5rem; }
    .fonte-doc h1 { font-size: clamp(1.8rem,5vw,2.6rem); margin: .2rem 0 .3rem; }
    .fonte-sub { font-style: italic; font-size: 1.1rem; opacity: .85; }
    .fonte-origem { font-family: var(--font-sans,'Inter',sans-serif); font-size: .78rem; line-height: 1.5; background: rgba(160,129,30,.08); border-radius: 8px; padding: .7rem .9rem; margin: 1.2rem 0 2.4rem; }
    .fonte-origem a { color: var(--color-accent-dk,#a0811e); }
    .cr-parte { font-family: var(--font-sans,'Inter',sans-serif); font-size: 1rem; font-weight: 600; color: var(--color-accent-dk,#a0811e); margin: 2.4rem 0 1rem; border-bottom: 1px solid rgba(0,0,0,.1); padding-bottom: .3rem; }
    .cr-passagem { margin: 1.6rem 0; scroll-margin-top: 5rem; }
    .cr-ref { font-family: var(--font-sans,'Inter',sans-serif); font-size: .75rem; color: var(--color-muted,#888); margin-bottom: .1rem; }
    .cr-cic { opacity: .8; }
    .cr-passagem h3 { font-family: var(--font-sans,'Inter',sans-serif); font-size: 1rem; font-weight: 600; margin: .1rem 0 .4rem; }
    .cr-texto { margin: 0; }
    .cr-passagem:target { background: var(--color-mark-bg,#fefce8); border-radius: 8px; padding: .6rem .8rem; margin-left: -.8rem; margin-right: -.8rem; }
  </style>
</head>
<body>
  <main class="fonte-doc">
    <p class="fonte-voltar"><a href="/">← Catecismo da Igreja Católica</a></p>
    <header>
      <p class="fonte-tipo">Concílio de Trento · 1566</p>
      <h1>${esc(data.meta.titulo)}</h1>
      <p class="fonte-sub">${esc(data.meta.subtitulo)}</p>
    </header>
    <p class="fonte-origem">
      ${esc(data.meta.traducao)}
      O texto latino original (domínio público) está no <a href="${esc(data.meta.latim_url)}" rel="nofollow noopener" target="_blank">fac-símile do Internet Archive</a>.
      Estas são apenas as passagens citadas nas notas do Catecismo da Igreja Católica — não a obra completa.
    </p>
    ${passagensHtml}
  </main>
</body>
</html>`;

fs.mkdirSync('fontes/catecismo-romano', { recursive: true });
fs.writeFileSync('fontes/catecismo-romano/index.html', html);
console.log(`fontes/catecismo-romano/index.html — ${data.passagens.length} passagens em ${partes.length} partes`);
