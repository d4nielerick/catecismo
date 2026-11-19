/**
 * seguir.mjs — destaca na tela a frase que está sendo dita (Modo Missa, "Acompanhar pelo áudio").
 *
 * Para quem ouve mal, ou numa igreja de som ruim: o texto da parte da missa já está na tela; o
 * reconhecimento de voz (ouvir.mjs) diz, com erros e atraso, o que está sendo falado. Este módulo
 * alinha uma coisa com a outra, como uma legenda sobre um texto conhecido.
 *
 * Como funciona:
 *  1. Ao desenhar uma tela, o texto que se diz em voz alta (leituras, salmo, diálogos, orações) é
 *     cortado em frases (ou orações, quando a frase é longa) e cada uma ganha um <span class="mm-fr">.
 *     As palavras viram uma lista só, normalizada como o reconhecimento entrega. Uma vez por tela.
 *  2. A cada resultado do reconhecimento, as últimas palavras ouvidas são alinhadas com o texto
 *     (alinhamento local, tipo Smith-Waterman: tolera palavra errada, palavra a mais e palavra
 *     pulada; palavras raras pesam mais que "de", "o", "que"). Primeiro numa janela em volta de
 *     onde a leitura estava, andando para a frente; só se ali não houver nada é que procura na tela
 *     inteira, e aí exige bem mais (várias palavras de conteúdo), para não pular por causa de
 *     "Senhor" ou "Deus". Não depende de saber o que é palavra nova: o Safari do iPhone manda uma
 *     palavra por vez e o Chrome reescreve o fim da frase, e a cauda realinhada serve aos dois.
 *  3. A frase onde a fala está fica destacada e é mantida à vista. Quando a última palavra de uma
 *     frase é ouvida, o destaque já passa para a seguinte (o reconhecimento chega atrasado, e é a
 *     resposta do povo que a pessoa precisa ver na hora).
 *
 * Quem rola o texto com o dedo manda: o acompanhamento para de rolar e aparece "Seguir o áudio".
 */
import { normalizar } from './ouvir.mjs';

// ── Texto → frases ──────────────────────────────────────────────────────────
const palavrasDe = t => { const n = normalizar(t); return n ? n.split(' ') : []; };
const LONGA = 18;      // acima disso a frase é cortada nas vírgulas
const CURTA = 3;       // abaixo disso junta com a vizinha ("E disse:", "Amém.")

