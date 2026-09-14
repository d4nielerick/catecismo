/**
 * api/_guardas.mjs — verificação determinística da resposta do modelo.
 *
 * O prompt pede que cada frase termine com o § que a sustenta. Aqui isso é
 * cobrado, sem IA:
 *   - frase sem citação sai;
 *   - citação a § que não foi enviado sai;
 *   - frase cujas palavras não estão no § citado sai (sustentação baixa).
 *
 * Sustentação = fração dos radicais de conteúdo da frase que aparecem no texto
 * dos §§ que ela cita. O modelo parafraseia pouco quando instruído a ficar
 * perto do texto, então resposta fiel fica alta e frase inventada fica baixa.
 * O corte foi calibrado com respostas reais — ver scripts/calibra-guardas.mjs.
 */

import { termos, textoDoParagrafo } from './_recuperar.mjs';

export const SUSTENTACAO_MINIMA = 0.5;

// Radicais comparados por prefixo de 5: "confessar"/"confessor" contam juntos,
// e o corte do radical em 6 letras não vira falso negativo.
const pref = (r) => r.slice(0, 5);

const _radicaisDoParagrafo = new Map();
function prefixosDe(numero) {
  if (!_radicaisDoParagrafo.has(numero)) {
    _radicaisDoParagrafo.set(numero, new Set(termos(textoDoParagrafo(numero) || '').map(pref)));
  }
  return _radicaisDoParagrafo.get(numero);
}

/** Fração dos radicais da frase presentes nos §§ citados (0..1). */
export function sustentacao(frase, numeros) {
  const rs = [...new Set(termos(frase).map(pref))];
  if (!rs.length) return 0;
  const doc = new Set();
  for (const n of numeros) for (const p of prefixosDe(n)) doc.add(p);
  return rs.filter((r) => doc.has(r)).length / rs.length;
}

/**
 * Divide o texto do modelo em frases com suas citações. Aceita "frase [§1]."
 * e "frase. [§1]"; o que vier depois da última citação não tem citação.
 */
export function frasesComCitacao(texto) {
  const frases = [];
  const re = /([^[]+?)((?:\s*\[§\s*\d+\])+)\s*\.?/g;
  let fim = 0;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const corpo = m[1].replace(/^[\s.]+/, '').trim();
    const numeros = [...m[2].matchAll(/\d+/g)].map((x) => Number(x[0]));
    if (corpo) frases.push({ corpo, numeros });
    fim = re.lastIndex;
  }
  const resto = texto.slice(fim).trim();
  if (resto.replace(/[\s.]/g, '')) frases.push({ corpo: resto, numeros: [] });
  return frases;
}

/**
 * Aplica as três travas. Devolve só o que se sustenta.
 * @returns {{ texto: string, citados: number[], removidas: object[] }}
 */
export function filtrarResposta(textoModelo, enviados) {
  const permitidos = new Set(enviados);
  const mantidas = [];
  const removidas = [];

  for (const { corpo, numeros } of frasesComCitacao(textoModelo.replace(/\*\*/g, ''))) {
    const validos = [...new Set(numeros.filter((n) => permitidos.has(n)))];
    if (!validos.length) { removidas.push({ corpo, motivo: 'sem citação válida' }); continue; }
    const s = sustentacao(corpo, validos);
    if (s < SUSTENTACAO_MINIMA) { removidas.push({ corpo, motivo: `sustentação ${s.toFixed(2)}` }); continue; }
    mantidas.push({ corpo: corpo.replace(/[.;,\s]+$/, ''), validos });
  }

  const citados = [...new Set(mantidas.flatMap((f) => f.validos))];
  const texto = mantidas
    .map(({ corpo, validos }) => `${corpo} ${validos.map((n) => `[§${n}]`).join('')}.`)
    .join(' ');
  return { texto, citados, removidas };
}
