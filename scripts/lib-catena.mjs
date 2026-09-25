/**
 * scripts/lib-catena.mjs — o que os scripts da Catena Aurea têm em comum: ler a referência do
 * Evangelho do dia e achar as lectiones (perícopes) da Catena que a cobrem.
 */
import fs from 'node:fs';
import path from 'node:path';

/** "Lc 9,43b-45" → { ev: 'Lc', cap: '9', versos: [43,44,45], parcialInicio: 43 }; "Mt 18,1-5.10" → 1..5 e 10.
 *  `parcialInicio`/`parcialFim` marcam versículo que entra só em parte ("43b", "5a"). */
export function refDe(ref) {
  const m = (ref || '').match(/^(\w+)\s+(\d+),([\d\w.\-]+)/);
  if (!m) return null;
  const versos = [];
  let parcialInicio = null, parcialFim = null;
  for (const parte of m[3].split('.')) {
    const q = parte.match(/^(\d+)([a-z]?)(?:-(\d+)([a-z]?))?$/);
    if (!q) continue;
    const a = +q[1], b = q[3] ? +q[3] : a;
    for (let v = a; v <= b; v++) versos.push(v);
    if (q[2] && q[2] !== 'a' && versos[0] === a) parcialInicio = a;   // "43b": o começo do versículo é da perícope anterior
    if (q[4] === 'a' || (!q[3] && q[2] === 'a')) parcialFim = b;         // "5a": o fim do versículo é da seguinte
  }
  return { ev: m[1], cap: m[2], versos, parcialInicio, parcialFim };
}

/** Lectiones do capítulo cujo intervalo cruza o do dia. Uma lectio que só toca o trecho no
 *  versículo partido (termina no "43" de "43b", ou começa no "5" de "5a") é a perícope vizinha, não
 *  a do dia. */
export function lectionesDoDia(capitulo, alvo) {
  return (capitulo || []).filter(l => {
    if (!l.versos) return false;
    const [a, b] = l.versos;
    const comum = alvo.versos.filter(v => v >= a && v <= b);
    if (!comum.length) return false;
    if (comum.length === 1 && comum[0] === alvo.parcialInicio && b === alvo.parcialInicio && a < b) return false;
    if (comum.length === 1 && comum[0] === alvo.parcialFim && a === alvo.parcialFim && b > a) return false;
    return true;
  });
}

export const arquivoDaCatena = (dados, alvo) => path.join(dados, 'catena', alvo.ev, `${alvo.cap.padStart(2, '0')}.json`);

/** O Evangelho principal do dia (sem alternativas) e sua referência decomposta, ou null. */
export function evangelhoDoDia(dados, dt) {
  const arq = path.join(dados, 'liturgia', `${dt}.json`);
  if (!fs.existsSync(arq)) return null;
  const dia = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const evangelho = dia.missas[0].leituras.find(l => l.tipo === 'evangelho' && !l.alternativa);
  const alvo = evangelho && refDe(evangelho.referencia);
  return alvo ? { dia, evangelho, alvo } : { dia, evangelho, alvo: null };
}

/** Lista de dias a partir de "AAAA-MM-DD" e "+N". */
export function diasDesde(de, n) {
  const d0 = new Date(`${de}T12:00:00Z`);
  return Array.from({ length: n }, (_, k) => { const d = new Date(d0); d.setUTCDate(d0.getUTCDate() + k); return d.toISOString().slice(0, 10); });
}
