/**
 * liturgia.js — Widget da Liturgia do Dia
 * Carrega data/liturgia/YYYY-MM-DD.json e exibe no hero.
 */

export async function iniciarLiturgia() {
  const el = document.getElementById('liturgia-widget');
  if (!el) return;

  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`/data/liturgia/${hoje}.json`);
    if (!res.ok) { el.remove(); return; }
    const d = await res.json();
    if (!d.tema) { el.remove(); return; }

    el.innerHTML = `
      <div class="liturgia-inner">
        <span class="liturgia-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <path d="M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z"/>
          </svg>
          ${d.tempo_liturgico || 'Liturgia do Dia'}
        </span>
        <p class="liturgia-tema">${d.tema}</p>
        <p class="liturgia-reflexao">${d.reflexao}</p>
        ${d.paragrafos.length ? `
          <div class="liturgia-paragrafos">
            ${d.paragrafos.map(p => `
              <a href="/#paragrafo-${p.id}" class="liturgia-para-link" title="${p.motivo}">§${p.id}</a>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    el.classList.remove('oculto');
  } catch {
    el.remove();
  }
}
