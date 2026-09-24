/**
 * leitor-audio.mjs — ouvir a leitura: tela cheia, sem distração, no estilo "Letras" do Apple Music.
 *
 * Só o texto, em letra grande: a linha que está sendo lida em destaque, as já lidas esmaecendo, as
 * próximas mais apagadas, e a rolagem acompanhando a voz. Tocar numa linha pula o áudio para ela.
 * Os controles (voltar/avançar 15s, tocar/pausar, música) somem sozinhos enquanto toca e voltam a
 * um toque. A voz vem pronta de data/liturgia-audio/AAAA-MM-DD/<leitura>.mp3 + .json (tempo de cada
 * linha), gerada com antecedência por scripts/build-audio-liturgia.mjs. Por baixo, bem baixa, uma
 * música de fundo que entra e sai em fade; dá para desligar.
 */

const MUSICA = '/assets/audio/fundo-leitura.mp3';
const VOLUME_MUSICA = 0.07;   // bem por baixo da voz
const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)');

let dlg = null;
let voz = null;
let musica = null;
let dados = null;
let fila = [];      // as leituras do dia com voz, na ordem da missa
let posFila = 0;
let diaAtual = '';
let atual = -1;
let quadro = 0;
let esperaControles = 0;
let musicaLigada = true;
try { musicaLigada = localStorage.getItem('lp-ouvir-musica') !== '0'; } catch { /* segue ligada */ }

const ICONE = {
  tocar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  pausar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13"/></svg>',
  voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/><text x="12" y="15.2" text-anchor="middle" font-size="6.5" fill="currentColor" stroke="none" font-family="system-ui" font-weight="700">15</text></svg>',
  avancar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/><text x="12" y="15.2" text-anchor="middle" font-size="6.5" fill="currentColor" stroke="none" font-family="system-ui" font-weight="700">15</text></svg>',
  musica: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
};

function montar() {
  dlg = document.createElement('dialog');
  dlg.className = 'lp-ouvir';
  dlg.setAttribute('aria-label', 'Ouvir a leitura');
  dlg.dataset.lenisPrevent = '';
  dlg.innerHTML = `
    <header class="lp-ouvir-topo">
      <p class="lp-ouvir-titulo"><span class="lp-ouvir-rotulo"></span><span class="lp-ouvir-ref"></span></p>
      <button type="button" class="lp-ouvir-fechar" aria-label="Fechar">${ICONE.fechar}</button>
    </header>
    <div class="lp-ouvir-texto" aria-live="off"></div>
    <footer class="lp-ouvir-controles">
      <div class="lp-ouvir-progresso"><span></span></div>
      <div class="lp-ouvir-botoes">
        <button type="button" data-acao="musica" class="lp-ouvir-musica" aria-label="Música de fundo">${ICONE.musica}</button>
        <button type="button" data-acao="voltar" aria-label="Voltar 15 segundos">${ICONE.voltar}</button>
        <button type="button" data-acao="tocar" class="lp-ouvir-tocar" aria-label="Tocar">${ICONE.tocar}</button>
        <button type="button" data-acao="avancar" aria-label="Avançar 15 segundos">${ICONE.avancar}</button>
        <span class="lp-ouvir-vao"></span>
      </div>
    </footer>`;
  document.body.append(dlg);

  dlg.querySelector('.lp-ouvir-fechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', parar);
  dlg.querySelector('.lp-ouvir-botoes').addEventListener('click', e => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'tocar') (voz.paused ? tocar : pausar)();
    if (acao === 'voltar') voz.currentTime = Math.max(0, voz.currentTime - 15);
    if (acao === 'avancar') voz.currentTime = Math.min(voz.duration || 1e9, voz.currentTime + 15);
    if (acao === 'musica') alternarMusica();
    mostrarControles();
  });
  // tocar numa linha pula a voz para ela
  dlg.querySelector('.lp-ouvir-texto').addEventListener('click', e => {
    const p = e.target.closest('[data-i]');
    if (p) { voz.currentTime = dados.linhas[+p.dataset.i].t0 + 0.01; if (voz.paused) tocar(); }
    mostrarControles();
  });
  dlg.querySelector('.lp-ouvir-progresso').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    voz.currentTime = ((e.clientX - r.left) / r.width) * (voz.duration || dados.duracao);
  });
  dlg.addEventListener('pointermove', mostrarControles, { passive: true });
  dlg.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); (voz.paused ? tocar : pausar)(); }
  });
}

function mostrarControles() {
  dlg.classList.remove('lp-ouvir-quieto');
  clearTimeout(esperaControles);
  esperaControles = setTimeout(() => { if (!voz?.paused) dlg.classList.add('lp-ouvir-quieto'); }, 3000);
}

function fade(el, alvo, ms, depois) {
  const de = el.volume, t0 = performance.now();
  const passo = t => {
    const p = Math.min(1, (t - t0) / ms);
    el.volume = de + (alvo - de) * p;
    if (p < 1) requestAnimationFrame(passo); else depois?.();
  };
  requestAnimationFrame(passo);
}

function tocar() {
  voz.play().catch(() => {});
  if (musicaLigada && musica) { musica.play().catch(() => {}); fade(musica, VOLUME_MUSICA, 1500); }
  dlg.querySelector('.lp-ouvir-tocar').innerHTML = ICONE.pausar;
  dlg.querySelector('.lp-ouvir-tocar').setAttribute('aria-label', 'Pausar');
  mostrarControles();
}

