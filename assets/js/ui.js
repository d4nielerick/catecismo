/**
 * ui.js
 * Controlador principal da interface.
 * Liga o motor de busca (search.js) aos dois painéis do DOM.
 *
 * Painel direito: renderiza todo o texto do Catecismo de forma contínua.
 * Ao clicar num resultado, faz scroll até o parágrafo correspondente.
 */

import { carregarDados, buscarPorNumero, carregarNotas, notasDoParagrafo } from './data.js';
import { buscar, agrupar, destacar, trecho } from './search.js';
import { adicionarEAbrir, contemNumero, onMudanca } from './coletor.js';
import { iniciarLeitor, abrirLeitor } from './leitor.js';
import { buscarVersiculo, mostrarCard, mostrarCardMobile } from './biblia.js';
import { gerarVariantes } from './variantes.js';

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
const btnResumir      = document.getElementById('btn-resumir');
const aiCard          = document.getElementById('ai-resumo-card');
const aiCorpo         = document.getElementById('ai-resumo-corpo');
const aiFechar        = document.getElementById('ai-resumo-fechar');
const temasRapidos    = document.getElementById('temas-rapidos');
const navAnterior     = document.getElementById('nav-anterior');
const navProximo      = document.getElementById('nav-proximo');

// Barra de nav mobile
const mobileNavBar        = document.getElementById('mobile-nav-bar');
const mobileBtnResultados = document.getElementById('mobile-btn-resultados');
const mobileBtnResumir    = document.getElementById('mobile-btn-resumir');
const mobileNavInfo       = document.getElementById('mobile-nav-info');
const mobileBtnAnterior   = document.getElementById('mobile-btn-anterior');
const mobileBtnProximo    = document.getElementById('mobile-btn-proximo');

// ── Estado ───────────────────────────────────────────────────────────────────
let paragrafos        = [];   // todos os parágrafos em memória
let queryAtual        = '';   // último termo buscado
let debounceTimer     = null;
let cardAtivo         = null; // elemento DOM do card selecionado
let paragrafoAtivo    = null; // elemento DOM do parágrafo ativo no texto contínuo
let resultadosAtuais  = [];   // parágrafos do resultado atual (para nav prev/next)
let indiceAtivo       = -1;   // índice do parágrafo ativo em resultadosAtuais
let autoSelectTimer   = null; // timer para seleção automática do 1º resultado
let _sugestaoEl       = null; // elemento de sugestão de variante

// ── Botões rovings (migram para o parágrafo ativo) ───────────────────────────

// Copiar link
const _btnRoving = document.createElement('button');
_btnRoving.className = 'para-copiar-btn';
_btnRoving.setAttribute('aria-label', 'Copiar link deste parágrafo');
_btnRoving.setAttribute('type', 'button');
_btnRoving.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
_btnRoving.addEventListener('click', (e) => { e.stopPropagation(); copiarLink(); });
let _rovingTimer = null;

// Colecionar trecho
const _btnColetar = document.createElement('button');
_btnColetar.className = 'para-coletar-btn';
_btnColetar.setAttribute('type', 'button');
_btnColetar.setAttribute('aria-label', 'Adicionar ao coletor');
_btnColetar.textContent = '+';
_btnColetar.addEventListener('click', (e) => {
  e.stopPropagation();
  const num = paragrafoAtivo ? parseInt(paragrafoAtivo.id.replace('p-', ''), 10) : null;
  if (!num) return;
  const p = paragrafos.find(x => x.numero === num);
  if (p) adicionarEAbrir(p);
  atualizarBtnColetar();
});

// Callback: atualiza visual do botão quando o coletor muda (ex: item removido)
onMudanca(atualizarBtnColetar);

