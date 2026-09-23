/**
 * icones-leituras.mjs — ícones das abas das leituras (barra de baixo, no celular).
 *
 * Símbolos de traço grosso, não ilustrações: bastam para reconhecer a leitura num relance.
 * A cor vem do CSS (currentColor): apagado nas abas paradas, escuro na ativa.
 *   leitura   — pergaminho com o número da leitura em algarismo romano (I, II… nas vigílias até VII)
 *   salmo     — nota musical (o salmo é cantado)
 *   evangelho — livro com a cruz
 */
const PERGAMINHO = '<path d="M6 4.5h11.5a2.5 2.5 0 0 1 0 5H17v8a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1 0-5H7v-7.5a2.5 2.5 0 0 0-1-2.5Z"/>';
const DESENHOS = {
  salmo: '<path d="M9 18V6.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  evangelho: '<path d="M5.5 5.5A2 2 0 0 1 7.5 3.5h11v15h-11a2 2 0 0 0-2 2Z"/><path d="M5.5 20.5a2 2 0 0 1 2-2h11v2.5"/><path d="M12 7v7M9.5 9.5h5"/>',
};
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** SVG em linha do ícone pedido; para 'leitura', n é o número da leitura (1 = I). */
export function icone(nome, n = 1) {
  if (nome !== 'leitura') return `<svg class="lp-aba-icone" viewBox="0 0 24 24" aria-hidden="true">${DESENHOS[nome]}</svg>`;
  const rom = ROMANOS[n - 1] || String(n);
  // o numeral encolhe conforme o número de letras, para caber no corpo do pergaminho
  const corpo = rom.length === 1 ? 8.6 : rom.length === 2 ? 7.4 : 5.8;
  return `<svg class="lp-aba-icone" viewBox="0 0 24 24" aria-hidden="true">${PERGAMINHO}`
    + `<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" font-size="${corpo}" class="lp-aba-numeral">${rom}</text></svg>`;
}

/** Qual ícone (e número) cabe a cada leitura. */
export function iconeDaLeitura(leitura) {
  if (leitura.tipo === 'salmo') return ['salmo'];
  if (leitura.tipo === 'evangelho') return ['evangelho'];
  const n = parseInt(leitura.rotulo, 10);     // "1ª Leitura" → 1, "2ª Leitura" → 2, vigília: "3ª Leitura"…
  return ['leitura', /Epístola/.test(leitura.rotulo) ? 2 : (Number.isFinite(n) ? n : 1)];
}
