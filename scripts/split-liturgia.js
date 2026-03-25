#!/usr/bin/env node
/**
 * split-liturgia.js
 * Divide liturgia.json (4.6MB) em arquivos por data em data/liturgia/
 * Uso: node scripts/split-liturgia.js
 */

const fs   = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'liturgia.json');
const dest = path.join(__dirname, '..', 'data', 'liturgia');

fs.mkdirSync(dest, { recursive: true });

const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const datas = Object.keys(data);

for (const dt of datas) {
  const entry = data[dt];
  const file  = path.join(dest, `${dt}-leituras.json`);
  // Não sobrescreve -reflexao.json (cache da IA)
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(entry, null, 2), 'utf8');
  }
}

console.log(`✓ ${datas.length} arquivos gerados em data/liturgia/`);
