/**
 * liturgiadiaria/tour.mjs — boas-vindas na primeira visita: oito telas curtas (nove no iPhone), cada uma com uma
 * cena animada (HTML + CSS, sem vídeo) feita com as mesmas peças da página — os ícones reais da
 * barra, as pinturas do acervo, os textos de verdade. Aparece uma vez só (localStorage
 * "lp-tour-visto"); ?tour=1 na URL mostra de novo. Pulável a qualquer momento.
 *
 * Cada cena é um laço de 6 s com um "dedo" que toca onde a pessoa tocaria.
 */
import { icone } from '/liturgiadiaria/icones-leituras.mjs';
import { jaInstalado, noIphone } from '/liturgiadiaria/pwa.mjs';

const CHAVE = 'lp-tour-visto';
const CELULAR = matchMedia('(max-width: 760px)');
/* O "dedo": a ponta de um toque, como a do iOS (círculo translúcido de borda branca). Cada número
   em `toques` é o instante (s) de um toque no laço de 6 s: ali nasce uma onda discreta, no mesmo
   momento em que o alvo reage. O caminho e o "afundar" de cada cena ficam no CSS dela. */
const dedo = (cls, toques = []) => `<i class="t-dedo ${cls}" aria-hidden="true">${toques.map(s => `<b style="--d:${s}s"></b>`).join('')}</i>`;
const TRACO = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
// os mesmos ícones da página: linha do título de cada leitura (liturgiadiaria.js), janela de compartilhar
// (compartilhar.mjs), botão de menu (menu.mjs) e tela de ouvir (leitor-audio.mjs)
const COMPARTILHAR = '<svg viewBox="0 0 24 24"><path d="M12 14V3.5M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5"/></svg>';
const OUVIR = '<svg viewBox="0 0 24 24"><path d="M3.5 16.5V12a8.5 8.5 0 0 1 17 0v4.5"/><path d="M3.5 15a2 2 0 0 1 2-2H6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5a2 2 0 0 1-2-2zM20.5 15a2 2 0 0 0-2-2H18a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h.5a2 2 0 0 0 2-2z"/></svg>';
const FECHAR = '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
const ZAP = `<svg ${TRACO}><path d="M3.6 20.4l1.2-4.1A8.4 8.4 0 1 1 8 19.5z"/><path d="M9.2 8.1c.3-.4.8-.4 1 0l.8 1.7c.1.3 0 .6-.2.8l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.5c.2-.2.5-.3.8-.2l1.7.8c.4.2.4.7 0 1-.9.9-2 1.1-3.3.4a8.6 8.6 0 0 1-3.9-3.9c-.7-1.3-.5-2.4.4-3.3z"/></svg>`;
const INSTA = `<svg ${TRACO}><rect x="3.5" y="3.5" width="17" height="17" rx="4.8"/><circle cx="12" cy="12" r="3.9"/><circle cx="17.2" cy="6.8" r="0.5" fill="currentColor"/></svg>`;
const SALVAR = `<svg ${TRACO}><path d="M12 4.5v10M7.8 10.6 12 14.8l4.2-4.2M5 19.5h14"/></svg>`;
const MENU = '<svg viewBox="0 0 24 24"><path class="t-hamb-1" d="M5 8h14"/><path class="t-hamb-2" d="M5 12h14"/><path class="t-hamb-3" d="M5 16h9"/></svg>';
const SETA_ANT = '<svg viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
const SETA_PROX = '<svg viewBox="0 0 24 24"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
const TOCAR = '<svg class="t-tocar" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>';
const PAUSAR = '<svg class="t-pausar" viewBox="0 0 24 24"><path d="M8 5.5v13M16 5.5v13"/></svg>';
const MUSICA = '<svg viewBox="0 0 24 24"><path d="M9 18V6.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
const PULO = (sinal) => `<svg viewBox="0 0 24 24"><path d="${sinal < 0 ? 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9' : 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15'}"/><text x="12" y="15.2" text-anchor="middle" font-size="6.5" fill="currentColor" stroke="none" font-weight="700">15</text></svg>`;
const CABECA = titulo => `<div class="t-cabeca"><b>${titulo}</b><span class="t-acoes"><i class="t-acao-ouvir">${OUVIR}</i><i class="t-acao-comp">${COMPARTILHAR}</i></span></div>`;
// a barra de vidro do celular: as leituras de 4/out (domingo: I, Salmo, II, Evangelho) e o botão de menu
const BARRA = `<div class="t-barra">
  <span class="t-barra-leituras"><i class="t-barra-luz"></i><a>${icone('leitura', 1)}</a><a>${icone('salmo')}</a><a>${icone('leitura', 2)}</a><a>${icone('evangelho')}</a></span>
  <span class="t-barra-menu">${MENU}</span>
</div>`;

