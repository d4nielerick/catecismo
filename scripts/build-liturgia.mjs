/**
 * scripts/build-liturgia.mjs — monta data/liturgia/AAAA-MM-DD.json a partir de
 * data/liturgia-fonte/AAAA-MM-DD-leituras.json (formato cru da API de origem, intocado).
 *
 * A fonte guarda o dia em três campos de texto (primeira_leitura, salmo, evangelho), mas o
 * conteúdo não respeita essa divisão: a 2ª leitura, a sequência e a aclamação vêm no fim do
 * salmo; vigílias, missas do dia e leituras à escolha vêm emendadas no evangelho; o campo
 * `aclamacao` está sempre vazio; parte do texto vem em Unicode decomposto (NFD). O build lê
 * os três campos como um fluxo único de linhas, reconhece cabeçalhos ("SEGUNDA LEITURA",
 * "Aclamação ao Evangelho", "Missa do dia", "Ou"…) e devolve cada leitura no seu lugar:
 *
 *   { data, tempo, cor, celebracao, complemento?,
 *     missas: [ { nome?, leituras: [ { tipo, rotulo, variante?, alternativa?, referencia?, titulo?, texto } ] } ] }
 *
 * `tipo`: leitura | salmo | sequencia | aclamacao | evangelho. A primeira missa é a principal
 * (a que a fonte lista em `referencias`); `alternativa` marca leituras "à escolha".
 * O nome do dia vem de lib-calendario-liturgico.mjs.
 *
 * Exporta buildDia() para verifica-liturgia.mjs. Rodar direto regrava data/liturgia/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diaLiturgico } from './lib-calendario-liturgico.mjs';

export const FONTE = 'data/liturgia-fonte';
export const SAIDA = 'data/liturgia';

const ORDINAIS = { PRIMEIRA: 1, SEGUNDA: 2, TERCEIRA: 3, QUARTA: 4, QUINTA: 5, SEXTA: 6, 'SÉTIMA': 7 };

export const RE = {
  fim: /^Palavra d[ao] (?:Senhor|Salvação)\.?$/i,
  ordinal: /^(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA|SÉTIMA)\s+LEITURA\s*(?:\((mais (?:longa|breve))\))?\s*:?$/i,
  evangelho: /^EVANGELHO\s*(?:\((mais (?:longo|breve))\))?\s*:?$/, // só maiúsculas: "Evangelho" no texto não é cabeçalho
  salmo: /^Salmo responsorial\s*:?$/i,
  sequencia: /^Sequência\b/i,
  aclamacao: /^(?:ALELUIA E )?Aclamação ao Evangelho\b\s*(.*)$/i,
  missa: /^(?:Missa(?: d[aoe]s? [\p{L} ]{2,30})?|Outras leituras[\p{L} ]{0,30})\s*:?$/iu,
  rubrica: /^LEITURAS DO (?:ANTIGO|NOVO) TESTAMENTO$/i,
  ou: /^Ou\s*[:,]?$/i,
  enchimento: /^(?:[,:()]|à escolha\s*:?|[a-e]\s*:)$/i,
  dica: /^(?:(\d)\s*ª\s*Leitura|(Evangelho)|(Salmo))\s*[-–]\s*(.+)$/i,
  incipitLeitura: /^(?:Leitura|Início|Conclusão) d[aoe]s?(?:\s|$)/i,
  incipitEvangelho: /^(?:†\s*)?(?:(?:Proclamação|Início|Conclusão|Continuação) do (?:santo )?Evangelho|Paixão de Nosso Senhor)/i,
  ref: /^(?:cf\.?\s*)?(?:(?:[1-3]\s?)?[A-ZÁÉÍÓÚÊ][A-Za-záéíóúêô]{0,5}\.?\s*(?:\(\d+[A-Za-z]?\)\s*)?)?\d+[A-Za-z]?\s*(?:\([^)]*\))?\s*[,.]\s*\d[\p{L}\d\s.,;:–\-()]*$/iu,
  versiculo: /^\d+[a-z]?$|^[a-z]$/,
};

const ehIncipit = l => RE.incipitLeitura.test(l) || RE.incipitEvangelho.test(l);
const ehRefDeSalmo = l => /^S[lI]\s*\(?\d/.test(l) && RE.ref.test(l);

export function linhasDe(texto) {
  return (texto || '').normalize('NFC').split('\n')
    .map(l => l.replace(/ /g, ' ').replace(/Âª/g, 'ª').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function cabecalho(l) {
  let m;
  if ((m = l.match(RE.ordinal))) return { tipo: 'leitura', ordem: ORDINAIS[m[1].toUpperCase()], variante: m[2]?.toLowerCase() };
  if ((m = l.match(RE.evangelho))) return { tipo: 'evangelho', variante: m[1]?.toLowerCase() };
  if (RE.salmo.test(l)) return { tipo: 'salmo' };
  if (RE.sequencia.test(l)) return { tipo: 'sequencia', resto: l.replace(RE.sequencia, '').trim() };
  if ((m = l.match(RE.aclamacao))) return { tipo: 'aclamacao', resto: m[1].trim() };
  return null;
}

/** Linha estrutural: some da saída de propósito (cabeçalho, incipit, referência, "Palavra do Senhor"…). */
export function ehEstrutural(l) {
  return RE.fim.test(l) || RE.missa.test(l) || RE.rubrica.test(l) || RE.ou.test(l) || RE.enchimento.test(l)
    || RE.dica.test(l) || !!cabecalho(l) || ehIncipit(l) || RE.ref.test(l) || l === '†' || /^cf\.?$/i.test(l);
}

