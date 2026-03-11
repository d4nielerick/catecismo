/**
 * router.js
 * Hash routing: #paragrafo-N
 *
 * Ao carregar com um hash, ou ao navegar para um hash,
 * abre o parágrafo correspondente no painel direito.
 *
 * Depende de ui.js exportar ativarBuscaEAbrirParagrafo().
 */

import { ativarBuscaEAbrirParagrafo } from './ui.js';

function handleHash() {
  const hash = location.hash; // e.g. "#paragrafo-1234"
  if (!hash.startsWith('#paragrafo-')) return;

  const numero = parseInt(hash.replace('#paragrafo-', ''), 10);
  if (Number.isFinite(numero) && numero > 0) {
    ativarBuscaEAbrirParagrafo(numero);
  }
}

// Ao navegar por botões do browser (voltar/avançar)
window.addEventListener('hashchange', handleHash);

// Ao carregar com hash já na URL (ui.js também faz isso no boot,
// mas router.js garante que funciona mesmo se carregado depois)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleHash);
} else {
  handleHash();
}
