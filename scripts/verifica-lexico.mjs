/**
 * verifica-lexico.mjs — valida data/lexico-conceitos.json.
 *
 * O léxico é curadoria humana (ao contrário dos outros dados, que são
 * gerados), então o que se prova aqui é outra coisa: que todo tema citado
 * existe mesmo no índice analítico e leva a parágrafos. Sem isto, um erro de
 * digitação num nome de tema vira uma sugestão que não abre nada.
 */

import { readFileSync } from 'node:fs';

const lexico  = JSON.parse(readFileSync('data/lexico-conceitos.json', 'utf8'));
const indice  = JSON.parse(readFileSync('data/indice_analitico.json', 'utf8'));
const nomes   = JSON.parse(readFileSync('data/remissoes.json', 'utf8')).nomes;

// Tema → quantos parágrafos ele alcança (via subtemas).
const paragrafosPorNome = new Map();
for (const tema of indice) {
  const nome = nomes[tema.id] || tema.nome;
  const total = (tema.subtemas || []).reduce((n, s) => n + (s.paragrafos?.length || 0), 0);
  paragrafosPorNome.set(nome, (paragrafosPorNome.get(nome) || 0) + total);
}

const erros = [];
const avisos = [];
const termos = lexico.termos || {};

if (!Object.keys(termos).length) erros.push('léxico vazio');

for (const [termo, alvos] of Object.entries(termos)) {
  if (!Array.isArray(alvos) || alvos.length === 0) {
    erros.push(`"${termo}" não aponta para nenhum tema`);
    continue;
  }
  const vistos = new Set();
  for (const alvo of alvos) {
    if (vistos.has(alvo)) erros.push(`"${termo}" repete o tema "${alvo}"`);
    vistos.add(alvo);

    if (!paragrafosPorNome.has(alvo)) {
      erros.push(`"${termo}" aponta para "${alvo}", que não é um tema do índice`);
    } else if (paragrafosPorNome.get(alvo) === 0) {
      avisos.push(`"${termo}" → "${alvo}" não alcança nenhum parágrafo`);
    }
  }
}

if (erros.length) {
  console.error('❌ léxico com problema:');
  for (const e of erros) console.error('   · ' + e);
  process.exit(1);
}

const ligacoes = Object.values(termos).reduce((n, v) => n + v.length, 0);
console.log(`✅ léxico OK: ${Object.keys(termos).length} termos → ${ligacoes} ligações, todos os temas existem no índice.`);
if (avisos.length) {
  console.log('   avisos:');
  for (const a of avisos) console.log('     · ' + a);
}
