/**
 * leitorpiox.js
 * Modo Leitura corrida — Catecismo Maior de São Pio X.
 * Estrutura de dados: {numero, parte, capitulo, pergunta, resposta}
 */

// ── Estado ────────────────────────────────────────────────────────────────────
let _capitulos       = [];
let _indice          = 0;
let _tocAberta       = true;
let _estadoAnterior  = 'estado-inicial';

// ── DOM ───────────────────────────────────────────────────────────────────────
const app        = document.getElementById('app');
const container  = document.getElementById('leitor-container');
const btnToc     = document.getElementById('leitor-btn-toc');
const breadcrumb = document.getElementById('leitor-breadcrumb');
const btnFechar  = document.getElementById('leitor-fechar');
const tocEl      = document.getElementById('leitor-toc');
const tocOverlay = document.getElementById('leitor-toc-overlay');
const textoEl    = document.getElementById('leitor-texto');
const btnAnt     = document.getElementById('leitor-anterior');
const btnProx    = document.getElementById('leitor-proximo');

// ── API pública ───────────────────────────────────────────────────────────────

export function iniciarLeitorPioX(dados) {
  _capitulos = construirCapitulos(dados);

  btnToc.addEventListener('click', toggleToc);
  if (tocOverlay) tocOverlay.addEventListener('click', () => {
    _tocAberta = false;
    container.classList.add('toc-fechada');
  });
  btnFechar.addEventListener('click', fecharLeitorPioX);
  btnAnt.addEventListener('click',  () => navegarCapitulo(_indice - 1));
  btnProx.addEventListener('click', () => navegarCapitulo(_indice + 1));

  document.addEventListener('keydown', (e) => {
    if (!app.classList.contains('estado-leitura')) return;
    if (e.key === 'ArrowLeft')  navegarCapitulo(_indice - 1);
    if (e.key === 'ArrowRight') navegarCapitulo(_indice + 1);
    if (e.key === 'Escape')     fecharLeitorPioX();
  });

  construirToc();
}

export function abrirLeitorPioX(indice = 0) {
  _estadoAnterior = app.classList.contains('estado-busca') ? 'estado-busca' : 'estado-inicial';
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

export function fecharLeitorPioX() {
  app.classList.remove('estado-leitura');
  app.classList.add(_estadoAnterior);
  // Reseta TOC para próxima abertura
  _tocAberta = true;
  container.classList.remove('toc-fechada');
  btnToc.setAttribute('aria-expanded', 'true');
}

// ── Construção dos capítulos ──────────────────────────────────────────────────

function construirCapitulos(dados) {
  const caps = [];
  let ultimo = '';
  let capCorrente = null;

  for (const p of dados) {
    const chave = `${p.parte || ''}|${p.capitulo || ''}`;
    if (chave !== ultimo) {
      ultimo = chave;
      capCorrente = { parte: p.parte || '', capitulo: p.capitulo || '', perguntas: [] };
      caps.push(capCorrente);
    }
    capCorrente.perguntas.push(p);
  }

  return caps;
}

// ── TOC ───────────────────────────────────────────────────────────────────────

function construirToc() {
  tocEl.innerHTML = '';

  let parteAtual   = '';
  let parteDetails = null;
  let capNum       = 0;

  _capitulos.forEach((cap, idx) => {
    if (cap.parte !== parteAtual) {
      parteAtual = cap.parte;
      capNum = 0;

      const details = document.createElement('details');
      details.className = 'toc-parte';
      details.open = true;

      const summary = document.createElement('summary');
      summary.appendChild(document.createTextNode(cap.parte));
      details.appendChild(summary);
      parteDetails = details;
      tocEl.appendChild(details);
    }

    capNum++;
    const btn = document.createElement('button');
    btn.className = 'toc-cap-link';
    btn.type = 'button';
    btn.dataset.idx = idx;

    const numSpan = document.createElement('span');
    numSpan.className = 'toc-cap-num';
    numSpan.textContent = capNum;
    btn.appendChild(numSpan);
    btn.appendChild(document.createTextNode(cap.capitulo || cap.parte));

    btn.addEventListener('click', () => {
      navegarCapitulo(idx);
      if (window.innerWidth < 768) {
        _tocAberta = false;
        container.classList.add('toc-fechada');
      }
    });

    (parteDetails || tocEl).appendChild(btn);
  });
}

function atualizarTocAtivo() {
  tocEl.querySelectorAll('.toc-cap-link').forEach((btn) => {
    const isAtivo = parseInt(btn.dataset.idx, 10) === _indice;
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

function toggleToc() {
  _tocAberta = !_tocAberta;
  container.classList.toggle('toc-fechada', !_tocAberta);
  btnToc.setAttribute('aria-expanded', String(_tocAberta));
}

// ── Renderização ──────────────────────────────────────────────────────────────

function navegarCapitulo(idx) {
  if (idx < 0 || idx >= _capitulos.length) return;
  _indice = idx;
  renderizarCapitulo(idx);
}

function renderizarCapitulo(idx) {
  const cap = _capitulos[idx];
  if (!cap) return;

  breadcrumb.textContent = [cap.parte, cap.capitulo].filter(Boolean).join(' › ');

  textoEl.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'leitor-conteudo';

  const h = document.createElement('h2');
  h.className = 'leitor-cap-titulo';
  h.textContent = cap.capitulo || cap.parte;
  wrapper.appendChild(h);

  for (const p of cap.perguntas) {
    const div = document.createElement('div');
    div.className = 'piox-leitor-qa';
    div.id = `lq-${p.numero}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'piox-leitor-num';
    numSpan.textContent = `Q. ${p.numero}`;

    const pergEl = document.createElement('div');
    pergEl.className = 'piox-leitor-pergunta';
    pergEl.textContent = p.pergunta;

    const respEl = document.createElement('div');
    respEl.className = 'piox-leitor-resposta';
    respEl.textContent = p.resposta;

    div.appendChild(numSpan);
    div.appendChild(pergEl);
    div.appendChild(respEl);
    wrapper.appendChild(div);
  }

  textoEl.appendChild(wrapper);
  textoEl.scrollTop = 0;

  btnAnt.disabled  = idx === 0;
  btnProx.disabled = idx === _capitulos.length - 1;

  atualizarTocAtivo();

  const ativoEl = tocEl.querySelector('.toc-cap-link.ativo');
  if (ativoEl) ativoEl.scrollIntoView({ block: 'nearest' });
}
