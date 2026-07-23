/**
 * scripts/lib-html.mjs — helpers de HTML compartilhados (decodificação de
 * entidades, remoção de tags, normalização de espaços). Mesma lógica embutida
 * em scrape-cic-vaticano.mjs, extraída para reuso pelo pipeline de notas
 * (scrape-notas-vaticano.mjs / build-notas.mjs).
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  shy: '',
  Aacute: 'Á', aacute: 'á', Acirc: 'Â', acirc: 'â', Agrave: 'À', agrave: 'à',
  Atilde: 'Ã', atilde: 'ã', Auml: 'Ä', auml: 'ä', Aring: 'Å', aring: 'å',
  AElig: 'Æ', aelig: 'æ', Ccedil: 'Ç', ccedil: 'ç',
  Eacute: 'É', eacute: 'é', Ecirc: 'Ê', ecirc: 'ê', Egrave: 'È', egrave: 'è',
  Euml: 'Ë', euml: 'ë', Iacute: 'Í', iacute: 'í', Icirc: 'Î', icirc: 'î',
  Igrave: 'Ì', igrave: 'ì', Iuml: 'Ï', iuml: 'ï', Ntilde: 'Ñ', ntilde: 'ñ',
  Oacute: 'Ó', oacute: 'ó', Ocirc: 'Ô', ocirc: 'ô', Ograve: 'Ò', ograve: 'ò',
  Otilde: 'Õ', otilde: 'õ', Ouml: 'Ö', ouml: 'ö', Oslash: 'Ø', oslash: 'ø',
  Uacute: 'Ú', uacute: 'ú', Ucirc: 'Û', ucirc: 'û', Ugrave: 'Ù', ugrave: 'ù',
  Uuml: 'Ü', uuml: 'ü', Yacute: 'Ý', yacute: 'ý',
  ordf: 'ª', ordm: 'º', deg: '°', sect: '§', para: '¶', middot: '·',
  laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m);
}

export function stripTags(str) {
  return str.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
}

export function normalizeSpaces(str) {
  return str.replace(/\s+/g, ' ').trim();
}

/** Extrai os marcadores de nota "(N)" de um texto de parágrafo (1–3 dígitos;
 *  exclui anos de 4 dígitos, como faz ui.js:972). Retorna array de números. */
export function marcadoresDeNota(texto) {
  return [...texto.matchAll(/\((\d{1,3})\)/g)].map((m) => m[1]);
}