// outubro de 2026 começa numa quinta: 4 casas vazias antes do dia 1; pontos como no calendário real
const DESTAQUES = { 1: 'santo', 2: 'santo', 5: 'santo', 7: 'maria', 12: 'maria', 15: 'santo', 16: 'santo', 22: 'santo', 28: 'santo' };
const MES = Array.from({ length: 4 }, () => '<span></span>').join('')
  + Array.from({ length: 31 }, (_, i) => `<span class="${[DESTAQUES[i + 1] ? `d-${DESTAQUES[i + 1]}` : '', i === 3 ? 'hoje' : ''].join(' ').trim()}">${i + 1}</span>`).join('');

const LEITURAS = [
  ['1ª Leitura', 'Is 5,1-7', '<span class="t-cap">V</span>ou cantar para o meu amado o cântico da vinha de um amigo meu: um amigo meu possuía uma vinha em fértil encosta.'],
  ['Salmo', 'Sl 79(80),9.12.13-14.15-16.19-20', '<span class="t-r">R.</span> A vinha do Senhor é a casa de Israel.<br><sup>9</sup>Arrancastes do Egito esta videira, e expulsastes as nações para plantá-la;'],
  ['2ª Leitura', 'Fl 4,6-9', 'Irmãos: <sup>6</sup>Não vos inquieteis com coisa alguma, mas apresentai as vossas necessidades a Deus, em orações e súplicas.'],
  ['Evangelho', 'Mt 21,33-43', '<span class="t-cap">N</span>aquele tempo, Jesus disse aos sumos sacerdotes e aos anciãos do povo: <sup>33</sup>"Escutai esta outra parábola."'],
];
const SALMO_PAGINA = `${CABECA('Salmo')}<small class="t-ref">Sl 79(80),9.12.13-14.15-16.19-20</small>
  <p class="t-texto"><span class="t-r">R.</span> A vinha do Senhor é a casa de Israel.</p>
  <p class="t-texto"><sup>9</sup>Arrancastes do Egito esta videira, e expulsastes as nações para plantá-la; <sup>12</sup>até o mar se estenderam seus sarmentos.</p>`;

const COMPARTILHAR_IOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14V3.5M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5"/></svg>';
const IOS = {
  voltar: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  avancar: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  livro: '<svg viewBox="0 0 24 24"><path d="M12 6.5c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/></svg>',
  abas: '<svg viewBox="0 0 24 24"><rect x="7.5" y="7.5" width="12" height="12" rx="2.5"/><path d="M4.5 15.5V7a2.5 2.5 0 0 1 2.5-2.5h8.5"/></svg>',
  copiar: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15.5V6a2 2 0 0 1 2-2h8"/></svg>',
  estrela: '<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  mais: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24"><path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z"/></svg>',
};

