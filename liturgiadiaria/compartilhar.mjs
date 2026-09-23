/**
 * compartilhar.mjs — card de um trecho da leitura, para WhatsApp e Instagram.
 *
 * O trecho vem pronto de data/liturgia-trechos/AAAA-MM-DD.json (escolhido fora do site, como o
 * resumo); aqui só se desenha, num <canvas>, em alguns layouts fixos. No celular troca-se o
 * layout arrastando para o lado; no desktop, pelas setas. Nada sai do aparelho além do que a
 * pessoa mesma compartilha.
 */

import { COR_FUNDO, COR_CALENDARIO } from '/liturgiadiaria/render.mjs';
import * as som from '/liturgiadiaria/som.mjs';

const SITE = 'santadoutrina.cloud/liturgiadiaria';
const TITULO = "'Times New Roman', Times, Georgia, serif";
const LEITURA = "'Inria Card', Georgia, serif";
const VERMELHO = '#cb2e2e';

// Tons da imagem provisória por cor litúrgica: [escuro, médio, luz]
const TONS = {
  branco: ['#3a2a12', '#8a6424', '#f3d58c'],
  verde: ['#12261a', '#2f5a3a', '#cfe0b4'],
  roxo: ['#1d1428', '#4a3266', '#d9c6ec'],
  vermelho: ['#2a0e0c', '#7a2420', '#f2b9a2'],
  rosa: ['#2e1520', '#8a4a62', '#f3cad6'],
  preto: ['#141312', '#3a3632', '#cfc8bf'],
};

// ── Fontes ───────────────────────────────────────────────────────────────────
let fontes = null;
function carregarFontes() {
  if (!fontes) {
    const lista = [
      new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-400.woff2)', { weight: '400' }),
      new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-400-italic.woff2)', { weight: '400', style: 'italic' }),
      new FontFace('Inria Card', 'url(/assets/fonts/inria-serif-700.woff2)', { weight: '700' }),
    ];
    fontes = Promise.all(lista.map(f => f.load().then(ff => document.fonts.add(ff)).catch(() => {})));
  }
  return fontes;
}

// ── Imagens (mesma origem: o canvas não fica "sujo" e pode virar PNG) ──────
const imagens = {};
let imagensProntas = null;
function carregarImagens() {
  const uma = (nome, src) => new Promise(ok => {
    const img = new Image();
    img.onload = () => { imagens[nome] = img; ok(); };
    img.onerror = () => ok();
    img.src = src;
  });
  imagensProntas ??= Promise.all([
    uma('faixa', '/assets/img/liturgia-faixa.webp'),
  ]);
  return imagensProntas;
}

/** O L do ícone, vetorizado (o mesmo traço do preloader, lido do próprio HTML), na cor pedida. */
let caminhoL;
function logo(ctx, x, y, tamanho, cor) {
  caminhoL ??= (() => {
    const d = document.querySelector('.lp-preloader-letra')?.getAttribute('d');
    return d ? new Path2D(d) : null;
  })();
  if (!caminhoL) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(tamanho / 100, tamanho / 100);
  ctx.fillStyle = cor;
  ctx.fill(caminhoL, 'evenodd');
  ctx.restore();
}

// ── Texto ────────────────────────────────────────────────────────────────────
function quebrar(ctx, texto, largura) {
  const linhas = [];
  let linha = '';
  for (const p of texto.split(/\s+/)) {
    const teste = linha ? `${linha} ${p}` : p;
    if (linha && ctx.measureText(teste).width > largura) { linhas.push(linha); linha = p; }
    else linha = teste;
  }
  if (linha) linhas.push(linha);
  return linhas;
}

/** Maior corpo (entre max e min) em que o texto cabe na caixa; abaixo do mínimo, corta com "…". */
function encaixar(ctx, texto, { fonte, largura, altura, max, min, entrelinha = 1.4 }) {
  for (let t = max; t >= min; t -= 2) {
    ctx.font = fonte(t);
    const linhas = quebrar(ctx, texto, largura);
    if (linhas.length * t * entrelinha <= altura) return { linhas, t, lh: t * entrelinha };
  }
  ctx.font = fonte(min);
  const cabem = Math.max(1, Math.floor(altura / (min * entrelinha)));
  const linhas = quebrar(ctx, texto, largura).slice(0, cabem);
  linhas[linhas.length - 1] = linhas.at(-1).replace(/[\s,.;:!?]*\S*$/, '…');
  return { linhas, t: min, lh: min * entrelinha };
}