function atualizarBtnColetar() {
  if (!paragrafoAtivo) return;
  const num = parseInt(paragrafoAtivo.id.replace('p-', ''), 10);
  _btnColetar.classList.toggle('coletado', contemNumero(num));
  _btnColetar.textContent = contemNumero(num) ? '✓' : '+';
}
let textoRenderizado = false; // se o texto contínuo já foi montado

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    [paragrafos] = await Promise.all([
      carregarDados(),
      carregarNotas(),
    ]);
  } catch (err) {
    painelConteudo.innerHTML = `
      <div class="placeholder">
        <p>Erro ao carregar os dados: ${err.message}</p>
      </div>`;
    return;
  }

  iniciarLeitor(paragrafos);
  registrarEventos();
  iniciarTooltips();

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
    clearTimeout(autoSelectTimer);
    debounceTimer = setTimeout(() => executarBusca(campoBusca.value), 200);
    botaoLimpar.classList.toggle('oculto', campoBusca.value === '');
  });

  campoBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') limparBusca();
  });

  botaoLimpar.addEventListener('click', limparBusca);

  btnFecharConteudo.addEventListener('click', () => {
    painelConteudo.classList.remove('aberto');
    fecharMobileNavBar();
  });

  mobileBtnResultados.addEventListener('click', () => {
    painelConteudo.classList.remove('aberto');
    fecharMobileNavBar();
  });

  mobileBtnAnterior.addEventListener('click', () => navegarPara(indiceAtivo - 1));
  mobileBtnProximo.addEventListener('click',  () => navegarPara(indiceAtivo + 1));
  mobileBtnResumir.addEventListener('click', () => {
    // Fecha o drawer e aciona o resumo no painel de resultados
    painelConteudo.classList.remove('aberto');
    fecharMobileNavBar();
    acionarResumoIA();
  });

  btnResumir.addEventListener('click', acionarResumoIA);
  aiFechar.addEventListener('click', () => {
    aiCard.classList.add('oculto');
    btnResumir.classList.remove('oculto');
  });


  temasRapidos.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tema]');
    if (!btn) return;
    campoBusca.value = btn.dataset.tema;
    if (window.innerWidth >= 768) campoBusca.focus();
    botaoLimpar.classList.remove('oculto');
    clearTimeout(autoSelectTimer);
    executarBusca(campoBusca.value);
    // Tema clicado = intenção clara — seleciona rápido
    autoSelectTimer = setTimeout(() => selecionarPrimeiro(), 300);
  });

  listaResultados.addEventListener('click', (e) => {
    const card = e.target.closest('[data-num]');
    if (!card) return;
    clearTimeout(autoSelectTimer);
    selecionarParagrafo(parseInt(card.dataset.num, 10), card);
  });

  listaResultados.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = document.activeElement.closest('[data-num]');
      if (card) selecionarParagrafo(parseInt(card.dataset.num, 10), card);
    }
  });

  navAnterior.addEventListener('click', () => navegarPara(indiceAtivo - 1));
  navProximo.addEventListener('click',  () => navegarPara(indiceAtivo + 1));

  document.getElementById('btn-ler-hero')
    ?.addEventListener('click', () => abrirLeitor(0));
  document.getElementById('btn-ler-header')
    ?.addEventListener('click', () => abrirLeitor(0));

  // Contribuição
  document.getElementById('btn-contribuir-hero')
    ?.addEventListener('click', abrirModalContribuicao);
  document.getElementById('btn-contribuir-header')
    ?.addEventListener('click', abrirModalContribuicao);
  document.getElementById('modal-contribuicao-fechar')
    ?.addEventListener('click', fecharModalContribuicao);
  document.getElementById('modal-contribuicao-overlay')
    ?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-contribuicao-overlay') fecharModalContribuicao();
    });
  document.getElementById('btn-copiar-pix')
    ?.addEventListener('click', copiarPix);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-contribuicao-overlay').classList.contains('oculto')) {
      fecharModalContribuicao();
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

  // Busca direta por número de parágrafo: "42" ou "§42"
  const numMatch = queryAtual.match(/^§?(\d{1,4})$/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const p = paragrafos.find(x => x.numero === num);
    if (p) {
      ativarEstadoBusca();
      resultadosAtuais = [p];
      indiceAtivo = -1;
      renderizarResultados(agrupar([p]), 1, '');
      atualizarHighlightsTexto('', [p]);
      clearTimeout(autoSelectTimer);
      autoSelectTimer = setTimeout(() => {
        const card = listaResultados.querySelector(`[data-num="${num}"]`);
        if (card) selecionarParagrafo(num, card);
      }, 100);
      return;
    }
  }

  ativarEstadoBusca();

  const { total, paragrafos: encontrados } = buscar(queryAtual, paragrafos);
  const grupos = agrupar(encontrados);

  resultadosAtuais = encontrados;
  indiceAtivo = -1;

  renderizarResultados(grupos, total, queryAtual);
  atualizarHighlightsTexto(queryAtual, encontrados);
  mostrarSugestao(queryAtual, total);

  // Seleciona o 1º resultado automaticamente após 1s de inatividade
  clearTimeout(autoSelectTimer);
  if (encontrados.length > 0) {
    autoSelectTimer = setTimeout(() => selecionarPrimeiro(), 1000);
  }
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
  btnResumir.classList.add('oculto');
  aiCard.classList.add('oculto');
  painelConteudo.classList.remove('aberto');
  fecharMobileNavBar();

  // Limpa highlights do texto contínuo
  limparHighlights();
  limparParagrafoAtivo();

  cardAtivo = null;
  resultadosAtuais = [];
  indiceAtivo = -1;
  ocultarNav();
}

