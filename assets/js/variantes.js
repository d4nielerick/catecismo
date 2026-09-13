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

// ── Proximidade ortográfica ─────────────────────────────────────────────────
// As variantes acima resolvem morfologia (plural/singular), não erro de grafia.
// "magua" não encontra "mágoa" por um caractere, e o Catecismo inteiro tem uma
// única ocorrência dessa palavra — o usuário fica sem nada e sem pista.

let _vocabulario = null; // Map<comprimento, Array<[palavra, frequência]>>

/** Índice do vocabulário do corpus, agrupado por comprimento. Construído uma
 *  vez, sob demanda — os parágrafos já estão em memória, não baixa nada. */
function vocabularioDe(paragrafos) {
  if (_vocabulario) return _vocabulario;

  const freq = new Map();
  for (const p of paragrafos) {
    for (const w of norm(p.texto || '').split(/[^a-z0-9]+/)) {
      if (w.length >= 4) freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  _vocabulario = new Map();
  for (const [palavra, n] of freq) {
    const balde = _vocabulario.get(palavra.length);
    if (balde) balde.push([palavra, n]);
    else _vocabulario.set(palavra.length, [[palavra, n]]);
  }
  return _vocabulario;
}

/** Distância de Levenshtein com corte: devolve `max + 1` assim que passar. */
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      if (atual[j] < menor) menor = atual[j];
    }
    if (menor > max) return max + 1; // nenhuma célula da linha salva mais
    anterior = atual;
  }
  return anterior[b.length];
}

/**
 * Palavras do corpus graficamente próximas da query, mais frequentes primeiro.
 * Só para busca de uma palavra — em frase, o ruído passa a compensar pouco.
 * @returns {string[]} até 3 candidatos
 */
export function sugerirPorGrafia(query, paragrafos) {
  const partes = query.trim().split(/\s+/);
  if (partes.length !== 1) return [];

  const w = norm(partes[0]);
  if (w.length < 4) return [];

  // Palavra longa tolera dois erros; curta, só um (senão vira outra palavra).
  const max = w.length >= 8 ? 2 : 1;
  const vocab = vocabularioDe(paragrafos);

  const candidatos = [];
  for (let len = w.length - max; len <= w.length + max; len++) {
    for (const [palavra, n] of vocab.get(len) || []) {
      if (palavra === w) return []; // a palavra existe: o problema não é grafia
      // Erro de digitação quase nunca troca o começo da palavra. Sem esta
      // trava, "magua" sugere "agua" (distância 1) — pior que não sugerir.
      if (palavra[0] !== w[0] || palavra[1] !== w[1]) continue;
      const d = distancia(w, palavra, max);
      if (d <= max) candidatos.push({ palavra, n, d });
    }
  }

  candidatos.sort((a, b) => a.d - b.d || b.n - a.n);
  return candidatos.slice(0, 3).map(c => c.palavra);
}
