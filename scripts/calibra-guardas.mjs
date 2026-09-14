/**
 * calibra-guardas.mjs — mede se o corte de sustentação separa frase fiel de
 * frase que não está no § citado. Sem API: usa respostas reais gravadas.
 *
 * Positivos: frases de respostas do modelo, com a citação que ele deu (lidas
 * e conferidas à mão contra o texto). Negativos: as mesmas frases apontando
 * para um § de outro assunto — exatamente o erro que a trava precisa pegar —
 * e frases plausíveis que o Catecismo não diz.
 *
 * `node scripts/calibra-guardas.mjs`
 */

import { sustentacao, SUSTENTACAO_MINIMA } from '../api/_guardas.mjs';

const POSITIVOS = [
  ['Aquele que tem consciência de haver cometido um pecado mortal não deve receber a sagrada Comunhão, mesmo que tenha uma grande contrição, sem ter previamente recebido a absolvição sacramental', [1457]],
  ['A Igreja chama Purgatório a esta purificação final dos eleitos, que é absolutamente distinta do castigo dos condenados', [1031]],
  ['A ordenação das mulheres não é possível, porque o Senhor Jesus escolheu homens para formar o colégio dos Doze Apóstolos', [1577]],
  ['A gravidade da mentira mede-se pela natureza da verdade que ela deforma, pelas circunstâncias, pelas intenções e pelos danos causados', [2484]],
  ['Recusando perdoar aos irmãos, o coração fecha-se e torna-se impermeável ao amor misericordioso do Pai', [2840]],
  ['A Igreja ensina que a pena de morte é inadmissível porque atenta contra a inviolabilidade e dignidade da pessoa', [2267]],
  ['A Trindade não tem senão uma e a mesma natureza e uma e a mesma operação', [258]],
  ['A Igreja permite a cremação, a não ser que esta ponha em causa a fé na ressurreição dos corpos', [2301]],
  ['O Catecismo ensina que os pais têm a missão de ensinar os filhos a rezar e a descobrir a sua vocação de filhos de Deus', [2226]],
  ['O perdão mútuo das ofensas está relacionado com o perdão que Deus concede aos pecados', [1425]],
  ['Esta purificação liberta do que se chama pena temporal do pecado', [1472]],
  ['Só o varão batizado pode receber validamente a sagrada ordenação', [1577]],
];

const NEGATIVOS = [
  // frase real, § errado
  ['A Igreja chama Purgatório a esta purificação final dos eleitos, que é absolutamente distinta do castigo dos condenados', [2301]],
  ['A ordenação das mulheres não é possível, porque o Senhor Jesus escolheu homens para formar o colégio dos Doze Apóstolos', [2484]],
  ['A Igreja permite a cremação, a não ser que esta ponha em causa a fé na ressurreição dos corpos', [1577]],
  ['A gravidade da mentira mede-se pela natureza da verdade que ela deforma', [1031]],
  ['Recusando perdoar aos irmãos, o coração fecha-se ao amor misericordioso do Pai', [258]],
  // plausível, mas o § citado não diz
  ['A Igreja proíbe a cremação em qualquer circunstância e exige o sepultamento', [2301]],
  ['Rezar pela vitória do seu time é idolatria e pecado grave', [2633]],
  ['O Papa Francisco alterou o Catecismo em 2018 por decreto próprio', [2267]],
  ['Mulheres podem receber a ordenação diaconal desde o Concílio Vaticano II', [1577]],
  ['A mentira nunca é pecado quando feita para proteger a família', [2484]],
];

const medir = (lista) => lista.map(([f, n]) => ({ f, s: sustentacao(f, n) })).sort((a, b) => a.s - b.s);
const P = medir(POSITIVOS);
const N = medir(NEGATIVOS);

console.log('Positivos (menores primeiro):');
for (const { f, s } of P) console.log(`  ${s.toFixed(2)}  ${f.slice(0, 80)}`);
console.log('Negativos (maiores primeiro):');
for (const { f, s } of [...N].reverse()) console.log(`  ${s.toFixed(2)}  ${f.slice(0, 80)}`);

const fn = P.filter((x) => x.s < SUSTENTACAO_MINIMA).length;
const fp = N.filter((x) => x.s >= SUSTENTACAO_MINIMA).length;
console.log(`\ncorte ${SUSTENTACAO_MINIMA}: ${fn}/${P.length} fiéis removidas por engano · ${fp}/${N.length} inventadas que passariam`);
console.log(`menor positivo ${P[0].s.toFixed(2)} · maior negativo ${N[N.length - 1].s.toFixed(2)}`);

if (fn || fp) {
  console.error('❌ o corte de sustentação não separa mais frase fiel de frase inventada');
  process.exit(1);
}
