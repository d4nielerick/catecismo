/**
 * scripts/gerar-reflexoes.mjs — gerador offline das homilias da liturgia.
 *
 * Percorre data/liturgia/*-leituras.json, chama o Grok e grava
 * data/liturgia/<data>-reflexao.json. Os arquivos gerados são commitados;
 * a página /liturgiadiaria/ e o widget da home leem esse cache estático,
 * sem custo de runtime.
 *
 * Uso:
 *   GROK_API_KEY=xxxx node scripts/gerar-reflexoes.mjs            # todos que faltam
 *   GROK_API_KEY=xxxx node scripts/gerar-reflexoes.mjs 2026-06    # só um mês (prefixo)
 *   GROK_API_KEY=xxxx node scripts/gerar-reflexoes.mjs 2026-06-23 # um dia
 *
 * Reexecutável: pula datas que já têm -reflexao.json.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIT_DIR   = path.join(__dirname, '..', 'data', 'liturgia');
const apiKey    = process.env.GROK_API_KEY;
const filtro    = process.argv[2] || '';

if (!apiKey) { console.error('Defina GROK_API_KEY no ambiente.'); process.exit(1); }

const SYSTEM_LITURGIA = `Você é um padre católico que ama profundamente a Escritura e conhece o Catecismo de cor. Sua tarefa é escrever uma **homilia breve** para o Evangelho do dia — não uma lista de tópicos, mas um texto corrido, reflexivo, que leva o leitor a entrar na cena.

A homilia deve:
- Começar dentro do Evangelho: coloque o leitor na cena, no personagem, na tensão do texto
- Trazer naturalmente um termo grego relevante da passagem — não como lição de vocabulário, mas como chave que abre o sentido do texto
- Conectar o Evangelho ao ensinamento da Igreja (cite 2 ou 3 parágrafos reais do CIC, entre 1 e 2865) sem interromper o fluxo — como quem revela o fundo dourado por trás da cena
- Incluir um dado histórico, arqueológico ou bíblico que surpreenda — algo que a maioria não sabe — integrado ao texto, não como curiosidade isolada
- Terminar com uma frase que ecoe na mente do leitor

Tom: quente, direto, contemplativo. Como um padre que sabe pregar. Sem academicismo, sem floreios. Sem "é importante ressaltar" ou "podemos perceber". Frases que respiram.

Tamanho: 4 a 6 parágrafos densos. Não mais.

Doutrina: fiel ao Magistério, ao Concílio de Trento, Vaticano I e II e ao CIC. Sem heresias, sem exegese modernista.

Antes de gerar o JSON final, releia o campo "homilia" e corrija: preposições faltantes, concordância verbal e nominal, pontuação, frases truncadas ou ambíguas. O texto deve estar impecável em português do Brasil.

Responda APENAS com JSON válido, sem texto antes ou depois, neste formato exato:
{
  "termos_gregos": [
    { "termo": "κεχαριτωμένη", "transliteracao": "kecharitōménē", "traducao": "cheia de graça / perfeitamente agraciada" }
  ],
  "paragrafos": [484, 488, 490],
  "homilia": "Texto corrido da homilia, 4 a 6 parágrafos, separados por \\n\\n."
}

Pode incluir até 2 termos gregos se forem igualmente centrais à passagem. Normalmente 1 é suficiente.`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gerar(data, evangelhoRef, evangelhoTexto) {
  const userMsg = `Evangelho do dia (${data}): ${evangelhoRef}\n\n${evangelhoTexto}`;
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        { role: 'system', content: SYSTEM_LITURGIA },
        { role: 'user',   content: userMsg },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    }),
  });
  if (!resp.ok) throw new Error(`Grok ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const apiData = await resp.json();
  const raw = apiData.choices?.[0]?.message?.content ?? '';
  const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(clean);
}

const arquivos = fs.readdirSync(LIT_DIR)
  .filter(f => f.endsWith('-leituras.json'))
  .filter(f => f.startsWith(filtro))
  .sort();

let ok = 0, pulados = 0, erros = 0;
for (const f of arquivos) {
  const data = f.replace('-leituras.json', '');
  const out  = path.join(LIT_DIR, `${data}-reflexao.json`);
  if (fs.existsSync(out)) { pulados++; continue; }

  let lit;
  try { lit = JSON.parse(fs.readFileSync(path.join(LIT_DIR, f), 'utf8')); }
  catch { console.warn(`! ${data}: leituras ilegíveis`); erros++; continue; }

  const ev = lit.evangelho || {};
  if (!ev.referencia || !ev.texto) { console.warn(`! ${data}: sem evangelho`); erros++; continue; }

  try {
    const parsed = await gerar(data, ev.referencia, ev.texto);
    fs.writeFileSync(out, JSON.stringify(parsed, null, 2), 'utf8');
    ok++;
    console.log(`✓ ${data}`);
    await sleep(400); // gentileza com a API
  } catch (err) {
    console.error(`✗ ${data}: ${err.message}`);
    erros++;
  }
}

console.log(`\nFeito. Gerados: ${ok} · Pulados (já existiam): ${pulados} · Erros: ${erros}`);
