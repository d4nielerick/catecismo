/**
 * liturgiadiaria/imagem-do-dia.mjs — as leituras inteiras em páginas de 1080×1920, para mandar a
 * quem não tem o site ("tá na missa, manda a liturgia"): cada leitura com rótulo, referência e
 * capitular vermelha, como na página; o salmo com o refrão. 1920 de altura porque o WhatsApp reduz
 * fotos a ~1600 px no lado maior: uma página por foto chega legível (uma imagem comprida, não).
 *
 * paginas(dia, cab, { referencia }) → [<canvas>] — com referencia, só aquela leitura; sem, o dia
 * inteiro (a 1ª página abre com a data grande e a celebração).
 */
import { VERSO, DIA_DA_SEMANA } from '/liturgiadiaria/render.mjs';

const W = 1080;
const TITULO = "'Times New Roman', Times, Georgia, serif";
const LEITURA = "'Inria Card', Georgia, serif";
const VERMELHO = '#cb2e2e';
const TINTA = '#1c1812';
const SUAVE = 'rgba(28, 24, 18, 0.55)';
const FUNDO = '#fbf8f2';
const SITE = 'liturgia.santadoutrina.com';

const M = 150, MD = 96;                 // margens (a da esquerda tem o ornamento)
const LARG = W - M - MD;
let CORPO = 36, LH = CORPO * 1.56;      // texto das leituras (paginas() pode apertar um pouco)
const CAP_LINHAS = 3;
const ALTURA_MAIUSC = 0.662;            // Times: altura da maiúscula / corpo
const MAIUSC_TEXTO = 0.68;              // Inria: idem
const ROTULOS = { leitura: null, salmo: 'Salmo responsorial', evangelho: 'Evangelho' };

let fontes = null;
function carregarFontes() {
  fontes ??= Promise.all([
    new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-400.woff2)', { weight: '400' }),
    new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-400-italic.woff2)', { weight: '400', style: 'italic' }),
    new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-700.woff2)', { weight: '700' }),
  ].map(f => f.load().then(ff => document.fonts.add(ff)).catch(() => {})));
  return fontes;
}
let faixaImg = null;
const carregarFaixa = () => (faixaImg ??= new Promise(ok => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = '/assets/img/liturgia-faixa.webp';
}));

// a pintura que ocupa o pé da última página quando sobra muito espaço
let pinturaImg = null;
const carregarPintura = () => (pinturaImg ??= new Promise(ok => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = '/assets/img/cards/trigo-colina.webp';
}));

/** Pintura no espaço livre (de y0 a y1), cortada por baixo, cantos arredondados. */
function pinturaNoPe(c, img, y0, y1) {
  const x = M, w = W - MD - M, h = y1 - y0;
  const esc = Math.max(w / img.width, h / img.height);
  const sw = w / esc, sh = h / esc;
  c.save();
  c.beginPath(); c.roundRect(x, y0, w, h, 18); c.clip();
  c.drawImage(img, (img.width - sw) / 2, img.height - sh, sw, sh, x, y0, w, h);
  c.restore();
}

// ── Texto das leituras ───────────────────────────────────────────────────────
const limpar = l => l.replace(/[*†+]/g, '').replace(/\s+/g, ' ').trim();

/** Prosa: as linhas do lecionário viram um parágrafo corrido (sem os números de versículo). */
function prosa(texto) {
  return texto.split('\n').map(l => l.trim()).filter(l => l && !VERSO.test(l)).map(limpar).join(' ');
}

/** Salmo: { refrao, estrofes: [[linhas]] } — o refrão vem depois do 1º "R."; cada "R." fecha uma estrofe. */
function salmo(texto) {
  const cruas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const refrao = [];
  let i = 0;
  if (/^R\.?$/.test(cruas[0])) {
    for (i = 1; i < cruas.length && !VERSO.test(cruas[i]) && !cruas[i].includes('*') && !/^R\.?$/.test(cruas[i]); i++) {
      if (!/^Ou:?$/i.test(cruas[i])) refrao.push(limpar(cruas[i]));
    }
  }
  const estrofes = [[]];
  for (; i < cruas.length; i++) {
    const l = cruas[i];
    if (VERSO.test(l)) continue;
    if (/^R\.?$/.test(l)) { if (estrofes.at(-1).length) estrofes.push([]); continue; }
    estrofes.at(-1).push(limpar(l));
  }
  return { refrao: refrao.join(' '), estrofes: estrofes.filter(e => e.length) };
}

