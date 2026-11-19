/**
 * ouvir.mjs — "Acompanhar pelo áudio" do Modo Missa (experimental).
 *
 * Usa o reconhecimento de voz do navegador (Web Speech API, pt-BR). No Chrome o áudio vai para os
 * servidores do Google; no Safari, para os da Apple. Nada é gravado aqui: só o texto reconhecido
 * passa por este módulo, e só os últimos instantes ficam na memória.
 *
 * A missa tem ordem fixa e cada parte começa com frases conhecidas ("Corações ao alto", "Eis o
 * mistério da fé"…). Em vez de transcrever a missa, o módulo espera, nas próximas partes, uma das
 * frases-âncora de cada uma e avança quando ouve. Nunca volta sozinho.
 */

export const suportado = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** Minúsculas, sem acento e sem pontuação: "Corações ao alto!" → "coracoes ao alto". */
export const normalizar = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** As primeiras N palavras de um texto de leitura (sem números de versículo nem "R."). */
export function comeco(texto, n = 4) {
  const palavras = normalizar(String(texto || '').replace(/^R\.?\s*/m, '').replace(/\b\d+[a-z]?\b/g, ' ')).split(' ').filter(Boolean);
  return palavras.slice(0, n).join(' ');
}

// Frases-âncora de cada parte (como se ouvem nas missas no Brasil; servem só para reconhecer)
export const ANCORAS = {
  'Entrada': ['em nome do pai', 'a graca de nosso senhor', 'o senhor esteja convosco', 'bendito seja deus que nos reuniu'],
  'Ato penitencial': ['confesso a deus', 'reconhecamos', 'por minha culpa', 'tenha compaixao de nos'],
  'Senhor, tende piedade': ['senhor tende piedade', 'senhor piedade', 'kyrie'],
  'Glória': ['gloria a deus nas alturas'],
  'Oração do dia': ['oremos'],
  'Salmo responsorial': ['salmo'],
  'Aclamação ao Evangelho': ['aleluia'],
  'Evangelho': ['o senhor esteja convosco', 'proclamacao do evangelho', 'evangelho de jesus cristo segundo'],
  'Homilia': ['palavra da salvacao'],
  'Profissão de fé': ['creio em deus pai', 'creio em um so deus'],
  'Oração dos fiéis': ['escutai a nossa prece', 'senhor escutai', 'ouvi nos senhor', 'oracao da comunidade'],
  'Apresentação das oferendas': ['bendito sejais senhor deus do universo', 'pelo pao que recebemos', 'orai irmaos'],
  'Prefácio e Santo': ['o senhor esteja convosco', 'coracoes ao alto', 'nosso coracao esta em deus', 'demos gracas ao senhor nosso deus', 'e nosso dever e nossa salvacao'],
  'Oração Eucarística': ['fonte de toda santidade', 'pai de misericordia a quem', 'proclamamos a vossa grandeza', 'na verdade vos sois santo', 'na verdade o pai vos sois santo'],
  'Consagração': ['tomai todos e comei', 'isto e o meu corpo'],
  'Mistério da fé': ['eis o misterio da fe', 'misterio da fe', 'anunciamos senhor a vossa morte', 'vinde senhor jesus'],
  'Pai-Nosso': ['pai nosso que estais', 'pai nosso que estas', 'santificado seja o vosso nome', 'obedientes a palavra do salvador', 'ousamos dizer'],
  'Paz e Cordeiro de Deus': ['a paz do senhor esteja sempre', 'cordeiro de deus que tirais', 'o amor de cristo nos uniu'],
  'Eis o Cordeiro de Deus': ['felizes os convidados', 'eu nao sou digno'],
  'Comunhão': ['o corpo de cristo'],
  'Oração depois da comunhão': ['oremos'],
  'Bênção e despedida': ['o senhor esteja convosco', 'abencoe vos deus todo poderoso', 'ide em paz', 'o senhor vos acompanhe'],
};

// Qual Oração Eucarística começou (as primeiras palavras de cada uma, no texto usado no Brasil)
export const ANCORAS_OE = {
  I: ['pai de misericordia a quem sobem', 'a quem sobem nossos louvores'],
  II: ['fonte de toda santidade', 'fonte de toda a santidade'],
  III: ['tudo o que criastes', 'deus do universo e tudo', 'com razao vos louva'],
  IV: ['proclamamos a vossa grandeza', 'porque sois grande'],
};

/**
 * Liga o reconhecimento. `aoOuvir(textoNormalizado, final)` recebe cada pedaço reconhecido;
 * `aoMudar(estado, detalhe)` recebe 'ouvindo' | 'parado' | 'erro'. Devolve { parar }.
 */
export function ouvir({ aoOuvir, aoMudar, aoDiagnostico = () => {} }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let ligado = true;
  let rec = null;
  let sessoes = 0;

  // Cada sessão é um reconhecedor novo: o Safari do iPhone encerra a escuta contínua sozinho e não
  // aceita recomeçar o mesmo objeto logo em seguida (o start() falha calado e a escuta morre).
  function comecar() {
    if (!ligado) return;
    rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    sessoes++;
    aoDiagnostico({ sessoes, evento: 'início' });
    rec.onstart = () => aoMudar('ouvindo');
    // Junta todos os pedaços desta sessão: o Safari do iPhone entrega a fala em fragmentos curtos
    // (às vezes uma palavra por resultado, sem nunca marcar "final"); o Chrome entrega frases.
    rec.onresult = e => {
      let texto = '';
      for (let i = 0; i < e.results.length; i++) texto += ' ' + e.results[i][0].transcript;
      aoOuvir(normalizar(texto).split(' ').slice(-40).join(' '), false);
    };
    rec.onerror = e => {
      aoDiagnostico({ sessoes, evento: `erro ${e.error}` });
      if (e.error === 'no-speech' || e.error === 'aborted') return;   // silêncio: recomeça no onend
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        ligado = false; aoMudar('erro', 'O navegador não deu acesso ao microfone (no iPhone, confira se o Ditado está ligado).'); return;
      }
      if (e.error === 'network') aoDiagnostico({ sessoes, evento: 'sem rede para o reconhecimento' });
    };
    rec.onend = () => {
      aoDiagnostico({ sessoes, evento: 'fim' });
      if (ligado) setTimeout(comecar, 300); else aoMudar('parado');
    };
    try { rec.start(); }
    catch (err) { aoDiagnostico({ sessoes, evento: `não começou: ${err.message || err}` }); if (ligado) setTimeout(comecar, 1000); }
  }
  comecar();
  return { parar() { ligado = false; try { rec?.stop(); } catch { /* já parou */ } } };
}