function getSugestaoEl() {
  if (_sugestaoEl) return _sugestaoEl;
  _sugestaoEl = document.createElement('div');
  _sugestaoEl.className = 'sugestao-variante oculto';
  document.getElementById('resultados-header').insertAdjacentElement('afterend', _sugestaoEl);
  return _sugestaoEl;
}

function mostrarSugestao(query, nAtual) {
  const el = getSugestaoEl();
  const variantes = gerarVariantes(query);
  if (!variantes.length) { el.className = 'sugestao-variante oculto'; return; }

  const THRESHOLD = 5;
  let melhor = null, melhorN = 0;
  for (const v of variantes) {
    const { total } = buscar(v, paragrafos);
    if (total > melhorN) { melhorN = total; melhor = v; }
  }

  if (!melhor || melhorN === 0 || (nAtual >= THRESHOLD && melhorN <= nAtual)) {
    el.className = 'sugestao-variante oculto'; return;
  }

  const prefixo = nAtual === 0 ? 'Nenhum resultado. Tentar:' : 'Ver também:';
  el.className = 'sugestao-variante';
  el.innerHTML = `${prefixo} <button class="sugestao-btn" type="button">${melhor} <span class="sugestao-count">(${melhorN})</span></button>`;
  el.querySelector('.sugestao-btn').addEventListener('click', () => {
    campoBusca.value = melhor;
    botaoLimpar.classList.remove('oculto');
    executarBusca(melhor);
  });
}

function limparBusca() {
  campoBusca.value = '';
  botaoLimpar.classList.add('oculto');
  if (_sugestaoEl) _sugestaoEl.className = 'sugestao-variante oculto';
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
    renderizarTextoComNotas(textoSpan, p.texto, p.numero);

    div.appendChild(numSpan);
    div.appendChild(textoSpan);
    container.appendChild(div);
  }

  // Limpa placeholder e insere texto contínuo; preserva o botão fechar (mobile)
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
      // Durante a busca: highlight simples (notas ficam como texto plano)
      textoEl.innerHTML = destacar(p.texto, query);
    }
  }
}

function limparHighlights() {
  const marcados = painelConteudo.querySelectorAll('.tc-paragrafo-texto');
  for (const el of marcados) {
    if (el.querySelector('mark')) {
      const pDiv = el.closest('.tc-paragrafo');
      if (pDiv) {
        const num = parseInt(pDiv.id.replace('p-', ''), 10);
        const p = buscarPorNumero(num);
        if (p) {
          el.innerHTML = '';
          renderizarTextoComNotas(el, p.texto, num);
        }
      }
    }
  }
}

function limparParagrafoAtivo() {
  if (paragrafoAtivo) {
    paragrafoAtivo.classList.remove('ativo');
    paragrafoAtivo = null;
  }
  if (_btnRoving.parentNode)  _btnRoving.parentNode.removeChild(_btnRoving);
  if (_btnColetar.parentNode) _btnColetar.parentNode.removeChild(_btnColetar);
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

  // Mobile: abre drawer + barra de nav
  if (window.innerWidth < 768) {
    painelConteudo.classList.add('aberto');
    abrirMobileNavBar(numero);
  }

  // Atualiza URL hash
  const novoHash = `#paragrafo-${numero}`;
  if (location.hash !== novoHash) {
    history.pushState(null, '', novoHash);
  }

  // Atualiza índice e setas de navegação
  indiceAtivo = resultadosAtuais.findIndex(p => p.numero === numero);
  atualizarNav();
}

