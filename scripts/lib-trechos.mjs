/**
 * scripts/lib-trechos.mjs — regras dos trechos dos cards de compartilhar (data/liturgia-trechos/).
 *
 * Usada por grava-trechos.mjs (antes de gravar) e por verifica-liturgia.mjs (no CI): as duas
 * pontas conferem do mesmo jeito.
 */
import { referenciasDoDia } from '../liturgiadiaria/render.mjs';

export const TRECHO_MAX_PALAVRAS = 35;

/** O texto da leitura como a página mostra: sem números de versículo, sem marcas do salmo
 *  (R., V., *, †), espaços únicos, minúsculo. */
export const textoPlano = t => t.split('\n')
  .filter(l => !/^(\d+[a-z]?|\d+,\d+[a-z]?|[a-z]|R\.?|V\.)$/.test(l.trim()))
  .join(' ').replace(/[*†]/g, '').replace(/\s+/g, ' ').toLowerCase();

/** Problemas de um arquivo de trechos em relação ao dia (lista vazia = ok). */
export function conferirTrechos(t, dia, idsDoAcervo = null) {
  const erros = [];
  if (t.leituras !== referenciasDoDia(dia)) erros.push('as leituras do dia mudaram (refaça os trechos)');
  const porRef = new Map(dia.missas[0].leituras.map(l => [l.referencia, l]));
  for (const [ref, trecho] of Object.entries(t.trechos || {})) {
    const leitura = porRef.get(ref);
    if (!leitura) { erros.push(`"${ref}" não é leitura do dia`); continue; }
    const n = trecho.trim().split(/\s+/).length;
    if (n > TRECHO_MAX_PALAVRAS) erros.push(`${ref}: ${n} palavras (máx. ${TRECHO_MAX_PALAVRAS})`);
    if (!textoPlano(leitura.texto).includes(trecho.replace(/\s+/g, ' ').trim().toLowerCase())) {
      erros.push(`${ref}: o trecho não está, palavra por palavra, na leitura`);
    }
  }
  if (idsDoAcervo) {
    for (const [ref, id] of Object.entries(t.imagens || {})) {
      if (!idsDoAcervo.has(id)) erros.push(`${ref}: pintura "${id}" não existe no acervo`);
    }
  }
  return erros;
}
