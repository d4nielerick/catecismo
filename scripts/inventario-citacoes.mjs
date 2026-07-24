/**
 * scripts/inventario-citacoes.mjs — inventário das fontes citadas nas notas.
 *
 * Lê data/notas.json e classifica cada nota em tipos (Escritura, Magistério,
 * Padres/Doutores, Denzinger, Outro), extraindo os documentos/livros distintos
 * e sua frequência. Objetivo: DIMENSIONAR o trabalho de hospedar os textos
 * citados (Parte 2). Determinístico, sem rede. Não altera nada — só relatório
 * (+ data/citacoes-inventario.json).
 *
 * Nota: "Cf." (confer, latim) é abreviação VÁLIDA e é ignorada como ruído.
 * Referências bíblicas coladas ("Act2, 42") são normalizadas p/ contagem ("Act 2").
 */
import fs from 'node:fs';

const notas = JSON.parse(fs.readFileSync('data/notas.json', 'utf8'));
const textos = Object.values(notas).flatMap((d) => Object.values(d));

// Abreviações bíblicas (Ave-Maria/vatican.va, com variantes latinas)
const LIVROS = ['Gn','Ex','Lv','Nm','Dt','Js','Jz','Rt','1Sm','2Sm','1Rs','2Rs','1Cr','2Cr',
  'Esd','Ne','Tb','Jt','Est','1Mac','2Mac','Jó','Job','Sl','Pr','Ecl','Ct','Sb','Eclo','Sir',
  'Is','Jr','Lm','Br','Ez','Dn','Os','Jl','Am','Ab','Jn','Mq','Na','Hab','Sf','Ag','Zc','Ml',
  'Mt','Mc','Lc','Jo','Act','At','Rm','1Cor','2Cor','Gl','Ef','Fl','Cl','1Ts','2Ts','1Tm','2Tm',
  'Tt','Fm','Heb','Hb','Tg','1Pe','2Pe','1Jo','2Jo','3Jo','Jd','Ap'];
const LIVRO_RE = new RegExp(`\\b(${LIVROS.map((l) => l.replace(/([12])/, '$1')).join('|')})\\s*\\d`, 'g');

// Documentos magisteriais bem conhecidos (nome canônico → regex de detecção)
const DOCS = {
  'Vaticano II — Lumen Gentium': /Lumen Gentium/i,
  'Vaticano II — Dei Verbum': /Dei Verbum/i,
  'Vaticano II — Gaudium et Spes': /Gaudium et Spes/i,
  'Vaticano II — Sacrosanctum Concilium': /Sacrosanctum Concilium/i,
  'Vaticano II — Unitatis Redintegratio': /Unitatis Redintegratio/i,
  'Vaticano II — Nostra Aetate': /Nostra Aetate/i,
  'Vaticano II — Dignitatis Humanae': /Dignitatis Humanae/i,
  'Vaticano II — Ad Gentes': /Ad Gentes/i,
  'Vaticano II — Presbyterorum Ordinis': /Presbyterorum Ordinis/i,
  'Vaticano II — Apostolicam Actuositatem': /Apostolicam Actuositatem/i,
  'Vaticano II — Optatam Totius': /Optatam Totius/i,
  'Vaticano II — Perfectae Caritatis': /Perfectae Caritatis/i,
  'Vaticano II — Christus Dominus': /Christus Dominus/i,
  'Vaticano II — Gravissimum Educationis': /Gravissimum Educationis/i,
  'Vaticano II — Orientalium Ecclesiarum': /Orientalium Ecclesiarum/i,
  'Vaticano II — Inter Mirifica': /Inter Mirifica/i,
  'Vaticano I — Dei Filius': /Dei Filius/i,
  'Vaticano I — Pastor Aeternus': /Pastor Aeternus/i,
  'Concílio de Trento': /Conc[íi]lio de Trento|Tridentin/i,
  'Concílio de Éfeso': /Conc[íi]lio de [ÉE]feso/i,
  'Concílio de Calcedônia': /Calced[óo]nia/i,
  'Concílio de Niceia': /Nice(ia|no)/i,
  'Humani Generis (Pio XII)': /Humani Generis/i,
  'Rerum Novarum (Leão XIII)': /Rerum Novarum/i,
  'Centesimus Annus (João Paulo II)': /Centesimus Annus/i,
  'Sollicitudo Rei Socialis': /Sollicitudo Rei Socialis/i,
  'Veritatis Splendor': /Veritatis Splendor/i,
  'Evangelium Vitae': /Evangelium Vitae/i,
  'Redemptor Hominis': /Redemptor Hominis/i,
  'Dominum et Vivificantem': /Dominum et Vivificantem/i,
  'Familiaris Consortio': /Familiaris Consortio/i,
  'Reconciliatio et Paenitentia': /Reconciliatio et Paenitentia/i,
  'Catechesi Tradendae': /Catechesi Tradendae/i,
  'Evangelii Nuntiandi (Paulo VI)': /Evangelii Nuntiandi/i,
  'Mysterium Fidei': /Mysterium Fidei/i,
  'Missale Romanum / Liturgia': /Missale Romanum|Missal Romano|Liturgia|Rito d/i,
  'Código de Direito Canônico (CIC/1983)': /C[óo]digo de Direito Can[óo]nico|CIC\b|c[aâ]non/i,
};

