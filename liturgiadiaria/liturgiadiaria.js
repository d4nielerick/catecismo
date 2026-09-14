/**
 * liturgiadiaria.js — página /liturgiadiaria/.
 *
 * Lê data/liturgia/AAAA-MM-DD.json (gerado por scripts/build-liturgia.mjs a partir da fonte
 * crua) e data/liturgia/indice.json (intervalo de datas disponível para o calendário).
 * O JSON já vem com cada leitura separada, a referência completa e o nome litúrgico do dia;
 * aqui só se desenha.
 */

const pad = n => String(n).padStart(2, '0');

// Data do aparelho, não UTC: às 22h em Brasília toISOString() já é o dia seguinte.
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COR_PONTO = { roxo: '#7c3aed', branco: '#b8972e', verde: '#15803d', vermelho: '#dc2626', rosa: '#db2777', preto: '#44403c' };
const COR_FUNDO = { roxo: '#f0ecf8', branco: '#faf7ee', verde: '#edf5ef', vermelho: '#f8edeb', rosa: '#f8edf2', preto: '#eeeceb' };

// ── Texto ────────────────────────────────────────────────────────────────────
const VERSO = /^\d+[a-z]?$|^\d+,\d+[a-z]?$|^[a-z]$/;
const OU = '<span class="salmo-ou">ou</span>';

function renderProsa(texto) {
  let html = '';
  for (const l of texto.split('\n')) {
    html += VERSO.test(l) ? `<sup class="vers-num">${esc(l)}</sup>` : `${esc(l)} `;
  }
  return `<p>${html.trim()}</p>`;
}

function renderPoema(texto) {
  return `<p>${texto.split('\n').map(esc).join('<br>')}</p>`;
}

function renderSalmo(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  let i = 0;
  const refrao = [];
  if (/^R\.?(\s|$)/.test(linhas[0] || '')) {
    const resto = linhas[0].replace(/^R\.?\s*/, '');
    if (resto) refrao.push(esc(resto));
    // O refrão termina no primeiro versículo (número ou linha com "*" de mediação).
    for (i = 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (VERSO.test(l) || l.includes('*')) break;
      if (/^R\.?$/.test(l)) continue;
      refrao.push(/^Ou:?$/i.test(l) ? OU : esc(l));
    }
  }

  let html = refrao.length ? `<div class="salmo-refrao"><span class="salmo-r-label">R.</span>${refrao.join(' ')}</div>` : '';
  let estrofe = '';
  const fechar = () => { if (estrofe) html += `<div class="salmo-estrofe">${estrofe}</div>`; estrofe = ''; };
  for (; i < linhas.length; i++) {
    const l = linhas[i].replace(/[*†]/g, '').trim();
    if (!l) continue;
    if (/^R\.?$/.test(l)) { fechar(); html += '<div class="salmo-r-sep">R.</div>'; continue; }
    if (/^R\.\s/.test(l)) { fechar(); html += `<div class="salmo-r-sep com-texto">R. ${esc(l.slice(2).trim())}</div>`; continue; }
    if (VERSO.test(l)) { estrofe += `<sup class="vers-num">${esc(l)}</sup>`; continue; }
    // Estrofe em texto corrido, como no layout (a linha do salmo não quebra).
    estrofe += /^Ou:?$/i.test(l) ? `${OU} ` : `${esc(l)} `;
  }
  fechar();
  return html;
}

function renderAclamacao(texto) {
  let html = '';
  let modo = null;
  let buf = [];
  const fechar = () => {
    if (!buf.length) return;
    if (modo === 'R') html += `<div class="salmo-refrao"><span class="salmo-r-label">R.</span>${buf.join('<br>')}</div>`;
    else if (modo === 'V') html += `<div class="acl-verso"><span class="salmo-r-label">V.</span>${buf.join('<br>')}</div>`;
    else html += `<p>${buf.join('<br>')}</p>`;
    buf = [];
  };
  for (const l of texto.split('\n').map(x => x.trim()).filter(Boolean)) {
    const m = l.match(/^([RV])\.\s*(.*)$/);
    if (m) { fechar(); modo = m[1]; if (m[2]) buf.push(esc(m[2])); continue; }
    buf.push(/^Ou:?$/i.test(l) ? OU : esc(l));
  }
  fechar();
  return html;
}

