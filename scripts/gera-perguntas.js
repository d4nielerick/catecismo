/**
 * gera-perguntas.js
 * Gerador DETERMINÍSTICO das perguntas populares — sem nenhuma chamada de API/IA.
 *
 * Regra do projeto: citação-first. A resposta de cada pergunta é composta pelos
 * §§ REAIS do Catecismo (citados verbatim, lidos de data/catecismo.json em tempo
 * de execução), mais uma introdução curta e factual (no máximo 2 frases, sem
 * nenhuma afirmação doutrinal própria) que apenas situa onde o Catecismo trata
 * do assunto.
 *
 * A curadoria de "pergunta → quais §§ respondem" é o trabalho humano registado
 * no mapa CURADORIA abaixo. O texto de cada § nunca é colado à mão: vem sempre
 * de data/catecismo.json.
 *
 * Uso: node scripts/gera-perguntas.js
 */

const fs = require('fs');
const path = require('path');

const DEST = path.join(__dirname, '../data/perguntas');
const CATECISMO_PATH = path.join(__dirname, '../data/catecismo.json');

const perguntas = [
  // Sacramentos
  "O que é a Eucaristia segundo o Catecismo?",
  "Quem pode receber a comunhão?",
  "O que é necessário para se confessar?",
  "A Igreja reconhece o batismo de outras religiões?",
  "O que é a Unção dos Enfermos?",
  "Quais são os sete sacramentos da Igreja?",

  // Moral e vida
  "O que a Igreja ensina sobre divórcio?",
  "Casamento civil tem valor para a Igreja?",
  "O que é pecado mortal?",
  "Qual a diferença entre pecado mortal e venial?",
  "O que a Igreja ensina sobre aborto?",
  // "A pena de morte é permitida pela Igreja?" — SUSPENSA: data/catecismo.json traz o §2267
  // truncado (falta a revisão de 2018 que declara a pena de morte inadmissível). Reativar
  // somente após corrigir a fonte, senão a resposta deturpa o ensinamento atual.
  "O que é a eutanásia segundo o Catecismo?",
  "O que o Catecismo ensina sobre mentira?",
  "O que é a consciência moral segundo a Igreja?",

  // Fé e doutrina
  "O que é a Santíssima Trindade?",
  "Por que Maria é chamada de Mãe de Deus?",
  "O que é a Imaculada Conceição?",
  "O que acontece depois da morte segundo a Igreja?",
  "O que é o Purgatório?",
  "A Igreja acredita no inferno?",
  "O que é a ressurreição dos mortos?",
  "Por que rezar para os santos?",
  "O que é a graça de Deus?",
  "O que é a fé segundo o Catecismo?",
  "O que é a esperança cristã?",
  "O que é a caridade segundo a Igreja?",

  // Oração e prática
  "Como rezar o Pai Nosso corretamente?",
  "O que é o Rosário e por que rezar?",
  "É obrigação ir à missa todo domingo?",
  "O que é o jejum e a abstinência na Igreja?",
  // "Quais são os mandamentos da Igreja?" — SUSPENSA: §2042/§2043 truncados na fonte (só 2 dos
  // 5 preceitos têm texto; o §2041 anuncia "são cinco"). Reativar após corrigir data/catecismo.json.
  "O que é a oração segundo o Catecismo?",
  "O que é a lectio divina?",

  // Igreja e sociedade
  "O que é a Igreja Católica segundo o Catecismo?",
  "O que é o magistério da Igreja?",
  "O que a Igreja ensina sobre a pobreza e os pobres?",
  "O que é a doutrina social da Igreja?",
  "O que o Catecismo diz sobre o trabalho?",
  "O que a Igreja ensina sobre o meio ambiente?",
];

/**
 * Curadoria: para cada pergunta, os §§ do CIC mais diretamente responsivos
 * (2 a 5 parágrafos) e o motivo (1 linha) pelo qual cada um foi escolhido.
 * Feita por leitura manual dos candidatos em data/catecismo.json e
 * data/indice_analitico.json — não por busca automática de palavra-chave.
 */
