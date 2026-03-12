/**
 * ui.js
 * Controlador principal da interface.
 * Liga o motor de busca (search.js) aos dois painéis do DOM.
 *
 * Painel direito: renderiza todo o texto do Catecismo de forma contínua.
 * Ao clicar num resultado, faz scroll até o parágrafo correspondente.
 */

import { carregarDados, buscarPorNumero } from './data.js';
import { buscar, agrupar, destacar, trecho } from './search.js';

// ── Elementos do DOM ─────────────────────────────────────────────────────────
const app             = document.getElementById('app');
const hero            = document.getElementById('hero');
const buscaTopo       = document.getElementById('busca-topo');
const buscarTopoWrap  = document.getElementById('busca-topo-wrapper');
const campoBusca      = document.getElementById('campo-busca');
const botaoLimpar     = document.getElementById('botao-limpar');
const listaResultados = document.getElementById('lista-resultados');
const contagemEl      = document.getElementById('contagem-resultados');
const semResultados   = document.getElementById('sem-resultados');
const painelConteudo  = document.getElementById('painel-conteudo');
const btnFecharConteudo = document.getElementById('btn-fechar-conteudo');
const temasRapidos    = document.getElementById('temas-rapidos');

// ── Estado ───────────────────────────────────────────────────────────────────
let paragrafos    = [];      // todos os parágrafos em memória
let queryAtual    = '';      // último termo buscado
let debounceTimer = null;
let cardAtivo     = null;    // elemento DOM do card selecionado
let paragrafoAtivo = null;   // elemento DOM do parágrafo ativo no texto contínuo
let textoRenderizado = false; // se o texto contínuo já foi montado

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    paragrafos = await carregarDados();
  } catch (err) {
    painelConteudo.innerHTML = `
      <div class="placeholder">
        <p>Erro ao carregar os dados: ${err.message}</p>
      </div>`;
    return;
  }

  registrarEventos();

  // Verifica se há um hash na URL para abrir diretamente
  if (location.hash) {
    const num = parseInt(location.hash.replace('#paragrafo-', ''), 10);
    if (Number.isFinite(num)) ativarBuscaEAbrirParagrafo(num);
  }
})();

// ── Eventos ──────────────────────────────────────────────────────────────────
function registrarEventos() {
  campoBusca.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executarBusca(campoBusca.value), 200);
    botaoLimpar.classList.toggle('oculto', campoBusca.value === '');
  });

  campoBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') limparBusca();
  });

  botaoLimpar.addEventListener('click', limparBusca);

  btnFecharConteudo.addEventListener('click', () => {
    painelConteudo.classList.remove('aberto');
  });

  temasRapidos.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tema]');
    if (!btn) return;
    campoBusca.value = btn.dataset.tema;
    campoBusca.focus();
    botaoLimpar.classList.remove('oculto');
    executarBusca(campoBusca.value);
  });

  listaResultados.addEventListener('click', (e) => {
    const card = e.target.closest('[data-num]');
    if (!card) return;
    selecionarParagrafo(parseInt(card.dataset.num, 10), card);
  });

  listaResultados.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = document.activeElement.closest('[data-num]');
      if (card) selecionarParagrafo(parseInt(card.dataset.num, 10), card);
    }
  });
}

// ── Busca ────────────────────────────────────────────────────────────────────
function executarBusca(query) {
  queryAtual = query.trim();

  if (queryAtual.length < 2) {
    if (queryAtual === '') {
      voltarEstadoInicial();
    }
    return;
  }

  ativarEstadoBusca();

  const { total, paragrafos: encontrados } = buscar(queryAtual, paragrafos);
  const grupos = agrupar(encontrados);

  renderizarResultados(grupos, total, queryAtual);
  atualizarHighlightsTexto(queryAtual, encontrados);
}

// ── Estados da UI ────────────────────────────────────────────────────────────
function ativarEstadoBusca() {
  if (app.classList.contains('estado-busca')) return;

  app.classList.remove('estado-inicial');
  app.classList.add('estado-busca');

  buscarTopoWrap.appendChild(campoBusca);
  buscarTopoWrap.appendChild(botaoLimpar);
  campoBusca.focus();

  // Renderiza texto contínuo na primeira vez
  if (!textoRenderizado) {
    renderizarTextoCompleto();
    textoRenderizado = true;
  }
}