function corpoLeitura(s) {
  const texto = s.tipo === 'salmo' ? renderSalmo(s.texto)
    : s.tipo === 'aclamacao' ? renderAclamacao(s.texto)
    : s.tipo === 'sequencia' ? renderPoema(s.texto)
    : renderProsa(s.texto);
  const titulo = s.titulo ? `<p class="leitura-titulo">${esc(s.titulo)}</p>` : '';
  return `${titulo}<div class="leitura-texto">${texto}</div>`;
}

const rotuloCompleto = s => s.rotulo + (s.variante ? ` (${s.variante})` : '');

// ── Cards ────────────────────────────────────────────────────────────────────
const FLAG_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;

const ANCORA = { salmo: 'salmo', sequencia: 'sequencia', aclamacao: 'aclamacao', evangelho: 'evangelho' };
function ancora(s) {
  if (s.tipo !== 'leitura') return ANCORA[s.tipo];
  return s.rotulo === '1ª Leitura' ? 'primeira-leitura' : s.rotulo === '2ª Leitura' ? 'segunda-leitura' : s.rotulo === 'Epístola' ? 'epistola' : `leitura-${parseInt(s.rotulo, 10)}`;
}

/** Agrupa cada leitura com as suas alternativas ("ou…") e gera ids únicos. */
function blocosDaMissa(missa, prefixo) {
  const blocos = [];
  const usados = new Map();
  for (const s of missa.leituras) {
    if (s.alternativa && blocos.length) { blocos.at(-1).alternativas.push(s); continue; }
    const base = prefixo + ancora(s);
    const n = (usados.get(base) || 0) + 1;
    usados.set(base, n);
    blocos.push({ leitura: s, id: n > 1 ? `${base}-${n}` : base, alternativas: [] });
  }
  return blocos;
}

function renderBloco({ leitura: s, id, alternativas }) {
  const alts = alternativas.map(a => `
      <details class="leitura-alt">
        <summary><span class="leitura-alt-ou">ou</span> ${esc(rotuloCompleto(a))}${a.referencia ? ` · ${esc(a.referencia)}` : ''}</summary>
        ${corpoLeitura(a)}
      </details>`).join('');
  return `
    <article class="leitura-card${s.tipo === 'evangelho' ? ' card-evangelho' : ''}${['aclamacao', 'sequencia'].includes(s.tipo) ? ' secao-menor' : ''}" id="${id}" data-rotulo="${esc(rotuloCompleto(s))}" style="position:relative;">
      <button class="leitura-flag-btn" type="button" aria-label="Reportar erro nesta leitura" title="Reportar erro" style="position:absolute;top:1rem;right:1rem;background:transparent;border:1px solid var(--color-border);border-radius:50%;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--color-muted);opacity:0;transition:opacity 0.15s;">${FLAG_SVG}</button>
      <div class="leitura-label">${esc(rotuloCompleto(s))}</div>
      ${s.referencia ? `<div class="leitura-ref">${esc(s.referencia)}</div>` : ''}
      ${corpoLeitura(s)}
      ${alts}
    </article>`;
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────
function preencherCabecalho(dt, dia, santos) {
  const data = new Date(`${dt}T12:00:00`);
  document.getElementById('lp-data').textContent =
    data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (!dia) return;
  pendurarFita(dia.cor);

  if (dia.tempo) {
    document.getElementById('lp-tempo').textContent = dia.tempo;
    document.getElementById('lp-cor-dot').style.background = COR_PONTO[dia.cor] ?? '#888';
    document.getElementById('lp-tempo-wrap').style.display = '';
  }
  const fundo = COR_FUNDO[dia.cor];
  if (fundo) document.documentElement.style.setProperty('--litur-bg', fundo);

  if (dia.celebracao) {
    const el = document.getElementById('lp-nome-dia');
    const slug = santos?.[dia.celebracao];
    if (slug) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'nome-dia-link';
      botao.title = 'Sobre a celebração (Wikipédia)';
      // A última palavra vai junto com o ícone, para o ícone nunca ficar sozinho numa linha.
      const corte = dia.celebracao.lastIndexOf(' ') + 1;
      botao.innerHTML = `${esc(dia.celebracao.slice(0, corte))}<span class="nome-dia-fim">${esc(dia.celebracao.slice(corte))}${ICONE_SOBRE}</span>`;
      botao.addEventListener('click', () => abrirSobre(slug, dia.celebracao));
      el.replaceChildren(botao);
    } else {
      el.textContent = dia.celebracao;
    }
    if (dia.complemento) {
      const c = document.createElement('span');
      c.className = 'complemento';
      c.textContent = dia.complemento;
      el.appendChild(c);
    }
    el.style.display = '';
  }
}

