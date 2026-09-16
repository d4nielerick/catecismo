/**
 * liturgiadiaria.js — página /liturgiadiaria/.
 *
 * Lê data/liturgia/AAAA-MM-DD.json (gerado por scripts/build-liturgia.mjs a partir da fonte
 * crua) e data/liturgia/indice.json (intervalo de datas disponível para o calendário).
 * O JSON já vem com cada leitura separada, a referência completa e o nome litúrgico do dia;
 * aqui só se desenha.
 */

import {
  esc, pad, hojeLocal, abasHtml, cabecalhoDoDia, conteudoDoDia, diasHtml, itensDasAbas, urlDoDia, NOME_COR,
} from '/liturgiadiaria/render.mjs';

function preencherCabecalho(dt, dia, santos) {
  const cab = cabecalhoDoDia(dt, dia);
  document.getElementById('lp-data').textContent = cab.linha;
  if (!dia) return;
  pendurarFita(dia.cor);
  if (cab.corDia) document.documentElement.style.setProperty('--lp-cor-dia', cab.corDia);
  if (cab.tempo) {
    document.getElementById('lp-tempo').textContent = cab.tempo;
    document.getElementById('lp-cor-dot').style.background = cab.corPonto || '#888';
  }

  if (dia.celebracao) {
    const el = document.getElementById('lp-nome-dia');
    el.textContent = dia.celebracao;
    const slug = santos?.[dia.celebracao];
    if (slug) {
      const mais = document.createElement('button'); // só aparece no celular
      mais.type = 'button';
      mais.className = 'nome-dia-mais';
      mais.textContent = 'Saiba mais';
      mais.addEventListener('click', () => abrirSobre(slug, dia.celebracao));
      el.append(mais);
      mostrarSobre(slug, dia.celebracao);
    }
    el.style.display = '';
  }
}