function voltarEstadoInicial() {
  app.classList.remove('estado-busca');
  app.classList.add('estado-inicial');

  const heroWrapper = hero.querySelector('.campo-busca-container');
  heroWrapper.appendChild(campoBusca);
  heroWrapper.appendChild(botaoLimpar);

  listaResultados.innerHTML = '';
  contagemEl.textContent = '';
  semResultados.classList.add('oculto');
  painelConteudo.classList.remove('aberto');

  // Limpa highlights do texto contínuo
  limparHighlights();
  limparParagrafoAtivo();

  cardAtivo = null;
}

function limparBusca() {
  campoBusca.value = '';
  botaoLimpar.classList.add('oculto');
  voltarEstadoInicial();
  campoBusca.focus();
}

// ── Renderização do texto completo (contínuo) ────────────────────────────────
function renderizarTextoCompleto() {
  const container = document.createElement('div');
  container.className = 'texto-continuo';

  let parteAtual = '';
  let secaoAtual = '';
  let capituloAtual = '';
  let artigoAtual = '';

  for (const p of paragrafos) {
    // Cabeçalho Parte
    if (p.parte && p.parte !== parteAtual) {
      parteAtual = p.parte;
      secaoAtual = '';
      capituloAtual = '';
      artigoAtual = '';
      const h = document.createElement('h2');
      h.className = 'tc-parte';
      h.textContent = p.parte;
      container.appendChild(h);
    }

    // Cabeçalho Seção
    if (p.secao && p.secao !== secaoAtual) {
      secaoAtual = p.secao;
      capituloAtual = '';
      artigoAtual = '';
      const h = document.createElement('h3');
      h.className = 'tc-secao';
      h.textContent = p.secao;
      container.appendChild(h);
    }

    // Cabeçalho Capítulo
    if (p.capitulo && p.capitulo !== capituloAtual) {
      capituloAtual = p.capitulo;
      artigoAtual = '';
      const h = document.createElement('h4');
      h.className = 'tc-capitulo';
      h.textContent = p.capitulo;
      container.appendChild(h);
    }

    // Cabeçalho Artigo
    if (p.artigo && p.artigo !== artigoAtual) {
      artigoAtual = p.artigo;
      const h = document.createElement('h5');
      h.className = 'tc-artigo';
      h.textContent = p.artigo;
      container.appendChild(h);
    }

    // Parágrafo
    const div = document.createElement('div');
    div.className = 'tc-paragrafo';
    div.id = `p-${p.numero}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'tc-paragrafo-num';
    numSpan.textContent = `§${p.numero}`;

    const textoSpan = document.createElement('span');
    textoSpan.className = 'tc-paragrafo-texto';
    textoSpan.textContent = p.texto;

    div.appendChild(numSpan);
    div.appendChild(textoSpan);
    container.appendChild(div);
  }

  // Limpa placeholder e insere texto contínuo
  // Preserva o botão fechar (mobile)
  const btnFechar = painelConteudo.querySelector('#btn-fechar-conteudo');
  painelConteudo.innerHTML = '';
  if (btnFechar) painelConteudo.appendChild(btnFechar);
  painelConteudo.appendChild(container);
}

// ── Highlights no texto contínuo ─────────────────────────────────────────────
function atualizarHighlightsTexto(query, encontrados) {
  // Primeiro limpa todos os highlights anteriores
  limparHighlights();

  // Cria set com números encontrados para lookup rápido
  const numerosEncontrados = new Set(encontrados.map(p => p.numero));

  // Atualiza apenas os parágrafos encontrados com highlight
  for (const p of encontrados) {
    const el = document.getElementById(`p-${p.numero}`);
    if (!el) continue;
    const textoEl = el.querySelector('.tc-paragrafo-texto');
    if (textoEl) {
      textoEl.innerHTML = destacar(p.texto, query);
    }
  }
}

function limparHighlights() {
  const marcados = painelConteudo.querySelectorAll('.tc-paragrafo-texto');
  for (const el of marcados) {
    // Se tem <mark>, restaura para texto puro
    if (el.querySelector('mark')) {
      // Encontra o parágrafo correspondente
      const pDiv = el.closest('.tc-paragrafo');
      if (pDiv) {
        const num = parseInt(pDiv.id.replace('p-', ''), 10);
        const p = buscarPorNumero(num);
        if (p) el.textContent = p.texto;
      }
    }
  }
}

function limparParagrafoAtivo() {
  if (paragrafoAtivo) {
    paragrafoAtivo.classList.remove('ativo');
    paragrafoAtivo = null;
  }
}

// ── Seleção de parágrafo ─────────────────────────────────────────────────────
function selecionarParagrafo(numero, cardEl) {
  // Destaca o card ativo na lista
  if (cardAtivo) {
    cardAtivo.classList.remove('selecionado');
    cardAtivo.setAttribute('aria-selected', 'false');
  }
  cardAtivo = cardEl;
  cardAtivo.classList.add('selecionado');
  cardAtivo.setAttribute('aria-selected', 'true');

  // Destaca e scrolla até o parágrafo no texto contínuo
  scrollParaParagrafo(numero);

  // Mobile: abre drawer
  if (window.innerWidth < 768) {
    painelConteudo.classList.add('aberto');
  }

  // Atualiza URL hash
  const novoHash = `#paragrafo-${numero}`;
  if (location.hash !== novoHash) {
    history.pushState(null, '', novoHash);
  }
}

function scrollParaParagrafo(numero) {
  const el = document.getElementById(`p-${numero}`);
  if (!el) return;

  // Remove ativo anterior
  limparParagrafoAtivo();

  // Marca novo como ativo
  el.classList.add('ativo');
  paragrafoAtivo = el;

  // Scroll suave
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Flash de destaque
  el.classList.remove('flash');
  void el.offsetWidth; // force reflow
  el.classList.add('flash');
}

// ── Renderização dos resultados (painel esquerdo) ────────────────────────────
function renderizarResultados(grupos, total, query) {
  listaResultados.innerHTML = '';

  if (total === 0) {
    contagemEl.textContent = '';
    semResultados.classList.remove('oculto');
    return;
  }

  semResultados.classList.add('oculto');
  contagemEl.textContent = total === 1
    ? '1 resultado'
    : `${total} resultado${total > 200 ? 's (exibindo 200)' : 's'}`;

  const frag = document.createDocumentFragment();

  for (const { parte, secoes } of grupos) {
    const grupoDiv = document.createElement('div');
    grupoDiv.className = 'grupo-parte';

    if (parte) {
      const tituloP = document.createElement('div');
      tituloP.className = 'grupo-parte-titulo';
      tituloP.textContent = parte;
      grupoDiv.appendChild(tituloP);
    }

    for (const { secao, capitulos } of secoes) {
      if (secao) {
        const tituloS = document.createElement('div');
        tituloS.className = 'grupo-secao-titulo';
        tituloS.textContent = secao;
        grupoDiv.appendChild(tituloS);
      }

      for (const { artigos } of capitulos) {
        for (const { paragrafos: ps } of artigos) {
          for (const p of ps) {
            grupoDiv.appendChild(criarCard(p, query));
          }
        }
      }
    }

    frag.appendChild(grupoDiv);
  }

  listaResultados.appendChild(frag);
}

function criarCard(p, query) {
  const card = document.createElement('div');
  card.className = 'resultado-card';
  card.setAttribute('role', 'option');
  card.setAttribute('aria-selected', 'false');
  card.setAttribute('tabindex', '0');
  card.dataset.num = p.numero;

  const labelContexto = [p.artigo, p.capitulo].filter(Boolean)[0] || '';

  card.innerHTML = `
    <div class="card-meta">
      <span class="card-num">\u00A7${p.numero}</span>
      ${labelContexto ? `<span class="card-artigo">${escapeHtml(labelContexto)}</span>` : ''}
    </div>
    <div class="card-trecho">${trecho(p.texto, query)}</div>
  `;

  return card;
}

// ── Utilitário: abrir parágrafo direto pelo hash (chamado pelo router.js) ────
export function ativarBuscaEAbrirParagrafo(numero) {
  const p = paragrafos.find(x => x.numero === numero);
  if (!p) return;

  ativarEstadoBusca();
  scrollParaParagrafo(numero);

  if (window.innerWidth < 768) {
    painelConteudo.classList.add('aberto');
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
