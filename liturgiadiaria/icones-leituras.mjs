/**
 * icones-leituras.mjs — ícones das abas das leituras (barra de baixo, no celular).
 *
 * Símbolos de traço grosso, não ilustrações: bastam para reconhecer a leitura num relance.
 * A cor vem do CSS (currentColor): apagado nas abas paradas, escuro na ativa.
 *   leitura   — pergaminho (1ª leitura e as demais: Antigo Testamento, Atos)
 *   carta     — envelope (2ª leitura: as epístolas)
 *   salmo     — nota musical (o salmo é cantado)
 *   evangelho — livro com a cruz
 */
const DESENHOS = {
  leitura: '<path d="M6 4.5h11.5a2.5 2.5 0 0 1 0 5H17v8a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1 0-5H7v-7.5a2.5 2.5 0 0 0-1-2.5Z"/><path d="M6.5 14.5h8M10 9.5h4M10 12h4"/>',
  carta: '<rect x="3.5" y="6" width="17" height="12.5" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
  salmo: '<path d="M9 18V6.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  evangelho: '<path d="M5.5 5.5A2 2 0 0 1 7.5 3.5h11v15h-11a2 2 0 0 0-2 2Z"/><path d="M5.5 20.5a2 2 0 0 1 2-2h11v2.5"/><path d="M12 7v7M9.5 9.5h5"/>',
};

/** SVG em linha do ícone pedido. */
export function icone(nome) {
  return `<svg class="lp-aba-icone" viewBox="0 0 24 24" aria-hidden="true">${DESENHOS[nome] || DESENHOS.leitura}</svg>`;
}

/** Qual ícone cabe a cada leitura. */
export function iconeDaLeitura(leitura) {
  if (leitura.tipo === 'salmo') return 'salmo';
  if (leitura.tipo === 'evangelho') return 'evangelho';
  if (/^2ª|Epístola/.test(leitura.rotulo)) return 'carta';
  return 'leitura';
}