function quebrar(ctx, texto, largura, recuo = 0, linhasComRecuo = 0) {
  const linhas = [];
  let linha = '';
  for (const p of texto.split(/\s+/)) {
    const lim = linhas.length < linhasComRecuo ? largura - recuo : largura;
    const teste = linha ? `${linha} ${p}` : p;
    if (linha && ctx.measureText(teste).width > lim) { linhas.push(linha); linha = p; } else linha = teste;
  }
  if (linha) linhas.push(linha);
  return linhas;
}

function justificar(ctx, linha, x, y, largura, ultima) {
  const palavras = linha.split(' ');
  if (ultima || palavras.length < 2) { ctx.fillText(linha, x, y); return; }
  const soma = palavras.reduce((t, p) => t + ctx.measureText(p).width, 0);
  const espaco = (largura - soma) / (palavras.length - 1);
  if (espaco > CORPO * 1.6) { ctx.fillText(linha, x, y); return; }   // linha curta demais: não estica
  let cx = x;
  for (const p of palavras) { ctx.fillText(p, cx, y); cx += ctx.measureText(p).width + espaco; }
}

function espacado(ctx, texto, x, y, espaco) {
  for (const ch of texto) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + espaco; }
  return x;
}

// ── Itens paginados ──────────────────────────────────────────────────────────
// Cada item tem altura fixa e sabe se desenhar a partir do topo (y). "espaco" some no alto da
// página; "junto" não fica sozinho no pé (vai com o próximo).
const PH = 1920;
const TOPO_PAG = 230, PE_PAG = PH - 200;

