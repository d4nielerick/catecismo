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
