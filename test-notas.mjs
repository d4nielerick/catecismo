import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNotas } from './scripts/build-notas.mjs';
import { marcadoresDeNota } from './scripts/lib-html.mjs';
import { linkificarNota, detectarFonte } from './assets/js/fontes.js';

const read = (file) => JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'));
const fonte = read('fonte-notas-vaticano.json');
const cat = read('catecismo.json');
const ajustes = read('notas-ajustes.json');
const original = JSON.stringify(fonte);
const { notas, stats } = buildNotas(fonte, cat, ajustes);
assert.equal(JSON.stringify(fonte), original, 'a fonte bruta deve permanecer intacta');
assert.equal(stats.totMarcadores, cat.paragrafos.reduce((n, p) => n + marcadoresDeNota(p.texto).length, 0));
assert.equal(stats.resolvidos, stats.totMarcadores);
assert.deepEqual(stats.marcadoresSemNota, []);
assert.equal(notas[489][134], 'Cf. 1 Cor 1, 27.');
assert.equal(notas[489][135], 'Cf. 1 Sm 1.');
assert.equal(notas[2831][100], 'Cf. Lc 16, 19-31.');
assert.equal(notas[2831][101], 'Cf. Mt 25, 31-46.');
assert.match(notas[1653][178], /Familiaris consortio/);
assert.equal(notas[1655][179], 'Cf At 18, 8.');
assert.match(notas[664][602], /Símbolo Niceno/);
assert.equal(notas[679][660], 'Cf. 1 Cor 3, 12-15.');
assert.equal(notas[679][661], 'Cf. Mt 12, 32; Heb 6, 4-6; 10, 26-31.');
assert.match(notas[2518][262], /De fide et symbolo/);
assert.match(notas[460][85], /Tomás de Aquino/);
assert.match(notas[469][99], /Antífona/);
assert.match(notas[1396][236], /Sermão 272/);
assert.equal(notas[1396][326], undefined);

// Notas válidas antes sobrescritas por números repetidos na fonte.
const probe = { paragrafos: [{ numero: 650, texto: '(600) (601)' }] };
const restored = buildNotas(fonte, probe, ajustes).notas[650];
assert.equal(restored[600], 'Cf. Ap 4, 6-11.');
assert.match(restored[601], /João Damasceno/);
const probe26 = { paragrafos: [{ numero: 2200, texto: '(26)' }] };
assert.match(buildNotas(fonte, probe26, ajustes).notas[2200][26], /Diogneto/);
assert.throws(() => buildNotas(fonte, cat, [{ ...ajustes[0], de: 'fonte mudou' }]), /fonte alterada/);
assert.throws(() => buildNotas(fonte, cat, [ajustes[0], ajustes[0]]), /inválido/);

const idx = read('fontes-index.json');
assert.match(linkificarNota(notas[841][334], idx), /\/fontes\/nostra-aetate\/#s3/);
assert.deepEqual(detectarFonte(notas[841][334], idx), { slug: 'nostra-aetate', titulo: 'Nostra Aetate', sec: '3' });
assert.match(linkificarNota('<script>alert(1)</script> Nostra Aetate, 3', idx), /&lt;script&gt;/);
console.log('✅ Notas: cobertura, separação, numeração, restauração e links verificados.');
