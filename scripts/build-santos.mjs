/**
 * scripts/build-santos.mjs — resumos da Wikipédia para as celebrações da Liturgia Diária.
 *
 * data/santos-fonte.json   { "celebração": ["Título do artigo na pt.wikipedia", …] }  (curado à mão)
 *   --este script (rede)-->  data/santos/indice.json   { "celebração": "slug" }
 *                            data/santos/<slug>.json   { celebracao, artigos: [{ titulo, url, resumo, imagem }] }
 *
 * Roda offline, quando a lista muda (precisa de rede; o CI só confere a coerência dos arquivos em
 * verifica-liturgia.mjs). A página /liturgiadiaria/ lê o índice e abre o resumo num modal, com
 * crédito e link para o artigo (texto CC BY-SA 4.0). Título inexistente ou página de desambiguação
 * faz o script falhar: corrija o título em santos-fonte.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = path.join(RAIZ, 'data', 'santos-fonte.json');
const SAIDA = path.join(RAIZ, 'data', 'santos');
const API = 'https://pt.wikipedia.org/w/api.php';
const AGENTE = 'santadoutrina-liturgia/1.0 (https://santadoutrina.cloud/liturgiadiaria/)';
const RESUMO_MIN = 650;
const RESUMO_PARAGRAFOS = 3;

export const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function consultar(titulos) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'extracts|pageimages|pageprops|info', inprop: 'url',
    exintro: '1', explaintext: '1', exlimit: 'max',
    piprop: 'thumbnail', pithumbsize: '480', ppprop: 'disambiguation',
    titles: titulos.join('|'),
  });
  const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
  if (!r.ok) throw new Error(`Wikipédia ${r.status}`);
  const j = await r.json();
  // Título pedido → título final (normalização e redirecionamento).
  const destino = new Map(titulos.map(t => [t, t]));
  for (const n of j.query.normalized ?? []) destino.set(n.from, n.to);
  for (const [t, atual] of destino) {
    const red = (j.query.redirects ?? []).find(x => x.from === atual);
    if (red) destino.set(t, red.to);
  }
  const paginas = new Map(j.query.pages.map(p => [p.title, p]));
  return new Map(titulos.map(t => [t, paginas.get(destino.get(t))]));
}

function resumir(extrato) {
  const paragrafos = (extrato || '').split('\n').map(p => p.trim()).filter(p => p.length > 40);
  const saida = [];
  for (const p of paragrafos) {
    saida.push(p.replace(/\s*\(\s*\)/g, '').replace(/\s{2,}/g, ' '));
    if (saida.join(' ').length >= RESUMO_MIN || saida.length >= RESUMO_PARAGRAFOS) break;
  }
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const fonte = JSON.parse(fs.readFileSync(FONTE, 'utf8'));
  const titulos = [...new Set(Object.values(fonte).flat())];
  const paginas = new Map();
  for (let i = 0; i < titulos.length; i += 20) {
    for (const [t, p] of await consultar(titulos.slice(i, i + 20))) paginas.set(t, p);
  }

  const erros = [];
  for (const t of titulos) {
    const p = paginas.get(t);
    if (!p || p.missing || p.invalid) erros.push(`"${t}": artigo não existe`);
    else if (p.pageprops && 'disambiguation' in p.pageprops) erros.push(`"${t}": página de desambiguação`);
    else if (!resumir(p.extract).length) erros.push(`"${t}": sem texto de introdução`);
  }
  if (erros.length) {
    console.error(`✗ santos: ${erros.length} título(s) a corrigir em data/santos-fonte.json`);
    console.error(erros.map(e => `  ${e}`).join('\n'));
    process.exit(1);
  }

  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
  const indice = {};
  for (const [celebracao, lista] of Object.entries(fonte)) {
    const s = slug(celebracao);
    indice[celebracao] = s;
    const artigos = lista.map(t => {
      const p = paginas.get(t);
      return {
        titulo: p.title,
        url: p.canonicalurl || p.fullurl,
        resumo: resumir(p.extract),
        imagem: p.thumbnail ? { src: p.thumbnail.source, largura: p.thumbnail.width, altura: p.thumbnail.height } : null,
      };
    });
    fs.writeFileSync(path.join(SAIDA, `${s}.json`), `${JSON.stringify({ celebracao, artigos }, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(SAIDA, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
  console.log(`data/santos: ${Object.keys(indice).length} celebrações, ${titulos.length} artigos da Wikipédia`);
}
