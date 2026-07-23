#!/usr/bin/env node
/**
 * verifica-citacoes.mjs
 * Verificador de integridade das perguntas citação-first.
 *
 * Percorre data/perguntas/*.json (exceto _indice.json) e falha (exit 1,
 * listando todos os erros encontrados) se, para qualquer pergunta:
 *   1. um § citado não existir em data/catecismo.json;
 *   2. o texto citado (trecho) não for idêntico byte-a-byte ao texto do §
 *      correspondente em data/catecismo.json;
 *   3. a resposta não tiver nenhuma citação (array paragrafos vazio/ausente);
 *   4. a introdução (campo resposta) tiver mais de 2 frases.
 *
 * Uso: node scripts/verifica-citacoes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(__dirname, '../data/perguntas');
const CATECISMO_PATH = path.join(__dirname, '../data/catecismo.json');

function contarFrases(texto) {
  const trimmed = (texto || '').trim();
  if (!trimmed) return 0;
  // Conta terminadores de frase (. ! ? …) seguidos de espaço ou fim de string.
  const matches = trimmed.match(/[.!?…]+(?=\s|$)/g);
  return matches ? matches.length : 1; // se não há pontuação terminal, conta como 1 frase
}

function main() {
  const erros = [];

  if (!fs.existsSync(CATECISMO_PATH)) {
    console.error(`ERRO FATAL: ${CATECISMO_PATH} não encontrado.`);
    process.exit(1);
  }
  const cru = JSON.parse(fs.readFileSync(CATECISMO_PATH, 'utf8'));
  const catecismo = {};
  for (const p of cru.paragrafos) catecismo[p.numero] = p;

  if (!fs.existsSync(DEST)) {
    console.error(`ERRO FATAL: ${DEST} não encontrado.`);
    process.exit(1);
  }

  const arquivos = fs.readdirSync(DEST).filter(f => f.endsWith('.json') && f !== '_indice.json');

  if (arquivos.length === 0) {
    console.error('ERRO FATAL: nenhum arquivo de pergunta encontrado em data/perguntas/.');
    process.exit(1);
  }

  for (const arquivo of arquivos) {
    const caminho = path.join(DEST, arquivo);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    } catch (e) {
      erros.push(`${arquivo}: JSON inválido (${e.message})`);
      continue;
    }

    const rotulo = data.slug || arquivo;

    // 3. resposta sem nenhuma citação
    if (!Array.isArray(data.paragrafos) || data.paragrafos.length === 0) {
      erros.push(`${rotulo}: nenhum § citado (paragrafos vazio ou ausente)`);
      continue; // sem paragrafos não há o que checar abaixo
    }

    // 4. intro com mais de 2 frases
    const numFrases = contarFrases(data.resposta);
    if (numFrases > 2) {
      erros.push(`${rotulo}: introdução (resposta) tem ${numFrases} frases, máximo permitido é 2 — "${data.resposta}"`);
    }
    if (!data.resposta || !data.resposta.trim()) {
      erros.push(`${rotulo}: campo resposta vazio`);
    }

    // 1 e 2: cada § citado deve existir e o texto deve bater byte-a-byte
    for (const p of data.paragrafos) {
      const numero = p.id;
      const original = catecismo[numero];
      if (!original) {
        erros.push(`${rotulo}: §${numero} citado não existe em catecismo.json`);
        continue;
      }
      if (p.trecho !== original.texto) {
        erros.push(`${rotulo}: §${numero} — trecho citado difere do texto original em catecismo.json`);
      }
      if (!p.motivo || !p.motivo.trim()) {
        erros.push(`${rotulo}: §${numero} sem campo motivo`);
      }
    }
  }

  if (erros.length > 0) {
    console.error(`\n❌ ${erros.length} erro(s) encontrado(s):\n`);
    for (const e of erros) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log(`✅ ${arquivos.length} perguntas verificadas, nenhum erro encontrado.`);
  console.log('   - todo § citado existe em catecismo.json');
  console.log('   - todo trecho citado é idêntico byte-a-byte ao texto original');
  console.log('   - toda pergunta tem ao menos uma citação');
  console.log('   - toda introdução tem no máximo 2 frases');
}

main();
