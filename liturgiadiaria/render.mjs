/**
 * render.mjs — desenho da Liturgia Diária, sem DOM.
 *
 * Usado pela página (liturgiadiaria.js) e pelo gerador das páginas de cada dia
 * (scripts/build-paginas-liturgia.mjs): o HTML que o Google lê é o mesmo que o navegador desenha.
 */

export const pad = n => String(n).padStart(2, '0');

// Data do aparelho, não UTC: às 22h em Brasília toISOString() já é o dia seguinte.
export function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const COR_PONTO = { roxo: '#7c3aed', branco: '#b8972e', verde: '#15803d', vermelho: '#dc2626', rosa: '#db2777', preto: '#44403c' };
export const COR_FUNDO = { roxo: '#f0ecf8', branco: '#faf7ee', verde: '#edf5ef', vermelho: '#f8edeb', rosa: '#f8edf2', preto: '#eeeceb' };

// ── Texto ────────────────────────────────────────────────────────────────────
export const VERSO = /^\d+[a-z]?$|^\d+,\d+[a-z]?$|^[a-z]$/;
export const OU = '<span class="salmo-ou">ou</span>';

/** Capitular: a primeira letra do texto, grande, como nos missais. O número do versículo fica de fora. */
const capitular = s => s.replace(/^([^\p{L}]*)(\p{L})/u, (_, antes, letra) =>
  `${antes}<span class="capitular" data-letra="${letra.toUpperCase()}">${letra}</span>`);

export function renderProsa(texto) {
  let html = '';
  let primeira = true;
  for (const l of texto.split('\n')) {
    if (VERSO.test(l)) { html += `<sup class="vers-num">${esc(l)}</sup>`; continue; }
    let corpo = esc(l);
    if (primeira && /\p{L}/u.test(corpo)) { corpo = capitular(corpo); primeira = false; }
    html += `${corpo} `;
  }
  return `<p>${html.trim()}</p>`;
}

export function renderPoema(texto) {
  return `<p>${texto.split('\n').map(esc).join('<br>')}</p>`;
}

export function renderSalmo(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  let i = 0;
  const refrao = [];
  if (/^R\.?(\s|$)/.test(linhas[0] || '')) {
    const resto = linhas[0].replace(/^R\.?\s*/, '');
    if (resto) refrao.push(esc(resto));
    // O refrão termina no primeiro versículo (número ou linha com "*" de mediação).
    for (i = 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (VERSO.test(l) || l.includes('*')) break;
      if (/^R\.?$/.test(l)) continue;
      refrao.push(/^Ou:?$/i.test(l) ? OU : esc(l));
    }
  }

  let html = refrao.length ? `<div class="salmo-refrao"><span class="salmo-r-label">R.</span>${refrao.join(' ')}</div>` : '';
  let estrofe = '';
  const fechar = () => { if (estrofe) html += `<div class="salmo-estrofe">${estrofe}</div>`; estrofe = ''; };
  for (; i < linhas.length; i++) {
    const l = linhas[i].replace(/[*†]/g, '').trim();
    if (!l) continue;
    if (/^R\.?$/.test(l)) { fechar(); html += '<div class="salmo-r-sep">R.</div>'; continue; }
    if (/^R\.\s/.test(l)) { fechar(); html += `<div class="salmo-r-sep com-texto">R. ${esc(l.slice(2).trim())}</div>`; continue; }
    if (VERSO.test(l)) { estrofe += `<sup class="vers-num">${esc(l)}</sup>`; continue; }
    // Estrofe em texto corrido, como no layout (a linha do salmo não quebra).
    estrofe += /^Ou:?$/i.test(l) ? `${OU} ` : `${esc(l)} `;
  }
  fechar();
  return html;
}

export function renderAclamacao(texto) {
  let html = '';
  let modo = null;
  let buf = [];
  const fechar = () => {
    if (!buf.length) return;
    if (modo === 'R') html += `<div class="salmo-refrao"><span class="salmo-r-label">R.</span>${buf.join('<br>')}</div>`;
    else if (modo === 'V') html += `<div class="acl-verso"><span class="salmo-r-label">V.</span>${buf.join('<br>')}</div>`;
    else html += `<p>${buf.join('<br>')}</p>`;
    buf = [];
  };
  for (const l of texto.split('\n').map(x => x.trim()).filter(Boolean)) {
    const m = l.match(/^([RV])\.\s*(.*)$/);
    if (m) { fechar(); modo = m[1]; if (m[2]) buf.push(esc(m[2])); continue; }
    buf.push(/^Ou:?$/i.test(l) ? OU : esc(l));
  }
  fechar();
  return html;
}

