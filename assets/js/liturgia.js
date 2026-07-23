/**
 * liturgia.js — Widget da Liturgia do Dia (hero da home)
 * Lê data/liturgia/YYYY-MM-DD-leituras.json e mostra um resumo com link para
 * a página completa (/liturgiadiaria/).
 */

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function iniciarLiturgia() {
  const el = document.getElementById('liturgia-widget');
  if (!el) return;

  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`/data/liturgia/${hoje}-leituras.json`);
    if (!res.ok) { el.remove(); return; }

    const d  = await res.json();
    const ev = d.evangelho || {};

    // Evangelista a partir do texto ("...segundo Mateus")
    const m = (ev.texto || '').match(/segundo\s+([A-Za-zÀ-ÿ]+)/i);
    const refEvangelho = [m ? m[1] : '', ev.referencia].filter(Boolean).join(' ');
    const titulo = d.titulo || 'Liturgia do Dia';
    const teaser = 'Leituras do dia.';

    el.innerHTML = `
      <a class="liturgia-inner" href="/liturgiadiaria/" style="display:block;text-decoration:none;">
        <span class="liturgia-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <path d="M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z"/>
          </svg>
          ${esc(titulo)}
        </span>
        ${refEvangelho ? `<p class="liturgia-tema">Evangelho · ${esc(refEvangelho)}</p>` : ''}
        <p class="liturgia-resumo">${esc(teaser)}</p>
        <span class="liturgia-para-link">Ler a liturgia de hoje →</span>
      </a>
    `;
    el.classList.remove('oculto');
  } catch {
    el.remove();
  }
}