function scrollParaParagrafo(numero) {
  const el = document.getElementById(`p-${numero}`);
  if (!el) return;

  // Remove ativo anterior
  limparParagrafoAtivo();

  // Marca novo como ativo
  el.classList.add('ativo');
  paragrafoAtivo = el;

  // Scroll instantâneo — o flash é o feedback visual de "você está aqui"
  const panelRect = painelConteudo.getBoundingClientRect();
  const elRect    = el.getBoundingClientRect();
  const target    = painelConteudo.scrollTop + elRect.top - panelRect.top
                    - (painelConteudo.clientHeight - el.offsetHeight) / 2;
  painelConteudo.scrollTop = Math.max(0, target);

  // Flash de destaque
  el.classList.remove('flash');
  void el.offsetWidth; // force reflow
  el.classList.add('flash');

  // Migra os botões rovings para este parágrafo
  _btnRoving.classList.remove('copiado');
  el.appendChild(_btnRoving);
  el.appendChild(_btnColetar);
  atualizarBtnColetar();
}

// ── Renderização dos resultados (painel esquerdo) ────────────────────────────
function renderizarResultados(grupos, total, query) {
  listaResultados.innerHTML = '';

  if (total === 0) {
    contagemEl.textContent = '';
    semResultados.classList.remove('oculto');
    btnResumir.classList.add('oculto');
    aiCard.classList.add('oculto');
    return;
  }

  semResultados.classList.add('oculto');
  contagemEl.textContent = total === 1
    ? '1 resultado'
    : `${total} resultado${total > 200 ? 's (exibindo 200)' : 's'}`;
  btnResumir.classList.remove('oculto');
  aiCard.classList.add('oculto');

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
  const salvo = contemNumero(p.numero);

  card.innerHTML = `
    <div class="card-meta">
      <span class="card-num">\u00A7${p.numero}</span>
      ${labelContexto ? `<span class="card-artigo">${escapeHtml(labelContexto)}</span>` : ''}
      <button class="card-save-btn${salvo ? ' salvo' : ''}" type="button" aria-label="Salvar parágrafo ${p.numero}">
        ${salvo
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 6L9 17l-5-5"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`}
      </button>
    </div>
    <div class="card-trecho">${trecho(p.texto, query)}</div>
  `;

  card.querySelector('.card-save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    adicionarEAbrir(p);
    const btn = e.currentTarget;
    btn.classList.add('salvo');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 6L9 17l-5-5"/></svg>`;
  });

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

// ── Renderização de texto com notas de rodapé ────────────────────────────────
/**
 * Preenche `el` com o texto do parágrafo, substituindo (n) por <sup> interativo
 * quando a nota existir em notas.json.
 */
function renderizarTextoComNotas(el, texto, numeroParagrafo) {
  const notas = notasDoParagrafo(numeroParagrafo);
  if (!notas) {
    el.textContent = texto;
    return;
  }

  // Exclui números de 4 dígitos (ex: anos como 1974, 1968) — não são notas de rodapé
  const partes = texto.split(/(\((?!\d{4}\))\d+\))/);
  for (const parte of partes) {
    const m = parte.match(/^\((\d+)\)$/);
    if (m && notas[m[1]]) {
      const ref      = m[1];
      const noteText = notas[ref];

      const sup = document.createElement('sup');
      sup.className = 'ref-nota';
      sup.textContent = ref;
      sup.setAttribute('aria-label', `Nota de rodapé ${ref}`);

      const tooltip = document.createElement('span');
      tooltip.className = 'nota-tooltip';

      const spanNota = document.createElement('span');
      spanNota.className = 'nota-tooltip-nota';
      spanNota.textContent = noteText;

      const spanVerso = document.createElement('span');
      spanVerso.className = 'nota-tooltip-verso';

      tooltip.appendChild(spanNota);
      tooltip.appendChild(spanVerso);
      sup.appendChild(tooltip);

      // Carrega versículo ao primeiro hover (desktop)
      let _fetched = false;
      let _verse   = null;
      sup.addEventListener('mouseenter', async () => {
        if (_fetched) return;
        _fetched = true;
        _verse = await buscarVersiculo(noteText);
        if (_verse) spanVerso.textContent = `${_verse.referencia}: "${_verse.texto}"`;
      });

      // Clique: mobile → card com nota + verso; desktop → card só com verso
      sup.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.innerWidth < 768) {
          if (!_fetched) {
            _fetched = true;
            _verse = await buscarVersiculo(noteText);
            if (_verse) spanVerso.textContent = `${_verse.referencia}: "${_verse.texto}"`;
          }
          mostrarCardMobile(ref, noteText, _verse);
        } else if (_verse) {
          mostrarCard(_verse.referencia, _verse.texto);
        }
      });

      el.appendChild(sup);
    } else {
      el.appendChild(document.createTextNode(parte));
    }
  }
}

