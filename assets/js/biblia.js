/**
 * biblia.js
 * Busca de versículos na Bíblia Ave-Maria para enriquecer as notas de rodapé.
 */

// ── Cache ─────────────────────────────────────────────────────────────────────
let _biblia   = null;
let _promise  = null;

async function _carregar() {
  if (_biblia)   return _biblia;
  if (_promise)  return _promise;
  _promise = fetch('data/biblia.json')
    .then(r => r.json())
    .then(d => { _biblia = d; return d; });
  return _promise;
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

  let biblia;
  try { biblia = await _carregar(); } catch { return null; }

  const texto = biblia.index?.[abrev]?.[cap]?.[vers];
  if (!texto) return null;

  const nome = biblia.nomes?.[abrev] ?? abrev;
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