const CURADORIA = {
  "O que é a Eucaristia segundo o Catecismo?": {
    paragrafos: [1323, 1324, 1374, 1376],
    motivos: {
      1323: "Cita a fórmula litúrgica que define a instituição da Eucaristia na última ceia.",
      1324: "Situa a Eucaristia como \"fonte e cume de toda a vida cristã\".",
      1374: "Explica por que a presença de Cristo na Eucaristia é chamada \"real\" por excelência.",
      1376: "Traz a definição de transubstanciação do Concílio de Trento.",
    },
  },
  "Quem pode receber a comunhão?": {
    paragrafos: [1385, 1415, 1457],
    motivos: {
      1385: "Cita São Paulo sobre o exame de consciência antes de comungar.",
      1415: "Define a exigência de estar em estado de graça para comungar.",
      1457: "Explica a obrigação de confessar pecado mortal antes da Comunhão.",
    },
  },
  "O que é necessário para se confessar?": {
    paragrafos: [1450, 1451, 1456],
    motivos: {
      1450: "Resume os três atos do penitente: contrição, confissão e satisfação.",
      1451: "Define o que é a contrição, o primeiro desses atos.",
      1456: "Explica a exigência de enumerar os pecados mortais na confissão.",
    },
  },
  "A Igreja reconhece o batismo de outras religiões?": {
    paragrafos: [1271, 818],
    motivos: {
      1271: "Afirma que o Batismo é o vínculo de comunhão entre todos os cristãos batizados.",
      818: "Reconhece como irmãos, batizados válidos fora da plena comunhão católica.",
    },
  },
  "O que é a Unção dos Enfermos?": {
    paragrafos: [1499, 1511, 1514, 1520],
    motivos: {
      1499: "Descreve o efeito da Unção dos Enfermos: encomendar o doente ao Senhor.",
      1511: "Situa a Unção entre os sete sacramentos como o dedicado à doença.",
      1514: "Esclarece que não é sacramento só para quem está prestes a morrer.",
      1520: "Detalha a graça de conforto, paz e coragem que o sacramento confere.",
    },
  },
  "Quais são os sete sacramentos da Igreja?": {
    paragrafos: [1113, 1210],
    motivos: {
      1113: "Enumera os sete sacramentos da Igreja.",
      1210: "Repete a lista e liga cada sacramento às etapas da vida cristã.",
    },
  },
  "O que a Igreja ensina sobre divórcio?": {
    paragrafos: [2382, 2384, 2386],
    motivos: {
      2382: "Afirma a indissolubilidade do matrimônio querida pelo Criador.",
      2384: "Define o divórcio como ofensa grave à lei natural.",
      2386: "Distingue o cônjuge vítima inocente do divórcio daquele que o causou.",
    },
  },
  "Casamento civil tem valor para a Igreja?": {
    paragrafos: [1630, 1631, 1650],
    motivos: {
      1630: "Explica por que a presença do ministro da Igreja torna o matrimônio uma realidade eclesial.",
      1631: "Afirma a exigência da forma eclesiástica na celebração do matrimônio.",
      1650: "Trata do caso de nova união apenas civil após divórcio, não reconhecida como válida.",
    },
  },
  "O que é pecado mortal?": {
    paragrafos: [1857, 1855, 1861],
    motivos: {
      1857: "Define as três condições simultâneas para o pecado ser mortal.",
      1855: "Contrasta pecado mortal e venial quanto ao efeito sobre a caridade.",
      1861: "Descreve as consequências do pecado mortal não resgatado pelo arrependimento.",
    },
  },
  "Qual a diferença entre pecado mortal e venial?": {
    paragrafos: [1855, 1862, 1863],
    motivos: {
      1855: "Contrasta diretamente o efeito de cada um sobre a caridade no coração.",
      1862: "Define quando um pecado é venial.",
      1863: "Explica por que o pecado venial não quebra a aliança com Deus.",
    },
  },
  "O que a Igreja ensina sobre aborto?": {
    paragrafos: [2270, 2271, 2272],
    motivos: {
      2270: "Afirma que a vida humana deve ser respeitada desde a concepção.",
      2271: "Declara o aborto direto gravemente contrário à lei moral.",
      2272: "Explica a pena canônica de excomunhão ligada à colaboração formal no aborto.",
    },
  },
  "A pena de morte é permitida pela Igreja?": {
    paragrafos: [2265, 2266, 2267],
    motivos: {
      2265: "Situa a legítima defesa como dever de quem é responsável pela vida de outrem.",
      2266: "Explica as finalidades da pena imposta pela autoridade pública.",
      2267: "Trata especificamente do recurso histórico à pena de morte pela autoridade legítima.",
    },
  },
  "O que é a eutanásia segundo o Catecismo?": {
    paragrafos: [2276, 2277, 2278, 2279],
    motivos: {
      2276: "Afirma o respeito devido às pessoas com vida deficiente ou enfraquecida.",
      2277: "Define a eutanásia direta como moralmente inaceitável.",
      2278: "Distingue a eutanásia da legítima recusa de tratamentos desproporcionados.",
      2279: "Trata do uso de analgésicos no fim da vida e dos cuidados paliativos.",
    },
  },
  "O que o Catecismo ensina sobre mentira?": {
    paragrafos: [2482, 2483, 2484],
    motivos: {
      2482: "Define o que é a mentira.",
      2483: "Explica por que a mentira ofende a relação do homem com a verdade.",
      2484: "Estabelece o critério para medir a gravidade de uma mentira.",
    },
  },
  "O que é a consciência moral segundo a Igreja?": {
    paragrafos: [1777, 1776, 1790],
    motivos: {
      1777: "Define a consciência moral e sua função de julgar as opções concretas.",
      1776: "Descreve a consciência como o núcleo secreto onde o homem se encontra a sós com Deus.",
      1790: "Trata do dever de obedecer sempre ao juízo certo da própria consciência.",
    },
  },
  "O que é a Santíssima Trindade?": {
    paragrafos: [253, 254, 261],
    motivos: {
      253: "Define a unidade da Trindade: um só Deus em três pessoas.",
      254: "Explica a distinção real entre as três pessoas divinas.",
      261: "Situa a Trindade como o mistério central da fé cristã.",
    },
  },
  "Por que Maria é chamada de Mãe de Deus?": {
    paragrafos: [495, 466, 509],
    motivos: {
      495: "Explica por que a Igreja confessa Maria como \"Theotokos\", Mãe de Deus.",
      466: "Cita o Concílio de Éfeso (431), que proclamou o título Mãe de Deus.",
      509: "Resume por que Maria é verdadeiramente Mãe de Deus.",
    },
  },
  "O que é a Imaculada Conceição?": {
    paragrafos: [490, 491, 492],
    motivos: {
      490: "Situa a preparação de Maria pela graça para ser Mãe do Salvador.",
      491: "Define o dogma da Imaculada Conceição, proclamado em 1854.",
      492: "Explica que essa santidade de Maria vem inteiramente dos méritos de Cristo.",
    },
  },
  "O que acontece depois da morte segundo a Igreja?": {
    paragrafos: [1021, 1022, 1023],
    motivos: {
      1021: "Explica a retribuição imediata depois da morte de cada um.",
      1022: "Define o juízo particular que decide o destino eterno da alma.",
      1023: "Descreve a visão beatífica de quem morre em graça e já purificado.",
    },
  },
  "O que é o Purgatório?": {
    paragrafos: [1030, 1031, 1032],
    motivos: {
      1030: "Descreve a purificação de quem morre em graça mas ainda não perfeitamente puro.",
      1031: "Nomeia essa purificação como Purgatório e cita os concílios que a definiram.",
      1032: "Liga a doutrina do Purgatório à prática da oração pelos defuntos.",
    },
  },
  "A Igreja acredita no inferno?": {
    paragrafos: [1033, 1035, 1037],
    motivos: {
      1033: "Define o Inferno como a autoexclusão definitiva da comunhão com Deus.",
      1035: "Afirma a doutrina da existência e eternidade do Inferno.",
      1037: "Esclarece que Deus não predestina ninguém para o Inferno.",
    },
  },
  "O que é a ressurreição dos mortos?": {
    paragrafos: [988, 990, 997, 1001],
    motivos: {
      988: "Situa a ressurreição dos mortos como o ponto culminante do Credo.",
      990: "Define o que significa \"ressurreição da carne\".",
      997: "Explica o que é ressuscitar: a reunião do corpo glorificado à alma.",
      1001: "Liga a ressurreição dos mortos à Parusia de Cristo.",
    },
  },
  "Por que rezar para os santos?": {
    paragrafos: [956, 2683],
    motivos: {
      956: "Explica a intercessão dos santos em favor dos que ainda peregrinam na terra.",
      2683: "Situa por que podemos e devemos pedir a intercessão dos santos.",
    },
  },
  "O que é a graça de Deus?": {
    paragrafos: [1996, 1997, 1999],
    motivos: {
      1996: "Define a graça como favor e socorro gratuito de Deus.",
      1997: "Explica a graça como participação na vida da Trindade.",
      1999: "Distingue a graça santificante recebida no Batismo.",
    },
  },
  "O que é a fé segundo o Catecismo?": {
    paragrafos: [26, 150, 1814],
    motivos: {
      26: "Define a fé como a resposta do homem a Deus que Se revela.",
      150: "Explica a fé como adesão pessoal a Deus e assentimento à verdade revelada.",
      1814: "Define a fé como virtude teologal, com a citação de \"o justo viverá pela fé\".",
    },
  },
  "O que é a esperança cristã?": {
    paragrafos: [1817, 1818, 1820],
    motivos: {
      1817: "Define a esperança como virtude teologal que deseja o Reino dos céus.",
      1818: "Explica a função da esperança: proteger contra o desânimo e sustentar na provação.",
      1820: "Liga a esperança cristã às bem-aventuranças e à oração do Pai Nosso.",
    },
  },
  "O que é a caridade segundo a Igreja?": {
    paragrafos: [1822, 1823, 1827],
    motivos: {
      1822: "Define a caridade como a virtude teologal de amar a Deus e ao próximo.",
      1823: "Cita o mandamento novo de Jesus sobre amar como Ele amou.",
      1827: "Explica a caridade como forma e vínculo de todas as outras virtudes.",
    },
  },
  "Como rezar o Pai Nosso corretamente?": {
    paragrafos: [2759, 2761, 2765],
    motivos: {
      2759: "Traz o texto integral do Pai Nosso confiado por Jesus aos discípulos.",
      2761: "Chama o Pai Nosso de \"resumo de todo o Evangelho\" e oração fundamental.",
      2765: "Explica por que essa oração é chamada \"do Senhor\": Ele é mestre e modelo dela.",
    },
  },
  "O que é o Rosário e por que rezar?": {
    paragrafos: [971, 2678, 1674],
    motivos: {
      971: "Chama o Rosário de \"resumo de todo o Evangelho\" e oração mariana.",
      2678: "Situa a origem do Rosário como substituto popular da Liturgia das Horas.",
      1674: "Lista o Rosário entre as formas de piedade popular que cercam a vida sacramental.",
    },
  },
  "É obrigação ir à missa todo domingo?": {
    paragrafos: [2180, 2181, 2042],
    motivos: {
      2180: "Cita o mandamento da Igreja que obriga à participação na missa dominical.",
      2181: "Qualifica como pecado grave faltar deliberadamente a essa obrigação.",
      2042: "Explica o primeiro preceito da Igreja: santificar o domingo participando na Eucaristia.",
    },
  },
  "O que é o jejum e a abstinência na Igreja?": {
    paragrafos: [2043, 1438],
    motivos: {
      2043: "Cita o quarto preceito da Igreja: guardar abstinência e jejuar nos dias determinados.",
      1438: "Situa os tempos de penitência do Ano Litúrgico em que se pratica o jejum.",
    },
  },
  "Quais são os mandamentos da Igreja?": {
    paragrafos: [2041, 2042, 2043],
    motivos: {
      2041: "Introduz os preceitos da Igreja, cinco ao todo, ligados à vida litúrgica e moral.",
      2042: "Detalha o primeiro preceito: participar na missa aos domingos e festas de guarda.",
      2043: "Detalha o quarto preceito: jejuar e guardar abstinência nos dias determinados.",
    },
  },
  "O que é a oração segundo o Catecismo?": {
    paragrafos: [2559, 2560, 2565],
    motivos: {
      2559: "Define a oração como elevação da alma para Deus, fundada na humildade.",
      2560: "Descreve a oração como o encontro da sede de Deus com a sede do homem.",
      2565: "Situa a oração cristã como relação viva com o Pai, o Filho e o Espírito Santo.",
    },
  },
  "O que é a lectio divina?": {
    paragrafos: [2705, 2706, 2708],
    motivos: {
      2705: "Define a meditação como busca apoiada em textos como a Sagrada Escritura.",
      2706: "Explica como meditar no que se lê leva a confrontá-lo com a própria vida.",
      2708: "Cita nominalmente a \"lectio divina\" como forma de meditar nos mistérios de Cristo.",
    },
  },
  "O que é a Igreja Católica segundo o Catecismo?": {
    paragrafos: [748, 811, 813],
    motivos: {
      748: "Explica que a Igreja não tem luz própria, apenas reflete a de Cristo.",
      811: "Enumera os quatro atributos da Igreja: una, santa, católica e apostólica.",
      813: "Detalha por que a Igreja é una: pela sua fonte, seu fundador e sua alma.",
    },
  },
  "O que é o magistério da Igreja?": {
    paragrafos: [85, 890, 2032],
    motivos: {
      85: "Define o Magistério vivo da Igreja como o encarregado de interpretar a Palavra de Deus.",
      890: "Explica a missão do Magistério de proteger o povo de Deus do erro.",
      2032: "Situa o dever da Igreja de anunciar os princípios morais, mesmo de ordem social.",
    },
  },
  "O que a Igreja ensina sobre a pobreza e os pobres?": {
    paragrafos: [2443, 2444, 2448],
    motivos: {
      2443: "Cita a bem-aventurança dos pobres e o critério de Cristo para reconhecer seus eleitos.",
      2444: "Situa o amor da Igreja pelos pobres como parte de sua tradição constante.",
      2448: "Descreve as múltiplas formas de miséria humana e o amor preferencial da Igreja por elas.",
    },
  },
  "O que é a doutrina social da Igreja?": {
    paragrafos: [2419, 2420, 2421],
    motivos: {
      2419: "Situa a doutrina social como fruto da Revelação aplicada às leis da vida social.",
      2420: "Define quando a Igreja emite juízo moral em matéria econômica e social.",
      2421: "Localiza no século XIX o desenvolvimento da doutrina social diante da sociedade industrial.",
    },
  },
  "O que o Catecismo diz sobre o trabalho?": {
    paragrafos: [2427, 2428, 378],
    motivos: {
      2427: "Define o trabalho humano como dever e como possível meio de santificação.",
      2428: "Afirma que o trabalho é para o homem, e não o homem para o trabalho.",
      378: "Situa o trabalho, desde a criação, como colaboração do homem com Deus.",
    },
  },
  "O que a Igreja ensina sobre o meio ambiente?": {
    paragrafos: [2415, 2416, 2417],
    motivos: {
      2415: "Exige o respeito pela integridade da criação, incluindo as gerações futuras.",
      2416: "Situa os animais como criaturas de Deus, merecedoras de estima.",
      2417: "Define os limites morais do uso humano dos animais.",
    },
  },
};

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 70);
}