// ── Seleção automática ────────────────────────────────────────────────────────
function selecionarPrimeiro() {
  if (!resultadosAtuais.length) return;
  if (window.innerWidth < 768) return;
  const primeiro = resultadosAtuais[0];
  const card = listaResultados.querySelector(`[data-num="${primeiro.numero}"]`);
  if (card) selecionarParagrafo(primeiro.numero, card);
}

// ── Navegação prev/next ───────────────────────────────────────────────────────
function navegarPara(novoIndice) {
  if (novoIndice < 0 || novoIndice >= resultadosAtuais.length) return;
  const p = resultadosAtuais[novoIndice];

  // Encontra o card na lista e seleciona
  const card = listaResultados.querySelector(`[data-num="${p.numero}"]`);
  if (card) {
    card.scrollIntoView({ block: 'nearest' });
    selecionarParagrafo(p.numero, card);
  } else {
    // Card fora dos 200 renderizados — apenas scrolla o texto
    scrollParaParagrafo(p.numero);
    indiceAtivo = novoIndice;
    atualizarNav();
  }
}

function atualizarNav() {
  if (indiceAtivo === -1 || resultadosAtuais.length <= 1) {
    ocultarNav();
    return;
  }
  navAnterior.classList.remove('oculto');
  navProximo.classList.remove('oculto');
  navAnterior.disabled = indiceAtivo === 0;
  navProximo.disabled  = indiceAtivo === resultadosAtuais.length - 1;

  // Sincroniza setas da barra mobile
  mobileBtnAnterior.disabled = indiceAtivo === 0;
  mobileBtnProximo.disabled  = indiceAtivo === resultadosAtuais.length - 1;
  // Atualiza texto de posição
  const num = resultadosAtuais[indiceAtivo]?.numero;
  if (num) mobileNavInfo.textContent = `§${num}  ·  ${indiceAtivo + 1}/${resultadosAtuais.length}`;
}

function ocultarNav() {
  navAnterior.classList.add('oculto');
  navProximo.classList.add('oculto');
  mobileBtnAnterior.disabled = true;
  mobileBtnProximo.disabled  = true;
}

// ── Copiar link ───────────────────────────────────────────────────────────────
let _copiarTimer = null;

