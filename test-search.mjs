/**
 * test-search.mjs  — smoke tests para search.js
 * Uso: node test-search.mjs
 */
import { readFileSync } from 'fs';
import { buscar, agrupar, destacar, trecho } from './assets/js/search.js';

const { paragrafos } = JSON.parse(readFileSync('./data/catecismo.json', 'utf-8'));

let ok = 0, fail = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    ok++;
  } else {
    console.error(`  ✗ ${desc}`);
    fail++;
  }
}

// ── buscar() ─────────────────────────────────────────────────────────────────
console.log('\nbuscar()');
{
  const r = buscar('eucaristia', paragrafos);
  assert('encontra resultados para "eucaristia"', r.total > 0);
  assert('total >= paragrafos retornados', r.total >= r.paragrafos.length);
  assert('máximo 200 parágrafos renderizados', r.paragrafos.length <= 200);
}
{
  const r = buscar('sacramentos', paragrafos);
  assert('encontra resultados para "sacramentos"', r.total > 10);
}
{
  const r = buscar('a', paragrafos); // query < 2 chars normalizada não, mas 1 char
  assert('query de 1 char retorna vazio', r.total === 0);
}
{
  const r = buscar('', paragrafos);
  assert('query vazia retorna vazio', r.total === 0);
}
{
  // Teste com acentos vs sem acentos
  const r1 = buscar('oração', paragrafos);
  const r2 = buscar('oracao', paragrafos);
  assert('busca normaliza acentos (oração == oracao)', r1.total === r2.total);
}
{
  // Case-insensitive
  const r1 = buscar('Trindade', paragrafos);
  const r2 = buscar('trindade', paragrafos);
  assert('busca é case-insensitive', r1.total === r2.total);
}

// ── agrupar() ────────────────────────────────────────────────────────────────
console.log('\nagrupar()');
{
  const { paragrafos: ps } = buscar('sacramentos', paragrafos);
  const grupos = agrupar(ps);
  assert('retorna array de partes', Array.isArray(grupos));
  assert('cada parte tem secoes', grupos.every(g => Array.isArray(g.secoes)));
  assert('cada seção tem capitulos', grupos.every(g =>
    g.secoes.every(s => Array.isArray(s.capitulos))
  ));
  assert('cada capítulo tem artigos', grupos.every(g =>
    g.secoes.every(s => s.capitulos.every(c => Array.isArray(c.artigos)))
  ));
  assert('cada artigo tem paragrafos', grupos.every(g =>
    g.secoes.every(s => s.capitulos.every(c =>
      c.artigos.every(a => Array.isArray(a.paragrafos) && a.paragrafos.length > 0)
    ))
  ));

  // Total de parágrafos preservado no agrupamento
  const totalAgrupados = grupos.reduce((acc, g) =>
    acc + g.secoes.reduce((a2, s) =>
      a2 + s.capitulos.reduce((a3, c) =>
        a3 + c.artigos.reduce((a4, a) => a4 + a.paragrafos.length, 0), 0), 0), 0);
  assert('total de parágrafos preservado no agrupamento', totalAgrupados === ps.length);
}

// ── destacar() ───────────────────────────────────────────────────────────────
console.log('\ndestacar()');
{
  const html = destacar('A graça de Deus é abundante', 'graça');
  assert('envolve termo em <mark>', html.includes('<mark>'));
  assert('não faz double-escape de &amp;', !html.includes('&amp;amp;'));
}
{
  const html = destacar('<script>alert(1)</script>', 'script');
  assert('faz escape de HTML (XSS)', !html.includes('<script>'));
}
{
  const html = destacar('Oração e adoração', 'oracao');
  assert('destaca com normalização de acentos', html.includes('<mark>'));
}

// ── trecho() ─────────────────────────────────────────────────────────────────
console.log('\ntrecho()');
{
  const t = trecho('Deus criou o mundo com amor infinito e providência', 'amor', 30);
  assert('trecho é mais curto que o texto original', t.replace(/<[^>]+>/g, '').length <= 35);
  assert('trecho contém <mark>', t.includes('<mark>'));
}

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(`\n${ok + fail} testes — ${ok} ok, ${fail} falhou\n`);
if (fail > 0) process.exit(1);
