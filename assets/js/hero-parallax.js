/**
 * hero-parallax.js — leve efeito de profundidade na cena da hero (CIC).
 * A foto inteira (fundo + figura) desloca junto, mais devagar que o scroll,
 * enquanto o título (que não é tocado aqui) segue no ritmo normal — é esse
 * descompasso entre os dois que dá a sensação de profundidade.
 *
 * Fundo e figura têm que se mover JUNTOS e na mesma taxa: a figura é um
 * recorte do mesmo papa que já aparece na foto de fundo, só que na frente do
 * título. Taxas diferentes destroem esse alinhamento e "duplicam" o papa.
 */

const FATOR   = 0.22;
const MAX_PX  = 36;

export function iniciarParallaxHero() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const hero = document.querySelector('#hero.hero-foto');
  if (!hero) return;

  const fundo  = hero.querySelector('.hero-cena-fundo');
  const figura = hero.querySelector('.hero-cena-figura');
  if (!fundo && !figura) return;

  let ticking = false;

  function atualizar() {
    ticking = false;
    const rect = hero.getBoundingClientRect();

    // Fora da tela (com folga) — não gasta trabalho calculando.
    if (rect.bottom < -200 || rect.top > innerHeight + 200) return;

    const deslocado = Math.max(0, -rect.top);
    const y = Math.min(deslocado * FATOR, MAX_PX);
    const t = `translate3d(0, ${y}px, 0)`;
    if (fundo) fundo.style.transform = t;
    if (figura) figura.style.transform = t;
  }

  function aoRolar() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(atualizar);
  }

  window.addEventListener('scroll', aoRolar, { passive: true });
  atualizar();
}
