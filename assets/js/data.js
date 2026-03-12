/**
 * data.js
 * Carrega catecismo.json uma única vez e expõe o array de parágrafos
 * normalizados para o motor de busca.
 *
 * Exporta:
 *   carregarDados() → Promise<Paragrafo[]>
 *
 * Tipo Paragrafo:
 *   { numero: number, texto: string, parte: string,
 *     secao: string, capitulo: string, artigo: string }
 */

// Caminhos relativos ao módulo — funciona em qualquer base URL
const DATA_URL  = new URL('../../data/catecismo.json', import.meta.url).href;
const NOTAS_URL = new URL('../../data/notas.json',     import.meta.url).href;

let _cache      = null;
let _notasCache = null;

/**
 * Retorna o array de parágrafos. Na primeira chamada faz fetch() e constrói
 * o cache; chamadas subsequentes retornam o resultado já em memória.
 *
 * @returns {Promise<Array<{numero:number, texto:string, parte:string, secao:string, capitulo:string, artigo:string}>>}
 */
export async function carregarDados() {
  if (_cache) return _cache;

  const resp = await fetch(DATA_URL);
  if (!resp.ok) {
    throw new Error(`Falha ao carregar dados: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();

  if (!Array.isArray(json.paragrafos)) {
    throw new Error('Formato inesperado: campo "paragrafos" não encontrado.');
  }

  _cache = json.paragrafos;
  return _cache;
}

/**
 * Retorna um parágrafo pelo número, ou null se não encontrado.
 * Requer que carregarDados() já tenha sido chamado.
 *
 * @param {number} numero
 * @returns {object|null}
 */
export function buscarPorNumero(numero) {
  if (!_cache) return null;
  return _cache.find(p => p.numero === numero) ?? null;
}

/**
 * Carrega o mapa de notas de rodapé (notas.json).
 * Retorna { [paraNum]: { [noteRef]: noteText } }
 *
 * @returns {Promise<Object>}
 */
export async function carregarNotas() {
  if (_notasCache) return _notasCache;
  try {
    const resp = await fetch(NOTAS_URL);
    if (!resp.ok) return {};
    _notasCache = await resp.json();
  } catch {
    _notasCache = {};
  }
  return _notasCache;
}

/**
 * Retorna as notas do parágrafo N, ou null.
 * @param {number} numero
 * @returns {Object|null}
 */
export function notasDoParagrafo(numero) {
  if (!_notasCache) return null;
  return _notasCache[String(numero)] ?? null;
}
