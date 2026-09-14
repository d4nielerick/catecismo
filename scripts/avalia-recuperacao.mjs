/**
 * avalia-recuperacao.mjs — mede se a recuperação do hub encontra os §§ certos.
 *
 * O modelo só responde com o que recebe. Se o § que responde a pergunta não
 * está entre os enviados, a resposta sai errada ou vazia por mais que o prompt
 * seja bom — então é aqui, sem gastar API, que a qualidade do hub se decide.
 *
 * Cada caso lista §§ conferidos contra o texto: acerta se ao menos um estiver
 * entre os LIMITE primeiros. `node scripts/avalia-recuperacao.mjs [-v]`
 */

import { recuperar, PARAGRAFOS_POR_PERGUNTA } from '../api/_recuperar.mjs';

const LIMITE = PARAGRAFOS_POR_PERGUNTA; // o mesmo corte que vai ao modelo
const PISO = 0.85; // fração mínima de casos com acerto

// Faixa contínua de §§ — o gabarito é o trecho do Catecismo que trata do
// assunto (conferido contra o texto), não o § que eu lembrava de cabeça.
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const CASOS = [
  ['Posso comungar se não me confessei?',                 [...faixa(1384, 1390), 1415, 1457]],
  ['O que a Igreja ensina sobre cremação?',                [2301]],
  ['O que é o purgatório?',                                faixa(1030, 1032)],
  ['Divórcio é pecado?',                                   [2382, 2384, 2385, 2386, 1650]],
  ['O que torna um pecado mortal?',                        faixa(1854, 1861)],
  ['Por que os católicos rezam para Maria?',               [971, ...faixa(2673, 2679)]],
  ['A Igreja aceita a pena de morte?',                     [2267]],
  ['O que acontece com a alma depois que a gente morre?',  faixa(1020, 1060)], // artigo "Creio na vida eterna"
  ['Como Deus pode ser três pessoas e um só?',             [234, 253, 254, 255]],
  ['Eutanásia é permitida?',                               faixa(2276, 2279)],
  ['Como me preparar para a confissão?',                   faixa(1450, 1460)],
  ['Sou obrigado a ir à missa todo domingo?',              [...faixa(2180, 2183), 1389]],
  ['O que é idolatria?',                                   faixa(2112, 2114)],
  ['O que significa dizer amém?',                          faixa(1061, 1065)],
  ['Tenho muita mágoa de uma pessoa, o que fazer?',        faixa(2838, 2845)],
  ['Qual a posição sobre o aborto?',                       faixa(2270, 2275)],
  ['O que é a graça de Deus?',                             faixa(1996, 2005)],
  ['Mulher pode ser padre?',                               faixa(1577, 1578)],
  ['O que é a comunhão dos santos?',                       faixa(946, 962)], // seção inteira
  ['Qual o papel do padrinho no batismo?',                 [1255]],
];

// Controle: escritos depois dos pesos já ajustados nos casos acima, e medidos
// antes de qualquer nova mudança. Se só os de cima melhoram, é sobreajuste.
const CONTROLE = [
  ['O que é o inferno?',                                   faixa(1033, 1037)],
  ['Por que Jesus morreu na cruz?',                        faixa(599, 623)],
  ['O que é o pecado original?',                           faixa(396, 409)],
  ['Posso usar métodos contraceptivos?',                   faixa(2366, 2372)],
  ['O que é a Crisma?',                                    faixa(1285, 1321)],
  ['O que são os anjos?',                                  faixa(328, 336)],
  ['Quais são os pecados capitais?',                       [1866]],
  ['É pecado mentir?',                                     faixa(2482, 2486)],
  ['Para que serve a unção dos enfermos?',                 faixa(1499, 1532)],
  ['O que a Igreja diz sobre o suicídio?',                 faixa(2280, 2283)],
  ['Por que batizar crianças pequenas?',                   faixa(1250, 1252)],
  ['O que é a Tradição?',                                  faixa(75, 83)],
];

const verbose = process.argv.includes('-v');

function avaliar(titulo, casos) {
  console.log(`\n── ${titulo}`);
  let acertos = 0;
  let somaRank = 0;

  for (const [pergunta, esperados] of casos) {
    const achados = recuperar(pergunta, LIMITE).map((r) => r.numero);
    const posicoes = esperados.map((n) => achados.indexOf(n)).filter((i) => i >= 0);
    const ok = posicoes.length > 0;
    if (ok) { acertos++; somaRank += Math.min(...posicoes) + 1; }

    // ⚠: acertou, mas fora da primeira metade do corte — um ajuste pequeno
    // o tira do que vai ao modelo (o §1577 passava aqui em 12º e caía na produção).
    const noLimite = ok && Math.min(...posicoes) + 1 > LIMITE / 2;
    const marca = !ok ? '✗' : noLimite ? '⚠' : '✓';
    const onde = ok ? `#${Math.min(...posicoes) + 1}, ${posicoes.length}/${esperados.length}` : 'fora';
    console.log(`${marca} ${pergunta.padEnd(54)} ${onde}`);
    if (verbose || !ok) console.log(`    veio: ${achados.join(' ')}`);
  }

  console.log(`${acertos}/${casos.length} com acerto no top ${LIMITE} (${Math.round(acertos / casos.length * 100)}%), ` +
              `posição média do 1º acerto: ${(somaRank / Math.max(1, acertos)).toFixed(1)}`);
  return acertos;
}

const total = avaliar('Casos de ajuste', CASOS) + avaliar('Controle', CONTROLE);
const taxa = total / (CASOS.length + CONTROLE.length);
console.log(`\nGeral: ${Math.round(taxa * 100)}%`);

if (taxa < PISO) {
  console.error(`❌ abaixo do piso de ${Math.round(PISO * 100)}%`);
  process.exit(1);
}