export function corpoLeitura(s) {
  const texto = s.tipo === 'salmo' ? renderSalmo(s.texto)
    : s.tipo === 'aclamacao' ? renderAclamacao(s.texto)
    : s.tipo === 'sequencia' ? renderPoema(s.texto)
    : renderProsa(s.texto);
  const titulo = s.titulo ? `<p class="leitura-titulo">${esc(s.titulo)}</p>` : '';
  return `${titulo}<div class="leitura-texto">${texto}</div>`;
}

export const rotuloCompleto = s => s.rotulo + (s.variante ? ` (${s.variante})` : '');

// ── Cards ────────────────────────────────────────────────────────────────────
export const ANCORA = { salmo: 'salmo', sequencia: 'sequencia', aclamacao: 'aclamacao', evangelho: 'evangelho' };
export function ancora(s) {
  if (s.tipo !== 'leitura') return ANCORA[s.tipo];
  return s.rotulo === '1ª Leitura' ? 'primeira-leitura' : s.rotulo === '2ª Leitura' ? 'segunda-leitura' : s.rotulo === 'Epístola' ? 'epistola' : `leitura-${parseInt(s.rotulo, 10)}`;
}

/** Agrupa cada leitura com as suas alternativas ("ou…") e gera ids únicos. */
export function blocosDaMissa(missa, prefixo) {
  const blocos = [];
  const usados = new Map();
  for (const s of missa.leituras) {
    if (s.alternativa && blocos.length) { blocos.at(-1).alternativas.push(s); continue; }
    const base = prefixo + ancora(s);
    const n = (usados.get(base) || 0) + 1;
    usados.set(base, n);
    blocos.push({ leitura: s, id: n > 1 ? `${base}-${n}` : base, alternativas: [] });
  }
  return blocos;
}

export function renderBloco({ leitura: s, id, alternativas }) {
  const alts = alternativas.map(a => `
      <details class="leitura-alt">
        <summary><span class="leitura-alt-ou">ou</span> ${esc(rotuloCompleto(a))}${a.referencia ? ` · ${esc(a.referencia)}` : ''}</summary>
        ${corpoLeitura(a)}
      </details>`).join('');
  return `
    <article class="leitura-card${s.tipo === 'evangelho' ? ' card-evangelho' : ''}${['aclamacao', 'sequencia'].includes(s.tipo) ? ' secao-menor' : ''}" id="${id}">
      <div class="leitura-label">${esc(rotuloCompleto(s))}</div>
      ${s.referencia ? `<div class="leitura-ref">${esc(s.referencia)}</div>` : ''}
      ${corpoLeitura(s)}
      ${alts}
    </article>`;
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────
// Dia marcado no calendário na cor litúrgica (a branca vira dourado, para aparecer no fundo claro).
export const COR_CALENDARIO = { roxo: '#5b2d86', verde: '#1f6e3d', vermelho: '#b8282a', rosa: '#c7688b', preto: '#262422', branco: '#b8972e' };
// Tons pastéis da cor litúrgica para o título ("Liturgia Diária"): presentes sem chamar atenção.
export const COR_TITULO = { roxo: '#9585b3', verde: '#7ba287', vermelho: '#cc8b82', rosa: '#d7a3b5', preto: '#8a837c', branco: '#c9b27a' };
export const DIA_DA_SEMANA =/\b(?:Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado)\b/;
export const semTempo = s => s.replace(/\s+d[oa] (?:Tempo Comum|Páscoa|Advento|Quaresma|Tempo do Natal)$/, ''); // o tempo já está no selo
// Nome do temporal ("24º Domingo do Tempo Comum", "Quinta-feira da 24ª Semana…"): vira a linha de baixo da data.
const TEMPORAL = /^(?:\d+º Domingo\b|\d+º dia da Oitava|(?:Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado) (?:da \d+ª Semana|depois d|da Oitava|do Tempo do Natal))/;
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Cabeçalho do dia ─────────────────────────────────────────────────────────
const MEIO_DIA = d => new Date(`${d}T12:00:00Z`);
const formatar = (d, opcoes) => MEIO_DIA(d).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });

/** Textos do cabeçalho: a data grande ("16/set"), embaixo o dia da semana e a semana do tempo
 *  ("Quarta-feira da 24ª Semana") e, só quando é uma celebração própria, o nome dela. Nada se repete:
 *  num dia do temporal o nome já está na linha de baixo; numa festa que já diz o dia da semana
 *  ("Quarta-feira de Cinzas"), a linha de baixo some. */