// ── Navegação ────────────────────────────────────────────────────────────────
function construirNav(blocos) {
  const tabsEl = document.getElementById('lp-tabs');
  tabsEl.innerHTML = abasHtml(blocos);
  const itens = itensDasAbas(blocos);

  const cards = itens.map(({ id }) => document.getElementById(id)).filter(Boolean);
  const links = [...tabsEl.querySelectorAll('a')];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('ativa', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-90px 0px -55% 0px' }); // ativa a leitura que passa logo abaixo das abas fixas
  cards.forEach(c => obs.observe(c));
}

// ── Calendário ───────────────────────────────────────────────────────────────
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function construirCalendario(dtAtual, hoje, indice) {
  const wrap = document.getElementById('cal-wrap');
  if (!wrap) return;

  const sel = new Date(`${dtAtual}T12:00:00`);
  let ano = sel.getFullYear();
  let mes = sel.getMonth();

  function render() {
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();

    let html = `
      <div class="cal-header">
        <button class="cal-btn" id="cal-prev" aria-label="Mês anterior">‹</button>
        <span class="cal-mes">${MESES[mes]} ${ano}</span>
        <button class="cal-btn" id="cal-next" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-grid">
        ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${Array(primeiroDia).fill('<div class="cal-dia vazio"></div>').join('')}
    `;

    for (let d = 1; d <= ultimoDia; d++) {
      const dtStr = `${ano}-${pad(mes + 1)}-${pad(d)}`;
      const foraRange = !indice || dtStr < indice.inicio || dtStr > indice.fim;
      const isHoje = dtStr === hoje;
      const isSel = dtStr === dtAtual;
      const cls = ['cal-dia', foraRange && 'fora-range', isHoje && 'hoje', isSel && !isHoje && 'selecionado']
        .filter(Boolean).join(' ');
      html += foraRange
        ? `<div class="${cls}">${d}</div>`
        : `<a class="${cls}" href="${urlDoDia(dtStr)}">${d}</a>`;
    }

    html += '</div>';
    wrap.innerHTML = html;

    document.getElementById('cal-prev')?.addEventListener('click', () => {
      mes--; if (mes < 0) { mes = 11; ano--; } render();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      mes++; if (mes > 11) { mes = 0; ano++; } render();
    });
  }

  render();
}

// ── Entrada do texto, linha a linha ──────────────────────────────────────────
// Cada palavra vira um <span>; a posição real na tela agrupa as palavras em linhas, e cada linha
// entra quando aparece no viewport (as que entram juntas vêm em cascata, de cima para baixo).
const SELETOR_ENTRADA = [
  '.lp-titulo', '.lp-data', '.tempo-wrap', '.nome-dia', '.lp-avisos',
  '.leitura-label', '.leitura-ref', '.leitura-titulo', '.leitura-texto p',
  '.salmo-refrao', '.salmo-estrofe', '.salmo-r-sep.com-texto', '.acl-verso',
].join(', ');
const BLOCOS_INTEIROS = '.lp-data, .tempo-wrap, .nome-dia, .lp-avisos, .leitura-label, .leitura-ref';
const UNIDADES_INLINE = 'sup, .salmo-r-label, .salmo-ou';
const PASSO_LINHA_MS = 55;
const LEVA_MAX_MS = 1000;

function quebrarEmPalavras(bloco) {
  const textos = [];
  const walker = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textos.push(walker.currentNode);
  for (const no of textos) {
    const inline = no.parentElement.closest(UNIDADES_INLINE);
    if (inline && bloco.contains(inline)) { inline.classList.add('lp-palavra', 'lp-oculto'); continue; }
    if (!no.textContent.trim()) continue;
    const frag = document.createDocumentFragment();
    for (const parte of no.textContent.split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { frag.append(parte); continue; }
      const span = document.createElement('span');
      span.className = 'lp-palavra lp-oculto';
      span.textContent = parte;
      frag.append(span);
    }
    no.replaceWith(frag);
  }
}

function animarEntrada() {
  const pronto = () => document.documentElement.classList.add('lp-pronto');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { pronto(); return; }

  for (const bloco of document.querySelectorAll(SELETOR_ENTRADA)) {
    if (bloco.closest('details') || bloco.dataset.lpBloco) continue;
    bloco.dataset.lpBloco = '1';
    if (bloco.matches(BLOCOS_INTEIROS)) bloco.classList.add('lp-oculto');
    else quebrarEmPalavras(bloco);
  }
  pronto();

  let obs = null;
  const linhaDo = new Map(); // primeira unidade da linha → unidades da linha

  function revelar(unidades, atraso) {
    for (const u of unidades) {
      u.style.setProperty('--lp-atraso', `${atraso}ms`);
      u.classList.replace('lp-oculto', 'lp-entra');
    }
  }

  function montar() {
    obs?.disconnect();
    linhaDo.clear();
    const linhas = [];
    let atual = null;
    for (const u of document.querySelectorAll('.lp-oculto')) {
      if (!u.getClientRects().length) { u.classList.remove('lp-oculto'); continue; } // escondido (display: none)
      const bloco = u.closest('[data-lp-bloco]');
      const r = u.getBoundingClientRect();
      const mesmaLinha = atual && atual.bloco === bloco && Math.abs(r.top - atual.top) < r.height * 0.5;
      if (!mesmaLinha) { atual = { bloco, top: r.top, unidades: [] }; linhas.push(atual); }
      atual.unidades.push(u);
    }
    obs = new IntersectionObserver(entradas => {
      // Lateral e leitura fazem cada uma a sua cascata, em paralelo; o passo encolhe quando
      // muitas linhas entram de uma vez, para a leva inteira caber em ~1s.
      const colunas = new Map();
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const coluna = e.target.closest('.lp-lateral') ? 'lateral' : 'leitura';
        if (!colunas.has(coluna)) colunas.set(coluna, []);
        colunas.get(coluna).push(e);
      }
      for (const lista of colunas.values()) {
        lista.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const passo = Math.min(PASSO_LINHA_MS, LEVA_MAX_MS / lista.length);
        lista.forEach((e, k) => {
          revelar(linhaDo.get(e.target), Math.round(k * passo));
          obs.unobserve(e.target);
        });
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    for (const l of linhas) {
      linhaDo.set(l.unidades[0], l.unidades);
      obs.observe(l.unidades[0]);
    }
  }

  // Mede depois da webfont (a quebra de linha muda com ela), mas sem esperar para sempre.
  Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]).then(montar);

  let espera;
  addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (document.querySelector('.lp-oculto')) montar(); }, 200);
  });
  document.addEventListener('animationend', e => {
    if (e.animationName === 'lp-entrada') e.target.classList.remove('lp-entra');
  });
}