// ── Navegação ────────────────────────────────────────────────────────────────
function construirNav(blocos) {
  const navEl = document.getElementById('lp-nav');
  const tabsEl = document.getElementById('lp-tabs');
  navEl.innerHTML = '';
  tabsEl.innerHTML = '';

  const itens = blocos.filter(b => !['aclamacao', 'sequencia'].includes(b.leitura.tipo));
  itens.forEach(({ leitura, id }, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${id}"${i === 0 ? ' class="ativa"' : ''}><span class="nav-dot"></span>${esc(leitura.rotulo)}</a>`;
    navEl.appendChild(li);

    const a = document.createElement('a');
    a.href = `#${id}`;
    a.textContent = leitura.rotulo;
    if (i === 0) a.classList.add('ativa');
    tabsEl.appendChild(a);
  });

  const cards = itens.map(({ id }) => document.getElementById(id)).filter(Boolean);
  const links = [...navEl.querySelectorAll('a'), ...tabsEl.querySelectorAll('a')];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('ativa', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-90px 0px -55% 0px' }); // ativa a leitura que passa logo abaixo das abas fixas
  cards.forEach(c => obs.observe(c));
}

// ── Correções ────────────────────────────────────────────────────────────────
function configurarFlagButtons(dt) {
  document.querySelectorAll('.leitura-card').forEach(card => {
    const btn = card.querySelector('.leitura-flag-btn');
    if (!btn) return;

    card.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    card.addEventListener('mouseleave', () => {
      if (!card.querySelector('.leitura-correcao-form')) btn.style.opacity = '0';
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = card.querySelector('.leitura-correcao-form');
      if (existing) { existing.remove(); btn.style.opacity = '0'; return; }

      const form = document.createElement('div');
      form.className = 'leitura-correcao-form';
      form.style.cssText = 'margin-top:1rem;border-top:1px solid var(--color-border);padding-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem;';
      form.innerHTML = `
        <textarea placeholder="Descreva o erro encontrado nesta leitura…" rows="3" style="font-size:0.8rem;padding:0.4rem 0.6rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);resize:vertical;width:100%;box-sizing:border-box;font-family:inherit;"></textarea>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button class="leitura-correcao-cancelar" type="button" style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.75rem;border-radius:100px;background:transparent;border:1px solid var(--color-border);color:var(--color-muted);cursor:pointer;">Cancelar</button>
          <button class="leitura-correcao-enviar" type="button" style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.75rem;border-radius:100px;background:var(--color-primary);border:1px solid var(--color-primary);color:#fff;cursor:pointer;">Enviar</button>
        </div>
      `;
      card.appendChild(form);
      form.querySelector('textarea').focus();

      form.querySelector('.leitura-correcao-cancelar').addEventListener('click', (ev) => {
        ev.stopPropagation();
        form.remove();
        btn.style.opacity = '0';
      });

      form.querySelector('.leitura-correcao-enviar').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const descricao = form.querySelector('textarea').value.trim();
        if (!descricao) return;
        const enviarBtn = form.querySelector('.leitura-correcao-enviar');
        enviarBtn.disabled = true;
        enviarBtn.textContent = 'Enviando…';
        try {
          const resp = await fetch('/api/correcao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // A data vai junto: "Evangelho" sozinho não diz de que dia é o erro.
            body: JSON.stringify({ paragrafo: `Liturgia ${dt} · ${card.dataset.rotulo}`, descricao }),
          });
          if (resp.ok) {
            form.innerHTML = '<p style="font-size:0.78rem;color:var(--color-muted);font-style:italic;">Obrigado! Correção recebida.</p>';
            setTimeout(() => { form.remove(); btn.style.opacity = '0'; }, 2500);
          } else {
            enviarBtn.disabled = false;
            enviarBtn.textContent = 'Enviar';
          }
        } catch {
          enviarBtn.disabled = false;
          enviarBtn.textContent = 'Enviar';
        }
      });
    });
  });
}

