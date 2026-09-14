/**
 * liturgia.js — Widget da Liturgia do Dia (hero da home)
 * Lê data/liturgia/AAAA-MM-DD.json (scripts/build-liturgia.mjs) e mostra um resumo com link
 * para a página completa (/liturgiadiaria/).
 */

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Data do aparelho, não UTC: às 22h em Brasília toISOString() já é o dia seguinte.
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function iniciarLiturgia() {
  const el = document.getElementById('liturgia-widget');
  if (!el) return;

  const hoje = hojeLocal();

  try {
    const res = await fetch(`/data/liturgia/${hoje}.json`);
    if (!res.ok) { el.remove(); return; }

    const d  = await res.json();
    const ev = d.missas?.[0]?.leituras.find(s => s.tipo === 'evangelho' && !s.alternativa);
    const titulo = d.celebracao || d.tempo || 'Liturgia do Dia';
    const teaser = d.tempo && d.tempo !== titulo ? d.tempo : 'Leituras do dia.';

    el.innerHTML = `
      <a class="liturgia-inner" href="/liturgiadiaria/" style="display:block;text-decoration:none;">
        <span class="liturgia-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <path d="M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z"/>
          </svg>
          ${esc(titulo)}
        </span>
        ${ev?.referencia ? `<p class="liturgia-tema">Evangelho · ${esc(ev.referencia)}</p>` : ''}
        <p class="liturgia-resumo">${esc(teaser)}</p>
        <span class="liturgia-para-link">Ler a liturgia de hoje →</span>
      </a>
    `;
    el.classList.remove('oculto');
  } catch {
    el.remove();
  }
}
