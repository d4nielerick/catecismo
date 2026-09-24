/**
 * scripts/build-audio-liturgia.mjs — leitura em voz alta de uma leitura do dia (piloto).
 *
 *   node scripts/build-audio-liturgia.mjs AAAA-MM-DD evangelho            # gera (ElevenLabs) e grava
 *   node scripts/build-audio-liturgia.mjs AAAA-MM-DD evangelho audio.mp3 tempos.json   # só monta, sem gerar
 *
 * Gera a voz com antecedência (fora do site, nada de IA em tempo de execução): o texto falado é o
 * texto oficial da leitura, sem números de versículo, com a abertura e o fecho litúrgicos. O
 * ElevenLabs devolve o tempo de cada caractere; aqui isso vira o tempo de cada LINHA do lecionário
 * (as linhas da fonte já são unidades de sentido), que a tela de leitura destaca enquanto a voz lê.
 *
 * Saída: data/liturgia-audio/AAAA-MM-DD/<leitura>.mp3 e <leitura>.json
 *   { referencia, voz, duracao, linhas: [{ t0, t1, texto }] }
 * A chave do ElevenLabs vem do Porta-chaves do macOS (item "elevenlabs-api-key") ou de ELEVENLABS_API_KEY.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOZ = { id: 'nPczCjzI2devNBz1zQrb', nome: 'Brian (ElevenLabs, multilíngue v2)' };
const [dt, qual = 'evangelho', audioArq, temposArq] = process.argv.slice(2);

const dia = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'liturgia', `${dt}.json`), 'utf8'));
const leitura = dia.missas[0].leituras.find(l => (qual === 'evangelho' ? l.tipo === 'evangelho' : false));
if (!leitura) throw new Error(`${dt}: leitura "${qual}" não encontrada`);

const LIVRO = { Mt: 'Mateus', Mc: 'Marcos', Lc: 'Lucas', Jo: 'João' };
const livro = LIVRO[leitura.referencia.split(' ')[0]] || '';
const abertura = `Evangelho de Nosso Senhor Jesus Cristo segundo ${livro}.`;
const fecho = 'Palavra da Salvação.';
const linhasFonte = leitura.texto.split('\n').map(l => l.trim())
  .filter(l => l && !/^(\d+[a-z]?|\d+,\d+[a-z]?|[a-z])$/.test(l));
const unidades = [abertura, ...linhasFonte, fecho];
const falado = unidades.join(' ').replace(/\s+/g, ' ').trim();

async function gerar() {
  let chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) chave = execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'elevenlabs-api-key', '-w']).toString().trim();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOZ.id}/with-timestamps?output_format=mp3_44100_96`, {
    method: 'POST',
    headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: falado, model_id: 'eleven_multilingual_v2', language_code: 'pt',
      voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { audio: Buffer.from(j.audio_base64, 'base64'), tempos: j.alignment };
}

const { audio, tempos } = audioArq
  ? { audio: fs.readFileSync(audioArq), tempos: JSON.parse(fs.readFileSync(temposArq, 'utf8')) }
  : await gerar();

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
