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
import { APP_VERSION } from './version.js';

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

// ── Índice Analítico ─────────────────────────────────────────────────────────
const MAX_TEMAS_VISIVEIS = 2;
let indiceAnalitico = null;
let subtemaAtivoEl  = null;

async function carregarIndiceAnalitico() {
  if (indiceAnalitico) return indiceAnalitico;
  try {
    const r = await fetch('data/indice_analitico.json');
    indiceAnalitico = await r.json();
  } catch {
    indiceAnalitico = [];
  }
  return indiceAnalitico;
}

function normalizarSimples(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function contemTermo(texto, termo) {
  // Verdadeiro só se o termo bate no início de alguma palavra do texto
  const t = normalizarSimples(texto);
  const q = normalizarSimples(termo);
  return t.split(/[\s\-\/]+/).some(palavra => palavra.startsWith(q));
}

function limparIndiceAnalitico() {
  const bloco = listaResultados.querySelector('.indice-analitico-bloco');
  if (bloco) bloco.remove();
  subtemaAtivoEl = null;
}

async function renderizarIndiceAnalitico(query) {
  limparIndiceAnalitico();
  const dados = await carregarIndiceAnalitico();

  const matches = [];
  const subtemaVistos = new Set();
  for (const tema of dados) {
    const temaMatch = contemTermo(tema.nome, query);
    const subtemasFiltrados = tema.subtemas.filter(s =>
      contemTermo(s.nome, query) && !subtemaVistos.has(s.nome)
    );
    const subtemasExibir = temaMatch
      ? tema.subtemas.filter(s => !subtemaVistos.has(s.nome))
      : subtemasFiltrados;
    const comParagrafos = subtemasExibir.filter(s => s.paragrafos && s.paragrafos.length > 0);
    if (comParagrafos.length === 0) continue;
    comParagrafos.forEach(s => subtemaVistos.add(s.nome));
    matches.push({ tema, subtemas: comParagrafos });
  }

  if (matches.length === 0) return;

  const bloco = document.createElement('div');
  bloco.className = 'indice-analitico-bloco';

  const titulo = document.createElement('div');
  titulo.className = 'indice-analitico-titulo';
  const tituloTexto = document.createElement('span');
  tituloTexto.textContent = 'Índice analítico';
  titulo.appendChild(tituloTexto);
  bloco.appendChild(titulo);

  const temasWrap = document.createElement('div');
  temasWrap.className = 'indice-analitico-temas-wrap';
  bloco.appendChild(temasWrap);

  const temasContainer = document.createElement('div');
  temasContainer.className = 'indice-analitico-temas';
  temasWrap.appendChild(temasContainer);

  function renderTemas(limite) {
    temasContainer.innerHTML = '';
    const visíveis = matches.slice(0, limite);
    for (const { tema, subtemas } of visíveis) {
      const temaEl = document.createElement('div');
      temaEl.className = 'indice-analitico-tema';

      const temaHeader = document.createElement('button');
      temaHeader.className = 'indice-analitico-tema-header';
      temaHeader.innerHTML = `<span class="indice-analitico-tema-nome">${tema.nome}</span><svg class="indice-tema-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>`;
      const subtemasWrap = document.createElement('div');
      subtemasWrap.className = 'indice-analitico-subtemas-wrap';
      temaHeader.addEventListener('click', () => {
        const collapsed = temaEl.classList.toggle('collapsed');
        temaHeader.querySelector('.indice-tema-chevron').style.transform = collapsed ? 'rotate(-90deg)' : '';
      });
      temaEl.appendChild(temaHeader);
      temaEl.appendChild(subtemasWrap);

      for (const sub of subtemas) {
        const subEl = document.createElement('button');
        subEl.className = 'indice-analitico-subtema';
        subEl.title = `§§ ${sub.paragrafos.join(', ')}`;

        const nomeSpan = document.createElement('span');
        nomeSpan.textContent = sub.nome;
        subEl.appendChild(nomeSpan);

        const count = paragrafos.filter(p => sub.paragrafos.includes(p.numero)).length;
        if (count > 0) {
          const countSpan = document.createElement('span');
          countSpan.className = 'indice-subtema-count';
          countSpan.textContent = count;
          subEl.appendChild(countSpan);
        }

        const xBtn = document.createElement('span');
        xBtn.className = 'indice-subtema-x';
        xBtn.innerHTML = '&times;';
        xBtn.title = 'Voltar à busca por palavra';
        xBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          subEl.classList.remove('ativo');
          subtemaAtivoEl = null;
          executarBusca(queryAtual);
        });
        subEl.appendChild(xBtn);

        subEl.addEventListener('click', () => {
          if (subtemaAtivoEl) subtemaAtivoEl.classList.remove('ativo');
          subEl.classList.add('ativo');
          subtemaAtivoEl = subEl;
          navegarParaSubtema(sub.paragrafos);
        });
        subtemasWrap.appendChild(subEl);
      }
      temasContainer.appendChild(temaEl);
    }

    // Botão ver mais (abaixo) / ver menos (no título)
    const btnAnterior = bloco.querySelector('.indice-analitico-ver-mais-wrap');
    if (btnAnterior) btnAnterior.remove();
    const verMenosAnterior = titulo.querySelector('.indice-analitico-ver-menos');
    if (verMenosAnterior) verMenosAnterior.remove();

    if (matches.length > MAX_TEMAS_VISIVEIS) {
      const collapsed = limite < matches.length;

      if (collapsed) {
        // "Ver mais" com gradiente, abaixo dos temas
        const wrap = document.createElement('div');
        wrap.className = 'indice-analitico-ver-mais-wrap collapsed';
        const btn = document.createElement('button');
        btn.className = 'indice-analitico-ver-mais';
        btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg> Ver mais ${matches.length - MAX_TEMAS_VISIVEIS} temas`;
        btn.addEventListener('click', () => renderTemas(matches.length));
        wrap.appendChild(btn);
        bloco.appendChild(wrap);
      } else {
        // "Ver menos" no título
        const btn = document.createElement('button');
        btn.className = 'indice-analitico-ver-menos';
        btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 6 12 10"/></svg> Ver menos`;
        btn.addEventListener('click', () => renderTemas(MAX_TEMAS_VISIVEIS));
        titulo.appendChild(btn);
      }
    }
  }

  renderTemas(MAX_TEMAS_VISIVEIS);
  listaResultados.prepend(bloco);
}