// ── Fita da cor litúrgica ────────────────────────────────────────────────────

function pendurarFita(cor) {
  const fita = document.getElementById('lp-fita');
  if (!fita || !NOME_COR[cor]) return;
  fita.dataset.cor = cor;
  fita.setAttribute('aria-label', `Cor litúrgica do dia: ${NOME_COR[cor]}`);
  fita.title = `Cor litúrgica: ${NOME_COR[cor]}`;
  fita.hidden = false;
}

// ── Avisos do calendário ─────────────────────────────────────────────────────
// indice.json › marcos (scripts/build-liturgia.mjs): Advento, Natal, Cinzas, dias de preceito…
// Contados a partir de hoje, não do dia aberto no calendário.
const AVISOS_MAX = 4;
const AVISO_MS = 5000;
const ATENCAO_DIAS = 21;

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
const diaCurto = iso => new Date(`${iso}T12:00:00`)
  .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
const semArtigo = s => s.replace(/^(?:o|a) /, '');

// Curto de propósito: cabe numa linha na lateral.
function textoDoAviso(m, n) {
  const rotulo = m.preceito ? 'Preceito' : m.jejum ? 'Jejum' : '';
  if (rotulo && n <= ATENCAO_DIAS) {
    const quando = n === 0 ? 'hoje' : n === 1 ? 'amanhã' : esc(diaCurto(m.data));
    return `<span class="lp-aviso-rotulo">${rotulo}</span>${quando} · <strong>${esc(semArtigo(m.curto))}</strong>`;
  }
  if (n <= 1) {
    const dia = n === 0 ? 'Hoje' : 'Amanhã';
    return m.inicio ? `${dia} começa <strong>${esc(m.curto)}</strong>` : `${dia}: <strong>${esc(semArtigo(m.curto))}</strong>`;
  }
  return `Faltam <strong>${n} dias</strong> para ${m.inicio ? 'começar ' : ''}${esc(m.curto)}`;
}

function montarAvisos(indice, hoje) {
  const wrap = document.getElementById('lp-avisos');
  if (!wrap || !indice?.marcos) return;

  const vistos = new Set();
  const avisos = [];
  for (const m of indice.marcos) {
    if (m.data < hoje || vistos.has(m.nome)) continue;
    vistos.add(m.nome);
    avisos.push(textoDoAviso(m, diasEntre(hoje, m.data)));
    if (avisos.length === AVISOS_MAX) break;
  }
  if (!avisos.length) return;

  const texto = wrap.querySelector('.lp-aviso-texto');
  let atual = 0;
  // Reserva a altura do aviso mais longo: quando um quebra linha, a troca não empurra a página.
  const reservarAltura = () => {
    texto.style.minHeight = '';
    let maior = 0;
    for (const a of avisos) {
      texto.innerHTML = a;
      maior = Math.max(maior, texto.offsetHeight);
    }
    texto.style.minHeight = `${maior}px`;
    texto.innerHTML = avisos[atual];
  };
  reservarAltura();
  document.fonts?.ready.then(reservarAltura);
  let esperaResize;
  addEventListener('resize', () => { clearTimeout(esperaResize); esperaResize = setTimeout(reservarAltura, 150); });
  if (avisos.length < 2) return;

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pausado = false;
  let troca;
  function avancar() {
    atual = (atual + 1) % avisos.length;
    clearTimeout(troca);
    if (reduzido) { texto.innerHTML = avisos[atual]; return; }
    texto.classList.add('saindo');
    troca = setTimeout(() => {
      texto.innerHTML = avisos[atual];
      texto.classList.remove('saindo');
    }, 250);
  }

  setInterval(() => { if (!pausado && !document.hidden) avancar(); }, AVISO_MS);
  texto.addEventListener('click', avancar);
  wrap.addEventListener('mouseenter', () => { pausado = true; });
  wrap.addEventListener('mouseleave', () => { pausado = false; });
}

// ── Sobre a celebração (resumo da Wikipédia) ─────────────────────────────────
// data/santos/indice.json › { celebração: slug }; o texto vem pronto de scripts/build-santos.mjs.
// Telas largas: o texto fica aberto embaixo do calendário. Celular: "Saiba mais" abre um modal.
const SOBRE_AO_LADO = matchMedia('(min-width: 761px)');
const sobreCache = new Map();

