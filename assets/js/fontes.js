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
