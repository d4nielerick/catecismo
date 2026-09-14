/**
 * scripts/lib-calendario-liturgico.mjs — nome litúrgico de um dia (Calendário Romano Geral + Brasil).
 *
 * Usado por build-liturgia.mjs e validado contra as próprias leituras em verifica-liturgia.mjs.
 * Particularidades do Brasil (CNBB), conferidas nas leituras de data/liturgia-fonte/:
 *  - Epifania no domingo entre 2 e 8/jan; Batismo do Senhor no domingo seguinte
 *    (na segunda-feira, se a Epifania cair em 7 ou 8/jan).
 *  - Ascensão no 7º domingo da Páscoa; Corpus Christi na quinta-feira.
 *  - São Pedro e São Paulo no domingo entre 28/jun e 4/jul; Assunção no domingo entre 15 e 21/ago;
 *    Todos os Santos no domingo entre 1º e 7/nov (fica no dia 1º quando Finados cai no domingo).
 *  - Nossa Senhora Aparecida (12/out) é solenidade; a Imaculada Conceição permanece no 8/dez
 *    mesmo em domingo do Advento (é o que as leituras de 2024 trazem).
 *
 * Retorna { tempo, celebracao, complemento }: `tempo` no mesmo vocabulário da fonte
 * ("Tempo Comum", "Tempo da Páscoa"…); `complemento` é o dia de semana quando a celebração é memória.
 */

const DIA = 86400000;
const utc = (a, m, d) => Date.UTC(a, m - 1, d);
const diaSemana = ms => new Date(ms).getUTCDay();
const domingoEmOuApos = ms => ms + ((7 - diaSemana(ms)) % 7) * DIA;
const domingoDaSemana = ms => ms - diaSemana(ms) * DIA;
const semanas = (de, ate) => Math.round((ate - de) / DIA / 7);

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const mas = n => `${n}º`;
const fem = n => `${n}ª`;

export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes, dia);
}

function marcos(ano) {
  const P = pascoa(ano);
  const epifania = domingoEmOuApos(utc(ano, 1, 2));
  const batismo = new Date(epifania).getUTCDate() >= 7 ? epifania + DIA : epifania + 7 * DIA;
  const advento = domingoEmOuApos(utc(ano, 11, 27));
  let sagradaFamilia = domingoEmOuApos(utc(ano, 12, 26));
  if (sagradaFamilia > utc(ano, 12, 31)) sagradaFamilia = utc(ano, 12, 30);
  return {
    P, epifania, batismo, advento, sagradaFamilia,
    cinzas: P - 46 * DIA, ramos: P - 7 * DIA, pentecostes: P + 49 * DIA, cristoRei: advento - 7 * DIA,
  };
}