/** Formata uma lista de §§ em texto tipo "§§ 1323, 1324 e 1376" ou "§ 971". */
function fraseParagrafos(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = sorted[i];
    prev = sorted[i];
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);

  const soSingular = ranges.length === 1 && !ranges[0].includes('–');
  const label = soSingular ? '§' : '§§';
  const prep = soSingular ? 'no' : 'nos';

  let lista;
  if (ranges.length === 1) {
    lista = ranges[0];
  } else if (ranges.length === 2) {
    lista = ranges.join(' e ');
  } else {
    lista = ranges.slice(0, -1).join(', ') + ' e ' + ranges[ranges.length - 1];
  }

  return `${prep} ${label} ${lista}`;
}

function gerarPergunta(pergunta, catecismo) {
  const cur = CURADORIA[pergunta];
  if (!cur) {
    throw new Error(`Sem curadoria definida para: "${pergunta}"`);
  }

  const paragrafos = cur.paragrafos.map((numero) => {
    const p = catecismo[numero];
    if (!p) {
      throw new Error(`§${numero} não existe em catecismo.json (pergunta: "${pergunta}")`);
    }
    const motivo = cur.motivos[numero];
    if (!motivo) {
      throw new Error(`Falta motivo para §${numero} (pergunta: "${pergunta}")`);
    }
    return {
      id: numero,
      motivo,
      trecho: p.texto,
    };
  });

  const resposta = `O Catecismo trata do tema ${fraseParagrafos(cur.paragrafos)}.`;

  return {
    pergunta,
    slug: slugify(pergunta),
    resposta,
    paragrafos,
    gerado_em: new Date().toISOString(),
  };
}