// ── Calendário ───────────────────────────────────────────────────────────────
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function construirCalendario(dtAtual, hoje, indice) {
  const wrap = document.getElementById('cal-wrap');
  if (!wrap) return;

  const sel = new Date(`${dtAtual}T12:00:00`);
  let ano = sel.getFullYear();
  let mes = sel.getMonth();

  function render() {
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();

    let html = `
      <div class="cal-header">
        <button class="cal-btn" id="cal-prev" aria-label="Mês anterior">‹</button>
        <span class="cal-mes">${MESES[mes]} ${ano}</span>
        <button class="cal-btn" id="cal-next" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-grid">
        ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${Array(primeiroDia).fill('<div class="cal-dia vazio"></div>').join('')}
    `;

    for (let d = 1; d <= ultimoDia; d++) {
      const dtStr = `${ano}-${pad(mes + 1)}-${pad(d)}`;
      const foraRange = !indice || dtStr < indice.inicio || dtStr > indice.fim;
      const isHoje = dtStr === hoje;
      const isSel = dtStr === dtAtual;
      const cls = ['cal-dia', foraRange && 'fora-range', isHoje && 'hoje', isSel && !isHoje && 'selecionado']
        .filter(Boolean).join(' ');
      html += foraRange
        ? `<div class="${cls}">${d}</div>`
        : `<a class="${cls}" href="?data=${dtStr}">${d}</a>`;
    }

    html += '</div>';
    wrap.innerHTML = html;

    document.getElementById('cal-prev')?.addEventListener('click', () => {
      mes--; if (mes < 0) { mes = 11; ano--; } render();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      mes++; if (mes > 11) { mes = 0; ano++; } render();
    });
  }

  render();
}

// ── Entrada do texto, linha a linha ──────────────────────────────────────────
// Cada palavra vira um <span>; a posição real na tela agrupa as palavras em linhas, e cada linha
// entra quando aparece no viewport (as que entram juntas vêm em cascata, de cima para baixo).
const SELETOR_ENTRADA = [
  '.lp-titulo', '.lp-data', '.tempo-wrap', '.nome-dia', '.lp-avisos',
  '.leitura-label', '.leitura-ref', '.leitura-titulo', '.leitura-texto p',
  '.salmo-refrao', '.salmo-estrofe', '.salmo-r-sep.com-texto', '.acl-verso',
].join(', ');
const BLOCOS_INTEIROS = '.lp-data, .tempo-wrap, .nome-dia, .lp-avisos, .leitura-label, .leitura-ref';
const UNIDADES_INLINE = 'sup, .salmo-r-label, .salmo-ou';
const PASSO_LINHA_MS = 55;
const LEVA_MAX_MS = 1000;

function quebrarEmPalavras(bloco) {
  const textos = [];
  const walker = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textos.push(walker.currentNode);
  for (const no of textos) {
    const inline = no.parentElement.closest(UNIDADES_INLINE);
    if (inline && bloco.contains(inline)) { inline.classList.add('lp-palavra', 'lp-oculto'); continue; }
    if (!no.textContent.trim()) continue;
    const frag = document.createDocumentFragment();
    for (const parte of no.textContent.split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { frag.append(parte); continue; }
      const span = document.createElement('span');
      span.className = 'lp-palavra lp-oculto';
      span.textContent = parte;
      frag.append(span);
    }
    no.replaceWith(frag);
  }
}