function itensDaLeitura(ctx, l) {
  const itens = [];
  const nome = ROTULOS[l.tipo] ?? l.rotulo;
  const ref = l.referencia.replace(/\s*\(R\..*\)$/, '');
  itens.push({ h: 22 + 34, junto: 2, draw: (c, y) => {
    c.fillStyle = VERMELHO; c.font = `700 22px ${LEITURA}`;
    const x = espacado(c, nome.toUpperCase(), M, y + 22, 4);
    c.fillStyle = SUAVE; c.font = `italic 400 26px ${LEITURA}`;
    c.fillText(ref, x + 16, y + 22);
  } });
  const linha = (texto, { fonte = `400 ${CORPO}px ${LEITURA}`, cor = TINTA, x = M, largura = null, ultima = true } = {}) =>
    ({ h: LH, draw: (c, y) => {
      c.fillStyle = cor; c.font = fonte;
      if (largura) justificar(c, texto, x, y + CORPO, largura, ultima); else c.fillText(texto, x, y + CORPO);
    } });
  const espaco = h => ({ h, espaco: true, draw: () => {} });

  if (l.tipo === 'salmo') {
    const s = salmo(l.texto);
    const italico = `italic 400 ${CORPO}px ${LEITURA}`;
    if (s.refrao) {
      ctx.font = italico;
      quebrar(ctx, `R. ${s.refrao}`, LARG).forEach(t => itens.push(linha(t, { fonte: italico, cor: VERMELHO })));
      itens.push(espaco(30));
    }
    ctx.font = `400 ${CORPO}px ${LEITURA}`;
    s.estrofes.forEach((e, k) => {
      if (k) itens.push(espaco(30));
      e.forEach(v => quebrar(ctx, v, LARG).forEach(t => itens.push(linha(t))));
    });
  } else {
    const texto = prosa(l.texto);
    // texto que abre com aspas: a capitular é a letra; as aspas ficam penduradas na margem
    const [, aspas, letra, depois] = texto.match(/^([“"«‘']?)\s*(.)(.*)$/s);
    const resto = depois.replace(/^\s/, '');
    const F = ((CAP_LINHAS - 1) * LH + MAIUSC_TEXTO * CORPO) / ALTURA_MAIUSC;
    ctx.font = `400 ${F}px ${TITULO}`;
    const recuo = ctx.measureText(letra).width + CORPO * 0.4;
    ctx.font = `400 ${CORPO}px ${LEITURA}`;
    const linhas = quebrar(ctx, resto, LARG, recuo, CAP_LINHAS);
    const ult = linhas.length - 1;
    // a capitular e as 3 primeiras linhas andam juntas
    const n = Math.min(CAP_LINHAS, linhas.length);
    itens.push({ h: CAP_LINHAS * LH, draw: (c, y) => {
      c.fillStyle = VERMELHO; c.font = `400 ${F}px ${TITULO}`;
      c.fillText(letra, M - F * 0.02, y + CORPO + (CAP_LINHAS - 1) * LH);
      if (aspas) {
        c.font = `400 ${F * 0.45}px ${TITULO}`; c.textAlign = 'right';
        c.fillText(aspas === '"' ? '“' : aspas, M - F * 0.04, y + CORPO + F * 0.12);
        c.textAlign = 'left';
      }
      c.fillStyle = TINTA; c.font = `400 ${CORPO}px ${LEITURA}`;
      for (let i = 0; i < n; i++) justificar(c, linhas[i], M + recuo, y + CORPO + i * LH, LARG - recuo, i === ult);
    } });
    for (let i = n; i < linhas.length; i++) itens.push(linha(linhas[i], { largura: LARG, ultima: i === ult }));
  }
  const fecho = l.tipo === 'evangelho' ? 'Palavra da Salvação.' : l.tipo === 'salmo' ? '' : 'Palavra do Senhor.';
  if (fecho) {
    itens.push(espaco(22));
    itens.push(linha(fecho, { fonte: `italic 400 ${CORPO - 3}px ${LEITURA}`, cor: SUAVE }));
  }
  // as 3 últimas linhas (e o "Palavra do Senhor") passam de página juntas: nada de uma linha
  // sozinha numa página nova
  const k = Math.max(0, itens.length - (fecho ? 2 : 0) - 3);
  if (!itens[k].junto) itens[k].junto = itens.length - 1 - k;
  return itens;
}

function divisor(c, y) {
  const cx = M + LARG / 2;
  c.strokeStyle = 'rgba(203, 46, 46, 0.45)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx - 150, y); c.lineTo(cx - 26, y); c.moveTo(cx + 26, y); c.lineTo(cx + 150, y); c.stroke();
  c.fillStyle = VERMELHO;
  c.fillRect(cx - 1.5, y - 14, 3, 28);
  c.fillRect(cx - 9, y - 6, 18, 3);
}

// "Quarta-feira da 4ª Semana da Quaresma" já diz o dia da semana: a data vai sem ele
const dataSemRepetir = cab => (DIA_DA_SEMANA.test(cab.celebracao) ? cab.dataLonga : cab.dataExtenso);

/** Cabeçalho grande (1ª página, numa leitura só ou no dia inteiro): "Liturgia Diária", a data, o dia e a celebração. */
function cabecalhoGrande(ctx, cab) {
  const itens = [{ h: 34 + 118 + 54, draw: (c, y) => {
    c.fillStyle = VERMELHO; c.font = `italic 400 34px ${TITULO}`;
    c.fillText('Liturgia Diária', M, y + 34);
    c.fillStyle = TINTA; c.font = `italic 400 118px ${TITULO}`;
    c.fillText(cab.dataCurta, M - 6, y + 34 + 118);
    c.fillStyle = SUAVE; c.font = `400 30px ${LEITURA}`;
    c.fillText(dataSemRepetir(cab), M, y + 34 + 118 + 54);
  } }];
  if (cab.celebracao) {
    ctx.font = `italic 400 38px ${LEITURA}`;
    quebrar(ctx, cab.celebracao, LARG).forEach((t, i) => itens.push({ h: i ? 50 : 62, draw: (c, y) => {
      c.fillStyle = TINTA; c.font = `italic 400 38px ${LEITURA}`; c.fillText(t, M, y + (i ? 50 : 62));
    } }));
  }
  itens.push({ h: 90, draw: () => {} });
  return itens;
}

/** Topo das páginas seguintes: uma linha discreta com o dia. */
function cabecalhoPequeno(c, cab) {
  c.fillStyle = VERMELHO; c.font = `italic 400 32px ${TITULO}`;
  c.fillText('Liturgia Diária', M, 110);
  c.fillStyle = SUAVE; c.font = `400 24px ${LEITURA}`;
  const linha = [dataSemRepetir(cab), cab.celebracao].filter(Boolean).join(' · ');
  const [primeira] = quebrar(c, linha, LARG);
  c.fillText(primeira === linha ? linha : `${primeira.replace(/[\s,·]+$/, '')}…`, M, 150);
}

function rodapePagina(c, cab, i, n, H) {
  const y = H - 92;
  c.fillStyle = VERMELHO; c.font = `italic 400 44px ${TITULO}`;
  c.fillText(cab.dataCurta, M, y);
  if (n > 1) {
    const x = M + c.measureText(cab.dataCurta).width + 18;
    c.fillStyle = SUAVE; c.font = `400 24px ${LEITURA}`;
    c.fillText(`${i + 1}/${n}`, x, y);
  }
  c.fillStyle = SUAVE; c.font = `400 24px ${LEITURA}`; c.textAlign = 'right';
  c.fillText(SITE, W - MD, y);
  c.font = `400 19px ${LEITURA}`; c.globalAlpha = 0.8;
  c.fillText('Textos litúrgicos: CNBB', W - MD, y + 34);
  c.globalAlpha = 1; c.textAlign = 'left';
}

function ornamento(ctx, faixa, H) {
  if (!faixa) return null;
  const w = 70;
  const tmp = Object.assign(document.createElement('canvas'), { width: w, height: H });
  const t = tmp.getContext('2d');
  const ih = faixa.height * (w / faixa.width);
  for (let yy = 0; yy < H; yy += ih) t.drawImage(faixa, 0, yy, w, ih);
  const d = t.getImageData(0, 0, w, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11;
    d.data[i] = 0xcb; d.data[i + 1] = 0x2e; d.data[i + 2] = 0x2e; d.data[i + 3] = lum * 0.85;
  }
  t.putImageData(d, 0, 0);
  return tmp;
}

/** Distribui os itens em páginas: nada de espaço no alto, rótulo e capitular nunca sozinhos no pé. */
function paginar(itens, topo0) {
  const paginas = [[]];
  let y = topo0;
  const topo = () => (paginas.length === 1 ? topo0 : TOPO_PAG);
  for (let k = 0; k < itens.length; k++) {
    const it = itens[k];
    if (it.espaco && y === topo()) continue;
    let precisa = it.h;
    for (let j = 1; j <= (it.junto || 0) && itens[k + j]; j++) precisa += itens[k + j].h;
    if (y + precisa > PE_PAG && y > topo()) {
      if (it.espaco) continue;
      paginas.push([]); y = TOPO_PAG;
    }
    paginas.at(-1).push({ it, y });
    y += it.h;
  }
  return paginas.filter(p => p.length);
}

function montar(medir, cab, leituras, grande) {
  const itens = grande ? cabecalhoGrande(medir, cab) : [];
  leituras.forEach((l, i) => {
    if (i) itens.push({ h: 150, espaco: true, draw: (c, y) => divisor(c, y + 75) });
    itens.push(...itensDaLeitura(medir, l));
  });
  return paginar(itens, grande ? 110 : TOPO_PAG);
}

export async function paginas(dia, cab, { referencia = null } = {}) {
  const [, faixa, pintura] = await Promise.all([carregarFontes(), carregarFaixa(), carregarPintura()]);
  const medir = document.createElement('canvas').getContext('2d');
  const leituras = dia.missas[0].leituras
    .filter(l => !l.alternativa && ['leitura', 'salmo', 'evangelho'].includes(l.tipo))
    .filter(l => !referencia || l.referencia === referencia);
  // a 1ª página abre com o cabeçalho grande, corpo 36. Se apertar a letra até 32 poupa uma página,
  // aperta; se nem assim, troca o cabeçalho grande pelo pequeno — o que der menos páginas, na
  // ordem de preferência abaixo (uma linha solta numa página nova não pode acontecer)
  const opcoes = [true, false].flatMap(g => [36, 34, 32].map(corpo => [g, corpo]));
  const tentar = ([g, corpo]) => { CORPO = corpo; LH = corpo * 1.56; return montar(medir, cab, leituras, g); };
  const menor = Math.min(...opcoes.map(o => tentar(o).length));
  let pags, grande;
  for (const o of opcoes) { pags = tentar(o); grande = o[0]; if (pags.length === menor) break; }
  const orn = ornamento(null, faixa, PH);
  return pags.map((pag, i) => {
    // uma página só e texto curto (um salmo): a imagem encolhe até o texto, sem ficar menor que
    // o formato do feed (1080×1350) — nada de meia página vazia
    const fim = Math.max(...pag.map(({ it, y }) => y + it.h));
    const H = pags.length === 1 ? Math.min(PH, Math.max(1350, Math.ceil(fim + 230))) : PH;
    const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const c = cv.getContext('2d');
    c.fillStyle = FUNDO; c.fillRect(0, 0, W, H);
    if (orn) c.drawImage(orn, 24, 0);
    if (i || !grande) cabecalhoPequeno(c, cab);
    for (const { it, y } of pag) it.draw(c, y);
    // sobrou muito papel embaixo (a última página, um salmo curto): uma pintura ocupa o pé
    const livre0 = fim + 50, livre1 = H - 150;
    if (pintura && livre1 - livre0 >= 260) pinturaNoPe(c, pintura, livre0, livre1);
    rodapePagina(c, cab, i, pags.length, H);
    return cv;
  });
}
