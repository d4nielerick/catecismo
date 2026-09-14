/**
 * perguntar.js — página do hub de perguntas ao Catecismo.
 *
 * Tudo o que vem da API é inserido com textContent: a resposta é texto de
 * modelo, e o trecho dos §§ passa por ela.
 */

const form      = document.getElementById('pq-form');
const campo     = document.getElementById('pq-campo');
const botao     = document.getElementById('pq-botao');
const exemplos  = document.getElementById('pq-exemplos');
const resultado = document.getElementById('pq-resultado');

const el = (tag, classe, texto) => {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texto != null) n.textContent = texto;
  return n;
};

/** Lista de §§ com trecho e link para abrir no leitor do Catecismo. */
function listaDeParagrafos(itens, prefixoId) {
  const ul = el('ul', 'pq-lista');
  for (const { numero, trecho } of itens) {
    const li = document.createElement('li');
    const a = el('a', 'pq-item');
    a.href = `../#paragrafo-${numero}`;
    if (prefixoId) a.id = `${prefixoId}-${numero}`;
    a.append(
      el('span', 'pq-item-num', `§${numero}`),
      el('span', 'pq-item-trecho', trecho),
      el('span', 'pq-item-ler', 'Ler no Catecismo →'),
    );
    li.appendChild(a);
    ul.appendChild(li);
  }
  return ul;
}

/** Leva ao § citado na lista abaixo e o realça por um instante. */
function irParaCitado(numero) {
  const alvo = document.getElementById(`citado-${numero}`);
  if (!alvo) return;
  const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
  alvo.classList.add('realce');
  setTimeout(() => alvo.classList.remove('realce'), 1400);
}

/** Texto da resposta com cada [§N] virando um botão discreto. */
function paragrafoDaResposta(texto) {
  const p = el('p', 'pq-resposta');
  for (const parte of texto.split(/(\[§\d+\])/g)) {
    const m = parte.match(/^\[§(\d+)\]$/);
    if (!m) { p.appendChild(document.createTextNode(parte)); continue; }
    const numero = Number(m[1]);
    const b = el('button', 'pq-cita', `§${numero}`);
    b.type = 'button';
    b.setAttribute('aria-label', `Ver o parágrafo ${numero}`);
    b.addEventListener('click', () => irParaCitado(numero));
    p.appendChild(b);
  }
  return p;
}

function renderizar(pergunta, dados) {
  resultado.replaceChildren(el('p', 'pq-pergunta-eco', `«${pergunta}»`));

  if (dados.tipo === 'resposta') {
    resultado.append(
      paragrafoDaResposta(dados.texto),
      el('h2', 'pq-rotulo', dados.citados.length > 1 ? 'Parágrafos citados' : 'Parágrafo citado'),
      listaDeParagrafos(dados.citados, 'citado'),
    );
    if (dados.relacionados?.length) {
      resultado.append(
        el('h2', 'pq-rotulo', 'Também tratam do assunto'),
        listaDeParagrafos(dados.relacionados),
      );
    }
    return;
  }

  // Não encontrado: dizer isso com clareza é a função, não uma falha.
  resultado.append(el('p', 'pq-vazio-titulo', 'Não encontrei resposta a essa pergunta no Catecismo.'));
  if (dados.relacionados?.length) {
    resultado.append(
      el('p', 'pq-vazio-sub', 'Estes parágrafos tratam de assuntos próximos:'),
      listaDeParagrafos(dados.relacionados),
    );
  } else {
    resultado.append(el('p', 'pq-vazio-sub', 'Tente perguntar com outras palavras.'));
  }
}

let emAndamento = false;

async function perguntar(pergunta) {
  pergunta = pergunta.replace(/\s+/g, ' ').trim();
  if (pergunta.length < 6 || emAndamento) return;

  emAndamento = true;
  botao.disabled = true;
  exemplos.hidden = true;
  resultado.replaceChildren(el('p', 'pq-carregando', 'Procurando no Catecismo…'));

  const url = new URL(location.href);
  url.searchParams.set('q', pergunta);
  history.replaceState(null, '', url);

  try {
    const resp = await fetch('/api/pergunta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta }),
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.error || 'Não foi possível responder agora. Tente novamente.');
    renderizar(pergunta, dados);
  } catch (err) {
    resultado.replaceChildren(el('p', 'pq-erro', err.message || 'Não foi possível responder agora.'));
  } finally {
    emAndamento = false;
    botao.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  campo.blur(); // fecha o teclado no celular para a resposta aparecer
  perguntar(campo.value);
});

exemplos.addEventListener('click', (e) => {
  const b = e.target.closest('.pq-exemplo');
  if (!b) return;
  campo.value = b.textContent;
  perguntar(b.textContent);
});

// Link compartilhado ou vindo da busca: ?q=...
const inicial = new URLSearchParams(location.search).get('q');
if (inicial) {
  campo.value = inicial;
  perguntar(inicial);
}