// grau do temporal: 'S' solenidade | 'privilegiado' (Cinzas, Semana Santa, oitava da Páscoa)
// | 'domingoForte' (Advento, Quaresma, Páscoa) | 'domingoComum' | 'oitava' (do Natal)
// | 'ferialMaior' (Quaresma, 17–24/dez) | 'ferial' | 'F' (festa do Senhor no temporal)
function temporal(ms, M) {
  const dt = new Date(ms);
  const mes = dt.getUTCMonth() + 1, d = dt.getUTCDate(), ano = dt.getUTCFullYear();
  const ds = diaSemana(ms), nomeDia = DIAS[ds];

  if (ms >= utc(ano, 12, 25)) {
    const tempo = 'Tempo do Natal';
    if (d === 25) return { tempo, nome: 'Natal do Senhor', grau: 'S' };
    if (ms === M.sagradaFamilia) return { tempo, nome: 'Sagrada Família de Jesus, Maria e José', grau: 'F' };
    return { tempo, nome: `${mas(d - 24)} dia da Oitava do Natal`, grau: 'oitava' };
  }
  if (ms <= M.batismo) {
    const tempo = 'Tempo do Natal';
    if (mes === 1 && d === 1) return { tempo, nome: 'Santa Maria, Mãe de Deus', grau: 'S' };
    if (ms === M.epifania) return { tempo, nome: 'Epifania do Senhor', grau: 'S' };
    if (ms === M.batismo) return { tempo, nome: 'Batismo do Senhor', grau: 'F' };
    const nome = ms < M.epifania ? `${nomeDia} do Tempo do Natal` : `${nomeDia} depois da Epifania`;
    return { tempo, nome, grau: 'ferial' };
  }
  if (ms >= M.advento) {
    const tempo = 'Tempo do Advento';
    const w = semanas(M.advento, domingoDaSemana(ms)) + 1;
    if (ds === 0) return { tempo, nome: `${mas(w)} Domingo do Advento`, grau: 'domingoForte' };
    return { tempo, nome: `${nomeDia} da ${fem(w)} Semana do Advento`, grau: mes === 12 && d >= 17 ? 'ferialMaior' : 'ferial' };
  }
  if (ms < M.cinzas) {
    const base = diaSemana(M.batismo) === 0 ? M.batismo : M.epifania;
    return tempoComum(semanas(base, domingoDaSemana(ms)) + 1, ds);
  }
  if (ms < M.ramos) {
    const tempo = 'Tempo da Quaresma';
    if (ms === M.cinzas) return { tempo, nome: 'Quarta-feira de Cinzas', grau: 'privilegiado' };
    if (ms < M.cinzas + 4 * DIA) return { tempo, nome: `${nomeDia} depois das Cinzas`, grau: 'ferialMaior' };
    const w = semanas(M.cinzas + 4 * DIA, domingoDaSemana(ms)) + 1;
    if (ds === 0) return { tempo, nome: `${mas(w)} Domingo da Quaresma`, grau: 'domingoForte' };
    return { tempo, nome: `${nomeDia} da ${fem(w)} Semana da Quaresma`, grau: 'ferialMaior' };
  }
  if (ms < M.P) {
    const tempo = 'Semana Santa';
    const nome = ['Domingo de Ramos e da Paixão do Senhor', 'Segunda-feira Santa', 'Terça-feira Santa',
      'Quarta-feira Santa', 'Quinta-feira Santa', 'Sexta-feira da Paixão do Senhor', 'Sábado Santo'][ds];
    return { tempo, nome, grau: 'privilegiado' };
  }
  if (ms <= M.pentecostes) {
    const tempo = 'Tempo da Páscoa';
    if (ms === M.P) return { tempo, nome: 'Domingo de Páscoa na Ressurreição do Senhor', grau: 'S' };
    if (ms < M.P + 7 * DIA) return { tempo, nome: `${nomeDia} da Oitava da Páscoa`, grau: 'privilegiado' };
    if (ms === M.P + 42 * DIA) return { tempo, nome: 'Ascensão do Senhor', grau: 'S' };
    if (ms === M.pentecostes) return { tempo, nome: 'Domingo de Pentecostes', grau: 'S' };
    const w = semanas(M.P, domingoDaSemana(ms)) + 1;
    if (ds === 0) {
      const nome = w === 2 ? '2º Domingo da Páscoa (da Divina Misericórdia)' : `${mas(w)} Domingo da Páscoa`;
      return { tempo, nome, grau: 'domingoForte' };
    }
    return { tempo, nome: `${nomeDia} da ${fem(w)} Semana da Páscoa`, grau: 'ferial' };
  }
  if (ms === M.cristoRei) return { tempo: 'Tempo Comum', nome: 'Nosso Senhor Jesus Cristo, Rei do Universo', grau: 'S' };
  return tempoComum(34 - semanas(domingoDaSemana(ms), M.cristoRei), ds);
}

function tempoComum(w, ds) {
  const tempo = 'Tempo Comum';
  if (ds === 0) return { tempo, nome: `${mas(w)} Domingo do Tempo Comum`, grau: 'domingoComum' };
  return { tempo, nome: `${DIAS[ds]} da ${fem(w)} Semana do Tempo Comum`, grau: 'ferial' };
}

