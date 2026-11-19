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
  'Entrada': ['em nome do pai', 'a graca de nosso senhor', 'o senhor esteja convosco'],
  'Ato penitencial': ['confesso a deus', 'reconhecamos', 'por minha culpa', 'tenha compaixao de nos'],
  'Senhor, tende piedade': ['senhor tende piedade', 'senhor piedade', 'kyrie'],
  'Glória': ['gloria a deus nas alturas'],
  'Oração do dia': ['oremos'],
  'Salmo responsorial': ['salmo'],
  'Aclamação ao Evangelho': ['aleluia'],
  'Evangelho': ['proclamacao do evangelho', 'evangelho de jesus cristo segundo'],
  'Homilia': ['palavra da salvacao'],
  'Profissão de fé': ['creio em deus pai', 'creio em um so deus'],
  'Oração dos fiéis': ['escutai a nossa prece', 'senhor escutai', 'ouvi nos senhor', 'oracao da comunidade'],
  'Apresentação das oferendas': ['bendito sejais senhor deus do universo', 'pelo pao que recebemos', 'orai irmaos'],
  'Prefácio e Santo': ['coracoes ao alto', 'nosso coracao esta em deus', 'demos gracas ao senhor nosso deus'],
  'Oração Eucarística': ['fonte de toda santidade', 'pai de misericordia a quem', 'proclamamos a vossa grandeza', 'na verdade vos sois santo', 'na verdade o pai vos sois santo'],
  'Consagração': ['tomai todos e comei', 'isto e o meu corpo'],
  'Mistério da fé': ['eis o misterio da fe', 'misterio da fe', 'anunciamos senhor a vossa morte'],
  'Pai-Nosso': ['pai nosso que estais', 'obedientes a palavra do salvador', 'ousamos dizer'],
  'Paz e Cordeiro de Deus': ['a paz do senhor esteja sempre', 'cordeiro de deus que tirais'],
  'Eis o Cordeiro de Deus': ['felizes os convidados', 'eu nao sou digno'],
  'Comunhão': ['o corpo de cristo'],
  'Oração depois da comunhão': ['oremos'],
  'Bênção e despedida': ['abencoe vos deus todo poderoso', 'ide em paz', 'o senhor vos acompanhe'],
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
export function ouvir({ aoOuvir, aoMudar }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let ligado = true;

  rec.onstart = () => aoMudar('ouvindo');
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      aoOuvir(normalizar(r[0].transcript), r.isFinal);
    }
  };
  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;   // silêncio: segue ouvindo
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { ligado = false; aoMudar('erro', 'O navegador não deu acesso ao microfone.'); return; }
    aoMudar('erro', e.error === 'network' ? 'Sem conexão com o serviço de voz do navegador.' : `Erro no reconhecimento (${e.error}).`);
  };
  // O Chrome encerra a escuta contínua depois de um tempo; enquanto estiver ligado, recomeça
  rec.onend = () => { if (ligado) { try { rec.start(); } catch { /* já começou */ } } else aoMudar('parado'); };
  try { rec.start(); } catch (err) { aoMudar('erro', String(err.message || err)); }
  return { parar() { ligado = false; try { rec.stop(); } catch { /* já parou */ } } };
}
