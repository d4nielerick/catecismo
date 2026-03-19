/**
 * theme.js — modo escuro compartilhado entre os dois catecismos.
 * Aplica data-theme="dark" no <html> e persiste via localStorage.
 */

const STORAGE_KEY = 'catecismo-theme';
const SVG_LUA  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SVG_SOL  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function temaAtual() {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (salvo) return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  document.querySelectorAll('.btn-tema-toggle').forEach(btn => {
    btn.innerHTML = tema === 'dark' ? SVG_SOL : SVG_LUA;
    btn.setAttribute('aria-label', tema === 'dark' ? 'Modo claro' : 'Modo escuro');
  });
}

export function iniciarTema() {
  aplicarTema(temaAtual());

  document.querySelectorAll('.btn-tema-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, novo);
      aplicarTema(novo);
    });
  });
}

// Aplica antes de qualquer import para evitar flash branco
aplicarTema(temaAtual());
