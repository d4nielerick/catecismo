/**
 * menu.mjs — menu flutuante da Liturgia Diária.
 *
 * Um botão (na barra de vidro, no celular; flutuando na coluna de leitura, no desktop) abre uma
 * folha com: navegação entre os dias, tamanho do texto e o apoio ao site. O tamanho é uma escala
 * (--lp-k no <html>) que o CSS usa no texto, na capitular e na largura da coluna; o nível fica
 * guardado no aparelho.
 */

const CHAVE = 'lp-fonte';
const ESCALAS = [1, 1.125, 1.25, 1.375];   // 16, 18, 20 e 22 px
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const SETA_ANT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
const SETA_PROX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
// três traços separados: com o menu aberto viram um X (CSS: html.lp-menu-aberto .lp-hamb-*)
export const ICONE_MENU = '<svg class="lp-hamb" viewBox="0 0 24 24" aria-hidden="true"><path class="lp-hamb-1" d="M5 8h14"/><path class="lp-hamb-2" d="M5 12h14"/><path class="lp-hamb-3" d="M5 16h9"/></svg>';

// Apoio: os links de pagamento e a meta ficam em data/apoio.json; o que já entrou no mês vem de /api/apoio
// (alimentado pelo webhook da Stripe). Sem a API, a barra mostra só a meta.
const API = /(^|\.)santadoutrina\.com$/.test(location.hostname) ? '/api' : 'https://santadoutrina.com/api';
const API_APOIO = `${API}/apoio`;
let apoio = { meta: 150, links: {}, valores: [10, 20, 50] };

let nivel = 0;
let dialogo = null;
let diasEl = null;

const ler = () => { try { return Number(localStorage.getItem(CHAVE)) || 0; } catch { return 0; } };
const gravar = n => { try { localStorage.setItem(CHAVE, String(n)); } catch { /* sem armazenamento: vale só nesta visita */ } };

/** Aplica o nível (0 a 3): muda a escala no <html> e atualiza os pontinhos e os botões. */
function aplicar(n) {
  nivel = Math.max(0, Math.min(ESCALAS.length - 1, n));
  document.documentElement.style.setProperty('--lp-k', String(ESCALAS[nivel]));
  dialogo?.querySelectorAll('.lp-menu-ponto').forEach((p, i) => p.classList.toggle('on', i <= nivel));
  const trilha = dialogo?.querySelector('.lp-menu-pontos');
  if (trilha) {
    trilha.style.setProperty('--p', String(nivel / (ESCALAS.length - 1)));   // a linha enche e o polegar desliza até aqui
    const polegar = trilha.querySelector('.lp-menu-polegar');
    polegar.classList.remove('pulo'); void polegar.offsetWidth; polegar.classList.add('pulo');
  }
  const menos = dialogo?.querySelector('[data-fonte="-1"]');
  const mais = dialogo?.querySelector('[data-fonte="1"]');
  if (menos) menos.disabled = nivel === 0;
  if (mais) mais.disabled = nivel === ESCALAS.length - 1;
}

