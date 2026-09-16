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

// O que a página está mostrando; trocar de dia acontece aqui mesmo, sem recarregar.
const estado = { dt: null, hoje: null, indice: null, santos: null, destaques: new Map() };
const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)');
const PODE_PAIRAR = matchMedia('(hover: hover) and (pointer: fine)');
const TELA_ESTREITA = matchMedia('(max-width: 1080px)');

function preencherData(dt, dia) {
  const cab = cabecalhoDoDia(dt, dia);
  document.getElementById('lp-titulo-data').textContent = cab.dataCurta;
  document.getElementById('lp-titulo-leitor').textContent = ` de ${cab.dataLonga}`;
  document.getElementById('lp-data').textContent = dia ? cab.linha : cabecalhoDoDia(dt, null).linha;
  return cab;
}

function preencherCabecalho(dt, dia, santos) {
  const cab = preencherData(dt, dia);
  document.getElementById('lp-compacto-data').textContent = cab.dataExtenso;
  if (!dia) { mostrarSobre(null); return; }
  pendurarFita(dia.cor);
  if (cab.corDia) document.documentElement.style.setProperty('--lp-cor-dia', cab.corDia);
  if (cab.corTitulo) document.documentElement.style.setProperty('--lp-cor-titulo', cab.corTitulo);
  if (cab.tempo) {
    document.getElementById('lp-tempo').textContent = cab.tempo;
    document.getElementById('lp-cor-dot').style.background = cab.corPonto || '#888';
  }

  const el = document.getElementById('lp-nome-dia');
  el.textContent = cab.nome;
  const slug = dia.celebracao && santos?.[dia.celebracao];
  if (slug) {
    const mais = document.createElement('button'); // só aparece no celular
    mais.type = 'button';
    mais.className = 'nome-dia-mais';
    mais.textContent = 'Saiba mais';
    mais.addEventListener('click', () => abrirSobre(slug, dia.celebracao));
    el.append(mais);
  }
  mostrarSobre(slug ? { slug, celebracao: dia.celebracao } : null);
}

// ── Navegação ────────────────────────────────────────────────────────────────
let observadorAbas = null;
function construirNav(blocos) {
  observadorAbas?.disconnect();
  const tabsEl = document.getElementById('lp-tabs');
  tabsEl.innerHTML = abasHtml(blocos);
  const itens = itensDasAbas(blocos);

  const cards = itens.map(({ id }) => document.getElementById(id)).filter(Boolean);
  const links = [...tabsEl.querySelectorAll('a')];
  const obs = observadorAbas = new IntersectionObserver(entries => {
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
      const destaque = !foraRange && estado.destaques.get(dtStr);
      const cls = ['cal-dia', foraRange && 'fora-range', isHoje && 'hoje', isSel && !isHoje && 'selecionado',
        destaque && `tem-destaque destaque-${destaque.tipo}`].filter(Boolean).join(' ');
      const dica = destaque ? ` data-dica="${esc(destaque.nome)}" data-tipo="${destaque.tipo}"` : '';
      html += foraRange
        ? `<div class="${cls}">${d}</div>`
        : `<a class="${cls}" href="${urlDoDia(dtStr)}"${dica}>${d}</a>`;
    }

    html += '</div>';
    esconderDica();
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
  '.leitura-label', '.leitura-ref', '.leitura-titulo', '.leitura-texto p',
  '.salmo-refrao', '.salmo-estrofe', '.salmo-r-sep.com-texto', '.acl-verso',
].join(', ');
const BLOCOS_INTEIROS = '.leitura-label, .leitura-ref';
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
  if (REDUZIDO.matches || !('IntersectionObserver' in window)) { pronto(); return; }

  for (const bloco of document.querySelectorAll(SELETOR_ENTRADA)) {
    if (bloco.closest('details') || bloco.dataset.lpBloco) continue;
    bloco.dataset.lpBloco = '1';
    if (bloco.matches(BLOCOS_INTEIROS)) bloco.classList.add('lp-oculto');
    else quebrarEmPalavras(bloco);
  }
  pronto();

  const linhaDo = new Map(); // primeira unidade da linha → unidades da linha

  function revelar(unidades, atraso) {
    for (const u of unidades) {
      u.style.setProperty('--lp-atraso', `${atraso}ms`);
      u.classList.replace('lp-oculto', 'lp-entra');
    }
  }

  function montar() {
    observadorLinhas?.disconnect();
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
    const obs = observadorLinhas = new IntersectionObserver(entradas => {
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
  remontarLinhas = montar;
  Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]).then(montar);
}

let observadorLinhas = null;
let remontarLinhas = null;
{
  let espera;
  addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (document.querySelector('.lp-oculto')) remontarLinhas?.(); }, 200);
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
  // No celular o lembrete mora embaixo do calendário; nas telas largas, na coluna do título.
  const celular = matchMedia('(max-width: 760px)');
  const posicionar = () => {
    const destino = celular.matches ? document.querySelector('.lp-direita') : document.querySelector('.lp-lateral');
    if (destino && wrap && wrap.parentElement !== destino) destino.append(wrap);
  };
  posicionar();
  celular.addEventListener('change', posicionar);
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

