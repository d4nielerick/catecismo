/**
 * scripts/lib-grafia.mjs — lógica compartilhada da adaptação ortográfica
 * pt-PT → pt-BR. Usada por aplica-grafia.mjs (aplicação) e
 * verifica-integridade.mjs (reconstrução determinística para o CI).
 */
const L = 'a-záéíóúâêôãõàçü';
const LU = `${L}A-ZÁÉÍÓÚÂÊÔÃÕÀÇÜ`;

const capitaliza = (w) => w[0].toUpperCase() + w.slice(1);

/** Aplica pares palavra-inteira preservando caixa. Retorna contagens por par. */
export function aplicaPares(paragrafos, pares) {
  const contagem = new Map();
  for (const p of paragrafos) {
    let t = p.texto;
    for (const { de, para } of pares) {
      const re = new RegExp(`(?<![${LU}-])(${de}|${capitaliza(de)}|${de.toUpperCase()})(?![${LU}-])`, 'g');
      t = t.replace(re, (m) => {
        contagem.set(de, (contagem.get(de) || 0) + 1);
        if (m === de) return para;
        if (m === de.toUpperCase()) return para.toUpperCase();
        return capitaliza(para);
      });
    }
    p.texto = t;
  }
  return contagem;
}

/** Aplica ajustes por ocorrência (escopados por §). Exige exatamente 1 ocorrência. */
export function aplicaAjustes(paragrafos, ajustes) {
  const porNumero = new Map(paragrafos.map(p => [p.numero, p]));
  for (const a of ajustes) {
    const p = porNumero.get(a.numero);
    if (!p) throw new Error(`ajuste §${a.numero}: parágrafo inexistente`);
    const n = p.texto.split(a.de).length - 1;
    if (n !== 1) throw new Error(`ajuste §${a.numero} "${a.de}": ${n} ocorrências (esperava 1)`);
    p.texto = p.texto.replace(a.de, a.para);
  }
}

/** Extrai o conjunto de palavras únicas (minúsculas) de uma lista de §§. */
export function vocabulario(paragrafos) {
  const re = new RegExp(`[${L}-]+`, 'g');
  const s = new Set();
  for (const p of paragrafos) for (const w of (p.texto.toLowerCase().match(re) || [])) s.add(w);
  return s;
}
