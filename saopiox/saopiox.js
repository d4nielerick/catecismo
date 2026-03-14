/**
 * saopiox.js
 * Motor de busca e UI para o Catecismo Maior de São Pio X.
 */

import { iniciarLeitorPioX, abrirLeitorPioX } from './leitorpiox.js';

// ── Estado ────────────────────────────────────────────────────────────────────
let _dados       = [];
let _resultados  = [];
let _idxAtivo    = -1;
let _query       = '';
let _debounce;
let _autoSelect;

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

// ── Render lista ──────────────────────────────────────────────────────────────
function renderLista() {
  listaEl.innerHTML = '';

  if (_resultados.length === 0) {
    semRes.classList.remove('oculto');
    contagemEl.textContent = 'Nenhum resultado';
    return;
  }

  semRes.classList.add('oculto');
  contagemEl.textContent = `${_resultados.length} questã${_resultados.length === 1 ? 'o' : 'ões'}`;

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

// ── Render Q&A no painel direito ──────────────────────────────────────────────
function abrirQA(idx) {
  if (idx < 0 || idx >= _resultados.length) return;
  _idxAtivo = idx;

  // Marca ativo na lista
  listaEl.querySelectorAll('.piox-item').forEach((el, i) =>
    el.classList.toggle('ativo', i === idx)
  );
  listaEl.querySelector('.piox-item.ativo')?.scrollIntoView({ block: 'nearest' });

  const p = _resultados[idx];
  const partes = [p.parte, p.capitulo].filter(Boolean);
  const breadcrumb = partes.map(t => `<span>${esc(t)}</span>`).join('');

  const respostaHtml = destacar(p.resposta, _query)
    .replace(/(\s(?:\d+[ºo°]|[IVX]+\.)\s)/g, '<br>$1');

  painelDir.innerHTML = `
    <button class="btn-fechar-dir" type="button" aria-label="Voltar aos resultados">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      Resultados
    </button>
    <div class="piox-qa">
      <div class="piox-qa-breadcrumb">${breadcrumb}</div>
      <div class="piox-qa-num">Q. ${p.numero}</div>
      <div class="piox-qa-pergunta">${destacar(p.pergunta, _query)}</div>
      <div class="piox-qa-resposta">${respostaHtml}</div>
    </div>
  `;
  painelDir.scrollTop = 0;

  // Botão fechar (reescrito pelo innerHTML)
  painelDir.querySelector('.btn-fechar-dir')
    ?.addEventListener('click', fecharDir);

  // Mobile: desliza o drawer
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
    mobileInfo.textContent = _resultados[_idxAtivo] ? `Q.${_resultados[_idxAtivo].numero}` : '';
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
  }

  renderLista();
  btnAnterior.classList.add('oculto');
  btnProximo.classList.add('oculto');

  // Auto-seleciona o primeiro resultado em desktop
  clearTimeout(_autoSelect);
  if (_resultados.length > 0 && window.innerWidth >= 768) {
    _autoSelect = setTimeout(() => abrirQA(0), 300);
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
  _resultados = []; _idxAtivo = -1; _query = '';

  // Devolve o campo ao hero
  const heroWrap = document.querySelector('#hero .campo-busca-container');
  heroWrap?.appendChild(campoBusca);
  heroWrap?.appendChild(btnLimpar);
  campoBusca.focus();
}

// ── Eventos ───────────────────────────────────────────────────────────────────
campoBusca.addEventListener('input', () => {
  const v = campoBusca.value.trim();
  btnLimpar.classList.toggle('oculto', !v);
  clearTimeout(_debounce);
  if (v.length < 2) return;
  _debounce = setTimeout(() => ativarBusca(v), 200);
});

campoBusca.addEventListener('keydown', e => {
  if (e.key === 'Escape') limparBusca();
});

btnLimpar.addEventListener('click', limparBusca);

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
  abrirQA(parseInt(item.dataset.idx, 10));
});

btnAnterior.addEventListener('click', () => { if (_idxAtivo > 0) abrirQA(_idxAtivo - 1); });
btnProximo.addEventListener('click',  () => { if (_idxAtivo < _resultados.length - 1) abrirQA(_idxAtivo + 1); });

mobileBtnRes?.addEventListener('click', fecharDir);
mobileBtnAnt?.addEventListener('click', () => { if (_idxAtivo > 0) abrirQA(_idxAtivo - 1); });
mobileBtnPro?.addEventListener('click', () => { if (_idxAtivo < _resultados.length - 1) abrirQA(_idxAtivo + 1); });

btnLerHero?.addEventListener('click',   () => abrirLeitorPioX(0));
btnLerHeader?.addEventListener('click', () => abrirLeitorPioX(0));

// ── Carrega dados ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const resp = await fetch('/data/saopiox.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    _dados = json.perguntas ?? [];
    campoBusca.placeholder = `Busque entre ${_dados.length} questões…`;
    console.log('[PioX] dados carregados:', _dados.length);
    iniciarLeitorPioX(_dados);
  } catch (err) {
    campoBusca.placeholder = 'Erro ao carregar dados';
    contagemEl.textContent = `Erro: ${err.message}`;
    console.error('[PioX] Falha:', err);
  }
})();