/** Corta um texto em frases: devolve os intervalos [início, fim) de cada uma, sem os espaços das pontas. */
export function cortar(texto) {
  const conta = (a, b) => palavrasDe(texto.slice(a, b)).length;
  // 1) pontuação forte (com as aspas que fecham)
  const inteiras = [];
  const fim = /[.!?;:…]+["'”’»)\]]*(?=\s|$)/g;
  let a = 0;
  for (let m; (m = fim.exec(texto));) { inteiras.push([a, m.index + m[0].length]); a = m.index + m[0].length; }
  if (a < texto.length) inteiras.push([a, texto.length]);
  // 2) frase longa: corta nas vírgulas, em pedaços de pelo menos 7 palavras
  const pedacos = [];
  for (const [ini, ate] of inteiras) {
    if (conta(ini, ate) <= LONGA) { pedacos.push([ini, ate]); continue; }
    const virgula = /[,–—]["'”’]?(?=\s)/g;
    virgula.lastIndex = ini;
    let p = ini;
    for (let m; (m = virgula.exec(texto)) && m.index < ate;) {
      const c = m.index + m[0].length;
      if (conta(p, c) >= 7 && conta(c, ate) >= 4) { pedacos.push([p, c]); p = c; }
    }
    pedacos.push([p, ate]);
  }
  // 3) pedaço curto demais junta com o vizinho: com o seguinte se anuncia algo ("E disse:"), senão com o anterior
  const frases = [];
  let pendente = -1;
  for (let [ini, ate] of pedacos) {
    if (pendente >= 0) { ini = pendente; pendente = -1; }
    const n = conta(ini, ate);
    if (n === 0 && !frases.length) { pendente = ini; continue; }
    if (n < CURTA) {
      const anuncia = /[:,]["'”’]?\s*$/.test(texto.slice(ini, ate));
      if (frases.length && !anuncia) { frases.at(-1)[1] = ate; continue; }
      if (anuncia || !frases.length) { pendente = ini; continue; }
    }
    frases.push([ini, ate]);
  }
  if (pendente >= 0) { if (frases.length) frases.at(-1)[1] = texto.length; else frases.push([pendente, texto.length]); }
  // sem os espaços das pontas (o destaque não pinta o espaço entre duas frases)
  return frases.map(([i, f]) => {
    while (i < f && /\s/.test(texto[i])) i++;
    while (f > i && /\s/.test(texto[f - 1])) f--;
    return [i, f];
  }).filter(([i, f]) => f > i && conta(i, f) > 0);
}

// ── Alinhamento ─────────────────────────────────────────────────────────────
const VAZIAS = new Set(('a o e de do da dos das em no na nos nas um uma uns umas que se por para com ao aos as os lhe lhes me te ' +
  'vos ele ela eles elas eu tu nao mas ou como seu sua seus suas meu minha teu tua isto isso este esta esse essa foi era ser sao ha ja ' +
  'so la pelo pela pelos pelas tambem entao quando').split(' '));

/** Duas palavras são "a mesma"? 1 = iguais; 0.6 = quase (plural, terminação do verbo, uma letra trocada); 0 = não. */
export function semelhanca(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la < 5 || lb < 5 || a[0] !== b[0] || Math.abs(la - lb) > 3) return 0;
  const menor = Math.min(la, lb);
  let p = 0;
  while (p < menor && a[p] === b[p]) p++;
  if (p >= 4 && p >= menor - 2) return 0.6;                 // "discipulo" / "discipulos", "resgatar" / "resgatara"
  if (Math.abs(la - lb) > 1) return 0;
  // uma letra trocada, a mais ou a menos, no meio: "campinas" / "campinhas"
  let i = p, j = p, erros = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++erros > 1) return 0;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return 0.6;
}

const CAUDA = 12;          // quantas palavras ouvidas entram no alinhamento
const ATRAS = 10, FRENTE = 60;   // janela em volta de onde a leitura está
const ERRADA = 0.8;        // palavra ouvida que não é a do texto
const A_MAIS = 0.7;        // palavra ouvida que não está no texto (ruído, reconhecimento errado)

/**
 * Acompanha a posição da fala num texto. `frases` é a lista das frases, cada uma já em palavras
 * normalizadas; `oculta(i)` diz se a frase i está recolhida (dentro de um <details> fechado): para
 * entrar nela exige-se o mesmo que para um salto. Sem DOM: dá para testar no Node.
 */
export function rastreador(frases, { oculta = () => false } = {}) {
  const palavras = [], dono = [], fimDe = [];
  frases.forEach((f, i) => { for (const p of f) { palavras.push(p); dono.push(i); } fimDe.push(palavras.length - 1); });
  const N = palavras.length;
  // peso: palavra vazia quase não conta; palavra longa conta mais; a que se repete muito na tela, menos
  const vezes = new Map();
  for (const p of palavras) vezes.set(p, (vezes.get(p) || 0) + 1);
  const peso = new Float32Array(N), cheia = new Uint8Array(N);
  for (let j = 0; j < N; j++) {
    const p = palavras[j];
    if (VAZIAS.has(p) || p.length < 3) { peso[j] = 0.3; continue; }
    cheia[j] = 1;
    peso[j] = Math.min(2, 0.6 + 0.22 * p.length) * (vezes.get(p) >= 4 ? 0.7 : 1);
  }

  let pos = -1;              // índice da última palavra do texto que foi ouvida
  let ultimaCauda = '';
  let ultimoGlobal = 0;

  /** Última linha do alinhamento local das palavras ouvidas `h` com o texto em [de, ate):
   *  S[k] = melhor pontuação de um alinhamento que termina na palavra de+k-1; C[k] = palavras cheias que casaram. */
  function linha(h, de, ate) {
    const m = ate - de;
    let sAnt = new Float32Array(m + 1), s = new Float32Array(m + 1);
    let cAnt = new Uint8Array(m + 1), c = new Uint8Array(m + 1);
    for (let i = 0; i < h.length; i++) {
      const hi = h[i];
      s[0] = 0; c[0] = 0;
      for (let k = 1; k <= m; k++) {
        const j = de + k - 1;
        const igual = semelhanca(hi, palavras[j]);
        let v = sAnt[k - 1] + (igual ? igual * peso[j] : -ERRADA);
        let n = cAnt[k - 1] + (igual && cheia[j] ? 1 : 0);
        const aMais = sAnt[k] - A_MAIS;
        if (aMais > v) { v = aMais; n = cAnt[k]; }
        const pulada = s[k - 1] - (0.25 + 0.3 * peso[j]);       // pular "de" custa pouco; pular "trincheiras", mais
        if (pulada > v) { v = pulada; n = c[k - 1]; }
        if (v <= 0) { v = 0; n = 0; }
        s[k] = v; c[k] = n;
      }
      [sAnt, s] = [s, sAnt]; [cAnt, c] = [c, cAnt];
    }
    return { S: sAnt, C: cAnt };
  }

  /** Recebe o texto ouvido (acumulado, normalizado). Devolve a nova posição, ou null se nada mudou. */
  function ouvir(texto, agora = Date.now()) {
    if (!N) return null;
    const h = String(texto || '').split(' ').filter(Boolean).slice(-CAUDA);
    const cauda = h.join(' ');
    if (!h.length || cauda === ultimaCauda) return null;
    ultimaCauda = cauda;

    // 1) perto de onde estava
    const de = Math.max(0, pos - ATRAS), ate = Math.min(N, pos + 1 + FRENTE);
    const { S, C } = linha(h, de, ate);
    const aqui = pos >= 0 ? S[pos - de + 1] : 0;       // o quanto a cauda já se explica sem sair do lugar
    let melhor = -1, valor = -Infinity, maxLocal = 0, salto = false;
    for (let j = de; j < ate; j++) {
      const s = S[j - de + 1], c = C[j - de + 1], d = j - pos;
      if (s > maxLocal) maxLocal = s;
      if (d === 0) continue;
      let serve, bonus = 0;
      if (oculta(dono[j])) serve = s >= 5.5 && c >= 3 && s >= aqui + 2;
      else if (d > 0 && d <= 8) { serve = s >= 1.8 && s >= aqui + 0.5; bonus = 0.8; }      // a continuação esperada
      else if (d > 8) { serve = s >= 3.2 && c >= 2 && s >= aqui + 1; bonus = d <= 25 ? 0.4 : 0; }   // pulou um trecho
      else serve = s >= 4.5 && c >= 3 && s >= aqui + 2.5;                                 // voltou (releu, recomeçou)
      if (serve && s + bonus > valor) { valor = s + bonus; melhor = j; }
    }
    // 2) na tela inteira, só com muita certeza (entrou no meio da leitura, pulou parágrafos, forma breve)
    if (melhor < 0 && h.length >= 4 && N > ate - de && agora - ultimoGlobal >= 250) {
      ultimoGlobal = agora;
      const g = linha(h, 0, N);
      let dist = Infinity;
      for (let j = 0; j < N; j++) {
        if (j >= de && j < ate) continue;
        const s = g.S[j + 1];
        if (s < 5.5 || g.C[j + 1] < 3 || s < maxLocal + 2) continue;
        const d = j > pos ? j - pos : (pos - j) + N;        // empate: o mais próximo para a frente
        if (s > valor + 0.01 || (s > valor - 0.01 && d < dist)) { valor = s; melhor = j; dist = d; salto = true; }
      }
    }
    if (melhor < 0) return null;
    salto = salto || melhor < pos;
    pos = melhor;
    return estado(salto);
  }

  function estado(salto = false) {
    if (pos < 0) return { pos, frase: -1, noFim: false, quase: false, salto };
    const f = dono[pos], fim = fimDe[f], tam = frases[f].length;
    return { pos, frase: f, noFim: pos === fim, quase: pos === fim - 1 && tam >= 5, salto };
  }

  return {
    ouvir, estado,
    /** Dá a frase por dita (o destaque já passou para a seguinte). */
    concluir(f) { if (f >= 0 && f < fimDe.length && pos < fimDe[f]) pos = fimDe[f]; },
    texto: ` ${palavras.join(' ')} `,
    total: N,
  };
}

// ── Tela ────────────────────────────────────────────────────────────────────
// O que se diz em voz alta. Ficam de fora: rubricas (.mm-r), título e referência da leitura, avisos.
const BLOCOS = '.leitura-texto p, .salmo-refrao, .salmo-estrofe, .salmo-r-sep, .acl-verso, p.mm-s, p.mm-p, .mm-oracao p:not(.mm-r), .mm-propria blockquote';
// Dentro de um bloco, o que não é dito: número do versículo, "V."/"R.", o rótulo para leitor de tela, "ou"
const FORA = '.vers-num, .mm-sig, .mm-sr, .salmo-r-label, .salmo-ou';
const QUASE_MS = 900;        // ouviu a penúltima palavra da frase: espera isso e passa para a seguinte
const RESPEITO_MS = 4000;    // depois de um gesto de rolar, não rola sozinho por este tempo

/**
 * Liga o acompanhamento ao palco. `botao` é o "Seguir o áudio" (aparece quando a pessoa rolou para
 * longe do trecho). Devolve { novaTela, ligar, desligar, ouvido, contem, estado }.
 */
export function criarSeguidor({ palco, botao }) {
  const porBloco = new WeakMap();   // bloco → frases já marcadas (a tela pode ganhar blocos novos: troca de Oração Eucarística)
  let raiz = null;
  let frases = [];
  let rastro = null;
  let ativo = false;
  let atual = -1;            // frase destacada
  let pausado = false;       // a pessoa rolou: não rolar sozinho
  let ultimoGesto = 0;
  let autoAte = 0;           // até quando um 'scroll' é efeito do nosso próprio scrollTo
  let quaseTimer = null;
  let botaoTimer = null;
  const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const agora = () => performance.now();

  // Salmo: o refrão se repete depois de cada estrofe, mas na página só está escrito no alto ("R." marca
  // onde volta). Aqui cada "R." ganha o texto do refrão (aparece só com o acompanhamento ligado): é a
  // hora em que todos respondem, e quem não ouve precisa ver isso no lugar certo, sem voltar ao alto.
  function repetirRefrao() {
    for (const sep of raiz.querySelectorAll('.salmo-r-sep:not(.com-texto):not([data-mm])')) {
      sep.dataset.mm = '1';
      const refrao = sep.parentElement.querySelector('.salmo-refrao');
      if (!refrao) continue;
      const copia = refrao.cloneNode(true);
      copia.querySelectorAll('.mm-fr').forEach(s => s.replaceWith(...s.childNodes));
      sep.replaceChildren(...copia.childNodes);
    }
  }

  /** Corta o bloco em frases e põe cada uma num <span class="mm-fr"> (vários, se a frase atravessa um
   *  número de versículo). A capitular fica de fora do destaque, mas a letra dela conta na palavra. */
  function marcarBloco(bloco) {
    const nos = [];
    let texto = '', antesCapitular = false;
    const tw = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const pai = n.parentElement;
      if (!pai || pai.closest(FORA)) continue;
      const capitular = !!pai.closest('.capitular');
      // dois nós de texto colados (<br>, <span>) são palavras separadas; só a capitular continua a palavra ("N" + "aquele")
      if (texto && !antesCapitular && !/\s$/.test(texto) && !/^\s/.test(n.data)) texto += ' ';
      nos.push({ n, ini: texto.length, capitular });
      texto += n.data;
      antesCapitular = capitular;
    }
    const fs = cortar(texto).map(([a, b]) => ({ bloco, a, b, els: [], palavras: palavrasDe(texto.slice(a, b)) }));
    for (const { n, ini, capitular } of nos) {
      if (capitular) continue;
      const fim = ini + n.data.length;
      const partes = fs.filter(f => f.a < fim && f.b > ini);
      if (!partes.length) continue;
      const frag = document.createDocumentFragment();
      let p = ini;
      for (const f of partes) {
        const a = Math.max(f.a, ini), b = Math.min(f.b, fim);
        if (a > p) frag.append(texto.slice(p, a));
        const t = texto.slice(a, b);
        if (t.trim()) {
          const span = document.createElement('span');
          span.className = 'mm-fr';
          span.textContent = t;
          f.els.push(span);
          frag.append(span);
        } else frag.append(t);
        p = b;
      }
      if (p < fim) frag.append(texto.slice(p, fim));
      n.replaceWith(frag);
    }
    return fs.filter(f => f.els.length);
  }

  const recolhida = f => { const d = f.bloco.closest('details'); return !!d && !d.open; };

  function indexar() {
    repetirRefrao();
    frases = [];
    for (const bloco of raiz.querySelectorAll(BLOCOS)) {
      let fs = porBloco.get(bloco);
      if (!fs) { fs = marcarBloco(bloco); porBloco.set(bloco, fs); }
      frases.push(...fs);
    }
    rastro = rastreador(frases.map(f => f.palavras), { oculta: i => recolhida(frases[i]) });
  }

  /** Tela nova (ou texto trocado dentro dela): marca as frases e recomeça do início. É chamada no mesmo
   *  instante em que o texto entra na página, para o leitor de tela não anunciar a tela duas vezes. */
  function novaTela(secao) {
    clearTimeout(quaseTimer);
    raiz = secao;
    atual = -1;
    pausado = false;
    autoAte = agora() + 500;          // o mostrar() volta a rolagem ao topo
    if (raiz) indexar(); else { frases = []; rastro = null; }
    mostrarBotao();
  }

  function caixa(f) {
    let topo = Infinity, base = -Infinity;
    for (const el of f.els) { const r = el.getBoundingClientRect(); if (r.height) { topo = Math.min(topo, r.top); base = Math.max(base, r.bottom); } }
    const p = palco.getBoundingClientRect();
    return { topo: topo - p.top, base: base - p.top, altura: palco.clientHeight };
  }

  /** Mantém a frase destacada na parte de cima do meio da tela. Só rola se ela saiu da faixa confortável. */
  function rolar(forcar = false) {
    const f = frases[atual];
    if (!f) return;
    const { topo, base, altura } = caixa(f);
    if (!Number.isFinite(topo)) return;
    if (pausado && !forcar) {
      // a pessoa rolou; se já faz um tempo e o trecho está à vista, volta a acompanhar sem perguntar
      if (agora() - ultimoGesto > RESPEITO_MS && topo >= 0 && base <= altura * 0.8) pausado = false;
      else { mostrarBotao(); return; }
    }
    mostrarBotao();
    if (!forcar && topo >= altura * 0.14 && base <= altura * 0.6) return;
    const folga = base - topo > altura * 0.5 ? altura * 0.1 : altura * 0.3;
    autoAte = agora() + 1000;
    palco.scrollTo({ top: Math.max(0, palco.scrollTop + topo - folga), behavior: semMovimento?.matches ? 'auto' : 'smooth' });
  }

  function destacar(i) {
    if (i === atual || !frases[i]) return;
    if (frases[atual]) for (const el of frases[atual].els) el.classList.remove('mm-agora');
    atual = i;
    const f = frases[i];
    if (recolhida(f)) f.bloco.closest('details').open = true;     // estão rezando o que estava recolhido (ex.: Símbolo dos Apóstolos)
    for (const el of f.els) el.classList.add('mm-agora');
    rolar();
  }

  function apagar() {
    clearTimeout(quaseTimer);
    if (frases[atual]) for (const el of frases[atual].els) el.classList.remove('mm-agora');
    atual = -1;
    mostrarBotao();
  }

  /** O que foi ouvido (texto acumulado e normalizado, como vem do ouvir.mjs). Devolve true se achou onde a fala está. */
  function ouvido(texto) {
    if (!ativo || !rastro) return false;
    const e = rastro.ouvir(texto);
    if (!e || e.frase < 0) return false;
    clearTimeout(quaseTimer);
    const seguinte = frases[e.frase + 1];
    const podeAdiantar = seguinte && !recolhida(seguinte);
    if (e.noFim && podeAdiantar) {
      // ouviu a última palavra: quem fala já está na frase seguinte (ou é a vez da resposta)
      destacar(e.frase + 1);
    } else if (e.frase > atual || e.salto || atual < 0) {
      destacar(e.frase);
    }
    if (e.quase && podeAdiantar) {
      const f = e.frase;
      quaseTimer = setTimeout(() => { if (ativo && atual === f) { rastro.concluir(f); destacar(f + 1); } }, QUASE_MS);
    }
    return true;
  }

  // ── Rolagem: quem manda é a mão ──
  function gesto() {
    ultimoGesto = agora();
    if (!ativo) return;
    pausado = true;
    clearTimeout(botaoTimer);
    botaoTimer = setTimeout(mostrarBotao, 150);
  }
  palco.addEventListener('wheel', gesto, { passive: true });
  palco.addEventListener('touchmove', gesto, { passive: true });
  // teclado, barra de rolagem, leitor de tela: qualquer rolagem que não seja a nossa
  palco.addEventListener('scroll', () => { if (agora() > autoAte) gesto(); else autoAte = Math.max(autoAte, agora() + 150); }, { passive: true });

  function mostrarBotao() {
    if (!botao) return;
    let fora = 0;
    if (ativo && pausado && frases[atual]) {
      const { topo, base, altura } = caixa(frases[atual]);
      fora = base < 8 ? -1 : topo > altura - 8 ? 1 : 0;
    }
    botao.hidden = !fora;
    botao.classList.toggle('acima', fora < 0);
  }
  botao?.addEventListener('click', e => {
    e.stopPropagation();
    pausado = false;
    rolar(true);
    mostrarBotao();
  });

  return {
    novaTela,
    ouvido,
    ligar() { ativo = true; document.body.classList.add('mm-seguindo'); },
    desligar() { ativo = false; pausado = false; apagar(); document.body.classList.remove('mm-seguindo'); },
    /** A frase (normalizada) faz parte do que se diz nesta tela? */
    contem: frase => !!rastro && rastro.texto.includes(` ${frase} `),
    estado: () => ({ ativo, atual, pausado, frases: frases.length, texto: frases[atual]?.els.map(e => e.textContent).join(' ') || '', ...(rastro ? { pos: rastro.estado().pos } : {}) }),
  };
}