function carregarSobre(slug) {
  if (!sobreCache.has(slug)) sobreCache.set(slug, buscarJson(`/data/santos/${slug}.json`));
  return sobreCache.get(slug);
}

function htmlDosArtigos(dados, classe) {
  const varios = dados.artigos.length > 1;
  return dados.artigos.map(a => `
    <section class="${classe}-artigo">
      ${a.imagem ? `<img class="${classe}-img" src="${esc(a.imagem.src)}" width="${a.imagem.largura}" height="${a.imagem.altura}" alt="${esc(a.titulo)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
      ${varios ? `<h3>${esc(a.titulo)}</h3>` : ''}
      ${a.resumo.map(p => `<p>${esc(p)}</p>`).join('')}
      <a class="${classe}-link" href="${esc(a.url)}" target="_blank" rel="noopener">Ler o artigo completo na Wikipédia ↗</a>
    </section>`).join('');
}

function mostrarSobre(slug, celebracao) {
  const box = document.getElementById('lp-sobre');
  if (!box) return;
  const desenhar = async () => {
    if (!SOBRE_AO_LADO.matches || box.dataset.slug === slug) return;
    const dados = await carregarSobre(slug);
    if (!dados) return;
    box.dataset.slug = slug;
    box.innerHTML = `
      <p class="lp-sobre-rotulo">Sobre a celebração</p>
      <h2 class="lp-sobre-titulo">${esc(celebracao)}</h2>
      ${htmlDosArtigos(dados, 'lp-sobre')}
      <p class="lp-sobre-credito">Texto da <a href="https://pt.wikipedia.org/" target="_blank" rel="noopener">Wikipédia</a>, licença <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
    box.hidden = false;
  };
  desenhar();
  SOBRE_AO_LADO.addEventListener('change', desenhar);
}

async function abrirSobre(slug, celebracao) {
  const dlg = document.getElementById('lp-santo');
  const corpo = document.getElementById('lp-santo-corpo');
  if (!dlg?.showModal) return;
  document.getElementById('lp-santo-titulo').textContent = celebracao;
  corpo.innerHTML = '<p class="lp-modal-carregando">Carregando…</p>';
  dlg.showModal();

  const dados = await carregarSobre(slug);
  corpo.innerHTML = dados
    ? htmlDosArtigos(dados, 'lp-modal')
    : '<p class="lp-modal-carregando">Não foi possível carregar o texto agora.</p>';
}

function configurarModal() {
  const dlg = document.getElementById('lp-santo');
  if (!dlg) return;
  dlg.querySelector('.lp-modal-fechar').addEventListener('click', () => dlg.close());
  // Clique no fundo escurecido: o alvo é o próprio <dialog>, fora da caixa.
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

// ── Início ───────────────────────────────────────────────────────────────────
const buscarJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

async function init() {
  const hoje = hojeLocal();
  // /liturgiadiaria/AAAA-MM-DD/ (página de cada dia) · ?data= (links antigos) · hoje
  const doCaminho = location.pathname.match(/\/liturgiadiaria\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
  const pedida = doCaminho || new URLSearchParams(location.search).get('data') || '';
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoje;

  const [indice, dia, santos] = await Promise.all([
    buscarJson('/data/liturgia/indice.json'),
    buscarJson(`/data/liturgia/${dt}.json`),
    buscarJson('/data/santos/indice.json'),
  ]);

  preencherCabecalho(dt, dia, santos);
  montarAvisos(indice, hoje);
  configurarModal();
  construirCalendario(dt, hoje, indice);
  document.getElementById('lp-dias').innerHTML = diasHtml(dt, indice);

  const conteudo = document.getElementById('conteudo');
  if (!dia) {
    conteudo.innerHTML = `<p class="erro">${dt === hoje ? 'Leituras de hoje não disponíveis.' : 'Leituras deste dia não disponíveis.'}</p>`;
    animarEntrada();
    return;
  }

  // Nas páginas de cada dia o HTML já veio pronto e é idêntico: redesenhar não mexe no layout.
  const { html, blocos } = conteudoDoDia(dia);
  conteudo.innerHTML = html;
  construirNav(blocos);
  animarEntrada();
}
init();
