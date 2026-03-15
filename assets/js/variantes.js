/**
 * variantes.js — gera variações morfológicas de uma palavra em português.
 * Usado para sugerir alternativas quando a busca retorna poucos/nenhum resultado.
 *
 * Nota: contemPalavra() usa prefix-match, portanto "animal" já encontra "animais".
 * A sugestão é necessária principalmente na direção plural→singular e formas irregulares.
 */

function norm(s = '') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Dado um termo de busca, retorna variantes normalizadas (sem acentos).
 * Funciona apenas para buscas de uma única palavra.
 * @param {string} query
 * @returns {string[]}
 */
export function gerarVariantes(query) {
  const partes = query.trim().split(/\s+/);
  if (partes.length !== 1) return [];

  const w = norm(partes[0]);
  if (w.length < 3) return [];

  const vs = new Set();

  // ── plural → singular ────────────────────────────────────────────────────
  if (w.endsWith('ais') && w.length > 4)  vs.add(w.slice(0, -3) + 'al');  // animais → animal
  if (w.endsWith('eis') && w.length > 4)  vs.add(w.slice(0, -3) + 'el');  // fieis   → fiel
  if (w.endsWith('ois') && w.length > 4)  vs.add(w.slice(0, -3) + 'ol');  // anzois  → anzol
  if (w.endsWith('uis') && w.length > 4)  vs.add(w.slice(0, -3) + 'ul');
  if (w.endsWith('oes') && w.length > 4)  vs.add(w.slice(0, -3) + 'ao');  // oracoes → oracao
  if (w.endsWith('aes') && w.length > 4)  vs.add(w.slice(0, -3) + 'ao');  // maes    → mao
  if (w.endsWith('ns')  && w.length > 3)  vs.add(w.slice(0, -2) + 'm');   // bens    → bem
  if (w.endsWith('es')  && w.length > 4
    && !w.endsWith('aes') && !w.endsWith('oes'))
                                           vs.add(w.slice(0, -2));          // luzes   → luz
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4)
                                           vs.add(w.slice(0, -1));          // livros  → livro

  // ── singular → plural ────────────────────────────────────────────────────
  if (w.endsWith('al') && w.length > 3)   vs.add(w.slice(0, -2) + 'ais'); // animal  → animais
  if (w.endsWith('el') && w.length > 3)   vs.add(w.slice(0, -2) + 'eis'); // fiel    → fieis
  if (w.endsWith('ol') && w.length > 3)   vs.add(w.slice(0, -2) + 'ois');
  if (w.endsWith('ul') && w.length > 3)   vs.add(w.slice(0, -2) + 'uis');
  if (w.endsWith('ao') && w.length > 3) {
    vs.add(w.slice(0, -2) + 'oes');                                         // oracao  → oracoes
    vs.add(w + 's');                                                         // mao     → maos
  }
  if (w.endsWith('m')  && w.length > 3)   vs.add(w.slice(0, -1) + 'ns');  // bem     → bens
  if ((w.endsWith('r') || w.endsWith('z')) && w.length > 3)
                                           vs.add(w + 'es');                // luz     → luzes
  if (!w.endsWith('s'))                   vs.add(w + 's');                 // livro   → livros

  return [...vs].filter(v => v !== w && v.length >= 3);
}
