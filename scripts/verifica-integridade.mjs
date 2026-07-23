/**
 * scripts/verifica-integridade.mjs — guard-rail de CI do Catecismo.
 *
 * Prova que data/catecismo.json é EXATAMENTE o resultado determinístico de:
 *   data/fonte-vaticano.json (texto oficial, vatican.va)
 *   + data/grafia-ptbr-pares.json (adaptação ortográfica pt-BR, palavra inteira)
 *   + data/grafia-ajustes.json (ajustes por ocorrência: concordância + errata da fonte)
 * e que a numeração 1–2865 está completa. Qualquer edição manual não registrada
 * nos dois arquivos de transformação faz este verificador falhar.
 */
import fs from 'node:fs';
import { aplicaPares, aplicaAjustes } from './lib-grafia.mjs';

const fonte   = JSON.parse(fs.readFileSync('data/fonte-vaticano.json', 'utf8'));
const pares   = JSON.parse(fs.readFileSync('data/grafia-ptbr-pares.json', 'utf8'));
const ajustes = JSON.parse(fs.readFileSync('data/grafia-ajustes.json', 'utf8'));
const cat     = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));

const nums = new Set(cat.paragrafos.map(p => p.numero));
for (let n = 1; n <= 2865; n++)
  if (!nums.has(n)) { console.error(`✗ §${n} ausente`); process.exit(1); }
if (cat.paragrafos.length !== 2865) { console.error(`✗ ${cat.paragrafos.length} §§ (esperava 2865)`); process.exit(1); }

const reconstruido = fonte.paragrafos.map(p => ({ numero: p.numero, texto: p.texto }));
aplicaPares(reconstruido, pares);
aplicaAjustes(reconstruido, ajustes);

const mapa = new Map(reconstruido.map(p => [p.numero, p.texto]));
const difs = cat.paragrafos.filter(p => mapa.get(p.numero) !== p.texto).map(p => p.numero);
if (difs.length) {
  console.error(`✗ ${difs.length} §§ divergem da reconstrução fonte+pares+ajustes: ${difs.slice(0, 15).join(', ')}`);
  process.exit(1);
}
console.log('✅ integridade OK: 2865 §§ completos e idênticos à reconstrução determinística da fonte oficial.');
