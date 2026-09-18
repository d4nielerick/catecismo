/**
 * biblia-refs.js — parser (puro, sem DOM) de referências bíblicas nas notas do
 * Catecismo. Extrai TODAS as referências de uma nota, tratando:
 *  - abreviações do Vaticano → canônicas dos arquivos data/biblia/ (Act→At, 1Pe→1Pd…)
 *  - livro colado ao número por OCR ("Act2, 42" → At 2,42)
 *  - intervalos ("19-20"), listas ("15, 17") e múltiplas refs (";")
 *  - reuso do último livro quando a ref seguinte só tem "cap, versos"
 * "Cf." (confer) é ruído e é ignorado. Testável em Node (sem document).
 */

// Abreviação da nota → abreviação canônica do arquivo (data/biblia/<abrev>.json).
export const ABREV = {
  Act: 'At', Heb: 'Hb', Jn: 'Jo', Job: 'Jó', Rom: 'Rm', SI: 'Sl', Ec: 'Ecl',
  '1Pe': '1Pd', '2Pe': '2Pd', Eclo: 'Sir', Ecli: 'Sir', Sre: 'Sir',
  Prov: 'Pr', Gen: 'Gn', Mat: 'Mt', Marc: 'Mc', Luc: 'Lc', Ioan: 'Jo',
  Apoc: 'Ap', Ps: 'Sl', Sap: 'Sb',
};

// Abreviações canônicas válidas (nomes de arquivo em data/biblia/).
export const CANON = new Set([
  '1Cor','1Cr','1Jo','1Mac','1Pd','1Rs','1Sm','1Tm','1Ts','2Cor','2Cr','2Jo','2Mac','2Pd',
  '2Rs','2Sm','2Tm','2Ts','3Jo','Ab','Ag','Am','Ap','At','Bar','Cl','Ct','Dn','Dt','Ecl',
  'Ef','Esd','Est','Ex','Ez','Fl','Fm','Gl','Gn','Hab','Hb','Is','Jd','Jl','Jo','Jon','Jr',
  'Js','Jt','Jz','Jó','Lc','Lm','Lv','Mc','Ml','Mq','Mt','Na','Ne','Nm','Os','Pr','Rm','Rt',
  'Sb','Sf','Sir','Sl','Tb','Tg','Tt','Zc',
]);

/** Normaliza a abreviação bruta ("1 Cor", "Act", "1Pe") → canônica ou null. */
export function normalizarLivro(raw) {
  if (!raw) return null;
  const limpo = raw.replace(/\s+/g, '').replace(/\.$/, '');
  const cap = ABREV[limpo] ?? limpo;
  return CANON.has(cap) ? cap : null;
}

/**
 * As notas do Catecismo citam os Salmos pela numeração hebraica; a Bíblia
 * Ave-Maria de data/biblia/Sl.json usa a da Vulgata. Sem converter, "Sl 22, 2"
 * (por que me abandonaste?) abria o Salmo 22 da Vulgata — "O Senhor é meu
 * pastor". Conferido verso a verso contra Sl.json: 51,3→50,3 · 23,1→22,1 ·
 * 22,2→21,2 · 10,1→9,22 · 115,1→113,9 · 116,10→115,1 · 147,12→147,1.
 * @returns {{ cap: number, verso: number }}
 */
export function salmoParaVulgata(cap, verso) {
  const c = Number(cap);
  const v = Number(verso);
  if (c <= 9 || c >= 148) return { cap: c, verso: v };
  if (c === 10) return { cap: 9, verso: v + 21 };       // Vulg 9 = hebr 9 (21 vv) + 10
  if (c <= 113) return { cap: c - 1, verso: v };
  if (c === 114) return { cap: 113, verso: v };
  if (c === 115) return { cap: 113, verso: v + 8 };     // Vulg 113 = hebr 114 (8 vv) + 115
  if (c === 116) return v <= 9 ? { cap: 114, verso: v } : { cap: 115, verso: v - 9 };
  if (c <= 146) return { cap: c - 1, verso: v };
  return v <= 11 ? { cap: 146, verso: v } : { cap: 147, verso: v - 11 }; // hebr 147
}

/** "15, 17-18" → [15,17,18]. Intervalos longos (>12) reduzem ao início (evita
 *  explodir cross-chapter tipo "1-22, 5"). */
export function expandirVersos(spec) {
  const out = [];
  for (const parte of spec.split(',')) {
    const m = parte.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (b >= a && b - a <= 12) for (let v = a; v <= b; v++) out.push(v);
    else out.push(a);
  }
  return out;
}

// livro opcional (com dígito e espaço opcionais) + capítulo + vírgula + versos
const REF_RE = /(?:([1-4]?\s?[A-Za-zÀ-ÿ]{1,4})\s*)?(\d+)\s*,\s*(\d[\d,\s-]*)/g;

/** Extrai as referências de um texto de nota. Retorna [{abrev, cap, versos, ref}]. */
export function extrairReferencias(textoNota) {
  if (!textoNota) return [];
  // remove "Cf."/"cf." e insere espaço entre letra e dígito colados
  const t = textoNota.replace(/\bCf\.?/gi, ' ').replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2');
  const refs = [];
  let ultimoLivro = null;
  for (const seg of t.split(';')) {
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(seg)) !== null) {
      const abrev = normalizarLivro(m[1]) ?? ultimoLivro;
      if (!abrev) continue;
      ultimoLivro = abrev;
      const versos = expandirVersos(m[3]);
      if (!versos.length) continue;
      refs.push({ abrev, cap: m[2], versos });
    }
  }
  return refs;
}
