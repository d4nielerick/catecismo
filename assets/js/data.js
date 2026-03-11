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

// Caminho relativo ao módulo — funciona em qualquer base URL (localhost, GitHub Pages, etc.)
const DATA_URL = new URL('../../data/catecismo.json', import.meta.url).href;

let _cache = null;

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
 * Requer que carregarDados() já tenha sido chamado (i.e., cache populado).
 *
 * @param {number} numero
 * @returns {{numero:number, texto:string, parte:string, secao:string, capitulo:string, artigo:string}|null}
 */
export function buscarPorNumero(numero) {
  if (!_cache) return null;
  return _cache.find(p => p.numero === numero) ?? null;
}