const PASSOS = [
  {
    titulo: 'As leituras de cada dia',
    texto: 'Toque numa data do calendário para abrir as leituras daquele dia. Os pontinhos marcam santos (dourado) e festas de Nossa Senhora (azul).',
    cena: `<div class="t-cal" style="--quadro:2.7s">
      <div class="t-cal-titulo">
        <span class="t-cal-t0"><b>4/out</b><em>27º Domingo do Tempo Comum</em></span>
        <span class="t-cal-t1"><b>7/out</b><em>Nossa Senhora do Rosário</em></span>
        <span class="t-cal-t2"><b>15/out</b><em>Santa Teresa de Jesus</em></span>
      </div>
      <div class="t-cal-mes"><span class="t-cal-hoje">Hoje</span><i>‹</i><b>Outubro 2026</b><i>›</i></div>
      <div class="t-cal-sem">${'DSTQQSS'.split('').map(l => `<span>${l}</span>`).join('')}</div>
      <div class="t-cal-grade"><i class="t-cal-sel"></i>${MES}</div>
      ${dedo('t-cal-dedo', [0.9, 2.28, 3.72])}
    </div>`,
  },
  {
    titulo: 'O resumo, antes de ler',
    texto: 'No alto do dia, o "Resumo das leituras" conta em poucas linhas do que falam as leituras. Toque em "Mostrar" para abrir.',
    cena: `<div class="t-res" style="--quadro:3s">
      <div class="t-res-caixa">
        <div class="t-res-topo"><span>Resumo das leituras</span><b><em>Mostrar</em><em>Ocultar</em></b></div>
        <p>Hoje, a primeira leitura (Is 5,1-7) canta a vinha cuidada com esmero que só deu uvas selvagens; o Salmo (Sl 79) repete que a vinha do Senhor é a casa de Israel; e o Evangelho (Mt 21,33-43) traz a parábola dos vinhateiros.</p>
      </div>
      <div class="t-res-pagina"><b class="t-titulo">1ª Leitura</b><small class="t-ref">Is 5,1-7</small><p class="t-texto">${LEITURAS[0][2]}</p></div>
      ${dedo('t-res-dedo', [0.96, 4.2])}
    </div>`,
  },
  {
    titulo: 'A barra de baixo',
    texto: 'Os ícones levam direto a cada leitura: I e II são a 1ª e a 2ª leitura, a nota musical é o Salmo e o livro com a cruz, o Evangelho. O botão redondo ao lado abre o menu.',
    soCelular: true,
    cena: `<div class="t-bar" style="--quadro:2.6s">
      <div class="t-bar-pagina"><div class="t-bar-rolo">
        ${LEITURAS.map(([t, r, x]) => `<section><b class="t-titulo">${t}</b><small class="t-ref">${r}</small><p class="t-texto">${x}</p></section>`).join('')}
      </div></div>
      <small class="t-compacto">Domingo, 4 de outubro de 2026</small>
      ${BARRA}
      ${dedo('t-bar-dedo', [0.84, 2.04, 3.24, 4.56])}
    </div>`,
  },
  {
    titulo: 'Ouça enquanto lê',
    texto: 'Ao lado do título de cada leitura há dois ícones. O fone abre a leitura em voz alta: a linha lida acende e, no fim, a próxima leitura começa sozinha.',
    cena: `<div class="t-ouv" style="--quadro:1.8s">
      <div class="t-pagina">${SALMO_PAGINA}</div>
      <div class="t-ouv-tela">
        <header class="t-ouv-topo">
          <p><span class="t-ouv-rot"><em>Salmo</em><em>Evangelho</em></span><span class="t-ouv-ref"><em>Sl 79(80),9.12.13-14…</em><em>Mt 21,33-43</em></span></p>
          <i class="t-ouv-fechar">${FECHAR}</i>
        </header>
        <div class="t-ouv-texto">
          <div class="t-ouv-col t-ouv-salmo"><p class="refrao">A vinha do Senhor é a casa de Israel.</p><p>Arrancastes do Egito esta videira,</p><p>e expulsastes as nações para plantá-la;</p><p>até o mar se estenderam seus sarmentos,</p><p>até o rio os seus rebentos se espalharam.</p></div>
          <div class="t-ouv-col t-ouv-ev"><p>Naquele tempo, Jesus disse aos sumos sacerdotes e aos anciãos do povo:</p><p>"Escutai esta outra parábola:</p></div>
        </div>
        <div class="t-ouv-aviso"><p>A seguir: Evangelho, em <span><em>3</em><em>2</em></span></p><div><b>Começar já</b><b>Parar</b></div></div>
        <footer class="t-ouv-controles">
          <div class="t-ouv-progresso"><i></i></div>
          <div class="t-ouv-botoes"><i>${MUSICA}</i><i>${PULO(-1)}</i><i class="t-ouv-tocar">${PAUSAR}${TOCAR}</i><i>${PULO(1)}</i><i></i></div>
        </footer>
      </div>
      ${dedo('t-ouv-dedo', [0.84])}
    </div>`,
  },
  {
    titulo: 'Compartilhe as leituras',
    texto: 'O segundo ícone compartilha: esta leitura inteira, todas as leituras do dia ou só um trecho com uma pintura, e você escolhe os versículos. Sai direto para o WhatsApp ou o Instagram.',
    cena: `<div class="t-com" style="--quadro:3s">
      <div class="t-pagina">${SALMO_PAGINA}</div>
      <div class="t-janela">
        <div class="t-janela-topo"><span class="t-janela-rot">Compartilhar</span><i class="t-janela-x">${FECHAR}</i></div>
        <div class="t-modos"><i class="t-modos-luz"></i><span>Esta leitura</span><span>Todas as leituras</span><span>Trecho</span></div>
        <div class="t-com-cards">
          <div class="t-card-leitura"><i class="t-card-faixa"></i><div><em>Liturgia Diária</em><b>4/out</b><small>Salmo responsorial</small><p class="t-card-r">R. A vinha do Senhor é a casa de Israel.</p><p>Arrancastes do Egito esta videira, e expulsastes as nações para plantá-la; até o mar se estenderam seus sarmentos, até o rio os seus rebentos se espalharam.</p></div></div>
          <div class="t-card-trecho"><img src="/assets/img/cards/mini/videira.webp" alt=""><div><small>Salmo · Sl 79(80)</small><p>A vinha do Senhor é a casa de Israel.</p><footer><em>4/out</em><span>liturgia.santadoutrina.com</span></footer></div></div>
        </div>
        <div class="t-janela-acoes"><span class="t-acao-zap"><i>${ZAP}</i>WhatsApp</span><span><i>${INSTA}</i>Instagram</span><span><i>${SALVAR}</i>Salvar</span></div>
      </div>
      ${dedo('t-com-dedo', [0.84, 2.28, 3.6])}
    </div>`,
  },
  {
    titulo: 'Os Padres e o Catecismo',
    texto: 'Embaixo do Evangelho, os Padres da Igreja comentam o trecho do dia (da Catena Aurea de São Tomás, traduzida do latim) e o Catecismo mostra o que diz sobre ele.',
    cena: `<div class="t-pad" style="--quadro:4.5s">
      <div class="t-pad-folha">
        <p class="t-texto"><sup>43</sup>Por isso, eu vos digo: o Reino de Deus vos será tirado e será entregue a um povo que produzirá frutos".</p>
        <img class="t-pad-divisor" src="/assets/img/liturgia-divisor.svg" alt="">
        <p class="t-pad-rotulo">Os Padres sobre o Evangelho</p>
        <p class="t-pad-fonte">Da <i>Catena Aurea</i> de São Tomás de Aquino sobre Mt 21,33-43</p>
        <p class="t-pad-tema">A vinha, o filho morto e o Reino dado a outros</p>
        <p class="t-pad-texto"><span>São João Crisóstomo.</span> Ora, a cada grau de malícia, a misericórdia de Deus se acrescentava; e a cada grau da misericórdia divina, crescia a malícia dos judeus…</p>
        <p class="t-pad-mais">Ler o comentário inteiro</p>
        <p class="t-pad-rotulo t-pad-cic">No Catecismo</p>
        <p class="t-pad-texto"><b>§ 755</b> Ela foi plantada pelo celeste Agricultor como uma vinha eleita.</p>
        <p class="t-pad-texto"><b>§ 443</b> Já muito antes, Ele Se designara como «o Filho» que conhece o Pai…</p>
      </div>
      ${dedo('t-pad-dedo')}
    </div>`,
  },
  {
    titulo: 'O santo do dia',
    texto: 'Quando o dia lembra um santo, o nome dele aparece embaixo da data, com um botão para compartilhar uma frase dele com a sua pintura. Se há dois santos no mesmo dia, os nomes se alternam na mesma linha; toque no nome para trocar.',
    cena: `<div class="t-san" style="--quadro:3s">
      <div class="t-san-cabeca">
        <em class="t-san-marca">Liturgia Diária</em>
        <b class="t-san-data">1/out</b>
        <small>Quinta-feira da 26ª Semana do Tempo Comum</small>
        <p class="t-san-nome">Santa Teresinha do Menino Jesus</p>
        <p class="t-san-linha"><span>Saiba mais</span><i class="t-san-botao">${COMPARTILHAR}</i></p>
      </div>
      <div class="t-janela">
        <div class="t-janela-topo"><span class="t-janela-selo">Santo do dia</span><i class="t-janela-x">${FECHAR}</i></div>
        <div class="t-layouts"><span>Feed</span><span>Stories</span><span>Só texto</span></div>
        <div class="t-card-trecho t-san-card"><img src="/assets/img/cards/mini/santa-teresinha.webp" alt=""><div><small>Santo do dia · Santa Teresinha do Menino Jesus</small><p>“No coração da Igreja, minha Mãe, eu serei o Amor.”</p><footer><em>1/out</em><span>liturgia.santadoutrina.com</span></footer></div></div>
        <div class="t-janela-acoes"><span class="t-acao-zap"><i>${ZAP}</i>WhatsApp</span><span><i>${INSTA}</i>Instagram</span><span><i>${SALVAR}</i>Salvar</span></div>
      </div>
      ${dedo('t-san-dedo', [0.84, 3.3])}
    </div>`,
  },
  {
    id: 'menu',
    titulo: 'O menu',
    texto: 'No ícone de menu (as três linhas) você aumenta o texto, instala a liturgia como app e ajuda a manter o site no ar, por Pix ou cartão. No celular ele fica na barra de baixo; no computador, no canto da tela.',
    cena: `<div class="t-menu" style="--quadro:3.6s">
      <div class="t-menu-pagina"><p class="t-texto">${LEITURAS[3][2]} Certo proprietário plantou uma vinha, pôs uma cerca em volta, fez nela um lagar para esmagar as uvas e construiu uma torre de guarda.</p></div>
      <small class="t-compacto">Domingo, 4 de outubro de 2026</small>
      <i class="t-menu-veu"></i>
      ${BARRA}
      <div class="t-menu-folha">
        <div class="t-menu-grab"><i></i></div>
        <div class="t-menu-corpo">
          <section class="t-menu-sec">
            <h3>Ajude a manter o site</h3>
            <p>Para manter o site no ar temos algumas despesas. Contribua.</p>
            <span class="t-menu-meta"><i></i></span>
            <span class="t-menu-valores"><span>R$ 68</span><span>R$ 150</span></span>
            <span class="t-menu-doar">Apoiar o site</span>
          </section>
          <section class="t-menu-sec t-menu-dias">
            <i class="t-menu-seta">${SETA_ANT}</i><span><b>4 de outubro</b><small>Domingo</small></span><i class="t-menu-seta">${SETA_PROX}</i>
          </section>
          <section class="t-menu-sec">
            <h3>Tamanho do texto</h3>
            <div class="t-menu-fonte">
              <i class="t-menu-a1">A</i>
              <span class="t-menu-pontos"><b class="t-menu-enche"></b>${'<i></i>'.repeat(4)}<b class="t-menu-polegar"></b></span>
              <i class="t-menu-a2">A</i>
            </div>
          </section>
          <section class="t-menu-sec">
            <h3>Instalar o app</h3>
            <p>Abra a liturgia direto da tela inicial, até sem internet.</p>
            <span class="t-menu-instalar">Instalar</span>
          </section>
        </div>
      </div>
      ${dedo('t-menu-dedo', [0.72, 2.64, 3.24])}
    </div>`,
  },
  {
    id: 'instalar',
    titulo: 'Instale como app',
    texto: 'No iPhone, toque no botão de compartilhar do Safari e depois em "Adicionar à Tela de Início". Aí a liturgia abre direto da tela inicial, até sem internet.',
    soIphone: true,
    cena: `<div class="t-ios" style="--quadro:4.6s">
      <div class="t-ios-safari">
        <div class="t-ios-pagina"><em>Liturgia Diária</em><b>4/out</b><small>27º Domingo do Tempo Comum</small></div>
        <div class="t-ios-endereco"><span>AA</span><b>liturgia.santadoutrina.com</b><i></i></div>
        <div class="t-ios-barra"><i>${IOS.voltar}</i><i class="t-ios-off">${IOS.avancar}</i><i class="t-ios-share">${COMPARTILHAR_IOS}</i><i>${IOS.livro}</i><i>${IOS.abas}</i></div>
      </div>
      <div class="t-ios-folha">
        <div class="t-ios-site"><img src="/assets/img/liturgia-icone-192.png?v=3" alt=""><span><b>Liturgia Diária</b><small>liturgia.santadoutrina.com</small></span><i class="t-ios-x">${FECHAR}</i></div>
        <div class="t-ios-apps"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="t-ios-lista">
          <div><span>Copiar</span>${IOS.copiar}</div>
          <div><span>Adicionar aos Favoritos</span>${IOS.estrela}</div>
          <div class="t-ios-alvo"><span>Adicionar à Tela de Início</span>${IOS.mais}</div>
          <div><span>Imprimir</span>${IOS.imprimir}</div>
        </div>
      </div>
      <div class="t-ios-add">
        <div class="t-ios-add-topo"><span>Cancelar</span><b>Adicionar à Tela de Início</b><span class="t-ios-ok">Adicionar</span></div>
        <div class="t-ios-add-card"><img src="/assets/img/liturgia-icone-192.png?v=3" alt=""><span><b>Liturgia</b><small>liturgia.santadoutrina.com</small></span></div>
      </div>
      <div class="t-ios-home">${'<i></i>'.repeat(5)}<i class="t-ios-nosso"><img src="/assets/img/liturgia-icone-192.png?v=3" alt=""><em>Liturgia</em></i>${'<i></i>'.repeat(2)}<div class="t-ios-dock"><i></i><i></i><i></i><i></i></div></div>
      ${dedo('t-ios-dedo', [0.72, 2.04, 3.24])}
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

/** `id`: abre direto num passo (o menu usa 'instalar' no botão "Ver como fazer"). */
export function abrirTour(id) {
  if (!dlg) montar();
  passos = PASSOS.filter(p => (!p.soCelular || CELULAR.matches)   // no computador não há a barra de baixo
    && (!p.soIphone || (noIphone() && !jaInstalado())));          // a instalação só para quem está no iPhone e ainda não instalou
  dlg.querySelector('.lp-tour-pontos').innerHTML = passos.map(() => '<span></span>').join('');
  passo = Math.max(0, passos.findIndex(p => p.id === id));
  mostrar(passo);
  dlg.showModal();
}
