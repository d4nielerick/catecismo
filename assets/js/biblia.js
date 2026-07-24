/**
 * biblia.js
 * Busca de versículos na Bíblia Ave-Maria para enriquecer as notas de rodapé.
 */
import { extrairReferencias } from './biblia-refs.js';

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

// ── Resolução de versículos ───────────────────────────────────────────────────

/** [17,19,20] → "17,19-20" (colapsa runs consecutivos, para rótulos compactos). */
function _colapsa(nums) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    runs.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return runs.join(',');
}

/** Resolve TODAS as referências bíblicas de uma nota → [{referencia, texto, …}].
 *  Trata glue, intervalos e múltiplas refs (via biblia-refs.js). Limita a
 *  `maxVersos` para não gerar tooltips gigantes. */
export async function buscarVersiculos(textoNota, maxVersos = 6) {
  const refs = extrairReferencias(textoNota);
  if (!refs.length) return [];
  const nomes = await _carregarNomes().catch(() => ({}));
  const out = [];
  for (const { abrev, cap, versos } of refs) {
    let caps;
    try { caps = await _carregarLivro(abrev); } catch { continue; }
    if (!caps) continue;
    const nome = nomes?.[abrev] ?? abrev;
    for (const v of versos) {
      const texto = caps?.[cap]?.[String(v)];
      if (!texto) continue;
      out.push({ abrev, nome, cap, v, referencia: `${nome} ${cap},${v}`, texto: texto.replace(/\*+/g, '').trim() });
      if (out.length >= maxVersos) return out;
    }
  }
  return out;
}

/** Compat (usado pelos tooltips): uma referência combinada — rótulo compacto
 *  (ex.: "Romanos 1,19-20") + texto de todos os versículos resolvidos. */
export async function buscarVersiculo(textoNota) {
  const vs = await buscarVersiculos(textoNota);
  if (!vs.length) return null;
  const grupos = [];
  for (const v of vs) {
    const chave = `${v.nome} ${v.cap}`;
    let g = grupos.find((x) => x.chave === chave);
    if (!g) { g = { chave, nome: v.nome, cap: v.cap, versos: [] }; grupos.push(g); }
    g.versos.push(v.v);
  }
  const referencia = grupos.map((g) => `${g.nome} ${g.cap},${_colapsa(g.versos)}`).join('; ');
  const texto = vs.length === 1 ? vs[0].texto : vs.map((v) => `${v.v}. ${v.texto}`).join('  ');
  return { referencia, texto };
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
