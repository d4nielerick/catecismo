/**
 * saopiox.js
 * Motor de busca e UI para o Catecismo Maior de São Pio X.
 * Texto contínuo no painel direito — ao selecionar um resultado,
 * scrolla até a questão e o usuário pode ler livremente.
 */

import { iniciarLeitorPioX, abrirLeitorPioX } from './leitorpiox.js';
import { gerarVariantes } from '/assets/js/variantes.js';

// ── Estado ────────────────────────────────────────────────────────────────────
let _dados        = [];
let _resultados   = [];
let _idxAtivo     = -1;
let _query        = '';
let _debounce;
let _autoSelect;
let _continuoRenderizado = false;
let _qaAtivo      = null;   // elemento DOM da questão ativa
let _sugestaoEl   = null;

// ── Elementos ─────────────────────────────────────────────────────────────────
const app           = document.getElementById('app');
const campoBusca    = document.getElementById('campo-busca');
const btnLimpar     = document.getElementById('botao-limpar');
const listaEl       = document.getElementById('lista-resultados');
const semRes        = document.getElementById('sem-resultados');
const contagemEl    = document.getElementById('contagem-resultados');
const painelDir     = document.getElementById('painel-conteudo');
const topoWrap      = document.getElementById('busca-topo-wrapper');
const temas         = document.getElementById('temas-rapidos');
const btnAnterior   = document.getElementById('nav-anterior');
const btnProximo    = document.getElementById('nav-proximo');
const mobileBar     = document.getElementById('mobile-nav-bar');
const mobileBtnRes  = document.getElementById('mobile-btn-resultados');
const mobileBtnAnt  = document.getElementById('mobile-btn-anterior');
const mobileBtnPro  = document.getElementById('mobile-btn-proximo');
const mobileInfo    = document.getElementById('mobile-nav-info');
const btnLerHero    = document.getElementById('btn-ler-hero');
const btnLerHeader  = document.getElementById('btn-ler-header');
const btnFechar     = document.getElementById('btn-fechar-conteudo');
const btnResumir    = document.getElementById('btn-resumir');
const aiCard        = document.getElementById('ai-resumo-card');
const aiCorpo       = document.getElementById('ai-resumo-corpo');
const aiFechar      = document.getElementById('ai-resumo-fechar');
const mobileBtnRes2 = document.getElementById('mobile-btn-resumir');

// ── Normalização / busca ───────────────────────────────────────────────────────
function norm(s = '') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function contemPalavra(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  if (idx > 0 && /[a-z]/.test(haystack[idx - 1])) return false;
  return true;
}

function buscar(q) {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  return _dados.filter(p =>
    contemPalavra(norm(p.pergunta), n) ||
    contemPalavra(norm(p.resposta), n) ||
    contemPalavra(norm(p.capitulo), n)
  );
}

// ── Highlight / trecho ────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function destacar(texto, query) {
  if (!query) return esc(texto);
  const n = norm(query);
  const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const tNorm = norm(texto);
  let r = '', pos = 0, m;
  while ((m = re.exec(tNorm)) !== null) {
    r += esc(texto.slice(pos, m.index));
    r += `<mark>${esc(texto.slice(m.index, m.index + m[0].length))}</mark>`;
    pos = m.index + m[0].length;
  }
  return r + esc(texto.slice(pos));
}

function trecho(texto, query, janela = 160) {
  const idx = norm(texto).indexOf(norm(query));
  if (idx === -1) return destacar(texto.slice(0, janela), query);
  const ini = Math.max(0, idx - Math.floor(janela / 2));
  const fim = Math.min(texto.length, ini + janela);
  return (ini > 0 ? '…' : '') + destacar(texto.slice(ini, fim), query) + (fim < texto.length ? '…' : '');
}

// ── Sugestão de variante ──────────────────────────────────────────────────────
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
    const n = buscar(v).length;
    if (n > melhorN) { melhorN = n; melhor = v; }
  }

  if (!melhor || melhorN === 0 || (nAtual >= THRESHOLD && melhorN <= nAtual)) {
    el.className = 'sugestao-variante oculto'; return;
  }

  const prefixo = nAtual === 0 ? 'Nenhum resultado. Tentar:' : 'Ver também:';
  el.className = 'sugestao-variante';
  el.innerHTML = `${prefixo} <button class="sugestao-btn" type="button">${melhor} <span class="sugestao-count">(${melhorN})</span></button>`;
  el.querySelector('.sugestao-btn').addEventListener('click', () => {
    campoBusca.value = melhor;
    btnLimpar.classList.remove('oculto');
    ativarBusca(melhor);
  });
}

