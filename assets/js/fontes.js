/**
 * fontes.js — liga o texto de uma nota do Catecismo aos documentos-fonte
 * hospedados em /fontes/<slug>/ (ver scripts/build-fontes.mjs).
 *
 * Detecta o título do documento no texto da nota (ex.: "Decl. Nostra aetate, 4")
 * e o transforma em link para a página hospedada, direto na seção citada
 * (#s4 quando há número de seção após o título).
 */
let _index = null;
let _promise = null;

export async function carregarFontes() {
  if (_index) return _index;
  if (_promise) return _promise;
  _promise = fetch('/data/fontes-index.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => { _index = Array.isArray(d) ? d : []; return _index; })
    .catch(() => { _index = []; return _index; });
  return _promise;
}

const _esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Retorna o HTML da nota (escapado) com os títulos de documentos linkados,
 *  ou null se nenhum documento hospedado foi citado (mantém texto plano). */
export function linkificarNota(texto, index) {
  if (!texto || !index || !index.length) return null;
  let html = _esc(texto);
  let casou = false;
  for (const { slug, titulo } of index) {
    // título (case-insensitive) seguido opcionalmente de ", N" (nº da seção)
    const re = new RegExp(`${_escRe(_esc(titulo))}(\\s*,\\s*(\\d{1,3}))?`, 'gi');
    html = html.replace(re, (m, _grp, secNum) => {
      casou = true;
      const anchor = secNum ? `#s${secNum}` : '';
      return `<a class="nota-fonte-link" href="/fontes/${slug}/${anchor}" target="_blank" rel="noopener">${m}</a>`;
    });
  }
  return casou ? html : null;
}

/** Primeiro documento hospedado citado na nota → { slug, titulo, sec } ou null. */
export function detectarFonte(texto, index) {
  if (!texto || !index || !index.length) return null;
  for (const { slug, titulo } of index) {
    const m = texto.match(new RegExp(`${_escRe(titulo)}(?:\\s*,\\s*(\\d{1,3}))?`, 'i'));
    if (m) return { slug, titulo, sec: m[1] || null };
  }
  return null;
}

// ── Trechos das seções (para citar no tooltip) ────────────────────────────────
let _trechos = null;
let _trechosPromise = null;

async function carregarTrechos() {
  if (_trechos) return _trechos;
  if (_trechosPromise) return _trechosPromise;
  _trechosPromise = fetch('/data/fontes-trechos.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => { _trechos = d && typeof d === 'object' ? d : {}; return _trechos; })
    .catch(() => { _trechos = {}; return _trechos; });
  return _trechosPromise;
}

/** Trecho da seção citada (truncado em `max` chars, sem cortar palavra). */
export async function trechoFonte(slug, sec, max = 220) {
  if (!slug || !sec) return null;
  const t = await carregarTrechos();
  const txt = t?.[slug]?.[String(sec)];
  if (!txt) return null;
  return txt.length > max ? txt.slice(0, max).replace(/\s+\S*$/, '') + '…' : txt;
}

/** HTML do trecho para o tooltip: rótulo + citação + link "Ler no documento →". */
export async function trechoFonteHtml(fonte, max = 220) {
  const tr = await trechoFonte(fonte.slug, fonte.sec, max);
  if (!tr) return null;
  const rotulo = `${_esc(fonte.titulo)}${fonte.sec ? ', ' + fonte.sec : ''}`;
  const anchor = fonte.sec ? `#s${fonte.sec}` : '';
  return `${rotulo}: «${_esc(tr)}» <a class="nota-tooltip-mais" href="/fontes/${fonte.slug}/${anchor}" target="_blank" rel="noopener">Ler no documento →</a>`;
}

// ── Catecismo Romano (Trento): passagens citadas por "CatRom P, C, N" ────────
let _catrom = null;
let _catromPromise = null;

async function carregarCatRom() {
  if (_catrom) return _catrom;
  if (_catromPromise) return _catromPromise;
  _catromPromise = fetch('/data/catromano.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { _catrom = new Map((d?.passagens || []).map((p) => [p.ref, p])); return _catrom; })
    .catch(() => { _catrom = new Map(); return _catrom; });
  return _catromPromise;
}

const _ROM = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10', XI: '11', XII: '12', XIII: '13' };
const _num = (x) => _ROM[String(x).toUpperCase()] ?? String(x);
const _CATROM = 'CatRom\\s*[.,]?\\s*([IVX0-9]+)[.,\\s]+([IVX0-9]+)[.,\\s]+([IVX0-9]+)';

/**
 * Enriquece o tooltip de uma nota: linka os documentos-fonte citados (Nostra
 * Aetate, Catecismo Romano…) no texto da nota e mostra o trecho/tradução no
 * slot do versículo. Chamado por leitor.js/ui.js. Não bloqueia a renderização.
 */
export async function enriquecerNota(noteText, spanNota, spanVerso) {
  if (!noteText) return;
  const [idx, cr] = await Promise.all([carregarFontes(), carregarCatRom()]);

  // 1) Linkificação: documentos genéricos + Catecismo Romano ("CatRom P,C,N")
  const linkGen = linkificarNota(noteText, idx);
  let base = linkGen ?? _esc(noteText);
  let mudou = linkGen != null;
  base = base.replace(new RegExp(_CATROM, 'gi'), (m, p, c, n) => {
    const pass = cr.get(`${_num(p)},${_num(c)},${_num(n)}`);
    if (!pass) return m;
    mudou = true;
    return `<a class="nota-fonte-link" href="/fontes/catecismo-romano/#${pass.anchor}" target="_blank" rel="noopener">${m}</a>`;
  });
  if (mudou) spanNota.innerHTML = base;

  // 2) Trecho no tooltip: fonte genérica (com seção) OU tradução do Catecismo Romano
  const f = detectarFonte(noteText, idx);
  if (f) { const h = await trechoFonteHtml(f); if (h) spanVerso.innerHTML = h; return; }
  const mcr = noteText.match(new RegExp(_CATROM, 'i'));
  if (mcr) {
    const pass = cr.get(`${_num(mcr[1])},${_num(mcr[2])},${_num(mcr[3])}`);
    if (pass) {
      const t = pass.pt.length > 240 ? pass.pt.slice(0, 240).replace(/\s+\S*$/, '') + '…' : pass.pt;
      spanVerso.innerHTML = `<em>Catecismo Romano (tradução de trabalho):</em> «${_esc(t)}» <a class="nota-tooltip-mais" href="/fontes/catecismo-romano/#${pass.anchor}" target="_blank" rel="noopener">Ler no documento →</a>`;
    }
  }
}

// ── Fechar tooltips fixados (Esc / clique fora) ──────────────────────────────
function _desfixarTodos() {
  document.querySelectorAll('.ref-nota.tooltip-visivel')
    .forEach((el) => el.classList.remove('tooltip-visivel'));
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.ref-nota') || e.target.closest('.nota-tooltip')) return;
    _desfixarTodos();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _desfixarTodos(); });
}