function animarEntrada() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

  for (const bloco of document.querySelectorAll(SELETOR_ENTRADA)) {
    if (bloco.closest('details') || bloco.dataset.lpBloco) continue;
    bloco.dataset.lpBloco = '1';
    if (bloco.matches(BLOCOS_INTEIROS)) bloco.classList.add('lp-oculto');
    else quebrarEmPalavras(bloco);
  }

  let obs = null;
  const linhaDo = new Map(); // primeira unidade da linha → unidades da linha

  function revelar(unidades, atraso) {
    for (const u of unidades) {
      u.style.setProperty('--lp-atraso', `${atraso}ms`);
      u.classList.replace('lp-oculto', 'lp-entra');
    }
  }

  function montar() {
    obs?.disconnect();
    linhaDo.clear();
    const linhas = [];
    let atual = null;
    for (const u of document.querySelectorAll('.lp-oculto')) {
      if (!u.getClientRects().length) { u.classList.remove('lp-oculto'); continue; } // escondido (display: none)
      const bloco = u.closest('[data-lp-bloco]');
      const r = u.getBoundingClientRect();
      const mesmaLinha = atual && atual.bloco === bloco && Math.abs(r.top - atual.top) < r.height * 0.5;
      if (!mesmaLinha) { atual = { bloco, top: r.top, unidades: [] }; linhas.push(atual); }
      atual.unidades.push(u);
    }
    obs = new IntersectionObserver(entradas => {
      // Lateral e leitura fazem cada uma a sua cascata, em paralelo; o passo encolhe quando
      // muitas linhas entram de uma vez, para a leva inteira caber em ~1s.
      const colunas = new Map();
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const coluna = e.target.closest('.lp-lateral') ? 'lateral' : 'leitura';
        if (!colunas.has(coluna)) colunas.set(coluna, []);
        colunas.get(coluna).push(e);
      }
      for (const lista of colunas.values()) {
        lista.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const passo = Math.min(PASSO_LINHA_MS, LEVA_MAX_MS / lista.length);
        lista.forEach((e, k) => {
          revelar(linhaDo.get(e.target), Math.round(k * passo));
          obs.unobserve(e.target);
        });
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    for (const l of linhas) {
      linhaDo.set(l.unidades[0], l.unidades);
      obs.observe(l.unidades[0]);
    }
  }

  // Mede depois da webfont (a quebra de linha muda com ela), mas sem esperar para sempre.
  Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]).then(montar);

  let espera;
  addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (document.querySelector('.lp-oculto')) montar(); }, 200);
  });
  document.addEventListener('animationend', e => {
    if (e.animationName === 'lp-entrada') e.target.classList.remove('lp-entra');
  });
}

// ── Fita da cor litúrgica ────────────────────────────────────────────────────
const NOME_COR = { roxo: 'roxa', branco: 'branca', verde: 'verde', vermelho: 'vermelha', rosa: 'rósea', preto: 'preta' };

function pendurarFita(cor) {
  const fita = document.getElementById('lp-fita');
  if (!fita || !NOME_COR[cor]) return;
  fita.dataset.cor = cor;
  fita.setAttribute('aria-label', `Cor litúrgica do dia: ${NOME_COR[cor]}`);
  fita.title = `Cor litúrgica: ${NOME_COR[cor]}`;
  fita.hidden = false;
}

// ── Avisos do calendário ─────────────────────────────────────────────────────
// indice.json › marcos (scripts/build-liturgia.mjs): Advento, Natal, Cinzas, dias de preceito…
// Contados a partir de hoje, não do dia aberto no calendário.
const AVISOS_MAX = 4;
const AVISO_MS = 5000;
const ATENCAO_DIAS = 21;

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
const diaCurto = iso => new Date(`${iso}T12:00:00`)
  .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
const semArtigo = s => s.replace(/^(?:o|a) /, '');

// Curto de propósito: cabe numa linha na lateral.
function textoDoAviso(m, n) {
  const rotulo = m.preceito ? 'Preceito' : m.jejum ? 'Jejum' : '';
  if (rotulo && n <= ATENCAO_DIAS) {
    const quando = n === 0 ? 'hoje' : n === 1 ? 'amanhã' : esc(diaCurto(m.data));
    return `<span class="lp-aviso-rotulo">${rotulo}</span>${quando} · <strong>${esc(semArtigo(m.curto))}</strong>`;
  }
  if (n <= 1) {
    const dia = n === 0 ? 'Hoje' : 'Amanhã';
    return m.inicio ? `${dia} começa <strong>${esc(m.curto)}</strong>` : `${dia}: <strong>${esc(semArtigo(m.curto))}</strong>`;
  }
  return `Faltam <strong>${n} dias</strong> para ${m.inicio ? 'começar ' : ''}${esc(m.curto)}`;
}