let sobreAtual = null;
function mostrarSobre(atual) {
  sobreAtual = atual;
  desenharSobre();
}

async function desenharSobre() {
  const box = document.getElementById('lp-sobre');
  if (!box) return;
  if (!sobreAtual) { box.hidden = true; box.dataset.slug = ''; box.innerHTML = ''; return; }
  const { slug, celebracao } = sobreAtual;
  if (!SOBRE_AO_LADO.matches || box.dataset.slug === slug) return;
  const dados = await carregarSobre(slug);
  if (!dados || sobreAtual?.slug !== slug) return;
  box.dataset.slug = slug;
  box.innerHTML = `
      <p class="lp-sobre-rotulo">Sobre a celebração</p>
      <h2 class="lp-sobre-titulo">${esc(celebracao)}</h2>
      ${htmlDosArtigos(dados, 'lp-sobre')}
      <p class="lp-sobre-credito">Texto da <a href="https://pt.wikipedia.org/" target="_blank" rel="noopener">Wikipédia</a>, licença <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
  box.hidden = false;
}
SOBRE_AO_LADO.addEventListener('change', desenharSobre);

async function abrirSobre(slug, celebracao) {
  const dlg = document.getElementById('lp-santo');
  const corpo = document.getElementById('lp-santo-corpo');
  if (!dlg?.showModal) return;
  document.getElementById('lp-santo-titulo').textContent = celebracao;
  corpo.innerHTML = '<p class="lp-modal-carregando">Carregando…</p>';
  dlg.showModal();
  lenis?.stop();

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
  dlg.addEventListener('close', () => lenis?.start());
}

// ── Início ───────────────────────────────────────────────────────────────────
const buscarJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

// ── Entrada do cabeçalho ─────────────────────────────────────────────────────
// "Liturgia Diária" entra grande, na cor litúrgica do dia, sai pela esquerda e dá lugar à data
// ("16/set"), que sobe de baixo; o título volta pequeno em cima e o resto do cabeçalho entra em
// cascata. Web Animations, sem biblioteca (~1,5s).
const SUAVE = 'cubic-bezier(0.16, 1, 0.3, 1)';      // entra desacelerando bem devagar
const SAI = 'cubic-bezier(0.55, 0, 0.75, 0.25)';    // sai ganhando velocidade aos poucos

function entrar(el, atraso, { duracao = 620, y = '0.4em', desfoque = 4 } = {}) {
  const anim = el.animate(
    [{ opacity: 0, transform: `translateY(${y})`, filter: `blur(${desfoque}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: duracao, delay: atraso, easing: SUAVE, fill: 'both' },
  );
  // Ao terminar, devolve o elemento ao estilo normal (a rolagem também mexe nele).
  anim.finished.then(() => { el.style.opacity = ''; el.style.transform = ''; el.style.filter = ''; anim.cancel(); }, () => {});
  return anim;
}