const dataPorExtenso = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} de ${MESES[m - 1]}`; };
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaDaSemana = d => { const [a, m, dd] = d.split('-').map(Number); return SEMANA[new Date(a, m - 1, dd).getDay()]; };

/** Atualiza a seção "Dia": setas redondas nas pontas (como as da barra) e a data de hoje no meio.
 *  `atual`: 'AAAA-MM-DD'; `anterior` e `proximo`: { data, href } (ou null se não há esse dia);
 *  `irParaHoje`: href de hoje quando a página não está nele. */
export function atualizarDias({ atual, anterior, proximo, irParaHoje }) {
  if (!diasEl || !atual) return;
  const seta = (d, rel, svg, rotulo) => d
    ? `<a class="lp-menu-seta" rel="${rel}" href="${d.href}" aria-label="${rotulo}: ${dataPorExtenso(d.data)}" title="${rotulo}: ${dataPorExtenso(d.data)}">${svg}</a>`
    : `<span class="lp-menu-seta vazio" aria-hidden="true">${svg}</span>`;
  diasEl.innerHTML = `<div class="lp-menu-dias">${seta(anterior, 'prev', SETA_ANT, 'Dia anterior')}`
    + `<div class="lp-menu-atual"><strong>${dataPorExtenso(atual)}</strong><small>${diaDaSemana(atual)}</small></div>`
    + `${seta(proximo, 'next', SETA_PROX, 'Dia seguinte')}</div>`
    + (irParaHoje ? `<a class="lp-menu-hoje" href="${irParaHoje}">Voltar para hoje</a>` : '');
}

const CELULAR = matchMedia('(max-width: 760px)');
const ALTURA_MAX = 0.88;           // a folha cheia ocupa até 88% da altura
let medioH = 0, cheioH = 0;        // as duas alturas de repouso (como os detents da Apple)
let arrasto = null;

/** Mede as duas posições: "média" mostra o apoio, o dia e o tamanho do texto;
 *  "cheia" mostra tudo. Se tudo já cabe na média, não há o que expandir. */
function medirAlturas() {
  dialogo.style.height = '';
  const total = dialogo.scrollHeight;
  cheioH = Math.min(total, Math.round(innerHeight * ALTURA_MAX));
  const terceira = dialogo.querySelectorAll('.lp-menu-sec')[2];
  const corpo = dialogo.querySelector('.lp-menu-corpo');
  const respiro = parseFloat(getComputedStyle(corpo).paddingBottom) + parseFloat(getComputedStyle(dialogo).paddingBottom);
  medioH = terceira ? Math.min(cheioH, Math.round(corpo.offsetTop + terceira.offsetTop + terceira.offsetHeight + respiro)) : cheioH;   // até o fim do tamanho do texto; o que vier depois aparece ao expandir
  if (cheioH - medioH < 24) medioH = cheioH;   // diferença pequena demais: uma altura só
}
const irPara = (h, anima = true) => {
  dialogo.style.transition = anima ? '' : 'none';
  dialogo.style.transform = '';
  if (cheioH > medioH) dialogo.style.height = `${h}px`;
};

function comecarArrasto(e) {
  if (!CELULAR.matches || e.button > 0) return;
  arrasto = { y0: e.clientY, h0: dialogo.getBoundingClientRect().height, t0: performance.now(), movido: false, ultimoY: e.clientY, ultimoT: performance.now(), v: 0 };
  e.currentTarget.setPointerCapture(e.pointerId);
  dialogo.style.transition = 'none';
}
function moverArrasto(e) {
  if (!arrasto) return;
  const dy = e.clientY - arrasto.y0;
  if (Math.abs(dy) > 4) arrasto.movido = true;
  const agora = performance.now();
  arrasto.v = (e.clientY - arrasto.ultimoY) / Math.max(1, agora - arrasto.ultimoT);   // px/ms, positivo = descendo
  arrasto.ultimoY = e.clientY; arrasto.ultimoT = agora;
  const alvo = arrasto.h0 - dy;   // altura que o dedo pede
  if (alvo >= medioH) {
    if (cheioH > medioH) dialogo.style.height = `${Math.min(alvo, cheioH)}px`;
    dialogo.style.transform = '';
  } else {
    dialogo.style.height = cheioH > medioH ? `${medioH}px` : '';
    dialogo.style.transform = `translateY(${Math.round(medioH - alvo)}px)`;   // abaixo da média: a folha desce
  }
}
function terminarArrasto() {
  if (!arrasto) return;
  const { h0, y0, ultimoY, v, movido } = arrasto;
  arrasto = null;
  const atual = h0 - (ultimoY - y0);
  const desce = v > 0.5, sobe = v < -0.5;
  if (!movido) {   // toque no puxador: alterna entre as alturas
    if (cheioH > medioH) irPara(dialogo.getBoundingClientRect().height > medioH + 4 ? medioH : cheioH);
    return;
  }
  if (atual < medioH * 0.62 || (atual < medioH && desce)) { fecharArrastando(); return; }
  if (cheioH > medioH) irPara(sobe || (!desce && atual > (medioH + cheioH) / 2) ? cheioH : medioH);
  else irPara(medioH);
}
function fecharArrastando() {
  document.documentElement.classList.remove('lp-menu-aberto');   // a barra volta (animada) enquanto a folha desce
  dialogo.style.transition = 'transform 0.2s ease-in';
  dialogo.style.transform = 'translateY(100%)';
  setTimeout(() => { dialogo.close(); dialogo.style.transition = dialogo.style.transform = dialogo.style.height = ''; }, 200);
}

function abrir(origem) {
  if (!dialogo || dialogo.open) return;
  dialogo.showModal();
  document.documentElement.classList.add('lp-menu-aberto');
  // no desktop a folha abre colada ao botão; no celular, embaixo, em largura total
  if (matchMedia('(min-width: 761px)').matches && origem) {
    const r = origem.getBoundingClientRect();
    dialogo.style.left = `${Math.max(12, r.right - dialogo.offsetWidth)}px`;
    dialogo.style.top = 'auto';
    dialogo.style.bottom = `${innerHeight - r.top + 12}px`;
  } else {
    dialogo.style.left = dialogo.style.top = dialogo.style.bottom = '';
  }
  if (CELULAR.matches) { medirAlturas(); irPara(medioH, false); requestAnimationFrame(() => { dialogo.style.transition = ''; }); }
  else dialogo.style.height = '';
}

function fechar() {
  if (!dialogo?.open) return;
  if (CELULAR.matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) { fecharArrastando(); return; }
  document.documentElement.classList.remove('lp-menu-aberto');
  dialogo.classList.add('saindo');
  const fim = () => { dialogo.classList.remove('saindo'); dialogo.close(); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) fim();
  else setTimeout(fim, 180);
}

const reais = n => `R$ ${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;

/** `oficial`: o valor veio do servidor (guarda-se como base para somar uma doação nova). */
function pintarMeta({ arrecadado = 0, meta = apoio.meta }, oficial = true) {
  const el = dialogo?.querySelector('#lp-menu-meta');
  if (!el) return;
  if (oficial) arrecadadoAtual = arrecadado;
  el.style.setProperty('--p', String(meta ? Math.min(1, arrecadado / meta) : 0));
  el.setAttribute('aria-valuemax', String(meta));
  el.setAttribute('aria-valuenow', String(arrecadado));
  el.querySelector('[data-arrecadado]').textContent = reais(arrecadado);
  el.querySelector('[data-meta]').textContent = reais(meta);
}

// ── Pix na própria página ────────────────────────────────────────────────────
let pix = null;   // { id, valor, codigo, timer, fim }
const $ = sel => dialogo.querySelector(sel);

function pararPix() { if (pix?.timer) clearInterval(pix.timer); if (pix) pix.timer = null; }

function mostrarEtapa(etapa) {   // 'botao' | 'valores' | 'pix' | 'obrigado'
  $('#lp-menu-doar').hidden = etapa === 'pix' || etapa === 'obrigado';
  $('#lp-menu-valores').hidden = etapa !== 'valores';
  $('#lp-menu-outro').hidden = true;
  $('#lp-menu-pix').hidden = etapa !== 'pix';
  $('#lp-menu-obrigado').hidden = etapa !== 'obrigado';
  $('#lp-menu-doar').setAttribute('aria-expanded', String(etapa === 'valores'));
  $('#lp-menu-doar').textContent = etapa === 'valores' ? 'Escolha o valor' : 'Apoiar o site';
  if (CELULAR.matches && dialogo.open) { medirAlturas(); irPara(etapa === 'botao' ? medioH : Math.max(medioH, Math.min(cheioH, dialogo.scrollHeight))); }
}

function estadoPix(texto, cor) {
  const el = $('#lp-menu-pix-estado');
  el.querySelector('span').textContent = texto;
  el.dataset.estado = cor || 'espera';
}

async function gerarPix(valor) {
  pararPix();
  pix = { valor, id: null, codigo: '', timer: null, fim: 0 };
  $('#lp-menu-pix-valor').textContent = `Pix de ${reais(valor)}`;
  $('#lp-menu-qr').innerHTML = '<span class="lp-menu-qr-espera"></span>';
  $('.lp-menu-copiar').disabled = true;
  const cartao = $('#lp-menu-cartao');
  if (apoio.stripe?.chave_publica) {   // cartão, Apple Pay e Google Pay na própria página (Stripe)
    cartao.href = '#';
    cartao.dataset.acao = 'cartao';
    cartao.textContent = 'Prefere cartão, Apple Pay ou Google Pay?';
  } else {                             // sem Stripe: o cartão segue pelo Checkout Pro, com o mesmo valor
    cartao.href = `${API}/apoio-checkout?valor=${valor}`;
    delete cartao.dataset.acao;
    cartao.textContent = 'Prefere cartão? Pagar no Mercado Pago';
  }
  estadoPix('Gerando o Pix…');
  mostrarEtapa('pix');
  try {
    const r = await fetch(`${API}/apoio-pix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'erro');
    pix = { ...pix, id: j.id, codigo: j.codigo, fim: Date.parse(j.expira) };
    $('#lp-menu-qr').innerHTML = j.qr ? `<img alt="QR Code do Pix de ${reais(valor)}" src="data:image/png;base64,${j.qr}">` : '';
    $('.lp-menu-copiar').disabled = false;
    estadoPix('Aguardando o pagamento…');
    pix.timer = setInterval(consultarPix, 3000);
  } catch (e) {
    estadoPix(e.message === 'Failed to fetch' ? 'Sem conexão. Tente de novo.' : (e.message || 'Não foi possível gerar o Pix.'), 'erro');
  }
}

async function consultarPix() {
  if (!pix?.id || !dialogo.open) return;
  if (Date.now() > pix.fim) { pararPix(); estadoPix('O Pix expirou. Gere outro para doar.', 'erro'); return; }
  try {
    const r = await fetch(`${API}/apoio-status?id=${pix.id}`);
    if (!r.ok) return;
    const { status } = await r.json();
    if (status === 'approved') agradecer(pix.valor);
    else if (['rejected', 'cancelled'].includes(status)) { pararPix(); estadoPix('O pagamento não foi concluído.', 'erro'); }
  } catch { /* sem rede por um instante: tenta no próximo ciclo */ }
}

// ── Cartão, Apple Pay e Google Pay (Checkout embutido da Stripe) ─────────────
let janelaCartao = null;   // <dialog> da Stripe
let checkout = null;       // formulário montado (precisa de destroy ao fechar)
let pagou = false;         // o fechamento veio do pagamento concluído

function carregarStripe() {
  return new Promise((ok, erro) => {
    if (window.Stripe) { ok(window.Stripe); return; }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => ok(window.Stripe);
    s.onerror = () => erro(new Error('Não foi possível carregar o pagamento. Verifique a conexão.'));
    document.head.append(s);
  });
}

function fecharCartao() {
  if (janelaCartao?.open) janelaCartao.close();
}

async function abrirCartao(valor) {
  pararPix();
  pix = null;
  if (!janelaCartao) {
    janelaCartao = document.createElement('dialog');
    janelaCartao.className = 'lp-pagar';
    janelaCartao.setAttribute('aria-label', 'Pagar com cartão');
    janelaCartao.innerHTML = `
      <div class="lp-pagar-topo"><strong class="lp-pagar-valor"></strong><button type="button" class="lp-pagar-fechar" data-acao="fechar-cartao" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div>
      <div class="lp-pagar-corpo"></div>`;
    janelaCartao.addEventListener('close', () => {
      try { checkout?.destroy(); } catch { /* já destruído */ }
      checkout = null;
      if (!pagou) mostrarEtapa('valores');   // fechou sem pagar: volta a escolher o valor
      pagou = false;
    });
    document.body.append(janelaCartao);
  }
  const corpo = janelaCartao.querySelector('.lp-pagar-corpo');
  janelaCartao.querySelector('.lp-pagar-valor').textContent = `Doação de ${reais(valor)}`;
  corpo.innerHTML = '<span class="lp-pagar-espera"></span>';
  janelaCartao.showModal();
  try {
    const [Stripe, r] = await Promise.all([
      carregarStripe(),
      fetch(`${API}/apoio-stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor }) }),
    ]);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Não foi possível abrir o pagamento.');
    if (!janelaCartao.open) return;   // fechou enquanto carregava
    checkout = await Stripe(apoio.stripe.chave_publica, { locale: 'pt-BR' }).initEmbeddedCheckout({
      clientSecret: j.clientSecret,
      onComplete: () => { pagou = true; fecharCartao(); agradecer(valor); },
    });
    corpo.innerHTML = '';
    checkout.mount(corpo);
  } catch (e) {
    corpo.innerHTML = '';
    corpo.append(Object.assign(document.createElement('p'), {
      className: 'lp-pagar-erro',
      textContent: e.message === 'Failed to fetch' ? 'Sem conexão. Tente de novo.' : (e.message || 'Não foi possível abrir o pagamento.'),
    }));
  }
}

