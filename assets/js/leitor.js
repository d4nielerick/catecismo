/**
 * leitor.js
 * Modo Leitura livre do Catecismo.
 * Navegação por capítulos com TOC lateral e salvar seleções no coletor.
 */

import { notasDoParagrafo } from './data.js';
import { adicionarTrecho, atualizarBadge as _atualizarBadge } from './coletor.js';

// ── Estado ────────────────────────────────────────────────────────────────────
let _paragrafos = [];
let _capitulos  = [];   // lista flat de capítulos
let _indice     = 0;    // capítulo atual
let _tocAberta  = true;

// ── DOM ───────────────────────────────────────────────────────────────────────
const app         = document.getElementById('app');
const container   = document.getElementById('leitor-container');
const btnToc      = document.getElementById('leitor-btn-toc');
const breadcrumb  = document.getElementById('leitor-breadcrumb');
const btnFechar   = document.getElementById('leitor-fechar');
const tocEl       = document.getElementById('leitor-toc');
const tocOverlay  = document.getElementById('leitor-toc-overlay');
const textoEl     = document.getElementById('leitor-texto');
const btnAnt      = document.getElementById('leitor-anterior');
const btnProx     = document.getElementById('leitor-proximo');
const savePopup   = document.getElementById('leitor-save-popup');
const saveBtnEl   = document.getElementById('leitor-save-btn');

// ── API pública ───────────────────────────────────────────────────────────────

export function iniciarLeitor(paragrafos) {
  _paragrafos = paragrafos;
  _capitulos  = construirCapitulos(paragrafos);

  btnToc.addEventListener('click', toggleToc);
  if (tocOverlay) tocOverlay.addEventListener('click', () => { _tocAberta = false; container.classList.add('toc-fechada'); });
  btnFechar.addEventListener('click', fecharLeitor);
  btnAnt.addEventListener('click',  () => navegarCapitulo(_indice - 1));
  btnProx.addEventListener('click', () => navegarCapitulo(_indice + 1));

  document.addEventListener('keydown', (e) => {
    if (!app.classList.contains('estado-leitura')) return;
    if (e.key === 'ArrowLeft')  navegarCapitulo(_indice - 1);
    if (e.key === 'ArrowRight') navegarCapitulo(_indice + 1);
    if (e.key === 'Escape')     fecharLeitor();
  });

  textoEl.addEventListener('mouseup',  onTextSelection);
  textoEl.addEventListener('touchend', onTextSelection);

  document.addEventListener('mousedown', (e) => {
    if (!savePopup.classList.contains('oculto') && !e.target.closest('#leitor-save-popup')) {
      savePopup.classList.add('oculto');
      _selecaoAtual = null;
    }
  });

  saveBtnEl.addEventListener('click', salvarSelecao);

  construirToc();
}

export function abrirLeitor(indice = 0) {
  _indice = Math.max(0, Math.min(indice, _capitulos.length - 1));
  app.classList.remove('estado-inicial', 'estado-busca');
  app.classList.add('estado-leitura');
  renderizarCapitulo(_indice);
}

export function fecharLeitor() {
  app.classList.remove('estado-leitura');
  app.classList.add('estado-inicial');
  savePopup.classList.add('oculto');
  _selecaoAtual = null;
}

// ── Construção dos capítulos ──────────────────────────────────────────────────

function construirCapitulos(paragrafos) {
  const caps = [];
  let ultimo = '';
  let capCorrente = null;

  for (const p of paragrafos) {
    const chave = `${p.parte||''}|${p.secao||''}|${p.capitulo||''}`;
    if (chave !== ultimo) {
      ultimo = chave;
      capCorrente = {
        label:     p.capitulo || p.secao || p.parte || 'Introdução',
        parte:     p.parte    || '',
        secao:     p.secao    || '',
        capitulo:  p.capitulo || '',
        paragrafos: [],
      };
      caps.push(capCorrente);
    }
    capCorrente.paragrafos.push(p);
  }

  return caps;
}

// ── TOC ───────────────────────────────────────────────────────────────────────

function construirToc() {
  tocEl.innerHTML = '';

  let parteAtual = '', secaoAtual = '';
  let parteDetails = null, secaoDetails = null;

  _capitulos.forEach((cap, idx) => {
    // Nova parte
    if (cap.parte !== parteAtual) {
      parteAtual = cap.parte;
      secaoAtual = '';
      secaoDetails = null;

      const details = document.createElement('details');
      details.className = 'toc-parte';
      details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = cap.parte || 'Geral';
      details.appendChild(summary);

      parteDetails = details;
      tocEl.appendChild(details);
    }

    // Nova seção
    if (cap.secao && cap.secao !== secaoAtual) {
      secaoAtual = cap.secao;

      const details = document.createElement('details');
      details.className = 'toc-secao';
      details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = cap.secao;
      details.appendChild(summary);

      secaoDetails = details;
      if (parteDetails) parteDetails.appendChild(details);
      else tocEl.appendChild(details);
    }

    // Link do capítulo — só se tiver label de capítulo ou seção
    if (!cap.capitulo && !cap.secao) return; // primeira entrada sem título estrutural

    const btn = document.createElement('button');
    btn.className = 'toc-cap-link';
    btn.type = 'button';
    btn.textContent = cap.capitulo || cap.secao;
    btn.dataset.idx = idx;
    btn.addEventListener('click', () => {
      navegarCapitulo(idx);
      if (window.innerWidth < 768) {
        _tocAberta = false;
        container.classList.add('toc-fechada');
      }
    });

    if (secaoDetails) secaoDetails.appendChild(btn);
    else if (parteDetails) parteDetails.appendChild(btn);
    else tocEl.appendChild(btn);
  });
}

