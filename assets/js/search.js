/**
 * search.js
 * Motor de busca do Catecismo — 100% client-side, zero dependências.
 *
 * API pública:
 *   buscar(query, paragrafos)  → ResultadoAgrupado[]
 *   destacar(texto, query)     → string  (HTML com <mark>)
 *
 * Tipo ResultadoAgrupado:
 *   { parte, secoes: [ { secao, capitulos: [ { capitulo, artigos: [ { artigo, paragrafos: Paragrafo[] } ] } ] } ] }
 */

// ── Normalização ──────────────────────────────────────────────────────────────

/**
 * Remove acentos e converte para minúsculas para comparação.
 * @param {string} s
 * @returns {string}
 */
function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ── Busca ────────────────────────────────────────────────────────────────────

const MAX_RENDERIZADOS = 200; // limite de itens renderizados no painel esquerdo

/**
 * Retorna true se `haystack` (normalizado) contém `needle` como palavra
 * ou início de palavra — mas nunca como sufixo de outra palavra.
 * Ex: "oracao" bate em "oracao", "oracoes", mas NÃO em "coracao".
 */
function contemPalavra(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  // O caractere imediatamente anterior não pode ser uma letra
  if (idx > 0 && /[a-z]/.test(haystack[idx - 1])) return false;
  return true;
}

/**
 * Filtra parágrafos que contêm a query em texto, artigo ou capítulo.
 * Retorna { total, paragrafos } onde `paragrafos` está limitado a MAX_RENDERIZADOS.
 *
 * @param {string} query
 * @param {Array} paragrafos  array completo em memória
 * @returns {{ total: number, paragrafos: Array }}
 */
export function buscar(query, paragrafos) {
  const q = normalizar(query.trim());

  if (q.length < 2) return { total: 0, paragrafos: [] };

  const encontrados = paragrafos.filter(p =>
    contemPalavra(normalizar(p.texto),    q) ||
    contemPalavra(normalizar(p.artigo),   q) ||
    contemPalavra(normalizar(p.capitulo), q)
  );

  return {
    total: encontrados.length,
    paragrafos: encontrados.slice(0, MAX_RENDERIZADOS),
  };
}

// ── Agrupamento ───────────────────────────────────────────────────────────────

/**
 * Agrupa um array de parágrafos na hierarquia:
 *   Parte → Seção → Capítulo → Artigo → Parágrafos
 *
 * @param {Array} paragrafos
 * @returns {Array<ResultadoAgrupado>}
 */
export function agrupar(paragrafos) {
  const parteMap = new Map();

  for (const p of paragrafos) {
    // ── Parte ──
    if (!parteMap.has(p.parte)) {
      parteMap.set(p.parte, { parte: p.parte, secoes: new Map() });
    }
    const parteObj = parteMap.get(p.parte);

    // ── Seção ──
    const secaoKey = p.secao || '';
    if (!parteObj.secoes.has(secaoKey)) {
      parteObj.secoes.set(secaoKey, { secao: secaoKey, capitulos: new Map() });
    }
    const secaoObj = parteObj.secoes.get(secaoKey);

    // ── Capítulo ──
    const capKey = p.capitulo || '';
    if (!secaoObj.capitulos.has(capKey)) {
      secaoObj.capitulos.set(capKey, { capitulo: capKey, artigos: new Map() });
    }
    const capObj = secaoObj.capitulos.get(capKey);

    // ── Artigo ──
    const artKey = p.artigo || '';
    if (!capObj.artigos.has(artKey)) {
      capObj.artigos.set(artKey, { artigo: artKey, paragrafos: [] });
    }
    capObj.artigos.get(artKey).paragrafos.push(p);
  }

  // Converter Maps para Arrays para facilitar renderização
  return [...parteMap.values()].map(parte => ({
    parte: parte.parte,
    secoes: [...parte.secoes.values()].map(secao => ({
      secao: secao.secao,
      capitulos: [...secao.capitulos.values()].map(cap => ({
        capitulo: cap.capitulo,
        artigos: [...cap.artigos.values()],
      })),
    })),
  }));
}

// ── Highlight ────────────────────────────────────────────────────────────────

/**
 * Envolve todas as ocorrências de `query` em `texto` com <mark>.
 * Seguro contra XSS: faz escape do texto antes de injetar as tags.
 *
 * @param {string} texto
 * @param {string} query
 * @returns {string}  HTML seguro
 */
export function destacar(texto, query) {
  // Escape de caracteres HTML
  const escaped = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const q = query.trim();
  if (!q) return escaped;

  // Regex que normaliza acentos ao fazer o match não é possível nativamente;
  // usamos a versão normalizada para encontrar posições e recortamos o original.
  const textoNorm  = normalizar(texto);
  const queryNorm  = normalizar(q);
  const queryEsc   = queryNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re         = new RegExp(queryEsc, 'gi');

  let resultado = '';
  let posOrig   = 0;
  let match;

  while ((match = re.exec(textoNorm)) !== null) {
    const start = match.index;
    const end   = start + match[0].length;

    // Texto antes do match (escapado)
    resultado += escape(texto.slice(posOrig, start));
    // Trecho original dentro do <mark> (escapado)
    resultado += `<mark>${escape(texto.slice(start, end))}</mark>`;
    posOrig = end;
  }

  resultado += escape(texto.slice(posOrig));
  return resultado;
}

/** Escapa apenas os caracteres HTML necessários (uso interno). */
function escape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Trecho de prévia ─────────────────────────────────────────────────────────

/**
 * Recorta um trecho curto do texto em volta da primeira ocorrência da query,
 * para exibição na lista de resultados.
 *
 * @param {string} texto
 * @param {string} query
 * @param {number} [janelaChars=160]
 * @returns {string}  HTML com <mark>
 */
export function trecho(texto, query, janelaChars = 160) {
  const textoNorm = normalizar(texto);
  const queryNorm = normalizar(query.trim());
  const idx       = textoNorm.indexOf(queryNorm);

  if (idx === -1) return destacar(texto.slice(0, janelaChars), query);

  const inicio = Math.max(0, idx - Math.floor(janelaChars / 2));
  const fim    = Math.min(texto.length, inicio + janelaChars);
  const prefixo = inicio > 0 ? '…' : '';
  const sufixo  = fim < texto.length ? '…' : '';

  return prefixo + destacar(texto.slice(inicio, fim), query) + sufixo;
}
