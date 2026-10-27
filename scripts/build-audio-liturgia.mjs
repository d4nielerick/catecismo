/**
 * scripts/build-audio-liturgia.mjs — leitura em voz alta de uma leitura do dia (piloto).
 *
 *   node scripts/build-audio-liturgia.mjs AAAA-MM-DD evangelho            # gera (ElevenLabs) e grava
 *   node scripts/build-audio-liturgia.mjs AAAA-MM-DD todas                # todas as leituras do dia
 *   … --ensaio                                                            # só mostra o texto que seria lido
 *   (leituras: primeira-leitura, salmo, segunda-leitura, evangelho — os ids dos cards na página)
 *   node scripts/build-audio-liturgia.mjs AAAA-MM-DD evangelho audio.mp3 tempos.json   # só monta, sem gerar
 *   … --gemini                                                            # voz do Gemini (grátis, devagar)
 *   … --grok                                                              # voz do Grok TTS (xAI, voz "leo")
 *
 * Gera a voz com antecedência (fora do site, nada de IA em tempo de execução): o texto falado é o
 * texto oficial da leitura, sem números de versículo, com a abertura e o fecho litúrgicos. O
 * ElevenLabs devolve o tempo de cada caractere; aqui isso vira o tempo de cada LINHA do lecionário
 * (as linhas da fonte já são unidades de sentido), que a tela de leitura destaca enquanto a voz lê.
 *
 * Saída: data/liturgia-audio/AAAA-MM-DD/<leitura>.mp3 e <leitura>.json
 *   { referencia, voz, duracao, linhas: [{ t0, t1, texto }] }
 * A chave do ElevenLabs vem do Porta-chaves do macOS (item "elevenlabs-api-key") ou de ELEVENLABS_API_KEY.
 *
 * Com --gemini a voz é do Gemini TTS (item "gemini-api-key"), que não devolve tempos: o Whisper
 * (instalado no Mac, modelo large-v3-turbo) marca o tempo de cada palavra ouvida, e as palavras
 * ouvidas são casadas com as do texto oficial (as que não casam ficam entre as vizinhas). Pula
 * leituras que já têm áudio do Gemini; na cota gratuita esgotada (429), para sem erro.
 * Com --grok a voz é do Grok TTS (item "xai-api-key"), com o mesmo caminho do Whisper.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEMINI = process.argv.includes('--gemini');
const GROK = process.argv.includes('--grok');
const VOZ = GROK ? { id: 'leo', nome: 'leo (Grok TTS)' }
  : GEMINI ? { modelo: process.env.GEMINI_MODELO || 'gemini-3.8-flash-tts', id: 'Algenib', nome: `Algenib (${process.env.GEMINI_MODELO || 'gemini-3.8-flash-tts'})` }
  : { id: 'onwK4e9ZLuTAKqWW03F9', nome: 'Daniel (ElevenLabs, v4)' };
const ENSAIO = process.argv.includes('--ensaio');   // só mostra o texto que seria lido, sem gerar
const [dt, pedido = 'evangelho', audioArq, temposArq] = process.argv.slice(2).filter(a => !a.startsWith('--'));

const dia = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'liturgia', `${dt}.json`), 'utf8'));
const principais = dia.missas[0].leituras.filter(l => !l.alternativa);
const ACHAR = {
  'primeira-leitura': l => l.tipo === 'leitura' && /^1ª/.test(l.rotulo),
  'segunda-leitura': l => l.tipo === 'leitura' && /^2ª|Epístola/.test(l.rotulo),
  salmo: l => l.tipo === 'salmo',
  evangelho: l => l.tipo === 'evangelho',
};

// "Leitura do Livro dos Provérbios", "Leitura da Carta de São Paulo aos Filipenses"…
const LIVROS = {
  Gn: 'do Livro do Gênesis', Ex: 'do Livro do Êxodo', Lv: 'do Livro do Levítico', Nm: 'do Livro dos Números', Dt: 'do Livro do Deuteronômio',
  Js: 'do Livro de Josué', Jz: 'do Livro dos Juízes', Rt: 'do Livro de Rute', '1Sm': 'do Primeiro Livro de Samuel', '2Sm': 'do Segundo Livro de Samuel',
  '1Rs': 'do Primeiro Livro dos Reis', '2Rs': 'do Segundo Livro dos Reis', '1Cr': 'do Primeiro Livro das Crônicas', '2Cr': 'do Segundo Livro das Crônicas',
  Esd: 'do Livro de Esdras', Ne: 'do Livro de Neemias', Tb: 'do Livro de Tobias', Jt: 'do Livro de Judite', Est: 'do Livro de Ester',
  '1Mc': 'do Primeiro Livro dos Macabeus', '2Mc': 'do Segundo Livro dos Macabeus', 'Jó': 'do Livro de Jó', Pr: 'do Livro dos Provérbios',
  Ecl: 'do Livro do Eclesiastes', Ct: 'do Livro do Cântico dos Cânticos', Sb: 'do Livro da Sabedoria', Eclo: 'do Livro do Eclesiástico',
  Is: 'do Livro do Profeta Isaías', Jr: 'do Livro do Profeta Jeremias', Lm: 'do Livro das Lamentações', Br: 'do Livro do Profeta Baruc',
  Ez: 'da Profecia de Ezequiel', Dn: 'da Profecia de Daniel', Os: 'da Profecia de Oseias', Jl: 'da Profecia de Joel', Am: 'da Profecia de Amós',
  Ab: 'da Profecia de Abdias', Jn: 'da Profecia de Jonas', Mq: 'da Profecia de Miqueias', Na: 'da Profecia de Naum', Hab: 'da Profecia de Habacuc',
  Sf: 'da Profecia de Sofonias', Ag: 'da Profecia de Ageu', Zc: 'da Profecia de Zacarias', Ml: 'da Profecia de Malaquias',
  At: 'dos Atos dos Apóstolos', Rm: 'da Carta de São Paulo aos Romanos', '1Cor': 'da Primeira Carta de São Paulo aos Coríntios',
  '2Cor': 'da Segunda Carta de São Paulo aos Coríntios', Gl: 'da Carta de São Paulo aos Gálatas', Ef: 'da Carta de São Paulo aos Efésios',
  Fl: 'da Carta de São Paulo aos Filipenses', Cl: 'da Carta de São Paulo aos Colossenses', '1Ts': 'da Primeira Carta de São Paulo aos Tessalonicenses',
  '2Ts': 'da Segunda Carta de São Paulo aos Tessalonicenses', '1Tm': 'da Primeira Carta de São Paulo a Timóteo', '2Tm': 'da Segunda Carta de São Paulo a Timóteo',
  Tt: 'da Carta de São Paulo a Tito', Fm: 'da Carta de São Paulo a Filêmon', Hb: 'da Carta aos Hebreus', Tg: 'da Carta de São Tiago',
  '1Pd': 'da Primeira Carta de São Pedro', '2Pd': 'da Segunda Carta de São Pedro', '1Jo': 'da Primeira Carta de São João',
  '2Jo': 'da Segunda Carta de São João', '3Jo': 'da Terceira Carta de São João', Jd: 'da Carta de São Judas', Ap: 'do Livro do Apocalipse de São João',
};
const EVANGELISTA = { Mt: 'Mateus', Mc: 'Marcos', Lc: 'Lucas', Jo: 'João' };
const VERSO = /^(\d+[a-z]?|\d+,\d+[a-z]?|[a-z])$/;

/** Texto falado de uma leitura, em unidades (linhas do lecionário) na ordem em que são lidas. */
function unidadesDe(l) {
  const livro = l.referencia.split(' ')[0];
  const linhas = l.texto.split('\n').map(x => x.replace(/[*†]/g, '').trim()).filter(x => x && !VERSO.test(x));
  if (l.tipo === 'evangelho') {
    return [`Evangelho de Nosso Senhor Jesus Cristo segundo ${EVANGELISTA[livro] || ''}.`, ...linhas, 'Palavra da Salvação.'];
  }
  if (l.tipo === 'salmo') {
    // o refrão vem depois do primeiro "R." e termina no primeiro versículo (número ou linha com "*"),
    // a mesma regra de render.mjs; cada "R." sozinho depois repete o refrão
    const cruas = l.texto.split('\n').map(x => x.trim()).filter(Boolean);
    const refrao = [];
    let i = 0;
    if (/^R\.?$/.test(cruas[0])) {
      for (i = 1; i < cruas.length && !VERSO.test(cruas[i]) && !cruas[i].includes('*') && !/^R\.?$/.test(cruas[i]); i++) {
        if (!/^Ou:?$/i.test(cruas[i])) refrao.push(cruas[i]);
      }
    }
    const saida = ['Salmo responsorial.', ...refrao];
    for (; i < cruas.length; i++) {
      const x = cruas[i].replace(/[*†]/g, '').trim();
      if (!x || VERSO.test(x)) continue;
      saida.push(...(/^R\.?$/.test(x) ? refrao : [x]));
    }
    return saida;
  }
  const abertura = LIVROS[livro] ? `Leitura ${LIVROS[livro]}.` : `${l.rotulo}.`;
  return [abertura, ...linhas, 'Palavra do Senhor.'];
}

