/**
 * som.mjs — sons discretos das interações da Liturgia Diária (e a vibração, no Android).
 *
 * Tudo sintetizado na hora com Web Audio: nenhum arquivo a baixar. Desligado por padrão; a pessoa
 * liga pelo botão de som, e a escolha fica guardada no aparelho. Nunca toca sem um toque da
 * pessoa (o navegador nem deixaria) e nunca é o único sinal: toda ação tem a sua resposta visual.
 *
 *   toque      — escolher algo pequeno (a pintura do card)
 *   deslizar   — trocar de mês ou de layout (papel correndo)
 *   limiar     — o arrasto de troca de dia passou do ponto em que, solto, confirma
 *   pagina     — trocar de dia (página virando)
 *   confirmar  — salvar ou compartilhar
 */

const CHAVE = 'lp-som';
const ouvintes = new Set();
let ligadoAgora = false;
try { ligadoAgora = localStorage.getItem(CHAVE) === '1'; } catch { /* sem armazenamento: fica desligado */ }

export const ligado = () => ligadoAgora;

export function alternar(valor = !ligadoAgora) {
  ligadoAgora = valor;
  try { localStorage.setItem(CHAVE, valor ? '1' : '0'); } catch { /* ignora */ }
  if (valor) { contexto(); tocar('toque'); }
  ouvintes.forEach(f => f(valor));
  return valor;
}

export const aoMudar = f => { ouvintes.add(f); return () => ouvintes.delete(f); };

// ── Motor ────────────────────────────────────────────────────────────────────
let ctx = null;
let saida = null;
let ruidoBuf = null;

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    saida = ctx.createGain();
    saida.gain.value = 0.5;              // volume geral baixo: é textura, não aviso
    saida.connect(ctx.destination);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Sopro de ruído filtrado: papel, página, clique. */
function ruido({ duracao, freq, freqFim = freq, q = 1, volume, ataque = 0.004 }) {
  const t = ctx.currentTime;
  const fonte = ctx.createBufferSource();
  fonte.buffer = ruidoBuf;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = q;
  filtro.frequency.setValueAtTime(freq, t);
  filtro.frequency.exponentialRampToValueAtTime(freqFim, t + duracao);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  fonte.connect(filtro).connect(g).connect(saida);
  fonte.start(t, Math.random() * 0.2);
  fonte.stop(t + duracao + 0.02);
}

/** Tom curto e macio (seno), sem melodia: só um "ponto" de confirmação. */
function tom({ freq, duracao, volume, atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  o.connect(g).connect(saida);
  o.start(t);
  o.stop(t + duracao + 0.02);
}

const SONS = {
  toque: () => ruido({ duracao: 0.03, freq: 3200, q: 2.5, volume: 0.25 }),
  deslizar: () => ruido({ duracao: 0.16, freq: 1800, freqFim: 3800, q: 0.9, volume: 0.09, ataque: 0.04 }),
  limiar: () => { ruido({ duracao: 0.025, freq: 2600, q: 3, volume: 0.3 }); tom({ freq: 1320, duracao: 0.07, volume: 0.035 }); },
  pagina: () => {
    ruido({ duracao: 0.26, freq: 900, freqFim: 3400, q: 0.7, volume: 0.12, ataque: 0.05 });
    ruido({ duracao: 0.05, freq: 2400, q: 2, volume: 0.12, ataque: 0.004 });
  },
  confirmar: () => { tom({ freq: 880, duracao: 0.14, volume: 0.05 }); tom({ freq: 1320, duracao: 0.2, volume: 0.035, atraso: 0.07 }); },
};

const VIBRACAO = { toque: 6, deslizar: 8, limiar: 14, pagina: [10, 30, 10], confirmar: 12 };

export function tocar(nome) {
  if (!ligadoAgora || document.hidden) return;
  if (contexto() && SONS[nome]) {
    try { SONS[nome](); } catch { /* áudio indisponível: segue em silêncio */ }
  }
  // Android: vibração curta junto (o Safari do iPhone não permite vibrar pela web)
  if (VIBRACAO[nome]) navigator.vibrate?.(VIBRACAO[nome]);
}

// ── Botão de som ─────────────────────────────────────────────────────────────
const ICONE_LIGADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>';
const ICONE_DESLIGADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>';

/** Desenha/atualiza um botão de som (pode haver mais de um na página; todos ficam em sincronia). */
export function botaoDeSom(classe) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = classe;
  const pintar = on => {
    b.innerHTML = on ? ICONE_LIGADO : ICONE_DESLIGADO;
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Desligar sons' : 'Ligar sons');
    b.title = on ? 'Sons ligados' : 'Sons desligados';
  };
  pintar(ligadoAgora);
  b.addEventListener('click', () => alternar());
  aoMudar(pintar);
  return b;
}
