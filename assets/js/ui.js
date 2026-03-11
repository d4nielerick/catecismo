/**
 * ui.js
 * Controlador principal da interface.
 * Liga o motor de busca (search.js) aos dois painéis do DOM.
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

  // Verifica se há um hash na URL para abrir diretamente (router.js chama isso também)
  if (location.hash) {
    const num = parseInt(location.hash.replace('#paragrafo-', ''), 10);
    if (Number.isFinite(num)) ativarBuscaEAbrirParagrafo(num);
  }
})();

// ── Eventos ──────────────────────────────────────────────────────────────────
function registrarEventos() {
  // Debounce na digitação
  campoBusca.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executarBusca(campoBusca.value), 200);
    botaoLimpar.classList.toggle('oculto', campoBusca.value === '');
  });

  // ESC limpa e volta ao estado inicial
  campoBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') limparBusca();
  });

  // Botão ×
  botaoLimpar.addEventListener('click', limparBusca);

  // Fechar drawer mobile
  btnFecharConteudo.addEventListener('click', () => {
    painelConteudo.classList.remove('aberto');
  });

  // Temas rápidos
  temasRapidos.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tema]');
    if (!btn) return;
    campoBusca.value = btn.dataset.tema;
    campoBusca.focus();
    botaoLimpar.classList.remove('oculto');
    executarBusca(campoBusca.value);
  });

  // Delegação de cliques na lista de resultados
  listaResultados.addEventListener('click', (e) => {
    const card = e.target.closest('[data-num]');
    if (!card) return;
    selecionarParagrafo(parseInt(card.dataset.num, 10), card);
  });

  // Navegação por teclado na lista
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
      // Voltamos ao estado inicial se campo vazio
      voltarEstadoInicial();
    }
    return;
  }

  // Ativa o estado de busca (barra sobe ao topo, painéis aparecem)
  ativarEstadoBusca();

  const { total, paragrafos: encontrados } = buscar(queryAtual, paragrafos);
  const grupos = agrupar(encontrados);

  renderizarResultados(grupos, total, queryAtual);
}

// ── Estados da UI ────────────────────────────────────────────────────────────
function ativarEstadoBusca() {
  if (app.classList.contains('estado-busca')) return;

  app.classList.remove('estado-inicial');
  app.classList.add('estado-busca');

  // Move o input + botão limpar para o wrapper do topo
  buscarTopoWrap.appendChild(campoBusca);
  buscarTopoWrap.appendChild(botaoLimpar);
  campoBusca.focus();
}

function voltarEstadoInicial() {
  app.classList.remove('estado-busca');
  app.classList.add('estado-inicial');

  // Devolve o input ao hero
  const heroWrapper = hero.querySelector('.campo-busca-container');
  heroWrapper.appendChild(campoBusca);
  heroWrapper.appendChild(botaoLimpar);

  listaResultados.innerHTML = '';
  contagemEl.textContent = '';
  semResultados.classList.add('oculto');
  painelConteudo.classList.remove('aberto');
  renderizarPlaceholderConteudo();
  cardAtivo = null;
}

function limparBusca() {
  campoBusca.value = '';
  botaoLimpar.classList.add('oculto');
  voltarEstadoInicial();
  campoBusca.focus();
}

// ── Renderização dos resultados ───────────────────────────────────────────────
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
      <span class="card-num">§${p.numero}</span>
      ${labelContexto ? `<span class="card-artigo">${escapeHtml(labelContexto)}</span>` : ''}
    </div>
    <div class="card-trecho">${trecho(p.texto, query)}</div>
  `;

  return card;
}

// ── Renderização do parágrafo selecionado ────────────────────────────────────
function selecionarParagrafo(numero, cardEl) {
  const p = buscarPorNumero(numero) ?? paragrafos.find(x => x.numero === numero);
  if (!p) return;

  // Destaca o card ativo
  if (cardAtivo) {
    cardAtivo.classList.remove('selecionado');
    cardAtivo.setAttribute('aria-selected', 'false');
  }
  cardAtivo = cardEl;
  cardAtivo.classList.add('selecionado');
  cardAtivo.setAttribute('aria-selected', 'true');

  renderizarConteudo(p);

  // Mobile: abre drawer
  if (window.innerWidth < 768) {
    painelConteudo.classList.add('aberto');
  }

  // Atualiza URL hash sem recarregar (router.js também escuta isso)
  const novoHash = `#paragrafo-${numero}`;
  if (location.hash !== novoHash) {
    history.pushState(null, '', novoHash);
  }
}

function renderizarConteudo(p) {
  const breadcrumb = [p.parte, p.secao, p.capitulo]
    .filter(Boolean)
    .map(s => `<span>${escapeHtml(s)}</span>`)
    .join('');

  painelConteudo.innerHTML = `
    <button id="btn-fechar-conteudo" type="button" aria-label="Voltar aos resultados">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      Resultados
    </button>

    <div class="conteudo-meta">
      ${breadcrumb ? `<div class="conteudo-breadcrumb">${breadcrumb}</div>` : ''}
      <span class="conteudo-num">§${p.numero}</span>
      ${p.artigo ? `<div class="conteudo-artigo">${escapeHtml(p.artigo)}</div>` : ''}
    </div>

    <p class="conteudo-texto">${destacar(p.texto, queryAtual)}</p>

    <div class="conteudo-toolbar">
      <button class="btn-toolbar" id="btn-copiar" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copiar link
      </button>
      <div class="conteudo-nav">
        <button class="btn-toolbar" id="btn-anterior" type="button" aria-label="Parágrafo anterior" ${p.numero <= 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Anterior
        </button>
        <button class="btn-toolbar" id="btn-proximo" type="button" aria-label="Próximo parágrafo">
          Próximo
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Rebind botões (innerHTML recriou os elementos)
  document.getElementById('btn-fechar-conteudo')
    .addEventListener('click', () => painelConteudo.classList.remove('aberto'));

  document.getElementById('btn-copiar')
    .addEventListener('click', () => copiarLink(p.numero));

  document.getElementById('btn-anterior')
    .addEventListener('click', () => navegarParagrafo(p.numero - 1));

  document.getElementById('btn-proximo')
    .addEventListener('click', () => navegarParagrafo(p.numero + 1));
}

function renderizarPlaceholderConteudo() {
  painelConteudo.innerHTML = `
    <div class="placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
      </svg>
      <p>Selecione um parágrafo para ler</p>
    </div>
  `;
}

// ── Copiar link ───────────────────────────────────────────────────────────────
async function copiarLink(numero) {
  const url = `${location.origin}${location.pathname}#paragrafo-${numero}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Fallback para browsers sem permissão
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  const btn = document.getElementById('btn-copiar');
  if (!btn) return;
  btn.classList.add('copiado');
  btn.textContent = '✓ Copiado!';
  setTimeout(() => {
    btn.classList.remove('copiado');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg>
      Copiar link`;
  }, 2000);
}

// ── Navegação parágrafo anterior / próximo ────────────────────────────────────
function navegarParagrafo(numero) {
  const p = paragrafos.find(x => x.numero === numero);
  if (!p) return;

  // Tenta encontrar o card na lista se existir; senão renderiza direto
  const card = listaResultados.querySelector(`[data-num="${numero}"]`);
  if (card) {
    card.scrollIntoView({ block: 'nearest' });
    selecionarParagrafo(numero, card);
  } else {
    renderizarConteudo(p);
    history.pushState(null, '', `#paragrafo-${numero}`);
  }
}

// ── Utilitário: abrir parágrafo direto pelo hash (chamado pelo router.js) ────
export function ativarBuscaEAbrirParagrafo(numero) {
  const p = paragrafos.find(x => x.numero === numero);
  if (!p) return;

  ativarEstadoBusca();
  renderizarConteudo(p);

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
