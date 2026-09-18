/**
 * api/_guardas.mjs — verificação determinística da resposta do modelo.
 *
 * A resposta é um parágrafo que raciocina a partir dos §§ — responde, explica
 * e distingue. Por isso a trava não exige que cada frase repita as palavras do
 * texto. Exige outra coisa, mais forte: cada § citado vem com um trecho copiado
 * dele, e esse trecho é conferido aqui palavra por palavra. O leitor vê os
 * trechos logo abaixo da resposta e pode julgar o raciocínio contra o texto.
 *
 *   - apoio a § que não foi enviado → descartado;
 *   - trecho que não está, literalmente, no § → citação inválida;
 *   - frase que só cita §§ sem trecho verificado → sai;
 *   - frase sem quase nada em comum com os §§ verificados (e, se não cita nada,
 *     com a pergunta) → sai;
 *     com apoio fraco → fica, mas vai para o registro como aviso;
 *   - nenhuma citação verificada de pé → "não encontrei".
 *
 * O que isto não pega: um raciocínio que usa as palavras certas para concluir
 * errado. Contra isso, o prompt e os trechos literais à vista do leitor.
 * Cortes calibrados em scripts/calibra-guardas.mjs.
 */

import { termos, textoDoParagrafo } from './_recuperar.mjs';

export const SUSTENTACAO_MINIMA = 0.2; // abaixo disso a frase sai
export const SUSTENTACAO_AVISO = 0.5;  // abaixo disso fica, mas vai para o registro
const TRECHO_MINIMO = 25;              // caracteres; "o amor" não prova nada

// Radicais comparados por prefixo de 5: "confessar"/"confessor" contam juntos,
// e o corte do radical em 6 letras não vira falso negativo.
const pref = (r) => r.slice(0, 5);

const _prefixos = new Map();
function prefixosDe(numero) {
  if (!_prefixos.has(numero)) {
    _prefixos.set(numero, new Set(termos(textoDoParagrafo(numero) || '').map(pref)));
  }
  return _prefixos.get(numero);
}

/**
 * Fração dos radicais da frase presentes nos §§ dados (0..1). `extra` soma
 * outro vocabulário aceito — o da pergunta, para a frase de conclusão.
 */
export function sustentacao(frase, numeros, extra = '') {
  const rs = [...new Set(termos(frase).map(pref))];
  if (!rs.length) return 0;
  const doc = new Set(termos(extra).map(pref));
  for (const n of numeros) for (const p of prefixosDe(n)) doc.add(p);
  return rs.filter((r) => doc.has(r)).length / rs.length;
}

/** Texto reduzido a palavras: sem acento, caixa, pontuação nem marcador "(12)". */
const soPalavras = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(\d+\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** O trecho está, palavra por palavra e em sequência, no texto do §? */
export function trechoLiteral(trecho, numero) {
  const t = soPalavras(trecho || '');
  if (t.length < TRECHO_MINIMO) return false;
  return ` ${soPalavras(textoDoParagrafo(numero) || '')} `.includes(` ${t} `);
}

// Ponto final seguido de espaço e de começo de frase (maiúscula ou aspas).
const FIM_DE_FRASE = /(?<=[.!?])\s+(?=[«"“A-ZÁÉÍÓÚÂÊÔÃÕÇ])/;

/** "o §2303", "(§2303)" e "[§ 2303]" viram "[§2303]". */
function normalizarCitacoes(texto) {
  return String(texto)
    .replace(/\*\*/g, '')
    .replace(/\[\s*§\s*(\d{1,4})\s*\]/g, '[§$1]')
    .replace(/(?<!\[)§\s*(\d{1,4})(?!\d)/g, '[§$1]')
    .replace(/\(\s*(\[§\d+\](?:\s*[,;e]\s*\[§\d+\])*)\s*\)/g, '$1');
}

/**
 * Aplica as travas a { resposta, apoios } do redator.
 * @returns {{ texto: string, citados: {numero:number, trecho:string}[], removidas: object[], avisos: object[] }}
 */
export function filtrarRedacao({ resposta, apoios }, enviados, pergunta = '') {
  const permitidos = new Set(enviados);
  const verificados = new Map(); // § → trecho literal
  const removidas = [];
  const avisos = [];

  for (const a of Array.isArray(apoios) ? apoios : []) {
    const n = Number(a?.paragrafo);
    if (!permitidos.has(n)) {
      removidas.push({ corpo: `§${a?.paragrafo}`, motivo: 'apoio a § não enviado' });
    } else if (!trechoLiteral(a.trecho, n)) {
      removidas.push({ corpo: `§${n}: ${String(a?.trecho ?? '').slice(0, 140)}`, motivo: 'trecho não é literal' });
    } else if (!verificados.has(n)) {
      verificados.set(n, String(a.trecho).replace(/\s+/g, ' ').trim());
    }
  }

  const mantidas = [];
  const ordem = [];
  const frases = normalizarCitacoes(resposta).split(FIM_DE_FRASE).map((x) => x.trim()).filter(Boolean);

  for (const frase of frases) {
    const citadas = [...frase.matchAll(/\[§(\d+)\]/g)].map((m) => Number(m[1]));
    const corpo = frase.replace(/\s*\[§\d+\]/g, '').trim();
    if (!corpo.replace(/[\s.,;]/g, '')) continue;

    const validas = [...new Set(citadas.filter((n) => verificados.has(n)))];
    if (citadas.length && !validas.length) {
      removidas.push({ corpo, motivo: 'citação sem trecho verificado' });
      continue;
    }

    // Frase citada responde pelos §§ que cita. Frase de raciocínio, sem
    // citação, pelo conjunto dos §§ verificados e pelas palavras da pergunta:
    // a conclusão retoma a pergunta — "não é lícito pedir a morte de alguém"
    // saía com sustentação 0 porque "pedir" e "morte" não estão no §2303.
    const s = validas.length
      ? sustentacao(corpo, validas)
      : verificados.size ? sustentacao(corpo, [...verificados.keys()], pergunta) : 0;
    if (s < SUSTENTACAO_MINIMA) {
      removidas.push({ corpo, motivo: `sustentação ${s.toFixed(2)}` });
      continue;
    }
    if (s < SUSTENTACAO_AVISO) avisos.push({ corpo, sustentacao: Number(s.toFixed(2)) });

    mantidas.push(
      frase.replace(/\[§(\d+)\]/g, (m, n) => (verificados.has(Number(n)) ? `[§${Number(n)}]` : ''))
        .replace(/\s+([.,;])/g, '$1').replace(/\s{2,}/g, ' ').trim(),
    );
    for (const n of validas) if (!ordem.includes(n)) ordem.push(n);
  }

  return {
    texto: mantidas.join(' '),
    citados: ordem.map((numero) => ({ numero, trecho: verificados.get(numero) })),
    removidas,
    avisos,
  };
}