// ── Fundos ───────────────────────────────────────────────────────────────────
function ruido(ctx, x, y, w, h, forca) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * forca;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, x, y);
}

function papel(ctx, x, y, w, h, cor) {
  ctx.fillStyle = cor;
  ctx.fillRect(x, y, w, h);
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 0, x + w / 2, y + h * 0.4, Math.max(w, h) * 0.8);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(90,60,20,0.10)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ruido(ctx, x, y, w, h, 14);
}

/** Imagem provisória: luz dourada atrás de uma cruz. Sai quando o acervo de imagens existir. */
function arte(ctx, x, y, w, h, cor) {
  // pintura do acervo, recortada para cobrir a área (como object-fit: cover)
  const img = imagens.arte;
  if (img) {
    const e = Math.max(w / img.width, h / img.height);
    const sw = w / e, sh = h / e;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * 0.4, sw, sh, x, y, w, h);
    return;
  }
  const [escuro, medio, luz] = TONS[cor] || TONS.branco;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const fundo = ctx.createLinearGradient(x, y, x, y + h);
  fundo.addColorStop(0, escuro); fundo.addColorStop(0.55, medio); fundo.addColorStop(1, escuro);
  ctx.fillStyle = fundo; ctx.fillRect(x, y, w, h);

  const cx = x + w / 2, cy = y + h * 0.42;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
  halo.addColorStop(0, luz); halo.addColorStop(0.25, `${luz}aa`); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = `${luz}33`; ctx.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 1.2, cy + Math.sin(a) * w * 1.2); ctx.stroke();
  }

  const s = Math.min(w, h) * 0.5;
  ctx.fillStyle = escuro;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40;
  ctx.fillRect(cx - s * 0.05, cy - s * 0.55, s * 0.1, s * 1.25);
  ctx.fillRect(cx - s * 0.32, cy - s * 0.3, s * 0.64, s * 0.1);
  ctx.restore();
  ruido(ctx, x, y, w, h, 22);
}

// ── Layouts ──────────────────────────────────────────────────────────────────
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

/** O ornamento floral das laterais da página, em vermelho (o claro da arte vira cor). */
function faixa(ctx, x, y, w, h) {
  const img = imagens.faixa;
  if (!img) return;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d');
  const ih = img.height * (w / img.width);
  for (let yy = 0; yy < h; yy += ih) t.drawImage(img, 0, yy, w, ih);
  const d = t.getImageData(0, 0, w, h);
  const [r, g, b] = [0xcb, 0x2e, 0x2e];
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11);
    d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = lum;
  }
  t.putImageData(d, 0, 0);
  ctx.drawImage(tmp, x, y);
}

