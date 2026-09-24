/**
 * liturgiadiaria/tour.mjs — boas-vindas na primeira visita: seis telas curtas, cada uma com uma
 * cena animada (HTML + CSS, sem vídeo) feita com as mesmas peças da página — os ícones reais da
 * barra, as pinturas do acervo, os textos de verdade. Aparece uma vez só (localStorage
 * "lp-tour-visto"); ?tour=1 na URL mostra de novo. Pulável a qualquer momento.
 *
 * Cada cena é um laço de 6 s com um "dedo" que toca onde a pessoa tocaria.
 */
import { icone } from '/liturgiadiaria/icones-leituras.mjs';

const CHAVE = 'lp-tour-visto';
const CELULAR = matchMedia('(max-width: 760px)');
const dedo = cls => `<i class="t-dedo ${cls}" aria-hidden="true"></i>`;
const TRACO = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
// WhatsApp cheio (balão branco com o fone em verde), que lê melhor pequeno do que o de traço
const ZAP = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2.6a9.4 9.4 0 0 0-8.1 14.2L2.6 21.4l4.7-1.2A9.4 9.4 0 1 0 12 2.6z"/><path fill="#25d366" d="M8.6 7.2c.3-.5.8-.5 1.1-.1l1.1 1.8c.2.3.1.8-.1 1l-.6.7c.6 1.3 1.7 2.4 3 3l.7-.6c.3-.2.7-.3 1-.1l1.8 1.1c.4.3.4.8-.1 1.1-.9.9-2.2 1.2-3.6.6a9.6 9.6 0 0 1-4.2-4.2c-.6-1.4-.3-2.7.4-3.8z"/></svg>';
const INSTA = `<svg ${TRACO}><rect x="3.5" y="3.5" width="17" height="17" rx="4.8"/><circle cx="12" cy="12" r="3.9"/><circle cx="17.2" cy="6.8" r="0.5" fill="currentColor"/></svg>`;
const COMPARTILHAR = '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';

// outubro de 2026 começa numa quinta: 4 casas vazias antes do dia 1
const DESTAQUES = { 1: 'santo', 4: 'santo', 7: 'maria', 12: 'maria', 15: 'santo', 22: 'santo' };
const MES = Array.from({ length: 4 }, () => '<span></span>').join('')
  + Array.from({ length: 31 }, (_, i) => `<span class="${DESTAQUES[i + 1] ? `d-${DESTAQUES[i + 1]}` : ''}">${i + 1}</span>`).join('');