function abrirCabecalho() {
  const raiz = document.documentElement;
  const cabeca = document.querySelector('.lp-cabeca');
  if (!cabeca || !raiz.classList.contains('lp-anima') || !cabeca.animate) {
    raiz.classList.add('lp-cabeca-pronta');
    return;
  }
  const intro = document.createElement('div');
  intro.className = 'lp-intro';
  intro.setAttribute('aria-hidden', 'true');
  intro.innerHTML = '<span>Liturgia</span><span>Diária</span>';
  cabeca.append(intro);

  // 1. o título grande entra, palavra por palavra
  [...intro.children].forEach((s, i) => entrar(s, i * 110, { duracao: 800, y: '0.3em', desfoque: 6 }));
  // 2. e sai pela esquerda, uma palavra logo depois da outra
  const saidas = [...intro.children].map((s, i) => s.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(-0.45em)', filter: 'blur(5px)' }],
    { duration: 420, delay: 850 + i * 70, easing: SAI, fill: 'both' },
  ).finished);
  Promise.all(saidas).then(() => intro.remove(), () => intro.remove());
  // 3. a data sobe de baixo no lugar dele, o título volta pequeno em cima
  entrar(cabeca.querySelector('.lp-titulo-data'), 1060, { duracao: 800, y: '0.55em', desfoque: 6 });
  entrar(cabeca.querySelector('.lp-marca'), 1100, { duracao: 700, y: '0.6em', desfoque: 0 });
  // 4. o resto do cabeçalho em cascata
  const resto = ['.lp-lateral .lp-data', '.lp-lateral .tempo-wrap', '.lp-lateral .nome-dia', '#lp-avisos'].map(s => document.querySelector(s)).filter(Boolean);
  resto.forEach((el, i) => entrar(el, 1260 + i * 80, { duracao: 640, y: '0.5em', desfoque: 3 }));
  raiz.classList.add('lp-cabeca-pronta');
}

// ── Troca de dia (sem recarregar) ────────────────────────────────────────────
// Só a data sai pela esquerda e a nova sobe de baixo; "Liturgia Diária" não entra de novo.
function trocarData(aplicar) {
  const alvos = [
    document.getElementById('lp-titulo-data'),
    ...['.lp-lateral .lp-data', '.lp-lateral .tempo-wrap', '.lp-lateral .nome-dia'].map(sel => document.querySelector(sel)),
  ].filter(Boolean);
  if (REDUZIDO.matches || !alvos[0]?.animate) { aplicar(); return; }
  const saidas = alvos.map((el, i) => el.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(-24px)', filter: 'blur(4px)' }],
    { duration: 340, delay: i * 45, easing: SAI, fill: 'forwards' },
  ));
  Promise.all(saidas.map(x => x.finished)).then(() => {
    aplicar();
    saidas.forEach(x => x.cancel());
    entrar(alvos[0], 0, { duracao: 800, y: '0.55em', desfoque: 6 });
    alvos.slice(1).forEach((el, i) => entrar(el, 140 + i * 80, { duracao: 640, y: '0.5em', desfoque: 3 }));
  }, aplicar);
}

function aplicarDia(dt, dia, { primeira = false } = {}) {
  estado.dt = dt;
  preencherCabecalho(dt, dia, estado.santos);
  construirCalendario(dt, estado.hoje, estado.indice);
  document.getElementById('lp-dias').innerHTML = diasHtml(dt, estado.indice);
  if (!primeira && dia) document.title = `Liturgia Diária ${dt.split('-').reverse().join('/')}: ${dia.celebracao}`;

  const conteudo = document.getElementById('conteudo');
  if (!dia) {
    conteudo.innerHTML = `<p class="erro">${dt === estado.hoje ? 'Leituras de hoje não disponíveis.' : 'Leituras deste dia não disponíveis.'}</p>`;
    construirNav([]);
    animarEntrada();
    return;
  }
  // Nas páginas de cada dia o HTML já veio pronto e é idêntico: redesenhar não mexe no layout.
  const { html, blocos } = conteudoDoDia(dia);
  conteudo.innerHTML = html;
  construirNav(blocos);
  animarEntrada();
}

let pedidoDeDia = 0;
async function irParaDia(dt) {
  if (dt === estado.dt) { rolarPara(0); return; }
  const vez = ++pedidoDeDia;
  const dia = await buscarJson(`/data/liturgia/${dt}.json`);
  if (vez !== pedidoDeDia) return;
  // O endereço volta a ser o da página de hoje: recarregar sempre abre o dia atual.
  if (location.pathname !== '/liturgiadiaria/' || location.search) history.replaceState(null, '', '/liturgiadiaria/');
  if (scrollY > 40) rolarPara(0);
  trocarData(() => aplicarDia(dt, dia));
}

