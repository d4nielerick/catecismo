/**
 * biblia.js
 * Busca de versículos na Bíblia Ave-Maria para enriquecer as notas de rodapé.
 */

// ── Cache por livro ───────────────────────────────────────────────────────────
const _livros   = new Map(); // abrev → caps object
const _promises = new Map(); // abrev → Promise em voo
let _nomes      = null;
let _nomesPromise = null;

async function _carregarNomes() {
  if (_nomes) return _nomes;
  if (_nomesPromise) return _nomesPromise;
  _nomesPromise = fetch('data/biblia/nomes.json')
    .then(r => r.json())
    .then(d => { _nomes = d; return d; });
  return _nomesPromise;
}

async function _carregarLivro(abrev) {
  if (_livros.has(abrev)) return _livros.get(abrev);
  if (_promises.has(abrev)) return _promises.get(abrev);
  const p = fetch(`data/biblia/${encodeURIComponent(abrev)}.json`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) _livros.set(abrev, d); return d; });
  _promises.set(abrev, p);
  return p;
}

// ── Mapa de abreviações alternativas → chave canônica do biblia.json ──────────
const ABREV = {
  // Variantes encontradas nas notas do Catecismo
  'Act': 'At',   // Atos (abreviação latina)
  'Heb': 'Hb',   // Hebreus
  'Jn':  'Jo',   // João (variante)
  'Job': 'Jó',   // Jó
  'Rom': 'Rm',   // Romanos
  'SI':  'Sl',   // Salmos (typo maiúscula)
  'Ec':  'Ecl',  // Eclesiastes
};

function _norm(abrev) {
  return ABREV[abrev] ?? abrev;
}

// ── Parser de referência bíblica ──────────────────────────────────────────────
// Extrai a primeira referência do tipo "Jo 3, 16" ou "1Cor10, 2" do texto da nota.
const _REF_RE = /([1-4]?[A-Za-zó]+)\s*(\d+)(?:-\d+)?[,\s]+(\d+)/;

export async function buscarVersiculo(textoNota) {
  if (!textoNota) return null;

  const m = textoNota.match(_REF_RE);
  if (!m) return null;

  const abrev = _norm(m[1]);
  const cap   = m[2];
  const vers  = m[3];

  let caps, nomes;
  try {
    [caps, nomes] = await Promise.all([_carregarLivro(abrev), _carregarNomes()]);
  } catch { return null; }

  const texto = caps?.[cap]?.[vers];
  if (!texto) return null;

  const nome = nomes?.[abrev] ?? abrev;
  return { referencia: `${nome} ${cap},${vers}`, texto };
}

// ── Card flutuante ────────────────────────────────────────────────────────────
const _card       = document.getElementById('biblia-card');
const _cardRef    = document.getElementById('biblia-card-ref');
const _cardNota   = document.getElementById('biblia-card-nota');
const _cardTexto  = document.getElementById('biblia-card-texto');
const _cardFechar = document.getElementById('biblia-card-fechar');

if (_cardFechar) {
  _cardFechar.addEventListener('click', ocultarCard);
}

// Fechar ao clicar fora do card
document.addEventListener('click', e => {
  if (_card && !_card.classList.contains('oculto') && !_card.contains(e.target)) {
    ocultarCard();
  }
});

// Fechar com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') ocultarCard();
});

// Desktop: clique numa nota com referência bíblica → mostra só o versículo
export function mostrarCard(referencia, texto) {
  if (!_card) return;
  _cardRef.textContent    = referencia;
  _cardNota.textContent   = '';
  _cardNota.style.display = 'none';
  _cardTexto.textContent  = texto;
  _cardTexto.style.display = '';
  _card.classList.remove('oculto');
}

// Mobile: tap numa nota → mostra texto da nota + versículo (se houver)
export function mostrarCardMobile(refNum, noteText, verse) {
  if (!_card) return;
  _cardRef.textContent    = `Nota ${refNum}`;
  _cardNota.textContent   = noteText;
  _cardNota.style.display = '';
  if (verse) {
    _cardTexto.textContent   = `${verse.referencia}: "${verse.texto}"`;
    _cardTexto.style.display = '';
  } else {
    _cardTexto.textContent   = '';
    _cardTexto.style.display = 'none';
  }
  _card.classList.remove('oculto');
}

export function ocultarCard() {
  _card?.classList.add('oculto');
}