function main() {
  if (!fs.existsSync(DEST)) {
    fs.mkdirSync(DEST, { recursive: true });
  }

  // Carrega catecismo como mapa numero→parágrafo
  const cru = JSON.parse(fs.readFileSync(CATECISMO_PATH, 'utf8'));
  const lista = cru.paragrafos;
  const catecismo = {};
  for (const p of lista) catecismo[p.numero] = p;

  let ok = 0, erros = 0;

  for (const pergunta of perguntas) {
    const slug = slugify(pergunta);
    const dest = path.join(DEST, `${slug}.json`);

    try {
      const resultado = gerarPergunta(pergunta, catecismo);
      fs.writeFileSync(dest, JSON.stringify(resultado, null, 2) + '\n');
      console.log(`✓ ${slug}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${slug}: ${e.message}`);
      erros++;
    }
  }

  console.log(`\nConcluído: ${ok} geradas, ${erros} erros`);

  if (erros > 0) {
    process.exit(1);
  }

  // Gera índice
  const arquivos = fs.readdirSync(DEST).filter(f => f.endsWith('.json') && f !== '_indice.json');
  const indice = arquivos.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(DEST, f), 'utf8'));
    return { slug: data.slug, pergunta: data.pergunta };
  });
  fs.writeFileSync(path.join(DEST, '_indice.json'), JSON.stringify(indice, null, 2) + '\n');
  console.log(`\n📋 Índice gerado: ${indice.length} perguntas`);
}

main();