// ── Santoral e solenidades móveis ────────────────────────────────────────────
// grau: 'S' solenidade | 'FS' festa do Senhor (vence domingo comum) | 'F' festa | 'M' memória
const FIXAS = {
  '01-25': ['F', 'Conversão de São Paulo'],
  '02-02': ['FS', 'Apresentação do Senhor'],
  '02-22': ['F', 'Cátedra de São Pedro'],
  '04-25': ['F', 'São Marcos, evangelista'],
  '05-03': ['F', 'São Filipe e São Tiago, apóstolos'],
  '05-14': ['F', 'São Matias, apóstolo'],
  '05-31': ['F', 'Visitação de Nossa Senhora'],
  '06-24': ['S', 'Natividade de São João Batista'],
  '07-03': ['F', 'São Tomé, apóstolo'],
  '07-22': ['F', 'Santa Maria Madalena'],
  '07-25': ['F', 'São Tiago, apóstolo'],
  '08-06': ['FS', 'Transfiguração do Senhor'],
  '08-10': ['F', 'São Lourenço, diácono e mártir'],
  '08-24': ['F', 'São Bartolomeu, apóstolo'],
  '09-08': ['F', 'Natividade de Nossa Senhora'],
  '09-14': ['FS', 'Exaltação da Santa Cruz'],
  '09-21': ['F', 'São Mateus, apóstolo e evangelista'],
  '09-29': ['F', 'São Miguel, São Gabriel e São Rafael, arcanjos'],
  '10-12': ['S', 'Nossa Senhora da Conceição Aparecida'],
  '10-18': ['F', 'São Lucas, evangelista'],
  '10-28': ['F', 'São Simão e São Judas, apóstolos'],
  '11-02': ['S', 'Comemoração de todos os fiéis defuntos'],
  '11-09': ['FS', 'Dedicação da Basílica do Latrão'],
  '11-30': ['F', 'Santo André, apóstolo'],
  '12-08': ['S', 'Imaculada Conceição de Nossa Senhora'],
  '12-12': ['F', 'Nossa Senhora de Guadalupe'],
  '12-26': ['F', 'Santo Estêvão, primeiro mártir'],
  '12-27': ['F', 'São João, apóstolo e evangelista'],
  '12-28': ['F', 'Santos Inocentes, mártires'],

  '01-02': ['M', 'São Basílio Magno e São Gregório Nazianzeno'],
  '01-17': ['M', 'Santo Antão, abade'],
  '01-21': ['M', 'Santa Inês, virgem e mártir'],
  '01-24': ['M', 'São Francisco de Sales'],
  '01-26': ['M', 'São Timóteo e São Tito, bispos'],
  '01-28': ['M', 'São Tomás de Aquino'],
  '01-31': ['M', 'São João Bosco'],
  '02-05': ['M', 'Santa Águeda, virgem e mártir'],
  '02-06': ['M', 'São Paulo Miki e companheiros, mártires'],
  '02-10': ['M', 'Santa Escolástica, virgem'],
  '02-23': ['M', 'São Policarpo, bispo e mártir'],
  '04-29': ['M', 'Santa Catarina de Sena'],
  '05-02': ['M', 'Santo Atanásio'],
  '05-26': ['M', 'São Filipe Néri'],
  '06-01': ['M', 'São Justino, mártir'],
  '06-03': ['M', 'São Carlos Lwanga e companheiros, mártires'],
  '06-05': ['M', 'São Bonifácio, bispo e mártir'],
  '06-11': ['M', 'São Barnabé, apóstolo'],
  '06-13': ['M', 'Santo Antônio de Pádua'],
  '06-21': ['M', 'São Luís Gonzaga'],
  '06-28': ['M', 'Santo Irineu, bispo e mártir'],
  '07-09': ['M', 'Santa Paulina do Coração Agonizante de Jesus'],
  '07-11': ['M', 'São Bento, abade'],
  '07-15': ['M', 'São Boaventura'],
  '07-29': ['M', 'Santa Marta, Santa Maria e São Lázaro'],
  '07-31': ['M', 'Santo Inácio de Loyola'],
  '08-01': ['M', 'Santo Afonso Maria de Ligório'],
  '08-04': ['M', 'São João Maria Vianney'],
  '08-08': ['M', 'São Domingos'],
  '08-11': ['M', 'Santa Clara, virgem'],
  '08-14': ['M', 'São Maximiliano Maria Kolbe, mártir'],
  '08-20': ['M', 'São Bernardo'],
  '08-21': ['M', 'São Pio X, papa'],
  '08-22': ['M', 'Nossa Senhora Rainha'],
  '08-27': ['M', 'Santa Mônica'],
  '08-28': ['M', 'Santo Agostinho'],
  '08-29': ['M', 'Martírio de São João Batista'],
  '09-03': ['M', 'São Gregório Magno'],
  '09-13': ['M', 'São João Crisóstomo'],
  '09-15': ['M', 'Nossa Senhora das Dores'],
  '09-16': ['M', 'São Cornélio e São Cipriano, mártires'],
  '09-20': ['M', 'Santo André Kim Taegon, São Paulo Chong Hasang e companheiros, mártires'],
  '09-23': ['M', 'São Pio de Pietrelcina'],
  '09-27': ['M', 'São Vicente de Paulo'],
  '09-30': ['M', 'São Jerônimo'],
  '10-01': ['M', 'Santa Teresinha do Menino Jesus'],
  '10-02': ['M', 'Santos Anjos da Guarda'],
  '10-04': ['M', 'São Francisco de Assis'],
  '10-07': ['M', 'Nossa Senhora do Rosário'],
  '10-15': ['M', 'Santa Teresa de Jesus'],
  '10-17': ['M', 'Santo Inácio de Antioquia, bispo e mártir'],
  '10-25': ['M', 'Santo Antônio de Sant’Ana Galvão'],
  '11-04': ['M', 'São Carlos Borromeu'],
  '11-10': ['M', 'São Leão Magno, papa'],
  '11-11': ['M', 'São Martinho de Tours'],
  '11-12': ['M', 'São Josafá, bispo e mártir'],
  '11-21': ['M', 'Apresentação de Nossa Senhora'],
  '11-22': ['M', 'Santa Cecília, virgem e mártir'],
  '11-24': ['M', 'Santo André Dung-Lac e companheiros, mártires'],
  '12-03': ['M', 'São Francisco Xavier'],
  '12-07': ['M', 'Santo Ambrósio'],
  '12-13': ['M', 'Santa Luzia, virgem e mártir'],
  '12-14': ['M', 'São João da Cruz'],
};