async function gerarLeitura(qual) {
  const leitura = principais.find(ACHAR[qual]);
  if (!leitura) { console.log(`${dt}: sem ${qual}`); return; }
  const unidades = unidadesDe(leitura);
  const jaFeito = path.join(RAIZ, 'data', 'liturgia-audio', dt, `${qual}.json`);
  if ((GEMINI || GROK) && !ENSAIO && fs.existsSync(jaFeito) && JSON.parse(fs.readFileSync(jaFeito, 'utf8')).voz === VOZ.nome) return;
  const falado = unidades.join(' ').replace(/\s+/g, ' ').trim();
  if (ENSAIO) { console.log(`\n── ${qual} (${falado.length} caracteres)\n${unidades.join('\n')}`); return; }
  const { audio, tempos } = audioArq
    ? { audio: fs.readFileSync(audioArq), tempos: JSON.parse(fs.readFileSync(temposArq, 'utf8')) }
    : GEMINI || GROK ? gerarGemini(unidades, falado) : await gerar(falado);
  if (!audio) return;
  montar(qual, leitura, unidades, falado, audio, tempos);
}

async function gerar(falado) {
  let chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) chave = execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'elevenlabs-api-key', '-w']).toString().trim();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOZ.id}/with-timestamps?output_format=mp3_44100_96`, {
    method: 'POST',
    headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: falado, model_id: 'eleven_v4', language_code: 'pt',
      voice_settings: { stability: 0.5 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { audio: Buffer.from(j.audio_base64, 'base64'), tempos: j.alignment };
}

/** Gemini TTS + Whisper: devolve o áudio (mp3) e tempos por caractere no formato do ElevenLabs.
 *  O refrão repetido do salmo faz o filtro de direitos autorais do Gemini recusar o texto (parece
 *  letra de música): por isso cada linha vai uma vez só, e as repetições reusam o mesmo trecho de áudio. */
function gerarGemini(unidades, falado) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'voz-'));
  const wav = path.join(tmp, 'voz.wav'), mp3 = path.join(tmp, 'voz.mp3');
  const unicas = [...new Set(unidades)];
  const faladoU = unicas.join(' ').replace(/\s+/g, ' ').trim();
  if (GROK) sintetizarGrok(unicas, tmp, wav);
  else {
  const chave = execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'gemini-api-key', '-w']).toString().trim();
  const instrucao = 'Leia em português do Brasil, com sotaque brasileiro neutro (T e R como no Brasil), como um leitor da Palavra '
    + 'na missa: voz calma, sóbria e reverente, em ritmo um pouco mais ágil, sem dramatizar. Pausa breve ao fim de cada linha.';
  fs.writeFileSync(path.join(tmp, 'pedido.json'), JSON.stringify({
    contents: [{ parts: [{ text: `${instrucao}\n\n${unicas.join('\n')}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ.id } } } },
  }));
  const resp = path.join(tmp, 'resp.json');
  execFileSync('curl', ['-s', '--max-time', '900', '-o', resp, '-H', 'Content-Type: application/json', '-H', `x-goog-api-key: ${chave}`,
    '-d', `@${path.join(tmp, 'pedido.json')}`, `https://generativelanguage.googleapis.com/v1beta/models/${VOZ.modelo}:generateContent`]);
  const j = JSON.parse(fs.readFileSync(resp, 'utf8'));
  if (j.error?.code === 429 || j.error?.code === 503) { console.log(`${dt}: Gemini indisponível agora (${j.error.code}: cota do dia ou demanda alta) — tente mais tarde`); process.exit(0); }
  const dados = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!dados) throw new Error(`Gemini: ${JSON.stringify(j.error || j).slice(0, 200)}`);
  fs.writeFileSync(wav, Buffer.from(dados, 'base64'));
  }
  execFileSync('whisper', [wav, '--model', 'large-v3-turbo', '--language', 'pt', '--word_timestamps', 'True',
    '--output_format', 'json', '--output_dir', tmp, '--fp16', 'False'], { stdio: 'ignore' });
  const ouvidas = JSON.parse(fs.readFileSync(path.join(tmp, 'voz.json'), 'utf8')).segments.flatMap(sg => sg.words || []);
  const tu = tempoPorCaractere(faladoU, ouvidas);
  const duracaoWav = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString();

  // trecho de áudio de cada linha única: de pouco antes da 1ª palavra até pouco antes da linha seguinte
  // (o que vem antes da 1ª linha — às vezes a instrução lida em voz alta — fica de fora)
  let pos = 0;
  const trechos = unicas.map(u => {
    const t = u.replace(/\s+/g, ' ').trim(), a = faladoU.indexOf(t, pos); pos = a + t.length;
    return { a, b: a + t.length, ini: tu.character_start_times_seconds[a] };
  });
  trechos.forEach((x, k) => {
    x.de = Math.max(0, x.ini - 0.2, k ? trechos[k - 1].fim ?? 0 : 0);
    x.ate = k < trechos.length - 1 ? Math.max(x.de, trechos[k + 1].ini - 0.2) : duracaoWav;
    x.fim = x.ate;
  });
  // monta na ordem do lecionário (repetindo o refrão) e recalcula os tempos de cada caractere
  const ordem = unidades.map(u => unicas.indexOf(u));
  const filtro = ordem.map((k, i) => `[0:a]atrim=${trechos[k].de}:${trechos[k].ate},asetpts=PTS-STARTPTS[s${i}]`).join(';')
    + `;${ordem.map((_, i) => `[s${i}]`).join('')}concat=n=${ordem.length}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-filter_complex', filtro, '-map', '[out]', '-b:a', '96k', mp3]);
  const ini = [], fim = [];
  let desloc = 0, p = 0;
  ordem.forEach((k, i) => {
    const x = trechos[k], t = unidades[i].replace(/\s+/g, ' ').trim(), a = falado.indexOf(t, p);
    for (; p < a; p++) { ini[p] = fim[p] = ini[p - 1] ?? 0; }             // espaço entre linhas
    for (let c = 0; c < t.length; c++, p++) {
      ini[p] = tu.character_start_times_seconds[x.a + c] - x.de + desloc;
      fim[p] = tu.character_end_times_seconds[x.a + c] - x.de + desloc;
    }
    desloc += x.ate - x.de;
  });
  return { audio: fs.readFileSync(mp3), tempos: { characters: [...falado], character_start_times_seconds: ini, character_end_times_seconds: fim } };
}

/** Grok TTS: lê as linhas como estão (não aceita instrução de estilo; a voz "leo" já é sóbria). */
function sintetizarGrok(unicas, tmp, wav) {
  const chave = execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'xai-api-key', '-w']).toString().trim();
  fs.writeFileSync(path.join(tmp, 'pedido.json'), JSON.stringify({
    text: unicas.join('\n'), language: 'pt-BR', voice_id: VOZ.id,
    output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 128000 },
  }));
  const bruto = path.join(tmp, 'grok.mp3');
  const status = execFileSync('curl', ['-s', '--max-time', '600', '-w', '%{http_code}', '-o', bruto, '-H', `Authorization: Bearer ${chave}`,
    '-H', 'Content-Type: application/json', '-d', `@${path.join(tmp, 'pedido.json')}`, 'https://api.x.ai/v1/tts']).toString().trim();
  if (status !== '200') throw new Error(`Grok ${status}: ${fs.readFileSync(bruto, 'utf8').slice(0, 200)}`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', bruto, '-ar', '24000', '-ac', '1', wav]);
}

/** Casa as palavras do texto com as ouvidas pelo Whisper (maior subsequência comum) e espalha os
 *  tempos por caractere; palavra sem par fica entre as vizinhas que casaram. */
function tempoPorCaractere(falado, ouvidas) {
  const norm = w => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const palavras = [...falado.matchAll(/\S+/g)].map(m => ({ i: m.index, fim: m.index + m[0].length, n: norm(m[0]) }));
  const a = palavras.map(p => p.n), b = ouvidas.map(w => norm(w.word));
  const L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let x = a.length - 1; x >= 0; x--) for (let y = b.length - 1; y >= 0; y--) {
    L[x][y] = a[x] && a[x] === b[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
  }
  for (let x = 0, y = 0; x < a.length && y < b.length;) {
    if (a[x] && a[x] === b[y]) { palavras[x].t0 = ouvidas[y].start; palavras[x].t1 = ouvidas[y].end; x++; y++; }
    else if (L[x + 1][y] >= L[x][y + 1]) x++; else y++;
  }
  const casadas = palavras.filter(p => p.t0 != null).length;
  if (casadas < palavras.length * 0.8) throw new Error(`o Whisper só reconheceu ${casadas}/${palavras.length} palavras (gere de novo)`);
  // sem par: entre o fim da anterior casada e o início da próxima
  for (let k = 0; k < palavras.length; k++) if (palavras[k].t0 == null) {
    const ant = palavras.slice(0, k).reverse().find(p => p.t0 != null), prox = palavras.slice(k + 1).find(p => p.t0 != null);
    palavras[k].t0 = ant ? ant.t1 : 0; palavras[k].t1 = prox ? prox.t0 : (ant ? ant.t1 + 0.4 : 0.4);
  }
  const ini = new Array(falado.length), fim = new Array(falado.length);
  let k = 0;
  for (let c = 0; c < falado.length; c++) {
    while (k < palavras.length - 1 && c >= palavras[k].fim) k++;
    ini[c] = palavras[k].t0; fim[c] = palavras[k].t1;
  }
  return { characters: [...falado], character_start_times_seconds: ini, character_end_times_seconds: fim };
}

function montar(qual, leitura, unidades, falado, audio, tempos) {
const letras = tempos.characters.join('');
if (letras !== falado) throw new Error('o áudio não corresponde ao texto desta leitura (gere de novo)');
const ini = tempos.character_start_times_seconds, fim = tempos.character_end_times_seconds;

// cada unidade (linha) ocupa um trecho contíguo do texto falado
const linhas = [];
let pos = 0;
for (const u of unidades) {
  const texto = u.replace(/\s+/g, ' ').trim();
  const a = falado.indexOf(texto, pos);
  if (a < 0) throw new Error(`linha não encontrada no texto falado: ${texto}`);
  const b = a + texto.length - 1;
  linhas.push({ t0: +ini[a].toFixed(2), t1: +fim[b].toFixed(2), texto });
  pos = b + 1;
}

const dir = path.join(RAIZ, 'data', 'liturgia-audio', dt);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${qual}.mp3`), audio);
const saida = { referencia: leitura.referencia, voz: VOZ.nome, duracao: +fim.at(-1).toFixed(2), linhas };
fs.writeFileSync(path.join(dir, `${qual}.json`), `${JSON.stringify(saida, null, 2)}\n`);
console.log(`data/liturgia-audio/${dt}/${qual}: ${linhas.length} linhas, ${saida.duracao}s`);
}

for (const qual of pedido === 'todas' ? Object.keys(ACHAR) : [pedido]) await gerarLeitura(qual);