function navegarParaSubtema(numeros) {
  const encontrados = paragrafos.filter(p => numeros.includes(p.numero));
  if (encontrados.length === 0) return;
  resultadosAtuais = encontrados;
  indiceAtivo = -1;
  // Salva o bloco antes de renderizarResultados limpar o innerHTML
  const bloco = listaResultados.querySelector('.indice-analitico-bloco');
  renderizarResultados(agrupar(encontrados), encontrados.length, '');
  if (bloco) listaResultados.prepend(bloco);
  atualizarHighlightsTexto('', encontrados);
  clearTimeout(autoSelectTimer);
  autoSelectTimer = setTimeout(() => {
    const card = listaResultados.querySelector(`[data-num="${encontrados[0].numero}"]`);
    if (card) selecionarParagrafo(encontrados[0].numero, card);
  }, 100);
}

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
const _cacheResumoIA  = new Map(); // cache de resumos IA por query (sessão)
const _paragrafosComHighlight = new Set(); // elementos .tc-paragrafo-texto com <mark> ativo

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

  // Versão discreta no rodapé do hero
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

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
    const delay = window.matchMedia('(pointer: coarse)').matches ? 500 : 200;
    debounceTimer = setTimeout(() => executarBusca(campoBusca.value), delay);
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
  document.getElementById('btn-toggle-qr')
    ?.addEventListener('click', toggleQR);
  document.querySelector('.pix-valores')
    ?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pix-valor-btn');
      if (btn) selecionarValorPix(btn.dataset.valor);
    });
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
  renderizarIndiceAnalitico(queryAtual);

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
  limparIndiceAnalitico();
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
      _paragrafosComHighlight.add(textoEl);
    }
  }
}

function limparHighlights() {
  for (const el of _paragrafosComHighlight) {
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
  _paragrafosComHighlight.clear();
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
const PIX_QR = {
  '10':    '/assets/img/pix-qr-10.webp',
  '20':    '/assets/img/pix-qr-20.webp',
  '50':    '/assets/img/pix-qr-50.webp',
  'livre': '/assets/img/pix-qr-livre.webp',
};

let _valorPix = '10';

function abrirModalContribuicao() {
  document.getElementById('modal-contribuicao-overlay')?.classList.remove('oculto');
}

function fecharModalContribuicao() {
  document.getElementById('modal-contribuicao-overlay')?.classList.add('oculto');
}

function selecionarValorPix(valor) {
  _valorPix = valor;
  document.querySelectorAll('.pix-valor-btn').forEach(b =>
    b.classList.toggle('ativo', b.dataset.valor === valor)
  );
  const img = document.getElementById('pix-qr-img');
  if (img) {
    img.src = PIX_QR[valor];
    img.alt = `QR Code PIX${valor !== 'livre' ? ` R$${valor}` : ' — valor livre'}`;
  }
}

function copiarPix() {
  const chave = document.getElementById('pix-chave')?.textContent?.trim();
  if (!chave) return;
  const btn = document.getElementById('btn-copiar-pix');
  navigator.clipboard.writeText(chave).then(() => {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg> Copiado!`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar chave`;
    }, 2000);
  });
}

function toggleQR() {
  const modal = document.getElementById('modal-contribuicao');
  const btn   = document.getElementById('btn-toggle-qr');
  const ativo = modal.classList.toggle('qr-ativo');
  btn.innerHTML = ativo
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg> Fechar QR`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3m0 4h4m-4 0h-4m4 0v-4"/></svg> Ver QR Code`;
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

  btnResumir.classList.add('oculto');
  aiCard.classList.remove('oculto');

  // Cache por query na sessão — evita chamadas repetidas ao Grok
  if (_cacheResumoIA.has(queryAtual)) {
    aiCorpo.innerHTML = '';
    renderizarResumoIA(_cacheResumoIA.get(queryAtual));
    return;
  }

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
      body: JSON.stringify({ query: queryAtual, paragrafos: resultadosAtuais.slice(0, 15) }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.resumo) {
      throw new Error(data.error || 'Erro desconhecido');
    }

    _cacheResumoIA.set(queryAtual, data.resumo);
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
