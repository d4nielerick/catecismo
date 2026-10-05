/**
 * metricas.mjs — eventos do Umami (cliques de compartilhar e de apoio).
 *
 * Só conta no site de verdade: localhost e testes não entram nos números. Sem o rastreador
 * (bloqueador de anúncios, rede lenta) não faz nada e nunca atrapalha a página.
 */

const SITE_REAL = /(^|\.)santadoutrina\.(com|cloud)$/;

export function evento(nome, dados) {
  if (!SITE_REAL.test(location.hostname)) return;
  try { window.umami?.track(nome, dados); } catch { /* sem rastreador */ }
}
