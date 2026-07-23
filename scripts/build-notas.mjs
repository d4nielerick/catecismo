/**
 * scripts/build-notas.mjs — monta data/notas.json a partir de
 * data/fonte-notas-vaticano.json (notas por arquivo) + os marcadores "(N)" no
 * texto de data/catecismo.json.
 *
 * Numeração das notas é contínua POR ARQUIVO (capítulo do CIC). Para cada
 * arquivo (intervalo §a–§b vindo do nome), a nota N é atribuída ao § de [a,b]
 * cujo texto contém o marcador "(N)". Resultado no shape que o front consome:
 * { "§": { "marcador": "texto" } } (assets/js/data.js:notasDoParagrafo).
 *
 * Exporta buildNotas() para reuso por verifica-notas.mjs. Rodar direto grava
 * data/notas.json e imprime a cobertura.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { marcadoresDeNota } from './lib-html.mjs';

const rangeDoArquivo = (nome) => {
  const m = nome.match(/(\d+)-(\d+)_po\.html$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
};

/** Reconstrói o mapa de notas. Determinístico: mesmas entradas → mesma saída. */
export function buildNotas(fonte, cat) {
  const texto = new Map(cat.paragrafos.map((p) => [p.numero, p.texto]));
  const notas = {};
  let totMarcadores = 0, resolvidos = 0;
  const marcadoresSemNota = [], notasOrfas = [];

  for (const [arquivo, notasArq] of Object.entries(fonte)) {
    const rng = rangeDoArquivo(arquivo);
    if (!rng) continue;
    const [a, b] = rng;
    const usadas = new Set();
    for (let n = a; n <= b; n++) {
      const t = texto.get(n);
      if (!t) continue;
      for (const M of marcadoresDeNota(t)) {
        totMarcadores++;
        if (notasArq[M]) {
          (notas[n] ??= {})[M] = notasArq[M];
          usadas.add(M);
          resolvidos++;
        } else {
          marcadoresSemNota.push(`§${n}(${M})`);
        }
      }
    }
    for (const N of Object.keys(notasArq)) if (!usadas.has(N)) notasOrfas.push(`${arquivo}#${N}`);
  }
  return { notas, stats: { totMarcadores, resolvidos, marcadoresSemNota, notasOrfas } };
}

// execução direta: grava data/notas.json
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const fonte = JSON.parse(fs.readFileSync('data/fonte-notas-vaticano.json', 'utf8'));
  const cat = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));
  const { notas, stats } = buildNotas(fonte, cat);
  fs.writeFileSync('data/notas.json', JSON.stringify(notas));
  const nParag = Object.keys(notas).length;
  const nNotas = Object.values(notas).reduce((s, d) => s + Object.keys(d).length, 0);
  const pct = (100 * stats.resolvidos / stats.totMarcadores).toFixed(1);
  console.log(`data/notas.json: ${nParag} §§, ${nNotas} notas`);
  console.log(`cobertura: ${stats.resolvidos}/${stats.totMarcadores} marcadores (${pct}%)`);
  console.log(`marcadores sem nota: ${stats.marcadoresSemNota.length}  ${stats.marcadoresSemNota.join(' ')}`);
  console.log(`notas órfãs: ${stats.notasOrfas.length}`);
}