export function cabecalhoDoDia(dt, dia) {
  const [, m, d] = dt.split('-').map(Number);
  const celebracao = dia?.celebracao || '';
  const temporal = TEMPORAL.test(celebracao);
  // A linha de baixo já diz o tempo litúrgico (o selo "Tempo Comum" saiu da página).
  const tempo = dia?.tempo || '';
  let linha = [formatar(dt, { weekday: 'long' }), tempo].filter(Boolean).join(' · ');
  if (dia?.complemento) linha = dia.complemento;
  else if (temporal) linha = celebracao;
  else if (DIA_DA_SEMANA.test(celebracao)) linha = tempo;
  const extenso = formatar(dt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return {
    dataCurta: `${d}/${MES_CURTO[m - 1]}`,
    dataExtenso: extenso[0].toUpperCase() + extenso.slice(1),
    dataLonga: formatar(dt, { day: 'numeric', month: 'long', year: 'numeric' }),
    linha,
    nome: temporal ? '' : celebracao,
    tempo: dia?.tempo || '',
    celebracao: dia?.celebracao || '',
    cor: dia?.cor || '',
    corPonto: COR_PONTO[dia?.cor] || '',
    corDia: COR_CALENDARIO[dia?.cor] || '',
    corTitulo: COR_TITULO[dia?.cor] || '',
  };
}

export const NOME_COR = { roxo: 'roxa', branco: 'branca', verde: 'verde', vermelho: 'vermelha', rosa: 'rósea', preto: 'preta' };

// ── Leituras, abas e outros dias ─────────────────────────────────────────────
export const urlDoDia = d => `/liturgiadiaria/${d}/`;

/** Referências da missa principal que o resumo cobre; se mudarem, o resumo fica desatualizado. */
export const referenciasDoDia = dia => dia.missas[0].leituras
  .filter(l => !l.alternativa && ['leitura', 'salmo', 'evangelho'].includes(l.tipo))
  .map(l => l.referencia).join(' | ');

/** Resumo das leituras (data/liturgia-resumos/). "Hoje" só quando o dia aberto é o de hoje:
 *  nas páginas de cada dia (geradas) e nos outros dias, "Neste dia". */
export function resumoHtml(resumo, { hoje = false } = {}) {
  if (!resumo?.texto) return '';
  return `
    <section class="lp-resumo" aria-label="Resumo das leituras">
      <p class="lp-resumo-rotulo">Resumo das leituras <button type="button" class="lp-resumo-botao" aria-expanded="false">mostrar</button></p>
      <p class="lp-resumo-texto">${hoje ? 'Hoje' : 'Neste dia'}, ${esc(resumo.texto)}</p>
    </section>`;
}

/** A aclamação não é desenhada: o evangelho vem logo depois do salmo. */
export const naPagina = blocos => blocos.filter(b => b.leitura.tipo !== 'aclamacao');

/** HTML das leituras do dia (missa principal + outras missas recolhidas) e os blocos da principal. */
export function conteudoDoDia(dia, resumo = null, opcoes = {}) {
  const [principal, ...outras] = dia.missas;
  const blocos = naPagina(blocosDaMissa(principal, ''));
  const valido = resumo && resumo.leituras === referenciasDoDia(dia);
  let html = (valido ? resumoHtml(resumo, opcoes) : '') + blocos.map(renderBloco).join('');
  outras.forEach((missa, k) => {
    html += `
      <details class="missa-extra">
        <summary>${esc(missa.nome)}</summary>
        ${naPagina(blocosDaMissa(missa, `m${k + 1}-`)).map(renderBloco).join('')}
      </details>`;
  });
  return { html, blocos };
}

/** Abas do alto da coluna: uma por leitura (a aclamação e a sequência ficam de fora). */
export const itensDasAbas = blocos => blocos.filter(b => !['aclamacao', 'sequencia'].includes(b.leitura.tipo));
export const abasHtml = blocos => itensDasAbas(blocos)
  .map(({ leitura, id }, i) => `<a href="#${id}"${i === 0 ? ' class="ativa"' : ''}>${esc(leitura.rotulo)}</a>`).join('');

export function somarDias(d, n) {
  const t = MEIO_DIA(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Dia anterior · hoje · dia seguinte (só os que têm leituras). */
export function diasHtml(dt, indice) {
  const existe = d => indice && d >= indice.inicio && d <= indice.fim;
  const rotulo = d => { const [, m, dd] = d.split('-').map(Number); return `${dd}/${MES_CURTO[m - 1]}`; };
  const ant = somarDias(dt, -1);
  const prox = somarDias(dt, 1);
  return [
    existe(ant) ? `<a class="lp-dia-ant" href="${urlDoDia(ant)}" rel="prev">← ${rotulo(ant)}</a>` : '<span></span>',
    '<a class="lp-dia-hoje" href="/liturgiadiaria/">Liturgia de hoje</a>',
    existe(prox) ? `<a class="lp-dia-prox" href="${urlDoDia(prox)}" rel="next">${rotulo(prox)} →</a>` : '<span></span>',
  ].join('');
}
