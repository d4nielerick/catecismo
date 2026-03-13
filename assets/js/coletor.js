/**
 * coletor.js
 * Coleta trechos do Catecismo e persiste em localStorage.
 * Gerencia o off-canvas e as exportações (TXT, MD, clipboard).
 */

const STORAGE_KEY = 'catecismo_coletor_v1';

// ── Persistência ──────────────────────────────────────────────────────────────

function carregar() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function salvar(lista) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

// ── API de dados ──────────────────────────────────────────────────────────────

export function obterTrechos() { return carregar(); }
export function contagem()     { return carregar().length; }

export function contemNumero(numero) {
  return carregar().some(p => p.numero === numero);
}

export function adicionarTrecho(paragrafo) {
  const lista = carregar();
  // Seleções (tipo:'selecao') podem ser múltiplas; parágrafos completos bloqueiam duplicatas
  if (!paragrafo.tipo && lista.some(p => p.numero === paragrafo.numero && !p.tipo)) return false;
  lista.push({ ...paragrafo, adicionadoEm: Date.now() });
  salvar(lista);
  return true;
}

export function removerTrecho(numero) {
  salvar(carregar().filter(p => p.numero !== numero));
}

export function limparTrechos() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Formatação e exportação ───────────────────────────────────────────────────

function contexto(p) {
  return [p.parte, p.secao, p.capitulo, p.artigo].filter(Boolean).join(' › ');
}

function formatarTxt(lista) {
  const sep = '\n\n' + '─'.repeat(60) + '\n\n';
  return lista.map(p => {
    const ctx = contexto(p);
    return `§${p.numero}\n${ctx ? ctx + '\n' : ''}${p.texto}`;
  }).join(sep);
}

function formatarMd(lista) {
  return lista.map(p => {
    const ctx = contexto(p);
    return `### §${p.numero}\n${ctx ? `*${ctx}*\n\n` : ''}${p.texto}`;
  }).join('\n\n---\n\n');
}

export function copiarTudo() {
  return navigator.clipboard.writeText(formatarTxt(carregar()));
}

export function baixar(formato) {
  const lista = carregar();
  if (!lista.length) return;
  const conteudo = formato === 'md' ? formatarMd(lista) : formatarTxt(lista);
  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `catecismo-trechos.${formato}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UI do off-canvas ──────────────────────────────────────────────────────────

const overlay  = document.getElementById('coletor-overlay');
const panel    = document.getElementById('coletor-panel');
const lista    = document.getElementById('coletor-lista');
const vazio    = document.getElementById('coletor-vazio');
const contEl   = document.getElementById('coletor-contagem');
const badge    = document.getElementById('badge-coletor');
const btnAbrir = document.getElementById('btn-coletor');

let _onMudanca = null; // callback para ui.js atualizar o botão roving

export function onMudanca(fn) { _onMudanca = fn; }

function notificar() { if (_onMudanca) _onMudanca(); }

export function atualizarBadge() {
  const n = contagem();
  if (badge)    badge.textContent = n;
  if (btnAbrir) btnAbrir.classList.toggle('oculto', n === 0);
}

function criarCard(p) {
  const ctx = contexto(p);
  const div = document.createElement('div');
  div.className = 'coletor-card';
  div.dataset.num = p.numero;

  div.innerHTML = `
    <div class="coletor-card-meta">
      <span class="coletor-card-num">§${p.numero}</span>
      ${ctx ? `<span class="coletor-card-ctx">${escHtml(ctx)}</span>` : ''}
      <button class="coletor-card-remover" aria-label="Remover §${p.numero}" type="button">×</button>
    </div>
    <p class="coletor-card-texto">${escHtml(p.texto)}</p>
  `;

  div.querySelector('.coletor-card-remover').addEventListener('click', () => {
    removerTrecho(p.numero);
    div.remove();
    renderizarLista();
    atualizarBadge();
    notificar();
  });

  return div;
}

function renderizarLista() {
  const trechos = carregar();
  lista.innerHTML = '';
  contEl.textContent = trechos.length === 1 ? '1 trecho' : `${trechos.length} trechos`;

  if (!trechos.length) {
    vazio.classList.remove('oculto');
    return;
  }
  vazio.classList.add('oculto');
  const frag = document.createDocumentFragment();
  trechos.forEach(p => frag.appendChild(criarCard(p)));
  lista.appendChild(frag);
}

export function abrirColetor() {
  renderizarLista();
  panel.classList.add('aberto');
  panel.setAttribute('aria-hidden', 'false');
  overlay.classList.remove('oculto');
  document.body.style.overflow = 'hidden';
}

export function fecharColetor() {
  panel.classList.remove('aberto');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.add('oculto');
  document.body.style.overflow = '';
}

// ── Inicialização dos eventos ─────────────────────────────────────────────────

document.getElementById('coletor-fechar')
  .addEventListener('click', fecharColetor);

overlay.addEventListener('click', fecharColetor);

btnAbrir.addEventListener('click', abrirColetor);

document.getElementById('coletor-copiar-tudo').addEventListener('click', (e) => {
  copiarTudo().then(() => {
    const btn = e.currentTarget;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar tudo'; }, 2000);
  });
});

document.getElementById('coletor-baixar-txt')
  .addEventListener('click', () => baixar('txt'));

document.getElementById('coletor-baixar-md')
  .addEventListener('click', () => baixar('md'));

document.getElementById('coletor-limpar').addEventListener('click', () => {
  if (!carregar().length) return;
  limparTrechos();
  renderizarLista();
  atualizarBadge();
  notificar();
});

// Badge no load
atualizarBadge();

// ── Helper ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Exportar função para ui.js usar ao adicionar ──────────────────────────────
export function adicionarEAbrir(paragrafo) {
  const adicionado = adicionarTrecho(paragrafo);
  atualizarBadge();
  notificar();
  abrirColetor();
  return adicionado;
}