function soTexto(ctx, W, H, c) {
  papel(ctx, 0, 0, W, H, COR_FUNDO[c.cor] || '#faf7ee');
  const fw = 110;
  faixa(ctx, 0, 0, fw, H);
  logo(ctx, W - 70 - 110, 50, 110, VERMELHO);

  const m = fw + 90, largura = W - m - 90;
  const letra = c.trecho.charAt(0);
  const resto = c.trecho.slice(1);
  const LINHAS_CAP = 3;
  const ALTURA_MAIUSC = 0.662;   // Times: altura da maiúscula / corpo
  const MAIUSC_TEXTO = 0.68;     // Inria: idem

  // Maior corpo em que tudo cabe; a capitular ocupa as 3 primeiras linhas, do topo da
  // maiúscula da 1ª linha à linha de base da 3ª, como na página.
  let plano = null;
  for (let t = 68; t >= 38; t -= 2) {
    const lh = t * 1.38;
    const F = ((LINHAS_CAP - 1) * lh + MAIUSC_TEXTO * t) / ALTURA_MAIUSC;
    ctx.font = `400 ${F}px ${TITULO}`;
    const recuo = ctx.measureText(letra).width + t * 0.35;
    ctx.font = `400 ${t}px ${LEITURA}`;
    const linhas = [];
    let linha = '';
    for (const p of resto.split(/\s+/)) {
      const lim = linhas.length < LINHAS_CAP ? largura - recuo : largura;
      const teste = linha ? `${linha} ${p}` : p;
      if (linha && ctx.measureText(teste).width > lim) { linhas.push(linha); linha = p; } else linha = teste;
    }
    if (linha) linhas.push(linha);
    const n = Math.max(linhas.length, LINHAS_CAP);
    plano = { t, lh, F, recuo, linhas, altura: t + (n - 1) * lh };
    if (plano.altura <= H - 680) break;
  }
  const { t, lh, F, recuo, linhas } = plano;
  const bloco = plano.altura + 170;
  const topo = Math.max(250, (H - bloco) / 2 - 30);   // topo da 1ª linha
  const base0 = topo + t;

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = `600 30px ${LEITURA}`;
  ctx.fillText(c.rotulo.toUpperCase(), m, topo - 56);

  ctx.fillStyle = VERMELHO; ctx.font = `400 ${F}px ${TITULO}`;
  ctx.fillText(letra, m - F * 0.02, base0 + (LINHAS_CAP - 1) * lh);

  ctx.fillStyle = '#1c1812'; ctx.font = `400 ${t}px ${LEITURA}`;
  linhas.forEach((l, i) => ctx.fillText(l, i < LINHAS_CAP ? m + recuo : m, base0 + i * lh));
  const fim = topo + plano.altura;

  ctx.font = `italic 42px ${LEITURA}`; ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillText(c.referencia, m, fim + 100);
  ctx.font = `italic 33px ${LEITURA}`; ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(`${c.data} · ${c.celebracao}`, m, fim + 152, largura);

  ctx.font = `400 26px ${LEITURA}`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.textAlign = 'right';
  ctx.fillText(SITE, W - 90, H - 66);
  ctx.textAlign = 'left'; ctx.font = `600 26px ${LEITURA}`;
  ctx.fillText('LITURGIA DIÁRIA', m, H - 66);
}

/** Linha justificada: distribui a sobra entre os espaços (a última linha fica alinhada à esquerda). */
function justificar(ctx, linha, x, y, largura, ultima) {
  const palavras = linha.split(' ');
  if (ultima || palavras.length < 2) { ctx.textAlign = 'left'; ctx.fillText(linha, x, y); return; }
  const soma = palavras.reduce((t, p) => t + ctx.measureText(p).width, 0);
  const espaco = (largura - soma) / (palavras.length - 1);
  let cx = x;
  ctx.textAlign = 'left';
  for (const p of palavras) { ctx.fillText(p, cx, y); cx += ctx.measureText(p).width + espaco; }
}

/** Metade de cima imagem, embaixo papel claro: rótulo espaçado, texto justificado e um
 *  rodapé em duas colunas (rótulos à esquerda, valores à direita), com o L no canto. */