let arrecadadoAtual = 0;
function agradecer(valor) {
  pararPix();
  pix = null;
  mostrarEtapa('obrigado');
  pintarMeta({ arrecadado: arrecadadoAtual + valor }, false);   // sobe já; o total oficial vem do servidor logo em seguida
  setTimeout(async () => { try { const r = await fetch(API_APOIO); if (r.ok) pintarMeta(await r.json()); } catch { /* fica o valor otimista */ } }, 4000);
}

async function copiarCodigo(botao) {
  if (!pix?.codigo) return;
  try { await navigator.clipboard.writeText(pix.codigo); }
  catch {
    const t = Object.assign(document.createElement('textarea'), { value: pix.codigo });
    document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* sem cópia */ } t.remove();
  }
  botao.textContent = 'Código copiado ✓';
  setTimeout(() => { botao.textContent = 'Copiar código Pix'; }, 2200);
}

/** Lê a configuração (links e meta) e o que já entrou no mês; qualquer falha deixa a folha como está. */
async function carregarApoio() {
  try {
    const r = await fetch('/data/apoio.json', { cache: 'no-cache' });
    if (r.ok) apoio = { ...apoio, ...(await r.json()) };
  } catch { /* sem configuração: o botão fica desligado */ }
  // Enquanto os links forem de teste, o apoio só aparece fora do site de verdade (desenvolvimento e testes).
  const naProducao = /(^|\.)santadoutrina\.com$/.test(location.hostname);
  if (naProducao && apoio.modo !== 'producao') { dialogo.querySelector('.lp-menu-sec-apoio').hidden = true; return; }
  const botao = dialogo.querySelector('#lp-menu-doar');
  const temLinks = apoio.valores.some(v => apoio.links?.[v]);
  botao.disabled = !temLinks;
  if (!temLinks) botao.textContent = 'Em breve';
  const noSite = apoio.provedor === 'mercadopago';   // Pix na própria página; o cartão segue pelo link do provedor
  dialogo.querySelector('#lp-menu-valores').innerHTML = apoio.valores.filter(v => apoio.links?.[v])
    .map(v => noSite ? `<button type="button" class="lp-menu-valor" data-valor="${v}">${reais(v)}</button>`
                     : `<a class="lp-menu-valor" href="${apoio.links[v]}" rel="noopener">${reais(v)}</a>`).join('')
    + (noSite ? '<button type="button" class="lp-menu-valor lp-menu-valor-outro" data-acao="outro">Outro</button>' : '');
  pintarMeta({ meta: apoio.meta });
  try {
    const r = await fetch(API_APOIO);
    if (r.ok) pintarMeta(await r.json());
  } catch { /* offline ou API fora do ar: fica só a meta */ }
}

