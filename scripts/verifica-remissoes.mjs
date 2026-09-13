/**
 * verifica-remissoes.mjs — prova que data/remissoes.json é reprodutível a
 * partir de data/indice_analitico.json e que o grafo é íntegro.
 *
 * Mesma disciplina dos outros dados gerados: o arquivo nunca é editado à mão;
 * se divergir, rode `node scripts/build-remissoes.mjs`.
 */

import { readFileSync } from 'node:fs';
import { construir } from './build-remissoes.mjs';

const indice   = JSON.parse(readFileSync('data/indice_analitico.json', 'utf8'));
const commitado = JSON.parse(readFileSync('data/remissoes.json', 'utf8'));

const { nomes, remete } = construir(indice);
const erros = [];

// 1. Reprodutibilidade byte-a-byte.
const esperado = JSON.stringify({ nomes, remete }, null, 1) + '\n';
const atual    = readFileSync('data/remissoes.json', 'utf8');
if (esperado !== atual) {
  erros.push('remissoes.json não reproduz a build — rode scripts/build-remissoes.mjs');
}

// 2. Todo tema do índice tem nome limpo, e nenhum nome carrega a cauda de remissão.
const idsIndice = new Set(indice.map(t => t.id));
for (const t of indice) {
  const nome = commitado.nomes[t.id];
  if (!nome) erros.push(`tema ${t.id} ("${t.nome}") sem nome limpo`);
  else if (/\bvide\b|\bcf\./i.test(nome)) {
    erros.push(`tema ${t.id} manteve a remissão no nome: "${nome}"`);
  }
}

// 3. O grafo só aponta para temas que existem, e nunca para si mesmo.
for (const [origem, alvos] of Object.entries(commitado.remete)) {
  if (!idsIndice.has(Number(origem))) erros.push(`remissão parte do tema inexistente ${origem}`);
  for (const alvo of alvos) {
    if (!idsIndice.has(alvo)) erros.push(`tema ${origem} remete ao inexistente ${alvo}`);
    if (Number(origem) === alvo) erros.push(`tema ${origem} remete a si mesmo`);
  }
}

const ligacoes = Object.values(commitado.remete).reduce((n, v) => n + v.length, 0);

if (erros.length) {
  console.error('❌ remissões com problema:');
  for (const e of erros.slice(0, 20)) console.error('   · ' + e);
  if (erros.length > 20) console.error(`   … e mais ${erros.length - 20}`);
  process.exit(1);
}

console.log(`✅ remissões OK: reprodutível, ${Object.keys(commitado.remete).length} temas ligados por ${ligacoes} remissões, todas para verbetes existentes.`);
