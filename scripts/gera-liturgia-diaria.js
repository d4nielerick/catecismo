/**
 * gera-liturgia-diaria.js
 * Roda diariamente via cron para gerar o widget da Liturgia do Dia.
 * Uso: GROK_API_KEY=... node scripts/gera-liturgia-diaria.js
 * Cron sugerido: 0 6 * * * GROK_API_KEY=... node /var/www/catecismo/scripts/gera-liturgia-diaria.js
 */

const fs = require('fs');
const path = require('path');

const DEST = path.join(__dirname, '../data/liturgia');
const CATECISMO_PATH = path.join(__dirname, '../data/catecismo.json');

// Garante que o diretório existe
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

function dataHoje() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function gerarLiturgia(data, catecismo) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const dataFormatada = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const prompt = `Você é um especialista em liturgia católica e no Catecismo da Igreja Católica (CIC).

Hoje é ${dataFormatada} (${data}).

Gere um widget de "Liturgia do Dia" com os seguintes campos:
- Um tema litúrgico relevante para esta data (considere o calendário litúrgico católico: tempo litúrgico, festas, santos)
- Uma breve reflexão de 2-3 frases sobre o tema, baseada no Catecismo
- 2 ou 3 parágrafos do CIC mais relacionados ao tema do dia

Responda APENAS com JSON válido, sem markdown:
{
  "data": "${data}",
  "tempo_liturgico": "nome do tempo litúrgico atual (ex: Quaresma, Tempo Comum)",
  "tema": "título curto do tema do dia (máx 8 palavras)",
  "reflexao": "2-3 frases de reflexão baseadas no Catecismo",
  "paragrafos": [
    { "id": número_inteiro, "motivo": "por que este parágrafo é relevante hoje (1 linha)" }
  ]
}

Use apenas parágrafos entre 1 e 2865 do CIC.`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-fast-beta',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const apiData = await res.json();
  const raw = apiData.choices?.[0]?.message?.content?.trim() ?? '';
  const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(clean);

  // Enriquece com trechos reais
  const paragrafos_enriquecidos = (parsed.paragrafos || [])
    .filter(p => catecismo[p.id])
    .map(p => ({
      id: p.id,
      motivo: p.motivo,
      trecho: catecismo[p.id].texto.substring(0, 180) + (catecismo[p.id].texto.length > 180 ? '…' : ''),
    }));

  return {
    data,
    tempo_liturgico: parsed.tempo_liturgico || '',
    tema: parsed.tema || '',
    reflexao: parsed.reflexao || '',
    paragrafos: paragrafos_enriquecidos,
    gerado_em: new Date().toISOString(),
  };
}

async function main() {
  if (!process.env.GROK_API_KEY) {
    console.error('❌ GROK_API_KEY não definida');
    process.exit(1);
  }

  const data = process.argv[2] || dataHoje();
  const dest = path.join(DEST, `${data}.json`);

  if (fs.existsSync(dest) && !process.argv[3] === '--force') {
    console.log(`⏩ Já existe: ${dest}`);
    process.exit(0);
  }

  console.log(`Gerando liturgia para ${data}…`);

  const lista = JSON.parse(fs.readFileSync(CATECISMO_PATH, 'utf8'));
  const catecismo = {};
  for (const p of lista) catecismo[p.numero] = p;

  try {
    const resultado = await gerarLiturgia(data, catecismo);
    fs.writeFileSync(dest, JSON.stringify(resultado, null, 2));
    console.log(`✓ Gerado: ${dest}`);
    console.log(`  Tema: ${resultado.tema}`);
    console.log(`  Parágrafos: ${resultado.paragrafos.map(p => p.id).join(', ')}`);
  } catch (e) {
    console.error(`✗ Erro: ${e.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