// ── Texto contínuo ────────────────────────────────────────────────────────────
function renderizarTodosQA() {
  if (_continuoRenderizado) return;
  _continuoRenderizado = true;

  const container = document.createElement('div');
  container.className = 'piox-continuo';

  let parteAtual = '';
  let capAtual   = '';

  for (const p of _dados) {
    if (p.parte && p.parte !== parteAtual) {
      parteAtual = p.parte;
      capAtual   = '';
      const h = document.createElement('h2');
      h.className = 'piox-cont-parte';
      h.textContent = p.parte;
      container.appendChild(h);
    }
    if (p.capitulo && p.capitulo !== capAtual) {
      capAtual = p.capitulo;
      const h = document.createElement('h3');
      h.className = 'piox-cont-cap';
      h.textContent = p.capitulo;
      container.appendChild(h);
    }

    const div = document.createElement('div');
    div.className = 'piox-qa-item';
    div.id = `qa-${p.numero}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'piox-qa-num';
    numSpan.textContent = `Q. ${p.numero}`;

    const pergEl = document.createElement('div');
    pergEl.className = 'piox-qa-pergunta';
    pergEl.textContent = p.pergunta;

    const respEl = document.createElement('div');
    respEl.className = 'piox-qa-resposta';
    respEl.textContent = p.resposta;

    div.appendChild(numSpan);
    div.appendChild(pergEl);
    div.appendChild(respEl);
    container.appendChild(div);
  }

  // Preserva o botão fechar e insere o texto contínuo
  const placeholder = painelDir.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  painelDir.appendChild(container);
}

function atualizarHighlights(query, resultados) {
  // Limpa highlights anteriores
  painelDir.querySelectorAll('.piox-qa-item mark').forEach(m => {
    m.outerHTML = m.textContent;
  });

  if (!query) return;
  const nums = new Set(resultados.map(p => p.numero));

  for (const p of resultados) {
    const el = document.getElementById(`qa-${p.numero}`);
    if (!el) continue;
    el.querySelector('.piox-qa-pergunta').innerHTML = destacar(p.pergunta, query);
    el.querySelector('.piox-qa-resposta').innerHTML = destacar(p.resposta, query);
  }
}

// ── Render lista ──────────────────────────────────────────────────────────────
function renderLista() {
  listaEl.innerHTML = '';

  if (_resultados.length === 0) {
    semRes.classList.remove('oculto');
    contagemEl.textContent = 'Nenhum resultado';
    btnResumir?.classList.add('oculto');
    aiCard?.classList.add('oculto');
    return;
  }

  semRes.classList.add('oculto');
  contagemEl.textContent = `${_resultados.length} questã${_resultados.length === 1 ? 'o' : 'ões'}`;
  btnResumir?.classList.remove('oculto');

  const frag = document.createDocumentFragment();
  _resultados.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'piox-item';
    div.setAttribute('role', 'option');
    div.dataset.idx = idx;

    const inPergunta = contemPalavra(norm(p.pergunta), norm(_query));
    div.innerHTML = `
      <div class="piox-item-num">Q. ${p.numero}</div>
      <div class="piox-item-pergunta">${destacar(p.pergunta, _query)}</div>
      ${!inPergunta ? `<div class="piox-item-trecho">${trecho(p.resposta, _query)}</div>` : ''}
    `;
    frag.appendChild(div);
  });
  listaEl.appendChild(frag);
}

// ── Scroll para Q&A no painel contínuo ───────────────────────────────────────
function scrollParaQA(idx) {
  if (idx < 0 || idx >= _resultados.length) return;
  _idxAtivo = idx;

  // Marca ativo na lista
  listaEl.querySelectorAll('.piox-item').forEach((el, i) =>
    el.classList.toggle('ativo', i === idx)
  );
  listaEl.querySelector('.piox-item.ativo')?.scrollIntoView({ block: 'nearest' });

  const p = _resultados[idx];
  const el = document.getElementById(`qa-${p.numero}`);
  if (!el) return;

  // Remove ativo anterior
  if (_qaAtivo) _qaAtivo.classList.remove('ativo', 'flash');
  _qaAtivo = el;
  el.classList.add('ativo');

  // Scroll centralizado no painel
  const panelRect = painelDir.getBoundingClientRect();
  const elRect    = el.getBoundingClientRect();
  const target    = painelDir.scrollTop + elRect.top - panelRect.top
                    - (painelDir.clientHeight - el.offsetHeight) / 2;
  painelDir.scrollTop = Math.max(0, target);

  // Flash
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');

  // Mobile
  painelDir.classList.add('aberto');
  mobileBar.classList.add('visivel');
  mobileBar.setAttribute('aria-hidden', 'false');

  atualizarNavArrows();
}

function fecharDir() {
  painelDir.classList.remove('aberto');
  mobileBar.classList.remove('visivel');
  mobileBar.setAttribute('aria-hidden', 'true');
}

function atualizarNavArrows() {
  const ant = _idxAtivo > 0;
  const pro = _idxAtivo < _resultados.length - 1;
  btnAnterior.classList.toggle('oculto', !ant);
  btnProximo.classList.toggle('oculto', !pro);
  if (mobileBtnAnt) mobileBtnAnt.disabled = !ant;
  if (mobileBtnPro) mobileBtnPro.disabled = !pro;
  if (mobileInfo) {
    const p = _resultados[_idxAtivo];
    mobileInfo.textContent = p ? `Q.${p.numero}  ·  ${_idxAtivo + 1}/${_resultados.length}` : '';
  }
}

// ── Ativar busca ──────────────────────────────────────────────────────────────
function ativarBusca(query) {
  _query      = query;
  _resultados = buscar(query);
  _idxAtivo   = -1;

  if (!app.classList.contains('estado-busca')) {
    app.classList.remove('estado-inicial');
    app.classList.add('estado-busca');
    topoWrap.appendChild(campoBusca);
    topoWrap.appendChild(btnLimpar);
    renderizarTodosQA();
  }

  renderLista();
  atualizarHighlights(query, _resultados);
  mostrarSugestao(query, _resultados.length);
  btnAnterior.classList.add('oculto');
  btnProximo.classList.add('oculto');

  // Auto-seleciona o primeiro em desktop
  clearTimeout(_autoSelect);
  if (_resultados.length > 0 && window.innerWidth >= 768) {
    _autoSelect = setTimeout(() => scrollParaQA(0), 300);
  }
}

function limparBusca() {
  campoBusca.value = '';
  btnLimpar.classList.add('oculto');
  app.classList.remove('estado-busca');
  app.classList.add('estado-inicial');
  painelDir.classList.remove('aberto');
  mobileBar.classList.remove('visivel');
  listaEl.innerHTML = '';
  semRes.classList.add('oculto');
  contagemEl.textContent = '';
  if (_sugestaoEl) _sugestaoEl.className = 'sugestao-variante oculto';
  btnResumir?.classList.add('oculto');
  aiCard?.classList.add('oculto');
  if (_qaAtivo) { _qaAtivo.classList.remove('ativo', 'flash'); _qaAtivo = null; }
  _resultados = []; _idxAtivo = -1; _query = '';

  // Devolve o campo ao hero
  const heroWrap = document.querySelector('#hero .campo-busca-container');
  heroWrap?.appendChild(campoBusca);
  heroWrap?.appendChild(btnLimpar);
  campoBusca.focus();
}

// ── IA resumo ─────────────────────────────────────────────────────────────────
async function acionarResumoIA() {
  if (!_resultados.length) return;

  btnResumir?.classList.add('oculto');
  aiCard?.classList.remove('oculto');
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
      body: JSON.stringify({
        query: _query,
        paragrafos: _resultados.map(p => ({
          numero: p.numero,
          texto: `P: ${p.pergunta}\nR: ${p.resposta}`,
        })),
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.resumo) throw new Error(data.error || 'Erro desconhecido');
    aiCorpo.innerHTML = '';
    renderizarResumoIA(data.resumo);
  } catch (err) {
    aiCorpo.innerHTML = `<p style="color:var(--color-muted);font-size:0.85rem">Não foi possível gerar o resumo. Tente novamente.</p>`;
    console.error('[AI PioX]', err);
  }
}

function renderizarResumoIA(texto) {
  const linhas = texto.split(/\n+/).filter(l => l.trim());
  for (const linha of linhas) {
    const p = document.createElement('p');
    // Substitui Q.NNN por botões clicáveis
    const parts = linha.split(/(Q\.\s*\d+)/g);
    for (const part of parts) {
      const m = part.match(/^Q\.\s*(\d+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        const btn = document.createElement('button');
        btn.className = 'ai-citacao';
        btn.type = 'button';
        btn.textContent = `Q.${num}`;
        btn.addEventListener('click', () => {
          const idx = _resultados.findIndex(p => p.numero === num);
          if (idx !== -1) scrollParaQA(idx);
        });
        p.appendChild(btn);
      } else {
        p.appendChild(document.createTextNode(part));
      }
    }
    aiCorpo.appendChild(p);
  }
}

// ── Eventos ───────────────────────────────────────────────────────────────────
campoBusca.addEventListener('input', () => {
  const v = campoBusca.value.trim();
  btnLimpar.classList.toggle('oculto', !v);
  if (window.innerWidth < 768) return;
  clearTimeout(_debounce);
  if (v.length < 2) return;
  _debounce = setTimeout(() => ativarBusca(v), 200);
});

campoBusca.addEventListener('keydown', e => {
  if (e.key === 'Escape') limparBusca();
  if (e.key === 'Enter') { e.preventDefault(); const v = campoBusca.value.trim(); if (v.length >= 2) ativarBusca(v); }
});

btnLimpar.addEventListener('click', limparBusca);

btnFechar?.addEventListener('click', fecharDir);

temas?.addEventListener('click', e => {
  const btn = e.target.closest('[data-tema]');
  if (!btn) return;
  campoBusca.value = btn.dataset.tema;
  btnLimpar.classList.remove('oculto');
  ativarBusca(btn.dataset.tema);
  if (window.innerWidth >= 768) campoBusca.focus();
});

listaEl.addEventListener('click', e => {
  const item = e.target.closest('[data-idx]');
  if (!item) return;
  clearTimeout(_autoSelect);
  scrollParaQA(parseInt(item.dataset.idx, 10));
});

btnAnterior.addEventListener('click', () => { if (_idxAtivo > 0) scrollParaQA(_idxAtivo - 1); });
btnProximo.addEventListener('click',  () => { if (_idxAtivo < _resultados.length - 1) scrollParaQA(_idxAtivo + 1); });

mobileBtnRes?.addEventListener('click', fecharDir);
mobileBtnAnt?.addEventListener('click', () => { if (_idxAtivo > 0) scrollParaQA(_idxAtivo - 1); });
mobileBtnPro?.addEventListener('click', () => { if (_idxAtivo < _resultados.length - 1) scrollParaQA(_idxAtivo + 1); });

btnResumir?.addEventListener('click', acionarResumoIA);
aiFechar?.addEventListener('click', () => {
  aiCard?.classList.add('oculto');
  btnResumir?.classList.remove('oculto');
});
mobileBtnRes2?.addEventListener('click', () => {
  fecharDir();
  acionarResumoIA();
});

btnLerHero?.addEventListener('click',   () => abrirLeitorPioX(0));
btnLerHeader?.addEventListener('click', () => abrirLeitorPioX(0));

// autocomplete só no desktop
function atualizarAutocomplete() {
  campoBusca.autocomplete = window.innerWidth >= 768 ? 'on' : 'off';
}
atualizarAutocomplete();
window.addEventListener('resize', atualizarAutocomplete);

// ── Carrega dados ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const resp = await fetch('/data/saopiox.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    _dados = json.perguntas ?? [];
    campoBusca.placeholder = `Busque entre ${_dados.length} questões…`;
    iniciarLeitorPioX(_dados);
  } catch (err) {
    campoBusca.placeholder = 'Erro ao carregar dados';
    contagemEl.textContent = `Erro: ${err.message}`;
    console.error('[PioX] Falha:', err);
  }
})();
