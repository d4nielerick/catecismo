/**
 * leitor.js
 * Modo Leitura livre do Catecismo.
 * Navegação por capítulos com TOC lateral e salvar seleções no coletor.
 */

import { notasDoParagrafo } from './data.js';
import { adicionarTrecho, atualizarBadge as _atualizarBadge, contemNumero } from './coletor.js';
import { buscarVersiculo, mostrarCard, mostrarCardMobile } from './biblia.js';

// ── Utilitários ───────────────────────────────────────────────────────────────
function _sentenceCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/[a-záàâãéèêíïóòôõúùûüç]/i, c => c.toUpperCase());
}

// ── Estado ────────────────────────────────────────────────────────────────────
let _paragrafos    = [];
let _capitulos     = [];   // lista de seções (agrupamento por parte|secao)
let _indice        = 0;    // seção atual
let _tocAberta     = true;
let _capSlugAtivo  = null; // slug do capítulo em destaque no TOC

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

  if (window.innerWidth < 768) {
    // Mobile: abre o TOC primeiro; usuário escolhe o capítulo
    _tocAberta = true;
    container.classList.remove('toc-fechada');
    btnToc.setAttribute('aria-expanded', 'true');
  } else {
    renderizarCapitulo(_indice);
  }
}

export function fecharLeitor() {
  app.classList.remove('estado-leitura');
  app.classList.add('estado-inicial');
  savePopup.classList.add('oculto');
  _selecaoAtual = null;
  // Reseta TOC para próxima abertura
  _tocAberta = true;
  container.classList.remove('toc-fechada');
  btnToc.setAttribute('aria-expanded', 'true');
}

// ── Construção dos capítulos ──────────────────────────────────────────────────

function construirCapitulos(paragrafos) {
  const caps = [];
  let ultimo = '';
  let capCorrente = null;

  for (const p of paragrafos) {
    const chave = `${p.parte||''}|${p.secao||''}`;
    if (chave !== ultimo) {
      ultimo = chave;
      capCorrente = {
        label:      p.secao || p.parte || 'Prólogo',
        parte:      p.parte  || '',
        secao:      p.secao  || '',
        paragrafos: [],
      };
      caps.push(capCorrente);
    }
    capCorrente.paragrafos.push(p);
  }

  return caps;
}

// ── TOC ───────────────────────────────────────────────────────────────────────

const ROMANOS = ['I','II','III','IV','V','VI','VII','VIII'];

