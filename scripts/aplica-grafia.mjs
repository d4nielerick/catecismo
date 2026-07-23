/**
 * scripts/aplica-grafia.mjs — aplica a adaptação ortográfica pt-PT → pt-BR
 * sobre data/catecismo.json:
 *   1. data/grafia-ptbr-pares.json — pares palavra-inteira, caixa preservada
 *   2. data/grafia-ajustes.json — ajustes por ocorrência (concordância/errata)
 *
 * Trava determinística: após aplicar, o vocabulário só pode ter perdido
 * palavras "de" e ganhado palavras "para" (dos dois arquivos). Qualquer outra
 * mudança → aborta sem gravar. Idempotente (reaplicar não muda nada).
 */
import fs from 'node:fs';
import { aplicaPares, aplicaAjustes, vocabulario } from './lib-grafia.mjs';

const pares   = JSON.parse(fs.readFileSync('data/grafia-ptbr-pares.json', 'utf8'));
const ajustes = JSON.parse(fs.readFileSync('data/grafia-ajustes.json', 'utf8'));
const cat     = JSON.parse(fs.readFileSync('data/catecismo.json', 'utf8'));

const antes = vocabulario(cat.paragrafos);
const contagem = aplicaPares(cat.paragrafos, pares);
try {
  aplicaAjustes(cat.paragrafos, ajustes);
} catch (e) {
  if (!/0 ocorrências/.test(e.message)) throw e; // 0 = já aplicado (idempotência)
}
const depois = vocabulario(cat.paragrafos);

const tokens = (s) => s.toLowerCase().match(/[a-záéíóúâêôãõàçü-]+/g) || [];
const permitidoPerder = new Set([...pares.map(p => p.de), ...ajustes.flatMap(a => tokens(a.de))]);
const permitidoGanhar = new Set([...pares.map(p => p.para), ...ajustes.flatMap(a => tokens(a.para))]);
const perdidasFora = [...antes].filter(w => !depois.has(w) && !permitidoPerder.has(w));
const ganhasFora   = [...depois].filter(w => !antes.has(w) && !permitidoGanhar.has(w));
if (perdidasFora.length || ganhasFora.length) {
  console.error('TRAVA: mudanças de vocabulário fora da whitelist!');
  console.error(' perdidas:', perdidasFora.slice(0, 20));
  console.error(' ganhas:', ganhasFora.slice(0, 20));
  process.exit(1);
}

fs.writeFileSync('data/catecismo.json', JSON.stringify(cat));
const total = [...contagem.values()].reduce((a, b) => a + b, 0);
console.log(`${total} substituições por pares (${contagem.size} pares ativos) + ${ajustes.length} ajustes pontuais.`);
for (const [de, n] of [...contagem].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`  ${de} → ${pares.find(p => p.de === de).para}: ${n}×`);