const PASSOS = [
  {
    titulo: 'As leituras de cada dia',
    texto: 'Toque numa data do calendário para abrir as leituras daquele dia. Os pontinhos marcam santos (dourado) e festas de Nossa Senhora (azul).',
    cena: `<div class="t-cal">
      <div class="t-cal-mes"><b>‹</b><span>Outubro 2026</span><b>›</b></div>
      <div class="t-cal-sem">${'DSTQQSS'.split('').map(l => `<span>${l}</span>`).join('')}</div>
      <div class="t-cal-grade"><i class="t-cal-sel"></i>${MES}</div>
      ${dedo('t-cal-dedo')}
    </div>`,
  },
  {
    titulo: 'O resumo, antes de ler',
    texto: 'No alto do dia, o "Resumo das leituras" conta em poucas linhas do que falam as leituras. Toque em "Mostrar" para abrir.',
    cena: `<div class="t-res">
      <div class="t-res-caixa">
        <div class="t-res-topo"><span>Resumo das leituras</span><b><em>Mostrar</em><em>Ocultar</em></b></div>
        <p>Hoje, a primeira leitura (Is 5,1-7) canta a vinha cuidada com esmero que só deu uvas selvagens; o Salmo (Sl 79) repete que a vinha do Senhor é a casa de Israel; e o Evangelho (Mt 21,33-43) traz a parábola dos vinhateiros.</p>
      </div>
      ${dedo('t-res-dedo')}
    </div>`,
  },
  {
    titulo: 'A barra de baixo',
    texto: 'Os ícones levam direto a cada leitura: I e II são a 1ª e a 2ª leitura, a nota musical é o Salmo e o livro com a cruz, o Evangelho. As setas das pontas passam para o dia anterior ou o seguinte.',
    soCelular: true,
    cena: `<div class="t-nav">
      <div class="t-nav-pagina">
        <small class="t-nav-data"><span>Domingo, 4 de outubro</span><span>Segunda, 5 de outubro</span></small>
        <div class="t-nav-rolo">
          ${['1ª Leitura', 'Salmo', '2ª Leitura', 'Evangelho'].map(t => `<div><b>${t}</b><i></i><i></i><i></i></div>`).join('')}
        </div>
      </div>
      <div class="t-nav-barra">
        <span class="t-nav-seta">‹</span>
        <span class="t-nav-abas"><i class="t-nav-luz"></i>${icone('leitura', 1)}${icone('salmo')}${icone('leitura', 2)}${icone('evangelho')}</span>
        <span class="t-nav-seta t-nav-prox">›</span>
      </div>
      ${dedo('t-nav-dedo')}
    </div>`,
  },
  {
    titulo: 'Ouça enquanto lê',
    texto: 'Toque em "Ouvir" numa leitura: a voz lê o texto e a linha lida acende. No fim, a próxima leitura começa sozinha.',
    cena: `<div class="t-ouv">
      <div class="t-ouv-leitura"><b>Evangelho</b><span class="t-ouv-botao">▶ Ouvir</span><i></i><i></i><i></i></div>
      <div class="t-ouv-tela">
        <small>EVANGELHO · Mt 21,33-43</small>
        <p>Naquele tempo,</p><p>Jesus disse aos sumos sacerdotes:</p><p>"Escutai esta outra parábola:</p><p>Certo proprietário plantou uma vinha…</p>
        <div class="t-ouv-barra"><i></i></div>
      </div>
      ${dedo('t-ouv-dedo')}
    </div>`,
  },
  {
    titulo: 'Compartilhe um trecho',
    texto: 'O botão ao lado de cada leitura cria uma imagem com um trecho e uma pintura, pronta para mandar no WhatsApp ou postar no Instagram.',
    cena: `<div class="t-com">
      <div class="t-com-leitura"><b>Salmo</b><span class="t-com-botao">${COMPARTILHAR}</span><i></i><i></i><i></i></div>
      <div class="t-com-card">
        <img src="/assets/img/cards/mini/videira.webp" alt="">
        <p>"A vinha do Senhor é a casa de Israel."</p>
        <small>4/out</small>
      </div>
      <span class="t-com-zap">WhatsApp</span>
      ${dedo('t-com-dedo')}
    </div>`,
  },
  {
    titulo: 'O santo do dia',
    texto: 'Quando o dia lembra um santo, o nome dele aparece embaixo da data, com um botão para compartilhar uma frase dele com a sua pintura.',
    cena: `<div class="t-san">
      <div class="t-san-dia"><b>1/out</b><div class="t-san-nome"><span>Santa Teresinha do Menino Jesus</span><i class="t-san-botao">${COMPARTILHAR}</i></div></div>
      <div class="t-san-card">
        <img src="/assets/img/cards/mini/santa-teresinha.webp" alt="">
        <div class="t-san-corpo">
          <small>SANTO DO DIA · SANTA TERESINHA</small>
          <p>"No coração da Igreja, minha Mãe, eu serei o Amor."</p>
          <footer><em>1/out</em><span>liturgia.santadoutrina.cloud</span></footer>
        </div>
      </div>
      <div class="t-san-apps"><span class="t-app-zap">${ZAP}</span><span class="t-app-insta">${INSTA}</span></div>
      ${dedo('t-san-dedo')}
    </div>`,
  },
];

let dlg = null;
let passo = 0;
let passos = PASSOS;

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
        <div class="lp-tour-pontos"></div>
        <button type="button" class="lp-tour-prox"></button>
      </div>
    </div>`;
  document.body.append(dlg);
  dlg.querySelector('.lp-tour-pular').addEventListener('click', fechar);
  dlg.querySelector('.lp-tour-prox').addEventListener('click', () => (passo < passos.length - 1 ? mostrar(passo + 1) : fechar()));
  dlg.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) fechar(); });   // toque fora da caixa
  // arrastar para o lado troca de tela
  let x0 = null;
  dlg.addEventListener('pointerdown', e => { x0 = e.clientX; });
  dlg.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && passo < passos.length - 1) mostrar(passo + 1);
    if (dx > 0 && passo > 0) mostrar(passo - 1);
  });
}

function mostrar(i) {
  const volta = i < passo;
  passo = i;
  const p = passos[i];
  const caixa = dlg.querySelector('.lp-tour-caixa');
  caixa.classList.remove('entra', 'volta');
  void caixa.offsetWidth;   // reinicia a animação de entrada do conteúdo
  caixa.classList.add('entra');
  caixa.classList.toggle('volta', volta);
  dlg.querySelector('.lp-tour-cena').innerHTML = p.cena;   // HTML novo: a cena recomeça do início
  dlg.querySelector('.lp-tour-titulo').textContent = p.titulo;
  dlg.querySelector('.lp-tour-texto').textContent = p.texto;
  dlg.querySelector('.lp-tour-prox').textContent = i < passos.length - 1 ? 'Próximo' : 'Começar';
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
  passos = PASSOS.filter(p => !p.soCelular || CELULAR.matches);   // no computador não há a barra de baixo
  dlg.querySelector('.lp-tour-pontos').innerHTML = passos.map(() => '<span></span>').join('');
  passo = 0;
  mostrar(0);
  dlg.showModal();
}
