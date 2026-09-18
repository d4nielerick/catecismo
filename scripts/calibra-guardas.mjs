/**
 * calibra-guardas.mjs — mede se as travas do hub separam o fiel do inventado.
 * Sem API: frases e trechos escritos à mão, conferidos contra o texto.
 *
 * Duas travas, dois testes:
 *   1. Trecho literal — a citação só vale com uma frase copiada do §. Tem de
 *      aceitar cópia (ignorando pontuação, caixa e acento) e recusar paráfrase,
 *      frase de outro § e frase inventada.
 *   2. Sustentação — frase fiel ao § fica acima do aviso (0,5); frase com § de
 *      outro assunto ou afirmação que o § não faz fica abaixo, e vai para o
 *      registro. Abaixo do mínimo (0,2), a frase sai.
 *
 * `node scripts/calibra-guardas.mjs` — falha se alguma separação quebrar.
 */

import { sustentacao, trechoLiteral, SUSTENTACAO_AVISO, SUSTENTACAO_MINIMA } from '../api/_guardas.mjs';

let falhas = 0;
const conferir = (ok, msg) => { if (!ok) { falhas++; console.error('  ✗ ' + msg); } };

// ── 1. Trecho literal
const LITERAIS = [
  ['A Igreja chama Purgatório a esta purificação final dos eleitos', 1031],
  ['O ódio voluntário é contra a caridade', 2303],
  ['a igreja chama purgatorio a esta purificacao final dos eleitos', 1031], // caixa e acento
  ['Odiar o próximo, querendo-lhe mal deliberadamente, é pecado', 2303],   // pontuação diferente
  ['A oração cristã vai até ao perdão dos inimigos', 2844],
];
const NAO_LITERAIS = [
  ['A Igreja chama de Purgatório a purificação final', 1031],             // paráfrase
  ['O ódio voluntário é contra a caridade', 1031],                        // frase de outro §
  ['Rezar pela morte do inimigo é sempre permitido', 2303],               // inventada
  ['o ódio', 2303],                                                       // curta demais
];
for (const [t, n] of LITERAIS) conferir(trechoLiteral(t, n), `literal recusado: §${n} "${t}"`);
for (const [t, n] of NAO_LITERAIS) conferir(!trechoLiteral(t, n), `não literal aceito: §${n} "${t}"`);
console.log(`trecho literal: ${LITERAIS.length} cópias aceitas, ${NAO_LITERAIS.length} paráfrases/invenções recusadas`);

// ── 2. Sustentação
const FIEIS = [
  ['Aquele que tem consciência de haver cometido um pecado mortal não deve receber a sagrada Comunhão sem ter previamente recebido a absolvição sacramental', [1457]],
  ['A Igreja chama Purgatório a esta purificação final dos eleitos, que é absolutamente distinta do castigo dos condenados', [1031]],
  ['A ordenação das mulheres não é possível, porque o Senhor Jesus escolheu homens para formar o colégio dos Doze Apóstolos', [1577]],
  ['A gravidade da mentira mede-se pela natureza da verdade que ela deforma, pelas circunstâncias, pelas intenções e pelos danos causados', [2484]],
  ['Recusando perdoar aos irmãos, o coração fecha-se e torna-se impermeável ao amor misericordioso do Pai', [2840]],
  ['A Igreja permite a cremação, a não ser que esta ponha em causa a fé na ressurreição dos corpos', [2301]],
  ['O ódio voluntário é contra a caridade, e desejar deliberadamente um mal grave ao próximo é pecado grave', [2303]],
  ['A ira é um desejo de vingança, e desejar a vingança para mal daquele que deve ser castigado é ilícito', [2302]],
];
const FRACAS = [
  ['A Igreja chama Purgatório a esta purificação final dos eleitos', [2301]],      // § errado
  ['A ordenação das mulheres não é possível', [2484]],                              // § errado
  ['A Igreja proíbe a cremação em qualquer circunstância e exige o sepultamento', [2301]],
  ['Rezar pela vitória do seu time é idolatria e pecado grave', [2633]],
  ['O Papa Francisco alterou o Catecismo em 2018 por decreto próprio', [2267]],
  ['Mulheres podem receber a ordenação diaconal desde o Concílio Vaticano II', [1577]],
  ['A mentira nunca é pecado quando feita para proteger a família', [2484]],
];
const FORA = [
  ['O campeonato brasileiro tem vinte clubes rivais', [1031]],
  ['Receita de bolo de chocolate com cobertura', [2303]],
];

const medir = (lista) => lista.map(([f, n]) => ({ f, s: sustentacao(f, n) }));
const F = medir(FIEIS), R = medir(FRACAS), X = medir(FORA);
for (const { f, s } of F) conferir(s >= SUSTENTACAO_AVISO, `fiel abaixo do aviso (${s.toFixed(2)}): ${f.slice(0, 60)}`);
for (const { f, s } of R) conferir(s < SUSTENTACAO_AVISO, `fraca sem aviso (${s.toFixed(2)}): ${f.slice(0, 60)}`);
for (const { f, s } of X) conferir(s < SUSTENTACAO_MINIMA, `fora do assunto não removida (${s.toFixed(2)}): ${f.slice(0, 60)}`);

const min = (xs) => Math.min(...xs.map((x) => x.s)).toFixed(2);
const max = (xs) => Math.max(...xs.map((x) => x.s)).toFixed(2);
console.log(`sustentação: fiéis ${min(F)}–${max(F)} · fracas ${min(R)}–${max(R)} (aviso < ${SUSTENTACAO_AVISO}) · fora do assunto até ${max(X)} (sai < ${SUSTENTACAO_MINIMA})`);

if (falhas) {
  console.error(`❌ ${falhas} separação(ões) quebrada(s) nas travas`);
  process.exit(1);
}
console.log('✅ travas separam citação literal de paráfrase, frase fiel de fraca e assunto de fora do assunto');