function pausar() {
  voz.pause();
  if (musica && !musica.paused) fade(musica, 0, 600, () => musica.pause());
  dlg.querySelector('.lp-ouvir-tocar').innerHTML = ICONE.tocar;
  dlg.querySelector('.lp-ouvir-tocar').setAttribute('aria-label', 'Tocar');
  mostrarControles();
}

function alternarMusica() {
  musicaLigada = !musicaLigada;
  try { localStorage.setItem('lp-ouvir-musica', musicaLigada ? '1' : '0'); } catch { /* ignora */ }
  dlg.querySelector('.lp-ouvir-musica').classList.toggle('desligada', !musicaLigada);
  if (!musica) return;
  if (musicaLigada && !voz.paused) { musica.play().catch(() => {}); fade(musica, VOLUME_MUSICA, 800); }
  else if (!musica.paused) fade(musica, 0, 500, () => musica.pause());
}

function parar() {
  cancelAnimationFrame(quadro);
  voz?.pause();
  if (musica) { musica.pause(); musica.currentTime = 0; }
  clearTimeout(esperaControles);
  dlg?.classList.remove('lp-ouvir-quieto');
}

/** Destaca a linha que está sendo lida e rola para mantê-la no meio da tela. */
function acompanhar() {
  const t = voz.currentTime;
  let i = dados.linhas.findIndex(l => t < l.t1 + 0.15);
  if (i < 0) i = dados.linhas.length - 1;
  if (t < dados.linhas[0].t0) i = 0;
  if (i !== atual) {
    atual = i;
    const ps = dlg.querySelectorAll('.lp-ouvir-texto [data-i]');
    ps.forEach((p, k) => {
      p.classList.toggle('atual', k === i);
      p.classList.toggle('lida', k < i);
    });
    const caixa = dlg.querySelector('.lp-ouvir-texto');
    const alvo = ps[i];
    caixa.scrollTo({ top: alvo.offsetTop - caixa.clientHeight * 0.38 + alvo.offsetHeight / 2, behavior: REDUZIDO.matches ? 'auto' : 'smooth' });
  }
  const dur = voz.duration || dados.duracao;
  dlg.querySelector('.lp-ouvir-progresso span').style.transform = `scaleX(${Math.min(1, t / dur)})`;
  quadro = requestAnimationFrame(acompanhar);
}

/** Carrega a leitura k da fila (texto, voz, tela de bloqueio) sem mexer na música. */
async function carregar(k, { tocarDepois = true } = {}) {
  posFila = k;
  const { qual, rotulo } = fila[k];
  const base = `/data/liturgia-audio/${diaAtual}/${qual}`;
  dados = await fetch(`${base}.json`).then(r => r.json());
  dlg.querySelector('.lp-ouvir-rotulo').textContent = fila.length > 1 ? `${rotulo} · ${k + 1} de ${fila.length}` : rotulo;
  dlg.querySelector('.lp-ouvir-ref').textContent = dados.referencia;
  const caixa = dlg.querySelector('.lp-ouvir-texto');
  caixa.innerHTML = dados.linhas
    .map((l, i) => `<p data-i="${i}">${l.texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
  caixa.scrollTop = 0;
  atual = -1;

  voz?.pause();
  voz = new Audio(`${base}.mp3`);
  voz.preload = 'auto';
  voz.addEventListener('ended', () => {
    // acabou esta leitura: segue para a próxima; na última, a música sai devagar
    if (posFila < fila.length - 1) { carregar(posFila + 1); return; }
    pausar();
    if (musica) fade(musica, 0, 2500, () => musica.pause());
  });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${rotulo} — ${dados.referencia}`, artist: 'Liturgia Diária',
      artwork: [{ src: '/assets/img/liturgia-icone-512.png?v=3', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('nexttrack', posFila < fila.length - 1 ? () => carregar(posFila + 1) : null);
    navigator.mediaSession.setActionHandler('previoustrack', posFila > 0 ? () => carregar(posFila - 1) : null);
  }
  if (tocarDepois) { voz.play().catch(() => {}); }
}

/** d: { dt, fila: [{ qual, rotulo }], inicio, cor } — fila: as leituras com voz; inicio: a tocada. */
export async function ouvir({ dt, fila: leituras, inicio = 0, cor = '#3a2a1a' }) {
  if (!dlg) montar();
  diaAtual = dt;
  fila = leituras;
  dlg.style.setProperty('--lp-ouvir-cor', cor);
  dlg.querySelector('.lp-ouvir-musica').classList.toggle('desligada', !musicaLigada);
  if (!musica) { musica = new Audio(MUSICA); musica.loop = true; musica.preload = 'auto'; }
  musica.volume = 0;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', tocar);
    navigator.mediaSession.setActionHandler('pause', pausar);
    navigator.mediaSession.setActionHandler('seekbackward', () => { voz.currentTime = Math.max(0, voz.currentTime - 15); });
    navigator.mediaSession.setActionHandler('seekforward', () => { voz.currentTime += 15; });
  }
  dlg.showModal();
  await carregar(inicio, { tocarDepois: false });
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(acompanhar);
  tocar();
}