function construirToc() {
  tocEl.innerHTML = '';

  // Prólogo: link direto no topo
  const prologoIdx = _capitulos.findIndex(c => c.parte === 'PRÓLOGO');
  if (prologoIdx !== -1) {
    const btn = document.createElement('button');
    btn.className = 'toc-cap-link toc-prologo';
    btn.type = 'button';
    btn.textContent = 'Prólogo';
    btn.dataset.secaoIdx = prologoIdx;
    btn.addEventListener('click', () => _tocClick(prologoIdx));
    tocEl.appendChild(btn);
  }

  // Itera sobre _paragrafos para obter hierarquia parte > seção > capítulo
  let parteAtual = '', secaoAtual = '', capituloAtual = '';
  let parteDetails = null, secaoDetails = null;
  let parteNum = 0, secaoNum = 0, capNum = 0;
  let introAdicionada = false;

  for (const p of _paragrafos) {
    if (p.parte === 'PRÓLOGO') continue;

    // ── Nova parte ──
    if (p.parte !== parteAtual) {
      parteAtual = p.parte;
      secaoAtual = '';
      capituloAtual = '';
      parteNum++;
      secaoNum = 0;
      introAdicionada = false;

      const details = document.createElement('details');
      details.className = 'toc-parte';
      details.open = true;

      const summary = document.createElement('summary');
      const numSpan = document.createElement('span');
      numSpan.className = 'toc-parte-num';
      numSpan.textContent = `Parte ${ROMANOS[parteNum - 1] || parteNum}`;
      summary.appendChild(numSpan);
      summary.appendChild(document.createTextNode(p.parte));

      const firstSecIdx = _capitulos.findIndex(c => c.parte === p.parte && c.secao);
      const navIdx = firstSecIdx !== -1 ? firstSecIdx : _capitulos.findIndex(c => c.parte === p.parte);
      summary.addEventListener('click', () => setTimeout(() => _tocClick(navIdx), 0));

      details.appendChild(summary);
      parteDetails = details;
      tocEl.appendChild(details);
    }

    if (!p.secao && !p.capitulo) continue; // intro de parte — pular

    // ── Nova seção ──
    if (p.secao && p.secao !== secaoAtual) {
      secaoAtual = p.secao;
      capituloAtual = '';
      secaoNum++;
      capNum = 0;
      introAdicionada = false;

      const secaoIdx = _capitulos.findIndex(c => c.parte === p.parte && c.secao === p.secao);

      const details = document.createElement('details');
      details.className = 'toc-secao';
      details.open = true;

      const summary = document.createElement('summary');
      const numSpan = document.createElement('span');
      numSpan.className = 'toc-secao-num';
      numSpan.textContent = `Seção ${ROMANOS[secaoNum - 1] || secaoNum}`;
      summary.appendChild(numSpan);
      summary.appendChild(document.createTextNode(p.secao));
      summary.addEventListener('click', () => setTimeout(() => _tocClick(secaoIdx), 0));

      details.appendChild(summary);
      secaoDetails = details;
      (parteDetails || tocEl).appendChild(details);
    }

    // ── Novo capítulo (ou intro de seção) ──
    if (p.capitulo && p.capitulo !== capituloAtual) {
      capituloAtual = p.capitulo;
      capNum++;

      const secaoIdx = _capitulos.findIndex(c => c.parte === p.parte && c.secao === p.secao);
      const slug = _capSlug(p.capitulo);

      const btn = document.createElement('button');
      btn.className = 'toc-cap-link';
      btn.type = 'button';
      btn.dataset.secaoIdx = secaoIdx;
      btn.dataset.capSlug = slug;
      btn.addEventListener('click', () => _tocClickCap(secaoIdx, slug));

      const numSpan = document.createElement('span');
      numSpan.className = 'toc-cap-num';
      numSpan.textContent = capNum;
      btn.appendChild(numSpan);
      btn.appendChild(document.createTextNode(_sentenceCase(p.capitulo)));

      (secaoDetails || parteDetails || tocEl).appendChild(btn);
    } else if (!p.capitulo && !introAdicionada) {
      introAdicionada = true;
      const secaoIdx = _capitulos.findIndex(c => c.parte === p.parte && c.secao === p.secao);

      const btn = document.createElement('button');
      btn.className = 'toc-cap-link toc-intro';
      btn.type = 'button';
      btn.dataset.secaoIdx = secaoIdx;
      btn.textContent = 'Introdução';
      btn.addEventListener('click', () => _tocClick(secaoIdx));

      (secaoDetails || parteDetails || tocEl).appendChild(btn);
    }
  }
}

function _capSlug(titulo) {
  return titulo.toLowerCase()
    .replace(/[«»""'']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 60);
}

function _tocClick(idx) {
  _capSlugAtivo = null;
  navegarCapitulo(idx);
  if (window.innerWidth < 768) {
    _tocAberta = false;
    container.classList.add('toc-fechada');
  }
}

function _tocClickCap(secaoIdx, capSlug) {
  _capSlugAtivo = capSlug;
  if (secaoIdx !== _indice) {
    navegarCapitulo(secaoIdx);
    setTimeout(() => _scrollParaCapitulo(capSlug), 60);
  } else {
    _scrollParaCapitulo(capSlug);
  }
  atualizarTocAtivo();
  if (window.innerWidth < 768) {
    _tocAberta = false;
    container.classList.add('toc-fechada');
  }
}