// ── Referências ──────────────────────────────────────────────────────────────
function refsDaFonte(html) {
  return (html || '').normalize('NFC')
    .replace(/<div[^>]*>\s*Leituras:\s*<\/div>/i, '')
    .split(/<\/?div[^>]*>/)
    .map(s => s.replace(/<[^>]+>/g, '').replace(/^\s*Evangelho:\s*/i, '').replace(/\s+/g, ' ').trim())
    .map(s => s.replace(/\s*\((?!R\.|gr\.|mais )[^)]*\p{L}{3,}[^)]*\)\s*$/u, '')) // "Mt 2,1-12 (Visita dos Magos)"
    .filter(Boolean);
}

const PREFIXO_LIVRO = /^(?:cf\.?\s*)?(?:[1-3]\s?)?[A-Za-zÀ-ú]{1,6}\.?\s*(?=[\d(])/i;
const temLivro = r => PREFIXO_LIVRO.test(r);
const soNumeros = r => (r || '').replace(PREFIXO_LIVRO, '').replace(/[^\p{L}\d]/gu, '').toLowerCase();
const livroDe = r => r?.match(/^(?:cf\.?\s*)?((?:[1-3]\s?)?[A-Za-zÀ-ú]{1,6})\.?\s*[\d(]/i)?.[1];
const capitulo = r => (r || '').replace(PREFIXO_LIVRO, '').match(/\d+/)?.[0];

function limparRef(r) {
  if (!r) return null;
  return r.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim()
    .replace(/^cf\.?\s*/i, 'cf. ')
    .replace(/^(cf\. )?SI\b/, '$1Sl').replace(/^(cf\. )?AP\b/, '$1Ap');
}

const EVANGELISTAS = { mateus: 'Mt', marcos: 'Mc', lucas: 'Lc', 'joão': 'Jo' };
const LIVROS = [
  ['Coríntios', 'Cor'], ['Romanos', 'Rm'], ['Gálatas', 'Gl'], ['Efésios', 'Ef'], ['Filipenses', 'Fl'],
  ['Colossenses', 'Cl'], ['Tessalonicenses', 'Ts'], ['Timóteo', 'Tm'], ['Tito', 'Tt'], ['Filêmon', 'Fm'],
  ['Hebreus', 'Hb'], ['Tiago', 'Tg'], ['Pedro', 'Pd'], ['Judas', 'Jd'], ['Apocalipse', 'Ap'], ['Atos', 'At'],
  ['João', 'Jo'], ['Gênesis', 'Gn'], ['Êxodo', 'Ex'], ['Levítico', 'Lv'], ['Números', 'Nm'],
  ['Deuteronômio', 'Dt'], ['Josué', 'Js'], ['Juízes', 'Jz'], ['Rute', 'Rt'], ['Samuel', 'Sm'], ['Reis', 'Rs'],
  ['Crônicas', 'Cr'], ['Esdras', 'Esd'], ['Neemias', 'Ne'], ['Tobias', 'Tb'], ['Judite', 'Jt'], ['Ester', 'Est'],
  ['Macabeus', 'Mc'], ['Jó', 'Jó'], ['Provérbios', 'Pr'], ['Eclesiastes', 'Ecl'], ['Cântico', 'Ct'],
  ['Sabedoria', 'Sb'], ['Eclesiástico', 'Eclo'], ['Isaías', 'Is'], ['Jeremias', 'Jr'], ['Lamentações', 'Lm'],
  ['Baruc', 'Br'], ['Ezequiel', 'Ez'], ['Daniel', 'Dn'], ['Oseias', 'Os'], ['Oséias', 'Os'], ['Joel', 'Jl'],
  ['Amós', 'Am'], ['Abdias', 'Ab'], ['Jonas', 'Jn'], ['Miqueias', 'Mq'], ['Miquéias', 'Mq'], ['Naum', 'Na'],
  ['Habacuc', 'Hab'], ['Sofonias', 'Sf'], ['Ageu', 'Ag'], ['Zacarias', 'Zc'], ['Malaquias', 'Ml'],
];

function livroDoIncipit(seg) {
  const inc = seg.incipit || '';
  if (seg.tipo === 'evangelho') {
    const m = inc.match(/(?:segundo|escrito por)\s+(?:segundo\s+)?(?:São\s+)?(Mateus|Marcos|Lucas|João)/i);
    if (m) return EVANGELISTAS[m[1].toLowerCase()];
    return /Filho de Deus/.test(inc) ? 'Mc' : null;
  }
  const palavras = ` ${inc} `;
  const par = LIVROS.find(([nome]) => palavras.includes(` ${nome} `));
  if (!par) return null;
  const n = /\bPrimeir[ao]\b/i.test(inc) ? '1' : /\bSegund[ao]\b/i.test(inc) ? '2' : /\bTerceir[ao]\b/i.test(inc) ? '3' : '';
  return n + par[1];
}

function resolverRef(seg, refsDia, dicasEvangelho) {
  let r = limparRef(seg.refLinha) || (seg.origem === 'campo' && RE.ref.test(seg.refCampo || '') ? limparRef(seg.refCampo) : null);
  if (r && seg.cf && !r.startsWith('cf.')) r = `cf. ${r}`;
  if (r && temLivro(r)) return r;
  if (r) {
    const igual = refsDia.find(x => soNumeros(x) === soNumeros(r));
    if (igual) return limparRef(igual);
    const dica = seg.dicaRef || (seg.tipo === 'evangelho' ? dicasEvangelho[0] : null);
    let livro = livroDoIncipit(seg) || livroDe(dica);
    if (!livro && seg.tipo !== 'salmo') {
      // Mesma leitura escrita de outro jeito ("48,1-15 (gr. 1-14)" × "Eclo 48,1-14"): casa pelo capítulo.
      const mesmoCap = refsDia.filter(x => !/^S[lI]\b/.test(x) && capitulo(x) === capitulo(r));
      if (mesmoCap.length === 1) livro = livroDe(mesmoCap[0]);
    }
    return livro ? `${livro} ${r}` : r;
  }
  if (seg.dicaRef && temLivro(seg.dicaRef) && !/[-–]$/.test(seg.dicaRef)) return limparRef(seg.dicaRef);
  return null;
}

// ── Segmentação ──────────────────────────────────────────────────────────────
function segmentar(raw) {
  const missas = [{ nome: null, alternativa: false, segs: [] }];
  const consumidas = [];      // linhas estruturais absorvidas (para a checagem de preservação)
  const dicasEvangelho = [];  // "Evangelho - Mt 18,1-5": só ajuda a achar o livro do evangelho
  let cur = null;             // segmento aberto
  let ultimo = null;          // último segmento criado (aberto ou fechado)
  let alt = false;            // um "Ou" anunciou uma alternativa
  let dica = null;            // "2ª Leitura - Hb 10,4-" prenuncia o próximo segmento
  let solto = [];             // linhas depois de "Palavra do Senhor", antes do próximo segmento

  const missaAtual = () => missas[missas.length - 1];
  const fechar = () => { if (cur) cur.fechado = true; cur = null; };
  // Linhas soltas que não abriram segmento continuam do anterior: texto nunca é descartado.
  const anexarSolto = () => { if (solto.length && ultimo) ultimo.corpo.push(...solto); solto = []; };

  function ordemSeguinte() {
    const segs = missaAtual().segs;
    for (let k = segs.length - 1; k >= 0; k--) {
      if (segs[k].tipo === 'evangelho') break;
      if (segs[k].tipo === 'leitura') return k === segs.length - 1 ? segs[k].ordem : segs[k].ordem + 1;
    }
    return 1;
  }

  function abrir(spec, pre = []) {
    fechar();
    if (spec.tipo === 'leitura' && spec.ordem === 1 && missaAtual().segs.some(s => s.tipo === 'evangelho')) {
      missas.push({ nome: null, alternativa: alt, segs: [] });
      alt = false;
    }
    const seg = {
      tipo: spec.tipo, ordem: spec.ordem ?? null, variante: spec.variante ?? null, alternativa: alt,
      origem: spec.origem, refCampo: spec.refCampo ?? null, dicaRef: spec.dicaRef ?? null,
      refLinha: null, cf: false, incipit: null, continuaIncipit: false, titulo: [], corpo: [], fase: 'pre', fechado: false,
    };
    alt = false;
    missaAtual().segs.push(seg);
    cur = ultimo = seg;
    for (const l of pre) linhaPre(seg, l);
    return seg;
  }

  function linhaPre(seg, l) {
    if (/^cf\.?$/i.test(l)) { seg.cf = true; return; }
    if (!seg.refLinha && RE.ref.test(l)) {
      const v = l.match(/\s*\((mais (?:longa|longo|breve))\)/i);
      if (v) { seg.variante ??= v[1].toLowerCase(); l = l.replace(v[0], '').trim(); }
      seg.refLinha = l;
      return;
    }
    seg.titulo.push(l);
  }

  function linha(seg, l, prox) {
    if (seg.fase === 'pre') {
      if (ehIncipit(l) && !seg.incipit) {
        const r = l.match(/\s(\d+[a-z]?\s*[,.]\s*\d[\w\s.,;–\-]*)$/i); // "… de São João 1,5-8"
        seg.incipit = (r ? l.slice(0, r.index) : l).replace(/^†\s*/, '');
        if (r && !seg.refLinha) seg.refLinha = r[1];
        seg.continuaIncipit = /\sd[aoe]s?$/i.test(seg.incipit) && !!prox[0] && !RE.ref.test(prox[0]);
        consumidas.push(l);
        return;
      }
      if (seg.continuaIncipit) { seg.incipit += ` ${l}`; seg.continuaIncipit = false; consumidas.push(l); return; }
      if (/^cf\.?$/i.test(l) || (!seg.refLinha && RE.ref.test(l))) { linhaPre(seg, l); return; }
      const antifona = !seg.incipit && !['salmo', 'aclamacao', 'sequencia'].includes(seg.tipo)
        && !RE.versiculo.test(l) && prox.some(ehIncipit);
      if (antifona) { seg.titulo.push(l); return; }
      seg.fase = 'corpo';
    }
    seg.corpo.push(l);
  }

  function ouAbreAlternativa(ls, i) {
    let j = i + 1;
    while (j < ls.length && RE.enchimento.test(ls[j])) j++;
    const n = ls[j];
    if (!n) return false;
    if (cabecalho(n) || RE.dica.test(n) || RE.missa.test(n) || ehIncipit(n)) return true;
    const tipo = (cur ?? ultimo)?.tipo;
    if (tipo === 'aclamacao') return false;           // versículo alternativo
    if (tipo === 'salmo') return ehRefDeSalmo(n);      // "Ou:" do refrão fica no salmo
    if (RE.ref.test(n)) return true;
    return ls.slice(j + 1, j + 4).some(ehIncipit);
  }

  const campos = [['primeira_leitura', 'leitura'], ['salmo', 'salmo'], ['evangelho', 'evangelho']];
  for (const [campo, tipoCampo] of campos) {
    anexarSolto(); fechar(); dica = null;
    const ls = linhasDe(raw[campo]?.texto);
    let implicito = { tipo: tipoCampo, ordem: tipoCampo === 'leitura' ? 1 : null, origem: 'campo', refCampo: raw[campo]?.referencia?.normalize('NFC') };

    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const prox = ls.slice(i + 1, i + 4);
      let m;

      if (RE.fim.test(l)) { anexarSolto(); fechar(); implicito = null; consumidas.push(l); continue; }
      if (RE.rubrica.test(l)) { consumidas.push(l); continue; }

      if (RE.missa.test(l)) {
        anexarSolto(); fechar(); implicito = null; dica = null; consumidas.push(l);
        const nome = l.replace(/\s*:$/, '');
        if (missaAtual().segs.length) missas.push({ nome, alternativa: alt, segs: [] });
        else { missaAtual().nome = nome; missaAtual().alternativa ||= alt; }
        alt = false;
        continue;
      }

      if (RE.ou.test(l) && ouAbreAlternativa(ls, i)) {
        anexarSolto(); fechar(); implicito = null; alt = true; consumidas.push(l);
        while (i + 1 < ls.length && RE.enchimento.test(ls[i + 1])) consumidas.push(ls[++i]);
        continue;
      }

      if ((m = l.match(RE.dica))) {
        // Não fecha o segmento aberto: "Evangelho - Mc 2,18-22" às vezes aparece no meio do salmo.
        anexarSolto(); implicito = null; consumidas.push(l);
        if (dica?.tipo === 'evangelho') dicasEvangelho.push(dica.dicaRef);
        dica = m[1] ? { tipo: 'leitura', ordem: +m[1], dicaRef: m[4] }
          : m[2] ? { tipo: 'evangelho', dicaRef: m[4] }
          : { tipo: 'salmo', dicaRef: m[4] };
        continue;
      }

      const cab = cabecalho(l);
      if (cab) {
        anexarSolto(); implicito = null; consumidas.push(l);
        let dicaRef = null;
        if (dica && dica.tipo === cab.tipo && (cab.tipo !== 'leitura' || dica.ordem === cab.ordem)) dicaRef = dica.dicaRef;
        else if (dica?.tipo === 'evangelho') dicasEvangelho.push(dica.dicaRef);
        dica = null;
        const seg = abrir({ ...cab, origem: 'cabecalho', dicaRef });
        if (cab.resto) linhaPre(seg, cab.resto);
        continue;
      }

      const incipit = ehIncipit(l);
      const tipoIncipit = RE.incipitEvangelho.test(l) ? 'evangelho' : 'leitura';
      const abrirPorIncipit = pre => abrir({ tipo: tipoIncipit, ordem: tipoIncipit === 'leitura' ? ordemSeguinte() : null, origem: 'incipit' }, pre);

      if (dica) {
        // A dica só abre segmento se o conteúdo dela vem em seguida (refrão do salmo ou incipit).
        const d = dica; dica = null;
        const vemRefrao = /^R\.?(\s|$)/.test(l);
        const vemIncipit = [l, ...prox].some(ehIncipit);
        if (d.tipo === 'salmo' ? vemRefrao || vemIncipit : vemIncipit) {
          // "Salmo - AP 5,11-14" seguido de uma leitura: a dica erra o tipo.
          const tipo = d.tipo === 'salmo' && !vemRefrao ? 'leitura' : d.tipo;
          const ordem = tipo !== 'leitura' ? null : d.tipo === 'leitura' ? d.ordem : ordemSeguinte();
          anexarSolto();
          abrir({ tipo, ordem, origem: 'dica', dicaRef: d.dicaRef });
          linha(cur, l, prox);
          continue;
        }
        if (d.tipo === 'evangelho') dicasEvangelho.push(d.dicaRef);
      }

      if (!cur) {
        if (implicito && !(incipit && tipoIncipit !== implicito.tipo)) {
          abrir(implicito);
          implicito = null;
        } else if (incipit) {
          const pre = solto; solto = [];
          abrirPorIncipit(pre);
        } else if (!solto.length && ehRefDeSalmo(l)) {
          abrir({ tipo: 'salmo', origem: 'incipit' });
        } else {
          solto.push(l);
          continue;
        }
      } else if (cur.fase === 'corpo') {
        if (incipit && cur.tipo !== tipoIncipit) {
          abrirPorIncipit();
        } else if (cur.tipo === 'salmo' && ehRefDeSalmo(l)) {
          abrir({ tipo: 'salmo', origem: 'incipit' });                 // outro salmo à escolha
        } else if (temLivro(l) && RE.ref.test(l) && prox.some(ehIncipit)) {
          // "Mt 11,25-30" / antífona / "Proclamação…": nova opção sem "Palavra da Salvação" antes
          const tipo = prox.some(p => RE.incipitEvangelho.test(p)) ? 'evangelho' : 'leitura';
          abrir({ tipo, ordem: tipo === 'leitura' ? ordemSeguinte() : null, origem: 'incipit' }, [l]);
          continue;
        }
      }
      linha(cur, l, prox);
    }
    if (dica?.tipo === 'evangelho') dicasEvangelho.push(dica.dicaRef);
  }
  anexarSolto();
  return { missas, consumidas, dicasEvangelho };
}

// ── Montagem ─────────────────────────────────────────────────────────────────
const chaveTexto = t => t.toLowerCase().replace(/[^\p{L}]/gu, '');
const chaveRefrao = t => {
  const ls = t.split('\n');
  const i = ls.findIndex(l => /^R\.?(\s|$)/.test(l));
  if (i < 0) return null;
  return chaveTexto(ls[i].replace(/^R\.?\s*/, '') || ls[i + 1] || '').slice(0, 25) || null;
};

function rotulo(s) {
  if (s.tipo === 'leitura') return s.ordem >= 8 ? 'Epístola' : `${s.ordem}ª Leitura`;
  return { salmo: 'Salmo', sequencia: 'Sequência', aclamacao: 'Aclamação ao Evangelho', evangelho: 'Evangelho' }[s.tipo];
}

export function buildDia(raw) {
  const refsDia = refsDaFonte(raw.referencias);
  const cal = diaLiturgico(raw.data);
  const { missas, consumidas, dicasEvangelho } = segmentar(raw);
  // Cópias repetidas da fonte saem da página, mas o texto delas conta como preservado.
  const descartar = s => consumidas.push(s.titulo, s.texto);

  let grupos = missas.map(m => {
    const segs = [];
    for (const s of m.segs) {
      let titulo = s.titulo;
      let corpo = s.corpo;
      if (titulo.length > 3) { corpo = [...titulo, ...corpo]; titulo = []; }
      corpo = corpo.filter(l => l !== '†').map(l => l.replace(/^†\s*/, ''));
      if (!corpo.length && titulo.length) { corpo = titulo; titulo = []; }
      if (!corpo.length) continue;
      const texto = corpo.join('\n');
      const item = {
        tipo: s.tipo, ordem: s.ordem, origem: s.origem, chave: chaveTexto(texto), variante: s.variante,
        alternativa: s.alternativa, referencia: resolverRef(s, refsDia, dicasEvangelho),
        titulo: titulo.join(' ') || null, texto,
      };

      // Blocos repetidos na fonte ("1ª Leitura - Ap 1,5-8" seguido de "SEGUNDA LEITURA" com o mesmo texto).
      const k = item.chave.length >= 80 ? segs.findIndex(o => o.chave === item.chave) : -1;
      if (k >= 0) {
        if (segs[k].origem !== 'dica' || item.origem === 'dica') { descartar(item); continue; }
        item.titulo ??= segs[k].titulo;
        descartar(segs[k]);
        segs.splice(k, 1);
      }
      segs.push(item);
    }

    // Cópias resumidas que a fonte antepõe com uma dica, preteridas pela versão completa:
    //  - "1ª Leitura - 2Cor 5,20-6,2" (sem versículos) antes da "SEGUNDA LEITURA" de mesma referência;
    //  - Vigília Pascal 2024–2025: salmos listados por "Salmo - …" antes das leituras, que voltam
    //    completos depois de cada uma (mesmo refrão, às vezes em outra tradução).
    const temCompleta = (s, k) => segs.some((o, j) => j !== k && o.origem !== 'dica' && (
      (s.referencia && o.referencia && soNumeros(o.referencia) === soNumeros(s.referencia))
      || (s.tipo === 'salmo' && o.tipo === 'salmo' && j > k && !!chaveRefrao(s.texto) && chaveRefrao(o.texto) === chaveRefrao(s.texto))));
    const limpos = segs.filter((s, k) => {
      if (s.origem !== 'dica' || !temCompleta(s, k)) return true;
      descartar(s);
      return false;
    });

    // "à escolha" só existe se houver a leitura de que é alternativa.
    limpos.forEach((s, k) => {
      const anterior = limpos.slice(0, k).reverse().find(o => o.tipo === s.tipo);
      const mesmaVez = !!anterior && anterior.ordem === s.ordem;
      s.alternativa = mesmaVez && (s.alternativa || !!s.variante || limpos[k - 1] === anterior);
    });
    return { nome: m.nome, segs: limpos };
  }).filter(g => g.segs.length);

  // Principal: a missa cujo evangelho é o que a fonte lista em `referencias`.
  const evPrincipal = refsDia.at(-1);
  let ip = evPrincipal
    ? grupos.findIndex(g => g.segs.some(s => s.tipo === 'evangelho' && s.referencia && soNumeros(s.referencia) === soNumeros(evPrincipal)))
    : -1;
  if (ip < 0) ip = grupos.findIndex(g => /^Missa(?: do dia| da Ceia do Senhor)?$/i.test(g.nome || ''));
  if (ip < 0) ip = 0;

  // Referência que faltou na principal: a fonte a lista em ordem (1ª leitura, salmo, [2ª], evangelho).
  const principal = grupos[ip];
  const semRef = (tipo, rot) => principal.segs.find(s => s.tipo === tipo && !s.alternativa && !s.referencia && (!rot || rotulo(s) === rot));
  const naoSalmos = refsDia.filter(x => !/^S[lI]\b/.test(x));
  const preencher = (seg, ref) => { if (seg && ref) seg.referencia = limparRef(ref); };
  preencher(semRef('leitura', '1ª Leitura'), naoSalmos.length >= 2 ? naoSalmos[0] : null);
  preencher(semRef('salmo'), refsDia.find(x => /^S[lI]\b/.test(x)));
  preencher(semRef('leitura', '2ª Leitura'), naoSalmos.length >= 3 ? naoSalmos.at(-2) : null);
  preencher(semRef('evangelho'), naoSalmos.length >= 2 ? naoSalmos.at(-1) : null);

  grupos.forEach((g, k) => {
    if (g.nome || k === ip) return;
    if (k > ip) g.nome = 'Outras leituras à escolha';
    else if (cal.celebracao.startsWith('Domingo de Ramos')) g.nome = 'Procissão de Ramos';
    else if (cal.celebracao === 'Quinta-feira Santa') g.nome = 'Missa do Crisma';
    else if (raw.data.endsWith('-12-25')) g.nome = 'Missa da Aurora';
    else g.nome = 'Missa da Vigília';
  });
  grupos = [principal, ...grupos.filter((_, k) => k !== ip)];

  const dia = {
    data: raw.data,
    tempo: raw.titulo || cal.tempo,
    cor: raw.cor_liturgica || null,
    celebracao: cal.celebracao,
    ...(cal.complemento && { complemento: cal.complemento }),
    missas: grupos.map((g, k) => ({
      ...(k > 0 && { nome: g.nome }),
      leituras: g.segs.map(s => ({
        tipo: s.tipo,
        rotulo: rotulo(s),
        ...(s.variante && { variante: s.variante }),
        ...(s.alternativa && { alternativa: true }),
        ...(s.referencia && { referencia: s.referencia }),
        ...(s.titulo && { titulo: s.titulo }),
        texto: s.texto,
      })),
    })),
  };

  // Preservação: toda linha de conteúdo da fonte precisa estar na saída (comparando só letras e
  // dígitos — blocos repetidos na fonte às vezes diferem apenas em aspas ou pontuação).
  const norm = s => s.toLowerCase().replace(/[^\p{L}\d]/gu, '');
  const blob = norm([
    ...consumidas,
    ...grupos.flatMap(g => [g.nome, ...g.segs.flatMap(s => [s.referencia, s.titulo, s.texto])]),
  ].filter(Boolean).join(' '));
  const perdidas = ['primeira_leitura', 'salmo', 'evangelho']
    .flatMap(c => linhasDe(raw[c]?.texto))
    .filter(l => !ehEstrutural(l) && norm(l) && !blob.includes(norm(l)));

  return { dia, perdidas };
}

export function listarFonte() {
  return fs.readdirSync(FONTE).filter(f => /^\d{4}-\d{2}-\d{2}-leituras\.json$/.test(f)).sort();
}

export function lerFonte(arquivo) {
  return JSON.parse(fs.readFileSync(path.join(FONTE, arquivo), 'utf8'));
}

// Datas que a página anuncia ("faltam 76 dias para o Advento", "dia de preceito"). Preceito no
// Brasil além dos domingos (CNBB, cân. 1246 §2): Natal, Santa Maria Mãe de Deus, Corpus Christi e
// Imaculada Conceição; Epifania, Ascensão, São Pedro e São Paulo e Assunção vão para o domingo.
const MARCOS = {
  '1º Domingo do Advento': { curto: 'o Advento', inicio: true },
  'Natal do Senhor': { curto: 'o Natal', preceito: true },
  'Santa Maria, Mãe de Deus': { curto: 'Santa Maria, Mãe de Deus', preceito: true },
  'Quarta-feira de Cinzas': { curto: 'a Quarta-feira de Cinzas', jejum: true },
  'Domingo de Ramos e da Paixão do Senhor': { curto: 'a Semana Santa', inicio: true },
  'Sexta-feira da Paixão do Senhor': { curto: 'a Sexta-feira Santa', jejum: true },
  'Domingo de Páscoa na Ressurreição do Senhor': { curto: 'a Páscoa' },
  'Domingo de Pentecostes': { curto: 'Pentecostes' },
  'Santíssimo Corpo e Sangue de Cristo': { curto: 'Corpus Christi', preceito: true },
  'Nossa Senhora da Conceição Aparecida': { curto: 'Nossa Senhora Aparecida' },
  'Imaculada Conceição de Nossa Senhora': { curto: 'a Imaculada Conceição', preceito: true },
};

export function indiceDe(datas) {
  const marcos = [];
  for (const data of datas) {
    const { celebracao } = diaLiturgico(data);
    if (MARCOS[celebracao]) marcos.push({ data, nome: celebracao, ...MARCOS[celebracao] });
  }
  return { inicio: datas[0], fim: datas.at(-1), dias: datas.length, marcos };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const f of fs.readdirSync(SAIDA)) if (f.endsWith('.json')) fs.unlinkSync(path.join(SAIDA, f));
  const arquivos = listarFonte();
  let perdidas = 0;
  for (const f of arquivos) {
    const { dia, perdidas: p } = buildDia(lerFonte(f));
    if (p.length) { perdidas += p.length; console.warn(`! ${dia.data}: ${p.length} linha(s) sem destino — ${p[0].slice(0, 60)}`); }
    fs.writeFileSync(path.join(SAIDA, `${dia.data}.json`), JSON.stringify(dia));
  }
  const datas = arquivos.map(f => f.slice(0, 10));
  fs.writeFileSync(path.join(SAIDA, 'indice.json'), JSON.stringify(indiceDe(datas)));
  console.log(`data/liturgia: ${arquivos.length} dias (${datas[0]} a ${datas.at(-1)}), ${perdidas} linha(s) sem destino`);
}