function editorial(ctx, W, H, c) {
  const alto = H > 1600;   // stories; senão, feed
  const corte = Math.round(H * (alto ? 0.48 : 0.38));
  const yTitulo = corte + (alto ? 250 : 150);
  const yRodape = H - (alto ? 250 : 200);   // 1ª das três linhas do rodapé
  const LINHA_RODAPE = 50;
  arte(ctx, 0, 0, W, corte, c.cor);
  papel(ctx, 0, corte, W, H - corte, '#ece6da');
  const m = 110, tinta = '#2a2620';

  logo(ctx, W - m - 92, corte + (alto ? 60 : 30), alto ? 108 : 92, tinta);

  // título da leitura e, ao lado, a passagem (a fonte encolhe se a referência for longa)
  ctx.fillStyle = tinta;
  const titulo = c.rotulo.toUpperCase();
  const passagem = `·  ${c.referencia.toUpperCase()}`;
  let corpo = 36;
  const largura = () => larguraEspacada(ctx, titulo, 7) + 14 + larguraEspacada(ctx, passagem, 5);
  do { ctx.font = `400 ${corpo}px ${LEITURA}`; } while (largura() > W - 2 * m && --corpo > 22);
  espacadoEsq(ctx, titulo, m, yTitulo, 7);
  ctx.globalAlpha = 0.55;
  espacadoEsq(ctx, passagem, m + larguraEspacada(ctx, titulo, 7) + 14, yTitulo, 5);
  ctx.globalAlpha = 1;

  const topo = yTitulo + 56;
  const caixa = encaixar(ctx, c.trecho, {
    fonte: t => `400 ${t}px ${LEITURA}`, largura: W - 2 * m, altura: yRodape - 100 - topo, max: alto ? 64 : 56, min: 34, entrelinha: alto ? 1.6 : 1.5,
  });
  ctx.fillStyle = tinta;
  caixa.linhas.forEach((l, i) => justificar(ctx, l, m, topo + caixa.t + i * caixa.lh, W - 2 * m, i === caixa.linhas.length - 1));

  const rotulos = ['CELEBRAÇÃO', 'DIA', 'LEIA MAIS'];
  const valores = [c.celebracao.toUpperCase(), c.data.toUpperCase(), 'SANTADOUTRINA.CLOUD'];
  rotulos.forEach((r, i) => {
    const y = yRodape + i * LINHA_RODAPE;
    ctx.font = `400 30px ${LEITURA}`;
    espacadoEsq(ctx, r, m, y, 5);
    // valor longo (nome de festa comprido) encolhe para não encostar no rótulo
    const livre = W - 2 * m - larguraEspacada(ctx, r, 5) - 40;
    let corpo = 30;
    while (larguraEspacada(ctx, valores[i], 5) > livre && --corpo > 18) ctx.font = `400 ${corpo}px ${LEITURA}`;
    espacadoDir(ctx, valores[i], W - m, y, 5);
  });
}

function espacadoEsq(ctx, texto, x, y, espaco) {
  ctx.textAlign = 'left';
  for (const ch of texto) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + espaco; }
}

const larguraEspacada = (ctx, texto, espaco) =>
  [...texto].reduce((t, ch) => t + ctx.measureText(ch).width + espaco, -espaco);

function espacadoDir(ctx, texto, x, y, espaco) {
  espacadoEsq(ctx, texto, x - larguraEspacada(ctx, texto, espaco), y, espaco);
}

export const LAYOUTS = [
  { id: 'editorial-feed', nome: 'Feed', w: 1080, h: 1350, desenhar: editorial },
  { id: 'editorial-stories', nome: 'Stories', w: 1080, h: 1920, desenhar: editorial },
  { id: 'texto', nome: 'Só texto', w: 1080, h: 1350, desenhar: soTexto },
];

// ── Ícones ───────────────────────────────────────────────────────────────────
const TRACO = 'viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
const ICONE = {
  // balão com o fone, em traço fino (a marca redesenhada no estilo dos outros ícones)
  whatsapp: `<svg ${TRACO}><path d="M3.6 20.4l1.2-4.1A8.4 8.4 0 1 1 8 19.5z"/><path d="M9.2 8.1c.3-.4.8-.4 1 0l.8 1.7c.1.3 0 .6-.2.8l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.5c.2-.2.5-.3.8-.2l1.7.8c.4.2.4.7 0 1-.9.9-2 1.1-3.3.4a8.6 8.6 0 0 1-3.9-3.9c-.7-1.3-.5-2.4.4-3.3z"/></svg>`,
  instagram: `<svg ${TRACO}><rect x="3.5" y="3.5" width="17" height="17" rx="4.8"/><circle cx="12" cy="12" r="3.9"/><circle cx="17.2" cy="6.8" r="0.5" fill="currentColor"/></svg>`,
  salvar: `<svg ${TRACO}><path d="M12 4.5v10M7.8 10.6 12 14.8l4.2-4.2M5 19.5h14"/></svg>`,
};

// ── Janela ───────────────────────────────────────────────────────────────────
// Os cards são desenhados em canvas de tamanho real fora da tela (é deles que sai o arquivo);
// na janela aparece só uma imagem reduzida de cada um, leve de arrastar no celular.
let dlg = null;
let atual = 0;
let conteudo = null;
const telas = LAYOUTS.map(l => Object.assign(document.createElement('canvas'), { width: l.w, height: l.h }));
const TOQUE = matchMedia('(pointer: coarse)');
const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)');

