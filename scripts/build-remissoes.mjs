/**
 * build-remissoes.mjs — extrai o grafo de remissões que já está escrito nos
 * nomes dos temas do índice analítico.
 *
 *   "Perdão vide também penitência e reconciliação"
 *   "Desejo cf. concupiscência cobiça"
 *
 * Hoje isso é texto morto: aparece cru na interface e não liga nada a nada.
 * O script separa o nome real do tema da sua lista de remissões e resolve
 * cada alvo contra os temas existentes, produzindo data/remissoes.json:
 *
 *   { "nomes": { "<id>": "Perdão" }, "remete": { "<id>": [<id>, ...] } }
 *
 * Determinístico: mesma entrada, mesma saída (verifica-remissoes.mjs prova).
 */

import { readFileSync, writeFileSync } from 'node:fs';

const ENTRADA = 'data/indice_analitico.json';
const SAIDA   = 'data/remissoes.json';

/** Remove acentos e marcas de flexão — "Paixão(ões)" e "paixao" viram o mesmo. */
export function normalizar(s = '') {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((?:s|es|ões|oes|a|as)\)/g, '') // sacramento(s), paixão(ões)
    .replace(/\/[a-zõç]+/g, '')                // paixão/ões
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEPARADOR = /\s*(?:[-–]\s*)?\b(?:vide\s+tamb[ée]m|vide|cf\.)\s*:?\s*/i;

/** Divide "Perdão vide também X e Y" em { nome: "Perdão", alvos: "X e Y" }. */
export function separar(nomeBruto) {
  const partes = nomeBruto.split(SEPARADOR);
  return {
    nome: partes[0].trim(),
    alvos: partes.length > 1 ? partes.slice(1).join(' ').trim() : '',
  };
}

/** Índice de busca dos temas conhecidos, por nome normalizado. */
function indexarTemas(temas) {
  const porNome = new Map();
  for (const t of temas) {
    const chave = normalizar(t.nome);
    if (chave && !porNome.has(chave)) porNome.set(chave, t.id);
  }
  return porNome;
}

/**
 * Resolve um termo de remissão contra os temas. O índice não é padronizado:
 * remete a "sacramento(s)" mas o tema é "Sacramentos"; a "vocação" mas o tema
 * é "Vocação do homem". Daí as três tentativas.
 */
function resolverTermo(termo, porNome, temas) {
  if (!termo) return null;
  if (porNome.has(termo)) return porNome.get(termo);

  const semS = termo.replace(/s$/, '');
  const comS = termo + 's';
  if (porNome.has(semS)) return porNome.get(semS);
  if (porNome.has(comS)) return porNome.get(comS);

  // "vocacao" → "Vocação do homem". Só aceita se um único tema começar assim,
  // senão a remissão viraria chute.
  const prefixados = temas.filter(t => {
    const n = normalizar(t.nome);
    return n.startsWith(termo + ' ') || n.startsWith(semS + ' ');
  });
  return prefixados.length === 1 ? prefixados[0].id : null;
}

/** Quebra a lista de alvos em termos candidatos, do mais longo ao mais curto. */
function candidatos(alvos) {
  const blocos = alvos.split(/\s+e\s+|[,;]/).map(normalizar).filter(Boolean);
  const saida = [];
  for (const bloco of blocos) {
    saida.push({ termo: bloco, palavras: bloco.split(' ').filter(w => w.length > 2) });
  }
  return saida;
}

export function construir(indice) {
  const limpos = indice.map(t => ({ id: t.id, nome: separar(t.nome).nome }));
  const porNome = indexarTemas(limpos);

  const nomes = {};
  const remete = {};
  const paragrafos = {}; // quantos § distintos cada tema alcança
  const naoResolvidos = [];

  for (const tema of indice) {
    const { nome, alvos } = separar(tema.nome);
    nomes[tema.id] = nome;

    // Contagem vai junto para a interface poder dizer "Perdão · 25 §§" sem
    // precisar do índice analítico inteiro (990 KB) já carregado.
    const distintos = new Set();
    for (const sub of tema.subtemas || []) {
      for (const n of sub.paragrafos || []) distintos.add(n);
    }
    if (distintos.size) paragrafos[tema.id] = distintos.size;

    if (!alvos) continue;

    const ids = new Set();
    for (const { termo, palavras } of candidatos(alvos)) {
      const direto = resolverTermo(termo, porNome, limpos);
      if (direto && direto !== tema.id) { ids.add(direto); continue; }

      // "advento Natal quaresma páscoa pentecostes": lista sem separador.
      let achouAlguma = false;
      for (const palavra of palavras) {
        const id = resolverTermo(palavra, porNome, limpos);
        if (id && id !== tema.id) { ids.add(id); achouAlguma = true; }
      }
      if (!achouAlguma) naoResolvidos.push({ tema: nome, termo });
    }

    if (ids.size) remete[tema.id] = [...ids].sort((a, b) => a - b);
  }

  return { nomes, remete, paragrafos, naoResolvidos };
}

function principal() {
  const indice = JSON.parse(readFileSync(ENTRADA, 'utf8'));
  const { nomes, remete, paragrafos, naoResolvidos } = construir(indice);

  const comRemissao = Object.keys(remete).length;
  const ligacoes = Object.values(remete).reduce((n, v) => n + v.length, 0);

  writeFileSync(SAIDA, JSON.stringify({ nomes, remete, paragrafos }, null, 1) + '\n');

  console.log(`✅ remissões: ${comRemissao} temas ligados, ${ligacoes} ligações.`);
  if (naoResolvidos.length) {
    console.log(`   ${naoResolvidos.length} termos sem tema correspondente (remissão a verbete inexistente):`);
    for (const n of naoResolvidos.slice(0, 10)) console.log(`     · ${n.tema} → "${n.termo}"`);
    if (naoResolvidos.length > 10) console.log(`     … e mais ${naoResolvidos.length - 10}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) principal();