function toggleToc() {
  _tocAberta = !_tocAberta;
  container.classList.toggle('toc-fechada', !_tocAberta);
  btnToc.setAttribute('aria-expanded', String(_tocAberta));
}

function atualizarTocAtivo() {
  tocEl.querySelectorAll('.toc-cap-link').forEach((btn) => {
    btn.classList.toggle('ativo', parseInt(btn.dataset.idx, 10) === _indice);
    // Garante que o item ativo esteja visível (abre details pais)
    if (btn.classList.contains('ativo')) {
      let el = btn.parentElement;
      while (el && el !== tocEl) {
        if (el.tagName === 'DETAILS') el.open = true;
        el = el.parentElement;
      }
    }
  });
}

// ── Renderização do capítulo ──────────────────────────────────────────────────

function navegarCapitulo(idx) {
  if (idx < 0 || idx >= _capitulos.length) return;
  _indice = idx;
  renderizarCapitulo(idx);
}

function renderizarCapitulo(idx) {
  const cap = _capitulos[idx];
  if (!cap) return;

  // Breadcrumb
  breadcrumb.textContent = [cap.parte, cap.secao, cap.capitulo].filter(Boolean).join(' › ');

  // Conteúdo
  textoEl.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'leitor-conteudo';

  // Título
  if (cap.capitulo || cap.secao) {
    const h = document.createElement('h2');
    h.className = 'leitor-cap-titulo';
    h.textContent = cap.capitulo || cap.secao;
    wrapper.appendChild(h);
  }

  let artigoAtual = '';
  for (const p of cap.paragrafos) {
    if (p.artigo && p.artigo !== artigoAtual) {
      artigoAtual = p.artigo;
      const h = document.createElement('h3');
      h.className = 'leitor-artigo-titulo';
      h.textContent = p.artigo;
      wrapper.appendChild(h);
    }

    const div = document.createElement('div');
    div.className = 'leitor-paragrafo';
    div.id = `lp-${p.numero}`;
    div.dataset.num = p.numero;

    const numSpan = document.createElement('span');
    numSpan.className = 'leitor-paragrafo-num';
    numSpan.textContent = `§${p.numero}`;

    const textoSpan = document.createElement('span');
    textoSpan.className = 'leitor-paragrafo-texto';
    renderizarTextoComNotas(textoSpan, p.texto, p.numero);

    div.appendChild(numSpan);
    div.appendChild(textoSpan);
    wrapper.appendChild(div);
  }

  textoEl.appendChild(wrapper);
  textoEl.scrollTop = 0;

  btnAnt.disabled  = idx === 0;
  btnProx.disabled = idx === _capitulos.length - 1;

  atualizarTocAtivo();

  // Scroll TOC para item ativo
  const ativoEl = tocEl.querySelector('.toc-cap-link.ativo');
  if (ativoEl) ativoEl.scrollIntoView({ block: 'nearest' });
}

// ── Seleção de texto → salvar ─────────────────────────────────────────────────

let _selecaoAtual = null;

function onTextSelection() {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';

  if (!text || text.length < 5) {
    savePopup.classList.add('oculto');
    _selecaoAtual = null;
    return;
  }

  // Parágrafo mais próximo
  const range   = sel.getRangeAt(0);
  const anchor  = range.commonAncestorContainer;
  const paraDiv = (anchor.nodeType === 1 ? anchor : anchor.parentElement)
                    ?.closest?.('.leitor-paragrafo');

  _selecaoAtual = {
    texto:  text,
    numero: paraDiv ? parseInt(paraDiv.dataset.num, 10) : null,
  };

  // Posiciona popup acima da seleção
  const rect = range.getBoundingClientRect();
  savePopup.style.top  = `${rect.top + window.scrollY - 48}px`;
  savePopup.style.left = `${rect.left + rect.width / 2}px`;
  saveBtnEl.textContent = 'Salvar trecho';
  savePopup.classList.remove('oculto');
}

function salvarSelecao() {
  if (!_selecaoAtual) return;

  const cap = _capitulos[_indice];
  const p   = cap?.paragrafos.find(x => x.numero === _selecaoAtual.numero)
              || cap?.paragrafos[0];

  adicionarTrecho({
    numero:   _selecaoAtual.numero ?? p?.numero,
    texto:    _selecaoAtual.texto,
    parte:    cap?.parte    || '',
    secao:    cap?.secao    || '',
    capitulo: cap?.capitulo || '',
    artigo:   p?.artigo     || '',
    tipo:     'selecao',
  });
  _atualizarBadge();

  saveBtnEl.textContent = 'Salvo ✓';
  setTimeout(() => { savePopup.classList.add('oculto'); _selecaoAtual = null; }, 1200);
  window.getSelection()?.removeAllRanges();
}

// ── Renderização de notas (igual ao ui.js) ────────────────────────────────────

function renderizarTextoComNotas(el, texto, numeroParagrafo) {
  const notas = notasDoParagrafo(numeroParagrafo);
  if (!notas) { el.textContent = texto; return; }

  const partes = texto.split(/(\((?!\d{4}\))\d+\))/);
  for (const parte of partes) {
    const m = parte.match(/^\((\d+)\)$/);
    if (m && notas[m[1]]) {
      const ref     = m[1];
      const sup     = document.createElement('sup');
      sup.className = 'ref-nota';
      sup.textContent = ref;
      sup.setAttribute('aria-label', `Nota de rodapé ${ref}`);
      const tooltip     = document.createElement('span');
      tooltip.className = 'nota-tooltip';
      tooltip.textContent = notas[ref];
      sup.appendChild(tooltip);
      el.appendChild(sup);
    } else {
      el.appendChild(document.createTextNode(parte));
    }
  }
}