function montarAvisos(indice, hoje) {
  const wrap = document.getElementById('lp-avisos');
  if (!wrap || !indice?.marcos) return;

  const vistos = new Set();
  const avisos = [];
  for (const m of indice.marcos) {
    if (m.data < hoje || vistos.has(m.nome)) continue;
    vistos.add(m.nome);
    avisos.push(textoDoAviso(m, diasEntre(hoje, m.data)));
    if (avisos.length === AVISOS_MAX) break;
  }
  if (!avisos.length) return;

  const texto = wrap.querySelector('.lp-aviso-texto');
  texto.innerHTML = avisos[0];
  wrap.hidden = false;
  if (avisos.length < 2) return;

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let atual = 0;
  let pausado = false;
  let troca;
  function avancar() {
    atual = (atual + 1) % avisos.length;
    clearTimeout(troca);
    if (reduzido) { texto.innerHTML = avisos[atual]; return; }
    texto.classList.add('saindo');
    troca = setTimeout(() => {
      texto.innerHTML = avisos[atual];
      texto.classList.remove('saindo');
    }, 250);
  }

  setInterval(() => { if (!pausado && !document.hidden) avancar(); }, AVISO_MS);
  texto.addEventListener('click', avancar);
  wrap.addEventListener('mouseenter', () => { pausado = true; });
  wrap.addEventListener('mouseleave', () => { pausado = false; });
}

// ── Sobre a celebração (resumo da Wikipédia) ─────────────────────────────────
// data/santos/indice.json › { celebração: slug }; o texto vem pronto de scripts/build-santos.mjs.
const ICONE_SOBRE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6.6"/><path d="M8 7.2v4" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.25" fill="currentColor"/></svg>';

async function abrirSobre(slug, celebracao) {
  const dlg = document.getElementById('lp-santo');
  const corpo = document.getElementById('lp-santo-corpo');
  if (!dlg?.showModal) return;
  document.getElementById('lp-santo-titulo').textContent = celebracao;
  corpo.innerHTML = '<p class="lp-modal-carregando">Carregando…</p>';
  dlg.showModal();

  const dados = await buscarJson(`/data/santos/${slug}.json`);
  if (!dados) {
    corpo.innerHTML = '<p class="lp-modal-carregando">Não foi possível carregar o texto agora.</p>';
    return;
  }
  const varios = dados.artigos.length > 1;
  corpo.innerHTML = dados.artigos.map(a => `
    <section class="lp-modal-artigo">
      ${a.imagem ? `<img class="lp-modal-img" src="${esc(a.imagem.src)}" width="${a.imagem.largura}" height="${a.imagem.altura}" alt="${esc(a.titulo)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
      ${varios ? `<h3>${esc(a.titulo)}</h3>` : ''}
      ${a.resumo.map(p => `<p>${esc(p)}</p>`).join('')}
      <a class="lp-modal-link" href="${esc(a.url)}" target="_blank" rel="noopener">Ler o artigo completo na Wikipédia ↗</a>
    </section>`).join('');
}

function configurarModal() {
  const dlg = document.getElementById('lp-santo');
  if (!dlg) return;
  dlg.querySelector('.lp-modal-fechar').addEventListener('click', () => dlg.close());
  // Clique no fundo escurecido: o alvo é o próprio <dialog>, fora da caixa.
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

// ── Início ───────────────────────────────────────────────────────────────────
const buscarJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

async function init() {
  const hoje = hojeLocal();
  const pedida = new URLSearchParams(location.search).get('data') || '';
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoje;

  const [indice, dia, santos] = await Promise.all([
    buscarJson('/data/liturgia/indice.json'),
    buscarJson(`/data/liturgia/${dt}.json`),
    buscarJson('/data/santos/indice.json'),
  ]);

  preencherCabecalho(dt, dia, santos);
  montarAvisos(indice, hoje);
  configurarModal();
  construirCalendario(dt, hoje, indice);

  const conteudo = document.getElementById('conteudo');
  if (!dia) {
    conteudo.innerHTML = `<p class="erro">${dt === hoje ? 'Leituras de hoje não disponíveis.' : 'Leituras deste dia não disponíveis.'}</p>`;
    animarEntrada();
    return;
  }

  const [principal, ...outras] = dia.missas;
  const blocos = blocosDaMissa(principal, '');
  let html = blocos.map(renderBloco).join('');
  outras.forEach((missa, k) => {
    html += `
      <details class="missa-extra">
        <summary>${esc(missa.nome)}</summary>
        ${blocosDaMissa(missa, `m${k + 1}-`).map(renderBloco).join('')}
      </details>`;
  });
  conteudo.innerHTML = html;

  construirNav(blocos);
  configurarFlagButtons(dt);
  animarEntrada();
}

init();
