/**
 * liturgiadiaria/tour.mjs — boas-vindas na primeira visita: quatro telas curtas, cada uma com uma
 * pequena animação (SVG + CSS, sem vídeo), mostrando o que a página faz. Aparece uma vez só
 * (localStorage "lp-tour-visto"); ?tour=1 na URL mostra de novo. Pulável a qualquer momento.
 */

const CHAVE = 'lp-tour-visto';

const PASSOS = [
  {
    titulo: 'As leituras de cada dia',
    texto: 'Toque numa data do calendário ou use as setas para ir a outro dia. Os pontinhos marcam santos e festas de Nossa Senhora.',
    cena: `<svg viewBox="0 0 200 120" class="lp-tour-cal" aria-hidden="true">
      <rect x="30" y="10" width="140" height="100" rx="10" class="c-fundo"/>
      ${[0, 1, 2, 3].map(l => [0, 1, 2, 3, 4, 5, 6].map(c =>
        `<rect x="${42 + c * 18}" y="${24 + l * 20}" width="12" height="10" rx="3" class="c-dia"/>`).join('')).join('')}
      <circle cx="${48 + 4 * 18}" cy="${24 + 1 * 20 + 14}" r="1.8" class="c-ponto"/>
      <circle cx="${48 + 2 * 18}" cy="${24 + 3 * 20 + 14}" r="1.8" class="c-ponto"/>
      <rect x="0" y="0" width="16" height="14" rx="4" class="c-sel"/>
      <circle r="7" class="c-dedo"/>
    </svg>`,
  },
  {
    titulo: 'Ouça enquanto lê',
    texto: 'Em cada leitura, toque em "Ouvir": a voz lê o texto e a linha lida acende na tela, com uma música suave ao fundo.',
    cena: `<svg viewBox="0 0 200 120" class="lp-tour-ouvir" aria-hidden="true">
      <rect x="30" y="8" width="140" height="104" rx="12" class="o-fundo"/>
      ${[0, 1, 2, 3].map(i => `<rect x="46" y="${22 + i * 14}" width="${[96, 80, 104, 70][i]}" height="6" rx="3" class="o-linha o-l${i}"/>`).join('')}
      <circle cx="100" cy="92" r="11" class="o-play"/>
      <path d="M97 87v10l8-5z" class="o-tri"/>
    </svg>`,
  },
  {
    titulo: 'Compartilhe um trecho',
    texto: 'O botão de compartilhar em cada leitura cria uma imagem com um trecho e uma pintura, pronta para o WhatsApp ou o Instagram.',
    cena: `<svg viewBox="0 0 200 120" class="lp-tour-card" aria-hidden="true">
      <g class="k-card">
        <rect x="62" y="10" width="76" height="96" rx="8" class="k-papel"/>
        <rect x="62" y="10" width="76" height="40" rx="8" class="k-pintura"/>
        <rect x="62" y="40" width="76" height="10" class="k-pintura"/>
        <rect x="72" y="60" width="56" height="5" rx="2.5" class="k-linha"/>
        <rect x="72" y="70" width="46" height="5" rx="2.5" class="k-linha"/>
        <rect x="72" y="80" width="52" height="5" rx="2.5" class="k-linha"/>
      </g>
      <g class="k-envia"><circle cx="160" cy="30" r="12" class="k-bola"/><path d="M160 36V24M155 29l5-5 5 5" class="k-seta"/></g>
    </svg>`,
  },
  {
    titulo: 'O santo do dia',
    texto: 'Nos dias de santo, o nome dele aparece embaixo da data, com uma frase dele para compartilhar.',
    cena: `<svg viewBox="0 0 200 120" class="lp-tour-santo" aria-hidden="true">
      <circle cx="100" cy="46" r="30" class="s-halo"/>
      <clipPath id="lp-tour-rosto"><circle cx="100" cy="46" r="22"/></clipPath>
      <image href="/assets/img/cards/mini/sao-pio.webp" x="70" y="24" width="60" height="45" clip-path="url(#lp-tour-rosto)" preserveAspectRatio="xMidYMid slice"/>
      <circle cx="100" cy="46" r="22" class="s-rosto"/>
      <text x="100" y="100" class="s-aspas">“ … ”</text>
    </svg>`,
  },
];

let dlg = null;
let passo = 0;

export function deveMostrar() {
  if (new URLSearchParams(location.search).has('tour')) return true;
  try { return !localStorage.getItem(CHAVE); } catch { return false; }
}

function marcarVisto() {
  try { localStorage.setItem(CHAVE, '1'); } catch { /* segue */ }
}

function montar() {
  dlg = document.createElement('dialog');
  dlg.className = 'lp-tour';
  dlg.setAttribute('aria-label', 'Boas-vindas');
  dlg.innerHTML = `
    <div class="lp-tour-caixa">
      <button type="button" class="lp-tour-pular">Pular</button>
      <div class="lp-tour-cena"></div>
      <h2 class="lp-tour-titulo"></h2>
      <p class="lp-tour-texto"></p>
      <div class="lp-tour-rodape">
        <div class="lp-tour-pontos">${PASSOS.map(() => '<span></span>').join('')}</div>
        <button type="button" class="lp-tour-prox"></button>
      </div>
    </div>`;
  document.body.append(dlg);
  dlg.querySelector('.lp-tour-pular').addEventListener('click', fechar);
  dlg.querySelector('.lp-tour-prox').addEventListener('click', () => (passo < PASSOS.length - 1 ? mostrar(passo + 1) : fechar()));
  dlg.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) fechar(); });   // toque fora da caixa
  // arrastar para o lado troca de tela
  let x0 = null;
  dlg.addEventListener('pointerdown', e => { x0 = e.clientX; });
  dlg.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && passo < PASSOS.length - 1) mostrar(passo + 1);
    if (dx > 0 && passo > 0) mostrar(passo - 1);
  });
}

function mostrar(i) {
  passo = i;
  const p = PASSOS[i];
  const caixa = dlg.querySelector('.lp-tour-caixa');
  caixa.classList.remove('entra');
  void caixa.offsetWidth;   // reinicia a animação de entrada do conteúdo
  caixa.classList.add('entra');
  dlg.querySelector('.lp-tour-cena').innerHTML = p.cena;
  dlg.querySelector('.lp-tour-titulo').textContent = p.titulo;
  dlg.querySelector('.lp-tour-texto').textContent = p.texto;
  dlg.querySelector('.lp-tour-prox').textContent = i < PASSOS.length - 1 ? 'Próximo' : 'Começar';
  dlg.querySelectorAll('.lp-tour-pontos span').forEach((s, k) => s.classList.toggle('atual', k === i));
}

function fechar() {
  marcarVisto();
  if (!dlg?.open) return;
  dlg.classList.add('saindo');
  setTimeout(() => { dlg.classList.remove('saindo'); dlg.close(); }, 280);
}

export function abrirTour() {
  if (!dlg) montar();
  mostrar(0);
  dlg.showModal();
}