function _scrollParaCapitulo(capSlug) {
  const el = document.getElementById(`cap-${capSlug}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleToc() {
  _tocAberta = !_tocAberta;
  container.classList.toggle('toc-fechada', !_tocAberta);
  btnToc.setAttribute('aria-expanded', String(_tocAberta));
}

function atualizarTocAtivo() {
  tocEl.querySelectorAll('.toc-cap-link').forEach((btn) => {
    const secaoIdx = parseInt(btn.dataset.secaoIdx ?? btn.dataset.idx, 10);
    const capSlug  = btn.dataset.capSlug;
    let isAtivo;
    if (_capSlugAtivo) {
      // Capítulo específico clicado — só ele fica ativo
      isAtivo = !!capSlug && secaoIdx === _indice && capSlug === _capSlugAtivo;
    } else {
      // Navegação por seção — marca capítulos da seção, mas não a Introdução
      isAtivo = !!capSlug && secaoIdx === _indice;
    }
    btn.classList.toggle('ativo', isAtivo);
    if (isAtivo) {
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
  _capSlugAtivo = null;
  renderizarCapitulo(idx);
}

function renderizarCapitulo(idx) {
  const cap = _capitulos[idx];
  if (!cap) return;

  // Breadcrumb
  breadcrumb.textContent = [cap.parte, cap.secao].filter(Boolean).join(' › ');

  // Conteúdo
  textoEl.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'leitor-conteudo';

  // Título da seção
  if (cap.secao || cap.parte) {
    const h = document.createElement('h2');
    h.className = 'leitor-cap-titulo';
    h.textContent = cap.secao || cap.parte;
    wrapper.appendChild(h);
  }

  let capituloAtual = '', artigoAtual = '';
  for (const p of cap.paragrafos) {
    // Cabeçalho de capítulo dentro da seção
    if (p.capitulo && p.capitulo !== capituloAtual) {
      capituloAtual = p.capitulo;
      artigoAtual = '';
      const h = document.createElement('h3');
      h.className = 'leitor-capitulo-titulo';
      h.id = `cap-${_capSlug(p.capitulo)}`;
      h.textContent = p.capitulo;
      wrapper.appendChild(h);
    }

    if (p.artigo && p.artigo !== artigoAtual) {
      artigoAtual = p.artigo;
      const h = document.createElement('h4');
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

    const saveBtn = document.createElement('button');
    saveBtn.className = 'leitor-para-save-btn' + (contemNumero(p.numero) ? ' salvo' : '');
    saveBtn.type = 'button';
    saveBtn.setAttribute('aria-label', `Salvar parágrafo ${p.numero}`);
    saveBtn.innerHTML = contemNumero(p.numero)
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 6L9 17l-5-5"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
    saveBtn.addEventListener('click', (e) => { e.stopPropagation(); salvarParagrafoLeitor(p, saveBtn); });

    const flagBtn = criarFlagBtn(p.numero);

    div.appendChild(numSpan);
    div.appendChild(textoSpan);
    div.appendChild(saveBtn);
    div.appendChild(flagBtn);
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

// ── Botão de correção ─────────────────────────────────────────────────────────

function criarFlagBtn(numeroParagrafo) {
  const btn = document.createElement('button');
  btn.className = 'card-flag-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', `Reportar erro no parágrafo ${numeroParagrafo}`);
  btn.title = 'Reportar erro';
  btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const container = btn.closest('.leitor-paragrafo');
    if (!container) return;
    const existing = container.querySelector('.card-correcao-form');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('div');
    form.className = 'card-correcao-form';
    form.innerHTML = `
      <textarea placeholder="Descreva o erro encontrado neste parágrafo…" rows="3"></textarea>
      <div class="card-correcao-form-acoes">
        <button class="btn-correcao-cancelar" type="button">Cancelar</button>
        <button class="btn-correcao-enviar" type="button">Enviar</button>
      </div>
    `;
    container.appendChild(form);
    form.querySelector('textarea').focus();

    form.querySelector('.btn-correcao-cancelar').addEventListener('click', (ev) => {
      ev.stopPropagation();
      form.remove();
    });

    form.querySelector('.btn-correcao-enviar').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const descricao = form.querySelector('textarea').value.trim();
      if (!descricao) return;
      const enviarBtn = form.querySelector('.btn-correcao-enviar');
      enviarBtn.disabled = true;
      enviarBtn.textContent = 'Enviando…';
      try {
        const resp = await fetch('/api/correcao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paragrafo: numeroParagrafo, descricao }),
        });
        if (resp.ok) {
          form.innerHTML = '<p class="card-correcao-ok">Obrigado! Correção recebida.</p>';
          setTimeout(() => form.remove(), 2500);
        } else {
          enviarBtn.disabled = false;
          enviarBtn.textContent = 'Enviar';
        }
      } catch {
        enviarBtn.disabled = false;
        enviarBtn.textContent = 'Enviar';
      }
    });
  });

  return btn;
}

// ── Salvar parágrafo completo ─────────────────────────────────────────────────

function salvarParagrafoLeitor(p, btn) {
  adicionarTrecho({
    numero:   p.numero,
    texto:    p.texto,
    parte:    p.parte    || '',
    secao:    p.secao    || '',
    capitulo: p.capitulo || '',
    artigo:   p.artigo   || '',
    tipo:     'paragrafo',
  });
  _atualizarBadge();
  btn.classList.add('salvo');
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 6L9 17l-5-5"/></svg>`;
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

// ── Renderização de notas ─────────────────────────────────────────────────────

function renderizarTextoComNotas(el, texto, numeroParagrafo) {
  const notas = notasDoParagrafo(numeroParagrafo);
  if (!notas) { el.textContent = texto; return; }

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