function montarJanela() {
  dlg = document.createElement('dialog');
  dlg.className = 'lp-card';
  dlg.setAttribute('aria-label', 'Compartilhar trecho');
  dlg.dataset.lenisPrevent = '';
  dlg.innerHTML = `
    <div class="lp-card-caixa">
      <header class="lp-card-topo">
        <p class="lp-card-titulo">Compartilhar trecho</p>
        <span class="lp-card-topo-vao"></span>
        <button class="lp-card-fechar" type="button" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
      </header>
      <nav class="lp-card-abas" aria-label="Layout">${LAYOUTS.map((l, i) => `<button type="button" data-i="${i}">${l.nome}</button>`).join('')}</nav>
      <div class="lp-card-palco">
        <button class="lp-card-seta lp-card-ant" type="button" aria-label="Layout anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>
        <div class="lp-card-trilho">${LAYOUTS.map((l, i) => `
          <figure class="lp-card-slide" data-i="${i}"><img alt="Card ${l.nome}" width="${l.w}" height="${l.h}" decoding="async"></figure>`).join('')}
        </div>
        <button class="lp-card-seta lp-card-prox" type="button" aria-label="Próximo layout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg></button>
      </div>
      <div class="lp-card-fotos" aria-label="Pintura do card"></div>
      <div class="lp-card-acoes">
        <button type="button" data-destino="whatsapp"><span class="lp-card-icone">${ICONE.whatsapp}</span>WhatsApp</button>
        <button type="button" data-destino="instagram"><span class="lp-card-icone">${ICONE.instagram}</span>Instagram</button>
        <button type="button" data-destino="salvar"><span class="lp-card-icone">${ICONE.salvar}</span>Salvar</button>
      </div>
      <p class="lp-card-aviso" role="status"></p>
    </div>`;
  document.body.append(dlg);
  dlg.querySelector('.lp-card-fechar').before(som.botaoDeSom('lp-card-som'));

  const trilho = dlg.querySelector('.lp-card-trilho');
  const passo = () => trilho.children[1].offsetLeft - trilho.children[0].offsetLeft;

  // Toque na aba ou na seta: rolagem própria, curta (~260ms), em vez da "smooth" do navegador.
  let animacao = 0;
  let animando = false;   // enquanto a rolagem é nossa, o detector de arrasto não mexe na aba
  const ir = i => {
    const antes = atual;
    atual = (i + LAYOUTS.length) % LAYOUTS.length;
    marcar();
    if (atual !== antes) som.tocar('deslizar');
    const de = trilho.scrollLeft, para = atual * passo();
    cancelAnimationFrame(animacao);
    if (REDUZIDO.matches || de === para) { trilho.scrollLeft = para; return; }
    animando = true;
    trilho.style.scrollSnapType = 'none';
    const t0 = performance.now(), dur = 260;
    const quadro = t => {
      const p = Math.min(1, (t - t0) / dur), q = 1 - (1 - p) ** 3;
      trilho.scrollLeft = de + (para - de) * q;
      if (p < 1) animacao = requestAnimationFrame(quadro);
      else { trilho.style.scrollSnapType = ''; animando = false; }
    };
    animacao = requestAnimationFrame(quadro);
  };
  dlg.querySelector('.lp-card-fechar').addEventListener('click', () => dlg.close());
  // tocar num card vizinho (a borda que aparece do lado) leva a ele
  trilho.addEventListener('click', e => {
    const slide = e.target.closest('.lp-card-slide');
    if (slide && +slide.dataset.i !== atual) ir(+slide.dataset.i);
  });
  dlg.querySelector('.lp-card-ant').addEventListener('click', () => ir(atual - 1));
  dlg.querySelector('.lp-card-prox').addEventListener('click', () => ir(atual + 1));
  dlg.querySelector('.lp-card-abas').addEventListener('click', e => { if (e.target.dataset.i) ir(+e.target.dataset.i); });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') ir(atual - 1);
    if (e.key === 'ArrowRight') ir(atual + 1);
  });
  // Arrastar no celular: a aba acompanha já durante o arrasto (o card mais perto do centro).
  let quadroRolagem = 0;
  trilho.addEventListener('scroll', () => {
    if (animando) return;
    cancelAnimationFrame(quadroRolagem);
    quadroRolagem = requestAnimationFrame(() => {
      const i = Math.max(0, Math.min(LAYOUTS.length - 1, Math.round(trilho.scrollLeft / passo())));
      if (i !== atual) { atual = i; marcar(); som.tocar('deslizar'); }
    });
  }, { passive: true });
  dlg.querySelector('.lp-card-fotos').addEventListener('click', e => {
    const b = e.target.closest('[data-foto]');
    if (b) { som.tocar('toque'); trocarFoto(+b.dataset.foto); }
  });
  dlg.querySelector('.lp-card-acoes').addEventListener('click', e => {
    const destino = e.target.closest('[data-destino]')?.dataset.destino;
    if (destino) enviar(destino);
  });
}

