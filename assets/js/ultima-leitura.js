/**
 * ultima-leitura.js — lembra o último parágrafo aberto para oferecer
 * "continuar lendo" na hero. Só o CIC usa; persiste em localStorage.
 */

const STORAGE_KEY = 'catecismo-ultima-leitura';
const TRECHO_MAX = 90;

/** Tira os marcadores de nota "(12)" e normaliza espaços para o resumo do chip. */
function limparTrecho(texto = '') {
  const limpo = texto.replace(/\(\d+\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (limpo.length <= TRECHO_MAX) return limpo;
  // Corta na última palavra inteira antes do limite.
  const corte = limpo.slice(0, TRECHO_MAX);
  return corte.slice(0, corte.lastIndexOf(' ')) + '…';
}

export function salvarUltimaLeitura(p) {
  if (!p || !p.numero) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      numero: p.numero,
      trecho: limparTrecho(p.texto),
      quando: Date.now(),
    }));
  } catch {
    // Modo privado/quota cheia: continuar lendo é conveniência, não bloqueia nada.
  }
}

export function lerUltimaLeitura() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return dados && dados.numero ? dados : null;
  } catch {
    return null;
  }
}
