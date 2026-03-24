/**
 * gera-perguntas.js
 * Roda UMA VEZ no servidor para gerar os JSONs das perguntas populares.
 * Uso: GROK_API_KEY=... node scripts/gera-perguntas.js
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
  "A pena de morte é permitida pela Igreja?",
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
  "Quais são os mandamentos da Igreja?",
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

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 70);
}

async function gerarPergunta(pergunta, catecismo) {
  const prompt = `Você é um especialista no Catecismo da Igreja Católica (CIC).

Pergunta: "${pergunta}"

Responda citando APENAS parágrafos reais do CIC. Escolha entre 2 e 4 parágrafos mais relevantes.

Responda APENAS com JSON válido, sem markdown, sem texto fora do JSON:
{
  "resposta": "3-4 frases claras, acessíveis e fiéis ao Catecismo",
  "paragrafos": [
    { "id": número_inteiro, "motivo": "por que este parágrafo é relevante (1 linha)" }
  ]
}

Use apenas parágrafos que existam no CIC (números entre 1 e 2865).`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-fast-beta',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

  // Remove markdown code fences se presentes
  const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(clean);

  // Enriquece com trechos reais do catecismo
  const paragrafos_enriquecidos = parsed.paragrafos
    .filter(p => catecismo[p.id])
    .map(p => ({
      id: p.id,
      motivo: p.motivo,
      trecho: catecismo[p.id].texto.substring(0, 220) + (catecismo[p.id].texto.length > 220 ? '…' : ''),
    }));

  return {
    pergunta,
    slug: slugify(pergunta),
    resposta: parsed.resposta,
    paragrafos: paragrafos_enriquecidos,
    gerado_em: new Date().toISOString(),
  };
}

async function main() {
  if (!process.env.GROK_API_KEY) {
    console.error('❌ GROK_API_KEY não definida');
    process.exit(1);
  }

  // Carrega catecismo como mapa id→parágrafo
  const lista = JSON.parse(fs.readFileSync(CATECISMO_PATH, 'utf8'));
  const catecismo = {};
  for (const p of lista) catecismo[p.numero] = p;

  let ok = 0, pulados = 0, erros = 0;

  for (const pergunta of perguntas) {
    const slug = slugify(pergunta);
    const dest = path.join(DEST, `${slug}.json`);

    if (fs.existsSync(dest)) {
      console.log(`⏩ Já existe: ${slug}`);
      pulados++;
      continue;
    }

    try {
      const resultado = await gerarPergunta(pergunta, catecismo);
      fs.writeFileSync(dest, JSON.stringify(resultado, null, 2));
      console.log(`✓ ${slug}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${slug}: ${e.message}`);
      erros++;
    }

    // Pausa entre chamadas
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\nConcluído: ${ok} geradas, ${pulados} puladas, ${erros} erros`);

  // Gera índice
  const arquivos = fs.readdirSync(DEST).filter(f => f.endsWith('.json'));
  const indice = arquivos.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(DEST, f), 'utf8'));
    return { slug: data.slug, pergunta: data.pergunta };
  });
  fs.writeFileSync(path.join(DEST, '_indice.json'), JSON.stringify(indice, null, 2));
  console.log(`\n📋 Índice gerado: ${indice.length} perguntas`);
}

main().catch(console.error);