function copiarLink() {
  navigator.clipboard.writeText(location.href).then(() => {
    _btnRoving.classList.add('copiado');
    clearTimeout(_copiarTimer);
    _copiarTimer = setTimeout(() => { _btnRoving.classList.remove('copiado'); }, 2000);
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Contribuição ──────────────────────────────────────────────────────────────
function abrirModalContribuicao() {
  document.getElementById('modal-contribuicao-overlay')?.classList.remove('oculto');
}

function fecharModalContribuicao() {
  document.getElementById('modal-contribuicao-overlay')?.classList.add('oculto');
}

function copiarPix() {
  const chave = document.getElementById('pix-chave')?.textContent?.trim();
  if (!chave) return;
  const btn = document.getElementById('btn-copiar-pix');
  navigator.clipboard.writeText(chave).then(() => {
    btn.textContent = 'Copiado ✓';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}

// ── Barra de nav mobile ───────────────────────────────────────────────────────
function abrirMobileNavBar(numeroParagrafo) {
  mobileNavBar.classList.add('visivel');
  mobileNavBar.setAttribute('aria-hidden', 'false');
  mobileNavInfo.textContent = `§${numeroParagrafo}`;
}

function fecharMobileNavBar() {
  mobileNavBar.classList.remove('visivel');
  mobileNavBar.setAttribute('aria-hidden', 'true');
}

// ── Resumo com IA ─────────────────────────────────────────────────────────────
async function acionarResumoIA() {
  if (!resultadosAtuais.length) return;

  // Mostra card com skeleton
  btnResumir.classList.add('oculto');
  aiCard.classList.remove('oculto');
  aiCorpo.innerHTML = `
    <div class="ai-skeleton">
      <div class="ai-skeleton-linha"></div>
      <div class="ai-skeleton-linha"></div>
      <div class="ai-skeleton-linha"></div>
    </div>`;

  try {
    const resp = await fetch('/api/resumo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryAtual, paragrafos: resultadosAtuais }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.resumo) {
      throw new Error(data.error || 'Erro desconhecido');
    }

    aiCorpo.innerHTML = '';
    renderizarResumoIA(data.resumo);
  } catch (err) {
    aiCorpo.innerHTML = `<p style="color:var(--color-muted);font-size:0.85rem">Não foi possível gerar o resumo. Tente novamente.</p>`;
    console.error('[AI resumo]', err);
  }
}

// Converte o texto do resumo em HTML, tornando §N clicáveis
function renderizarResumoIA(texto) {
  // Quebra em parágrafos por linha em branco ou ponto final de parágrafo
  const linhas = texto.split(/\n+/).filter(l => l.trim());

  for (const linha of linhas) {
    const p = document.createElement('p');

    // Detecta "Parágrafos: §X, §Y" — última linha com citações
    const isCitacoes = /parágrafos?:/i.test(linha);
    if (isCitacoes) p.style.cssText = 'font-family:var(--font-sans);font-size:0.78rem;margin-top:0.5rem;';

    // Substitui §NNN por botões clicáveis
    const parts = linha.split(/(§\d+)/g);
    for (const part of parts) {
      const m = part.match(/^§(\d+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        const btn = document.createElement('button');
        btn.className = 'ai-citacao';
        btn.type = 'button';
        btn.textContent = `§${num}`;
        btn.addEventListener('click', () => {
          const card = listaResultados.querySelector(`[data-num="${num}"]`);
          if (card) {
            card.scrollIntoView({ block: 'nearest' });
            selecionarParagrafo(num, card);
          }
        });
        p.appendChild(btn);
      } else {
        p.appendChild(document.createTextNode(part));
      }
    }
    aiCorpo.appendChild(p);
  }
}

// ── Posicionamento de tooltips ────────────────────────────────────────────────
// Usa position:fixed para escapar de pais com overflow:auto e clamp ao viewport.
function iniciarTooltips() {
  const MARGIN = 10;
  const GAP    = 8;

  document.addEventListener('mouseenter', (e) => {
    const sup = e.target.closest?.('.ref-nota');
    if (!sup) return;
    const tooltip = sup.querySelector('.nota-tooltip');
    if (!tooltip) return;

    const supRect = sup.getBoundingClientRect();
    const maxW    = Math.min(320, window.innerWidth - MARGIN * 2);

    // Horizontal: centralizado no sup, clamped ao viewport
    let left = supRect.left + supRect.width / 2 - maxW / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - maxW - MARGIN));

    // Vertical: acima por padrão; abaixo se não houver espaço
    const spaceAbove = supRect.top - GAP;
    const showAbove  = spaceAbove > 60; // altura mínima estimada

    tooltip.classList.toggle('tooltip-abaixo', !showAbove);
    Object.assign(tooltip.style, {
      position:  'fixed',
      left:      left + 'px',
      maxWidth:  maxW + 'px',
      width:     maxW + 'px',
      transform: 'none',
      zIndex:    '9000',
      ...(showAbove
        ? { bottom: (window.innerHeight - supRect.top + GAP) + 'px', top: 'auto' }
        : { top:    (supRect.bottom + GAP) + 'px',                   bottom: 'auto' }),
    });
  }, true);

  document.addEventListener('mouseleave', (e) => {
    const sup = e.target.closest?.('.ref-nota');
    if (!sup) return;
    const tooltip = sup.querySelector('.nota-tooltip');
    if (!tooltip) return;
    tooltip.style.cssText = '';
    tooltip.classList.remove('tooltip-abaixo');
  }, true);
}