function marcar() {
  dlg.querySelectorAll('.lp-card-abas button').forEach((b, i) => b.setAttribute('aria-current', i === atual));
  dlg.querySelectorAll('.lp-card-slide').forEach((f, i) => f.classList.toggle('atual', i === atual));
  dlg.querySelector('.lp-card-fotos').classList.toggle('inativa', LAYOUTS[atual].id === 'texto');
}

const nomeArquivo = () => `liturgia-${conteudo.dt}-${LAYOUTS[atual].id}.png`;
const blobDoCard = () => new Promise(r => telas[atual].toBlob(r, 'image/png'));

function baixar(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Abre um app pelo esquema dele; se a página continuar à vista (app não instalado), cai no plano B. */
function abrirApp(url, planoB) {
  let saiu = false;
  const marca = () => { saiu = true; };
  document.addEventListener('visibilitychange', marca, { once: true });
  location.href = url;
  setTimeout(() => {
    document.removeEventListener('visibilitychange', marca);
    if (!saiu && !document.hidden) planoB?.();
  }, 1400);
}

// Uma página web não consegue entregar a imagem direto ao WhatsApp ou ao Instagram:
// · WhatsApp: abre o app com o trecho e o link (a prévia do link mostra a imagem do dia);
// · Instagram: copia o card e abre a câmera do stories, onde ele pode ser colado;
// · Salvar: no celular, a folha do sistema (é o único caminho até a galeria de fotos).
async function enviar(destino) {
  const link = `https://${SITE}/${conteudo.dt}/`;
  const texto = `“${conteudo.trecho}” (${conteudo.referencia})\n${link}`;

  if (destino === 'whatsapp') {
    som.tocar('confirmar');
    const web = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    if (TOQUE.matches) abrirApp(`whatsapp://send?text=${encodeURIComponent(texto)}`, () => { location.href = web; });
    else open(web, '_blank', 'noopener');
    return;
  }

  if (destino === 'instagram') {
    if (TOQUE.matches && navigator.clipboard?.write && window.ClipboardItem) {
      try {
        // o Safari exige que a escrita comece no próprio toque: vai a promessa do blob, não o blob
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobDoCard() })]);
        som.tocar('confirmar');
        avisar('Card copiado. No stories, toque em “Adicionar” ou cole.');
        setTimeout(() => abrirApp('instagram://story-camera', () => compartilharArquivo()), 700);
        return;
      } catch { /* sem permissão: segue para a folha do sistema */ }
    }
    if (TOQUE.matches && await compartilharArquivo()) return;
    baixar(await blobDoCard());
    som.tocar('confirmar');
    avisar('Imagem salva. Publique pelo app do Instagram.');
    return;
  }

  // salvar
  if (TOQUE.matches) {
    avisar('Toque em “Salvar imagem”.');
    if (await compartilharArquivo()) return;
  }
  baixar(await blobDoCard());
  som.tocar('confirmar');
  avisar('Imagem salva.');
}

async function compartilharArquivo() {
  const arquivo = new File([await blobDoCard()], nomeArquivo(), { type: 'image/png' });
  if (!navigator.canShare?.({ files: [arquivo] })) return false;
  try { await navigator.share({ files: [arquivo] }); som.tocar('confirmar'); } catch { /* cancelou */ }
  return true;
}

let esperaAviso;
function avisar(msg) {
  const el = dlg.querySelector('.lp-card-aviso');
  el.textContent = msg;
  el.classList.add('visivel');
  clearTimeout(esperaAviso);
  esperaAviso = setTimeout(() => el.classList.remove('visivel'), 4000);
}