/** Monta a folha, o botão do desktop e os ouvintes. Chamada uma vez. */
export function iniciarMenu() {
  dialogo = document.createElement('dialog');
  dialogo.className = 'lp-menu';
  dialogo.id = 'lp-menu';
  dialogo.setAttribute('aria-label', 'Menu');
  dialogo.innerHTML = `
    <div class="lp-menu-grab" aria-hidden="true"><i></i></div>
    <div class="lp-menu-corpo" tabindex="-1" autofocus>
      <button class="lp-menu-fechar" type="button" aria-label="Fechar o menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
      <section class="lp-menu-sec lp-menu-sec-apoio" aria-labelledby="lp-menu-h-apoio">
        <h3 id="lp-menu-h-apoio">Ajude a manter o site</h3>
        <div class="lp-menu-apoio" id="lp-menu-apoio">
          <p>Para manter o site no ar temos algumas despesas. Contribua.</p>
          <div class="lp-menu-meta" id="lp-menu-meta" role="progressbar" aria-label="Meta do mês" aria-valuemin="0" style="--p:0">
            <span class="lp-menu-meta-trilho"><i></i></span>
            <span class="lp-menu-meta-valores"><span data-arrecadado>R$ 0</span><span data-meta>R$ 150</span></span>
          </div>
          <button type="button" class="lp-menu-doar" id="lp-menu-doar" aria-expanded="false">Apoiar o site</button>
          <div class="lp-menu-valores" id="lp-menu-valores" hidden></div>
          <div class="lp-menu-outro" id="lp-menu-outro" hidden>
            <label for="lp-menu-outro-valor">R$</label>
            <input id="lp-menu-outro-valor" type="number" inputmode="numeric" min="1" max="1000" step="1" placeholder="Outro valor">
            <button type="button" data-acao="outro-ok">Gerar Pix</button>
          </div>
          <div class="lp-menu-pix" id="lp-menu-pix" hidden aria-live="polite">
            <div class="lp-menu-pix-topo"><strong id="lp-menu-pix-valor"></strong><button type="button" data-acao="voltar">‹ Trocar valor</button></div>
            <div class="lp-menu-qr" id="lp-menu-qr"><span class="lp-menu-qr-espera"></span></div>
            <button type="button" class="lp-menu-copiar" data-acao="copiar" disabled>Copiar código Pix</button>
            <p class="lp-menu-pix-estado" id="lp-menu-pix-estado"><i></i><span>Gerando o Pix…</span></p>
            <a class="lp-menu-cartao" id="lp-menu-cartao" href="#" rel="noopener">Prefere cartão? Pagar no Mercado Pago</a>
          </div>
          <div class="lp-menu-obrigado" id="lp-menu-obrigado" hidden>
            <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M15 27l8 8 14-16"/></svg>
            <strong>Obrigado!</strong>
            <span>Sua doação ajuda a manter a Liturgia Diária no ar.</span>
            <button type="button" class="lp-menu-denovo" data-acao="de-novo">Doar novamente</button>
          </div>
        </div>
      </section>
      <section class="lp-menu-sec" aria-label="Dia">
        <div id="lp-menu-dias"></div>
      </section>
      <section class="lp-menu-sec" aria-labelledby="lp-menu-h-fonte">
        <h3 id="lp-menu-h-fonte">Tamanho do texto</h3>
        <div class="lp-menu-fonte">
          <button type="button" data-fonte="-1" aria-label="Diminuir o texto"><span class="a-menor">A</span></button>
          <span class="lp-menu-pontos" aria-hidden="true">${ESCALAS.map(() => '<i class="lp-menu-ponto"></i>').join('')}<b class="lp-menu-enche"></b><b class="lp-menu-polegar"></b></span>
          <button type="button" data-fonte="1" aria-label="Aumentar o texto"><span class="a-maior">A</span></button>
        </div>
      </section>
    </div>`;
  document.body.append(dialogo);
  diasEl = dialogo.querySelector('#lp-menu-dias');

  // botão flutuante do desktop: uma âncora sem altura, presa à base da janela, dentro da coluna
  const main = document.querySelector('.lp-main');
  if (main) {
    const ancora = document.createElement('div');
    ancora.className = 'lp-menu-ancora';
    ancora.innerHTML = `<button class="lp-menu-fab" type="button" data-lp-menu aria-haspopup="dialog" aria-label="Abrir o menu">${ICONE_MENU}</button>`;
    main.prepend(ancora);
  }

  document.addEventListener('click', e => {
    const gatilho = e.target.closest?.('[data-lp-menu]');
    if (gatilho) { abrir(gatilho); return; }
    if (janelaCartao?.open) {   // a janela do cartão fica por cima do menu
      if (e.target === janelaCartao || e.target.closest('[data-acao="fechar-cartao"]')) fecharCartao();
      return;
    }
    if (!dialogo.open) return;
    if (e.target === dialogo || e.target.closest('.lp-menu-fechar')) { fechar(); return; }
    const valorBtn = e.target.closest('[data-valor]');
    if (valorBtn) { gerarPix(Number(valorBtn.dataset.valor)); return; }
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'outro') { $('#lp-menu-outro').hidden = false; $('#lp-menu-outro-valor').focus(); return; }
    if (acao === 'outro-ok') {
      const v = Number($('#lp-menu-outro-valor').value);
      if (Number.isInteger(v) && v >= 1 && v <= 1000) gerarPix(v); else $('#lp-menu-outro-valor').focus();
      return;
    }
    if (acao === 'de-novo') { mostrarEtapa('valores'); return; }
    if (acao === 'voltar') { pararPix(); pix = null; mostrarEtapa('valores'); return; }
    if (acao === 'copiar') { copiarCodigo(e.target.closest('[data-acao]')); return; }
    if (acao === 'cartao') { e.preventDefault(); abrirCartao(pix.valor); return; }
    if (e.target.closest('#lp-menu-doar')) {
      const aberto = $('#lp-menu-valores').hidden;
      mostrarEtapa(aberto ? 'valores' : 'botao');
      return;
    }
    const btn = e.target.closest('[data-fonte]');
    if (btn) { aplicar(nivel + Number(btn.dataset.fonte)); gravar(nivel); return; }
    if (e.target.closest('a[href]')) setTimeout(fechar, 60);   // trocar de dia: a navegação roda e a folha desce
  });
  dialogo.addEventListener('close', () => {
    document.documentElement.classList.remove('lp-menu-aberto');
    pararPix();
    if (pix) { pix = null; mostrarEtapa('botao'); }   // fechou no meio de um Pix: volta ao início
  });
  dialogo.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
  const grab = dialogo.querySelector('.lp-menu-grab');
  grab.addEventListener('pointerdown', comecarArrasto);
  grab.addEventListener('pointermove', moverArrasto);
  grab.addEventListener('pointerup', terminarArrasto);
  grab.addEventListener('pointercancel', terminarArrasto);
  aplicar(ler());
  carregarApoio();
  // de volta do pagamento: a folha abre com o agradecimento
  if (new URLSearchParams(location.search).get('apoio') === 'obrigado') {
    mostrarEtapa('obrigado');
    history.replaceState(null, '', location.pathname);
    setTimeout(() => abrir(document.querySelector('.lp-menu-fab')), 800);
  }
}