// Padres / Doutores
const PADRES = {
  'Santo Agostinho': /Agostinho/i,
  'São Tomás de Aquino': /Tom[áa]s de Aquino|Summa/i,
  'São João Crisóstomo': /Cris[óo]stomo/i,
  'Santo Irineu': /Irineu|Iren/i,
  'São Cirilo': /Cirilo/i,
  'São Jerônimo': /Jer[óo]nimo|Hieron/i,
  'São Gregório': /Greg[óo]rio/i,
  'Santo Ambrósio': /Ambr[óo]sio/i,
  'São Basílio': /Bas[íi]lio/i,
  'Tertuliano': /Tertuliano/i,
  'Orígenes': /Or[íi]genes/i,
  'São Boaventura': /Boaventura/i,
  'Santo Atanásio': /Atan[áa]sio/i,
  'São Cipriano': /Cipriano/i,
  'São Leão Magno': /Le[ãa]o Magno/i,
  'São Francisco de Assis': /Francisco de Assis/i,
  'Santa Teresa': /Teresa/i,
};

const cont = (obj) => Object.fromEntries(Object.keys(obj).map((k) => [k, 0]));
const magC = cont(DOCS), padC = cont(PADRES), livC = {};
let nEscritura = 0, nMagisterio = 0, nPadres = 0, nDenzinger = 0, nOutro = 0;

for (const t of textos) {
  let classificado = false;
  // Escritura
  const refs = [...t.matchAll(LIVRO_RE)];
  if (refs.length) {
    nEscritura++; classificado = true;
    for (const m of refs) livC[m[1]] = (livC[m[1]] || 0) + 1;
  }
  // Magistério
  for (const [nome, re] of Object.entries(DOCS)) if (re.test(t)) { magC[nome]++; nMagisterio++; classificado = true; }
  // Padres
  for (const [nome, re] of Object.entries(PADRES)) if (re.test(t)) { padC[nome]++; nPadres++; classificado = true; }
  // Denzinger
  if (/\bDS\s*\d|\bDenz/i.test(t)) { nDenzinger++; classificado = true; }
  if (!classificado) nOutro++;
}

const ord = (o) => Object.entries(o).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
const total = textos.length;
console.log(`INVENTÁRIO DE CITAÇÕES — ${total} notas\n`);
console.log(`Por tipo (nota pode ter +de 1):`);
console.log(`  Escritura     ${nEscritura}`);
console.log(`  Magistério    ${nMagisterio}`);
console.log(`  Padres/Dout.  ${nPadres}`);
console.log(`  Denzinger     ${nDenzinger}`);
console.log(`  Outro/?       ${nOutro}\n`);

console.log(`Documentos magisteriais distintos citados (${ord(magC).length}):`);
for (const [nome, n] of ord(magC)) console.log(`  ${String(n).padStart(4)}  ${nome}`);
console.log(`\nPadres/Doutores distintos (${ord(padC).length}):`);
for (const [nome, n] of ord(padC)) console.log(`  ${String(n).padStart(4)}  ${nome}`);
console.log(`\nLivros bíblicos distintos citados: ${ord(livC).length} | top 12:`);
for (const [l, n] of ord(livC).slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${l}`);

fs.writeFileSync('data/citacoes-inventario.json', JSON.stringify({
  total, tipos: { nEscritura, nMagisterio, nPadres, nDenzinger, nOutro },
  magisterio: Object.fromEntries(ord(magC)), padres: Object.fromEntries(ord(padC)),
  livros: Object.fromEntries(ord(livC)),
}, null, 1));