// ── Pinturas (data/cards-imagens.json) ───────────────────────────────────────
const CARDS = '/assets/img/cards';
const diaDoAno = dt => Math.round(Date.parse(`${dt}T00:00:00Z`) / 86400000);

/** Pinturas oferecidas para o dia: a escolhida para a leitura (se houver) e depois as que batem
 *  o tempo litúrgico (+2) e a cor (+1), e por fim as neutras. Dentro do grupo de maior nota, a primeira gira com a data,
 *  para o card de cada dia não abrir sempre com a mesma. */
export function escolherFotos(catalogo, { tempo, cor, dt, preferida }, max = 6) {
  const lista = catalogo?.imagens || [];
  // tempo do dia vale 2, cor 1; as neutras ("todos") entram por último, em qualquer dia
  const nota = im => (im.tempos.includes(tempo) ? 2 : 0) + (im.cores.includes(cor) ? 1 : 0)
    + (im.tempos.includes('todos') ? 0.5 : 0);
  const boas = lista.filter(im => nota(im) > 0).sort((a, b) => nota(b) - nota(a));
  const topo = boas.filter(im => nota(im) === nota(boas[0]));
  const giro = topo.length ? diaDoAno(dt) % topo.length : 0;
  const ordem = [...topo.slice(giro), ...topo.slice(0, giro), ...boas.slice(topo.length)];
  const pref = preferida && lista.find(im => im.id === preferida);
  const fotos = pref ? [pref, ...ordem.filter(im => im !== pref)] : ordem;
  return fotos.slice(0, max).map(im => ({ ...im, src: `${CARDS}/${im.id}.webp`, mini: `${CARDS}/mini/${im.id}.webp` }));
}

const carregarArte = src => new Promise(ok => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = src;
});

// Desenha cada card no tamanho real e põe na janela uma cópia reduzida (larga o bastante para
// telas de alta densidade, mas bem mais leve de mover que o canvas cheio).
const PREVIA_L = 640;
function desenharTodos() {
  const imgs = dlg.querySelectorAll('.lp-card-slide img');
  telas.forEach((cv, i) => {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    LAYOUTS[i].desenhar(ctx, cv.width, cv.height, conteudo);
    const previa = Object.assign(document.createElement('canvas'), { width: PREVIA_L, height: Math.round(PREVIA_L * cv.height / cv.width) });
    previa.getContext('2d').drawImage(cv, 0, 0, previa.width, previa.height);
    previa.toBlob(b => {
      if (!b) return;
      const antigo = imgs[i].src;
      imgs[i].src = URL.createObjectURL(b);
      if (antigo.startsWith('blob:')) URL.revokeObjectURL(antigo);
    }, 'image/jpeg', 0.9);
  });
}

let pedidoFoto = 0;
async function trocarFoto(i) {
  const foto = conteudo.fotos?.[i];
  dlg.querySelectorAll('.lp-card-fotos button').forEach((b, k) => b.setAttribute('aria-pressed', k === i));
  const vez = ++pedidoFoto;
  const img = foto ? await carregarArte(foto.src) : null;
  if (vez !== pedidoFoto) return;
  if (img) imagens.arte = img; else delete imagens.arte;
  desenharTodos();
}

/** c: { dt, trecho, referencia, rotulo, celebracao, data, cor, fotos? } (fotos: de escolherFotos) */
export async function abrirCard(c, { aoFechar } = {}) {
  if (!dlg) montarJanela();
  conteudo = { ...c, trecho: maiuscula(c.trecho) };
  dlg.onclose = () => aoFechar?.();
  const fila = dlg.querySelector('.lp-card-fotos');
  fila.innerHTML = (c.fotos || []).map((f, i) => `
    <button type="button" data-foto="${i}" aria-pressed="${i === 0}" title="${f.titulo}">
      <img src="${f.mini}" alt="${f.titulo}" width="56" height="56">
    </button>`).join('');
  fila.hidden = !(c.fotos?.length > 1);
  dlg.showModal();
  atual = 0;
  dlg.querySelector('.lp-card-trilho').scrollLeft = 0;
  marcar();
  delete imagens.arte;
  await Promise.all([carregarFontes(), carregarImagens()]);
  await trocarFoto(0);
}
