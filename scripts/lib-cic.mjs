/**
 * scripts/lib-cic.mjs — o Catecismo visto pelas notas: a frase em que uma nota aparece e os Padres
 * da Catena que as notas citam. Usado por liga-evangelho, grava-curadoria e padres-no-catecismo.
 */

/** A frase do § em que a nota (marcador "(N)") aparece — é o que o Catecismo faz com o que cita,
 *  não a abertura do parágrafo. Sai sem os marcadores de nota. */
export function fraseDaNota(texto, marcador) {
  const t = texto.replace(/\s+/g, ' ').trim();
  const pos = t.indexOf(`(${marcador})`);
  if (pos < 0) return null;
  const antes = t.slice(0, pos);
  const ini = Math.max(antes.lastIndexOf('. '), antes.lastIndexOf('! '), antes.lastIndexOf('? '));
  const depois = t.slice(pos);
  const fimRel = depois.search(/[.!?](?=\s|$)/);
  const fim = fimRel < 0 ? t.length : pos + fimRel + 1;
  return t.slice(ini < 0 ? 0 : ini + 2, fim).replace(/\s*\(\d+\)/g, '').replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** Como as notas do Catecismo escrevem cada Padre da Catena (chave = autor da Catena). Só os que
 *  o Catecismo cita; o nome tem de casar sem ambiguidade (São Cirilo de Jerusalém não é o Cirilo
 *  de Alexandria da Catena, nem Gregório de Nissa o Magno). */
export const PADRE_NA_NOTA = {
  Augustinus: /Santo Agostinho/, Chrysostomus: /Cris[óo]stomo/, Ambrosius: /Santo Ambr[óo]sio/,
  Gregorius: /Greg[óo]rio Magno/, 'Gregorius Moralium': /Greg[óo]rio Magno/, Hieronymus: /Jer[óoô]nimo/,
  Origenes: /Or[íi]genes/, Hilarius: /Hil[áa]rio/, Basilius: /Bas[íi]lio/, Cyrillus: /Cirilo de Alexandria/,
  'Gregorius Nyssenus': /Greg[óo]rio de Nissa/, Damascenus: /Damasceno/, Athanasius: /Atan[áa]sio/,
  'Gregorius Nazianzenus': /Nazian/,
};

/** As notas que citam o Padre: [{ numero, marcador, nota, frase }]. */
export function citacoesDoPadre(autor, notas, paragrafos) {
  const re = PADRE_NA_NOTA[autor];
  if (!re) return [];
  const saida = [];
  for (const [par, ns] of Object.entries(notas)) for (const [marcador, nota] of Object.entries(ns)) {
    if (!re.test(nota)) continue;
    const frase = fraseDaNota(paragrafos.get(+par) || '', marcador);
    if (frase) saida.push({ numero: +par, marcador, nota, frase });
  }
  return saida;
}