const mmdd = ms => new Date(ms).toISOString().slice(5, 10);

function proprios(ano, M) {
  const mapa = new Map();
  const por = (ms, grau, nome) => { if (!mapa.has(ms)) mapa.set(ms, { grau, nome }); };

  // Móveis e transferências vêm antes: ocupam o dia e deslocam o fixo, se houver.
  por(M.P + 56 * DIA, 'S', 'Santíssima Trindade');
  por(M.P + 60 * DIA, 'S', 'Santíssimo Corpo e Sangue de Cristo');
  por(M.P + 68 * DIA, 'S', 'Sagrado Coração de Jesus');
  por(M.P + 50 * DIA, 'M', 'Bem-aventurada Virgem Maria, Mãe da Igreja');
  por(M.P + 69 * DIA, 'M', 'Imaculado Coração de Maria');

  let jose = utc(ano, 3, 19);
  if (jose >= M.ramos && jose <= M.P + 7 * DIA) jose = M.ramos - DIA;
  else if (diaSemana(jose) === 0) jose += DIA;
  por(jose, 'S', 'São José, esposo da Virgem Maria');

  let anunciacao = utc(ano, 3, 25);
  if (anunciacao >= M.ramos && anunciacao <= M.P + 7 * DIA) anunciacao = M.P + 8 * DIA;
  else if (diaSemana(anunciacao) === 0) anunciacao += DIA;
  por(anunciacao, 'S', 'Anunciação do Senhor');

  const joaoBatista = utc(ano, 6, 24);
  if (joaoBatista === M.P + 68 * DIA) por(joaoBatista - DIA, 'S', FIXAS['06-24'][1]);

  por(domingoEmOuApos(utc(ano, 6, 28)), 'S', 'São Pedro e São Paulo, apóstolos');
  por(domingoEmOuApos(utc(ano, 8, 15)), 'S', 'Assunção de Nossa Senhora');
  const finadosNoDomingo = diaSemana(utc(ano, 11, 2)) === 0;
  por(finadosNoDomingo ? utc(ano, 11, 1) : domingoEmOuApos(utc(ano, 11, 1)), 'S', 'Todos os Santos');

  for (const [md, [grau, nome]] of Object.entries(FIXAS)) {
    const [m, d] = md.split('-').map(Number);
    const ms = utc(ano, m, d);
    if (md === '06-24' && ms === M.P + 68 * DIA) continue;
    por(ms, grau, nome);
  }
  return mapa;
}

function vence(prop, tmp, ms) {
  const g = tmp.grau;
  if (g === 'S' || g === 'privilegiado') return false;
  if (g === 'domingoForte') return prop.grau === 'S' && mmdd(ms) === '12-08';
  if (g === 'F') return prop.grau === 'S';
  if (g === 'domingoComum') return prop.grau === 'S' || prop.grau === 'FS';
  if (g === 'oitava' || g === 'ferialMaior') return prop.grau !== 'M';
  return true; // ferial
}

/** @param {string} iso AAAA-MM-DD */
export function diaLiturgico(iso) {
  const [ano, m, d] = iso.split('-').map(Number);
  const ms = utc(ano, m, d);
  const M = marcos(ano);
  const tmp = temporal(ms, M);
  const prop = proprios(ano, M).get(ms);
  if (!prop || !vence(prop, tmp, ms)) return { tempo: tmp.tempo, celebracao: tmp.nome, complemento: null };
  return {
    tempo: tmp.tempo,
    celebracao: prop.nome,
    complemento: prop.grau === 'M' ? tmp.nome : null,
  };
}