const LINK_DE_DIA = /^\/liturgiadiaria\/(\d{4}-\d{2}-\d{2})\/$/;

function configurarNavegacao() {
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#top') { e.preventDefault(); rolarPara(0); return; }
    if (href.startsWith('#') && a.closest('#lp-tabs')) {
      const card = document.getElementById(href.slice(1));
      if (card) { e.preventDefault(); rolarPara(card); }
      return;
    }
    const dia = href.match(LINK_DE_DIA)?.[1] || (href === '/liturgiadiaria/' ? estado.hoje : null);
    if (!dia || !estado.indice) return;
    // No toque, dia especial: o primeiro toque mostra o que é, o segundo abre o dia.
    if (a.dataset.dica && !PODE_PAIRAR.matches && dicaAlvo !== a) { e.preventDefault(); mostrarDica(a); return; }
    e.preventDefault();
    esconderDica();
    irParaDia(dia);
  });
}

// ── Dica dos dias especiais no calendário ────────────────────────────────────
const TIPO_DE_DESTAQUE = { mariana: 'Festa de Nossa Senhora', santo: 'Santo de devoção' };
let dica = null;
let dicaAlvo = null;

function mostrarDica(el) {
  if (!dica) return;
  dicaAlvo = el;
  dica.innerHTML = `<span class="lp-dica-tipo lp-dica-${el.dataset.tipo}">${TIPO_DE_DESTAQUE[el.dataset.tipo] || ''}</span>`
    + `<span class="lp-dica-nome">${esc(el.dataset.dica)}</span>`
    + (PODE_PAIRAR.matches ? '' : '<span class="lp-dica-toque">toque de novo para abrir</span>');
  const r = el.getBoundingClientRect();
  dica.style.left = '0px';
  dica.style.top = '0px';
  dica.classList.add('medindo');
  const { width: w, height: h } = dica.getBoundingClientRect();
  dica.classList.remove('medindo');
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const acima = r.top - h - 10 > 8;
  dica.style.left = `${Math.round(x)}px`;
  dica.style.top = `${Math.round(acima ? r.top - h - 10 : r.bottom + 10)}px`;
  dica.style.setProperty('--seta-x', `${Math.round(r.left + r.width / 2 - x)}px`);
  dica.classList.toggle('abaixo', !acima);
  dica.classList.add('visivel');
}

function esconderDica() {
  dicaAlvo = null;
  dica?.classList.remove('visivel');
}

function configurarDicas() {
  dica = document.createElement('div');
  dica.className = 'lp-dica';
  dica.setAttribute('role', 'tooltip');
  document.body.append(dica);
  const cal = document.getElementById('cal-wrap');
  const diaDe = e => e.target.closest?.('.cal-dia[data-dica]');
  cal.addEventListener('pointerover', e => { if (PODE_PAIRAR.matches && diaDe(e)) mostrarDica(diaDe(e)); });
  cal.addEventListener('pointerout', e => { if (PODE_PAIRAR.matches && diaDe(e) && !diaDe(e).contains(e.relatedTarget)) esconderDica(); });
  // Teclado (Tab) também mostra a dica; o foco que vem de um toque, não (senão o 1º toque já abriria o dia).
  cal.addEventListener('focusin', e => { if (diaDe(e)?.matches(':focus-visible')) mostrarDica(diaDe(e)); });
  cal.addEventListener('focusout', esconderDica);
  document.addEventListener('pointerdown', e => { if (dicaAlvo && !e.target.closest('.cal-dia[data-dica]')) esconderDica(); });
  addEventListener('scroll', () => { if (dicaAlvo) esconderDica(); }, { passive: true });
}

// ── Rolagem ──────────────────────────────────────────────────────────────────
// Telas até 1080px: o cabeçalho e o calendário encolhem e somem ao subir; quando somem de vez,
// a data por extenso e a fitinha aparecem pequenas em cima das abas. No desktop eles ficam fixos.
const SOME_NA_ROLAGEM = [
  '.lp-lateral > .lp-cabeca', '.lp-lateral > .tempo-wrap', '.lp-lateral > .nome-dia', '.lp-lateral > .lp-avisos',
  '.lp-direita > .cal-wrap', '.lp-direita > .lp-avisos', '.lp-direita > .lp-sobre',
].join(', ');

function configurarRolagem() {
  const raiz = document.documentElement;
  let pedido = false;
  function atualizar() {
    pedido = false;
    const lista = document.querySelectorAll(SOME_NA_ROLAGEM);
    if (!TELA_ESTREITA.matches) {
      lista.forEach(el => { el.style.transform = ''; el.style.opacity = ''; });
      raiz.classList.remove('lp-compacto-on');
      return;
    }
    if (!REDUZIDO.matches) {
      for (const el of lista) {
        const r = el.getBoundingClientRect();
        if (!r.height) continue;
        // Começa a encolher quando o topo do elemento chega a 60px do alto da tela (nunca antes de
        // rolar) e termina quando ele sai inteiro. A escala parte do topo, então o topo não se mexe.
        const topo = r.top + scrollY;
        const comeco = Math.max(0, topo - 60);
        const p = Math.min(1, Math.max(0, (scrollY - comeco) / (topo + r.height - comeco)));
        const q = p * p * (3 - 2 * p);
        el.style.transform = q ? `scale(${(1 - 0.14 * q).toFixed(4)})` : '';
        el.style.opacity = q ? (1 - q).toFixed(3) : '';
      }
    }
    raiz.classList.toggle('lp-compacto-on', document.querySelector('.lp-direita').getBoundingClientRect().bottom < 8);
  }
  const pedir = () => { if (!pedido) { pedido = true; requestAnimationFrame(atualizar); } };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', pedir);
  TELA_ESTREITA.addEventListener('change', pedir);
  pedir();
}

// Rolagem suave (Lenis) no mouse e no trackpad; no toque fica a rolagem nativa do aparelho.
let lenis = null;
async function iniciarLenis() {
  if (REDUZIDO.matches) return;
  try {
    const { default: Lenis } = await import('/assets/js/vendor/lenis.mjs');
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    const quadro = t => { lenis.raf(t); requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  } catch {
    lenis = null;
  }
}

function rolarPara(alvo) {
  let y = 0;
  if (alvo instanceof Element) {
    const titulo = alvo.querySelector('.leitura-label') || alvo;
    const abas = document.getElementById('lp-tabs').offsetHeight;
    const compacto = TELA_ESTREITA.matches ? document.getElementById('lp-compacto').offsetHeight : 0;
    y = titulo.getBoundingClientRect().top + scrollY - abas - compacto - 14;
  }
  if (lenis) lenis.scrollTo(y, { duration: 1.1 });
  else scrollTo({ top: y, behavior: REDUZIDO.matches ? 'auto' : 'smooth' });
}

async function init() {
  const hoje = estado.hoje = hojeLocal();
  // /liturgiadiaria/AAAA-MM-DD/ (página de cada dia) · ?data= (links antigos) · hoje
  const doCaminho = location.pathname.match(/\/liturgiadiaria\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
  const pedida = doCaminho || new URLSearchParams(location.search).get('data') || '';
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoje;

  // A data já é conhecida: a entrada começa sem esperar as leituras.
  if (!doCaminho) preencherData(dt, null);
  abrirCabecalho();
  // O calendário também já pode ser desenhado (o intervalo real de datas chega com o índice).
  construirCalendario(dt, hoje, { inicio: '0000-00-00', fim: '9999-99-99' });
  configurarDicas();
  configurarNavegacao();
  configurarRolagem();
  configurarModal();
  iniciarLenis();

  const [indice, dia, santos] = await Promise.all([
    buscarJson('/data/liturgia/indice.json'),
    buscarJson(`/data/liturgia/${dt}.json`),
    buscarJson('/data/santos/indice.json'),
  ]);
  estado.indice = indice;
  estado.santos = santos;
  estado.destaques = new Map((indice?.destaques || []).map(d => [d.data, d]));

  montarAvisos(indice, hoje);
  aplicarDia(dt, dia, { primeira: true });
}
init();
