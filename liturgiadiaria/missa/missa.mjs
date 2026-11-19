/**
 * Modo Missa (protótipo): a missa do dia em telas, uma parte por vez, para acompanhar no banco.
 *
 * As leituras vêm de data/liturgia/AAAA-MM-DD.json (as mesmas da Liturgia Diária). O Ordinário da
 * Missa está aqui em tradução de trabalho feita do latim (Ordo Missae); quando a CNBB autorizar,
 * entra o texto oficial do Missal Romano. Orações próprias do dia (coleta, oferendas, depois da
 * comunhão) e as Orações Eucarísticas não estão nos dados: a tela só diz o que está acontecendo.
 *
 * Nas partes de recolhimento (Consagração e Comunhão) a tela escurece e solta o "manter a tela
 * acesa": o próprio app pede para guardar o celular.
 */
import { hojeLocal, esc, corpoLeitura, COR_PONTO, NOME_COR } from '../render.mjs';

// ── Textos ──────────────────────────────────────────────────────────────────
// s = sacerdote, p = povo (resposta), r = rubrica (o que acontece), t = texto livre
const S = t => ({ s: t });
const P = t => ({ p: t });
const R = t => ({ r: t });

const GLORIA = 'Glória a Deus nas alturas, e paz na terra aos homens por ele amados. Nós vos louvamos, nós vos bendizemos, nós vos adoramos, nós vos glorificamos, nós vos damos graças por vossa imensa glória. Senhor Deus, Rei dos céus, Deus Pai todo-poderoso. Senhor Jesus Cristo, Filho Unigênito, Senhor Deus, Cordeiro de Deus, Filho de Deus Pai. Vós que tirais o pecado do mundo, tende piedade de nós. Vós que tirais o pecado do mundo, acolhei a nossa súplica. Vós que estais à direita do Pai, tende piedade de nós. Só vós sois o Santo, só vós o Senhor, só vós o Altíssimo, Jesus Cristo, com o Espírito Santo, na glória de Deus Pai. Amém.';

const CREDO_NICENO = 'Creio em um só Deus, Pai todo-poderoso, criador do céu e da terra, de todas as coisas visíveis e invisíveis. Creio em um só Senhor, Jesus Cristo, Filho Unigênito de Deus, nascido do Pai antes de todos os séculos: Deus de Deus, luz da luz, Deus verdadeiro de Deus verdadeiro; gerado, não criado, consubstancial ao Pai. Por ele todas as coisas foram feitas. E por nós, homens, e para a nossa salvação, desceu dos céus [todos se inclinam] e se encarnou pelo Espírito Santo, no seio da Virgem Maria, e se fez homem. Também por nós foi crucificado sob Pôncio Pilatos; padeceu e foi sepultado. Ressuscitou ao terceiro dia, conforme as Escrituras, e subiu aos céus, onde está sentado à direita do Pai. E de novo há de vir, em sua glória, para julgar os vivos e os mortos; e o seu reino não terá fim. Creio no Espírito Santo, Senhor que dá a vida, que procede do Pai e do Filho; e com o Pai e o Filho é adorado e glorificado: ele que falou pelos profetas. Creio na Igreja una, santa, católica e apostólica. Professo um só batismo para a remissão dos pecados. E espero a ressurreição dos mortos e a vida do mundo que há de vir. Amém.';

const CREDO_APOSTOLOS = 'Creio em Deus Pai todo-poderoso, criador do céu e da terra; e em Jesus Cristo, seu único Filho, nosso Senhor, que foi concebido pelo poder do Espírito Santo; nasceu da Virgem Maria; padeceu sob Pôncio Pilatos, foi crucificado, morto e sepultado; desceu à mansão dos mortos; ressuscitou ao terceiro dia; subiu aos céus; está sentado à direita de Deus Pai todo-poderoso, donde há de vir a julgar os vivos e os mortos. Creio no Espírito Santo, na santa Igreja Católica, na comunhão dos santos, na remissão dos pecados, na ressurreição da carne, na vida eterna. Amém.';

const PAI_NOSSO = 'Pai nosso que estais nos céus, santificado seja o vosso nome; venha a nós o vosso reino; seja feita a vossa vontade, assim na terra como no céu. O pão nosso de cada dia nos dai hoje; perdoai-nos as nossas ofensas, assim como nós perdoamos a quem nos tem ofendido; e não nos deixeis cair em tentação, mas livrai-nos do mal.';

const COMUNHAO_ESPIRITUAL = 'Meu Jesus, creio que estais presente no Santíssimo Sacramento. Amo-vos sobre todas as coisas e desejo receber-vos em minha alma. Já que agora não posso receber-vos sacramentalmente, vinde ao menos espiritualmente ao meu coração. Como se já tivésseis vindo, eu vos abraço e me uno todo a vós. Não permitais que eu jamais me separe de vós. Amém.';

const ORACOES_EUCARISTICAS = [
  ['I', 'Cânon Romano', 'a mais antiga e a mais longa; o sacerdote lembra pelo nome os apóstolos e os mártires de Roma.'],
  ['II', 'Oração Eucarística II', 'a mais breve, a de muitos dias de semana; tem um prefácio próprio.'],
  ['III', 'Oração Eucarística III', 'comum aos domingos; pede que nos tornemos uma oferenda perfeita.'],
  ['IV', 'Oração Eucarística IV', 'percorre a história da salvação, da criação até Cristo; prefácio próprio.'],
  ['R', 'Da Reconciliação (I ou II)', 'usada em tempos penitenciais, como a Quaresma.'],
  ['D', 'Para diversas circunstâncias', 'em missas por necessidades particulares.'],
];

const EVANGELISTA = { Mt: 'Mateus', Mc: 'Marcos', Lc: 'Lucas', Jo: 'João' };

// ── Regras do dia ───────────────────────────────────────────────────────────
const ehDomingo = d => { const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd).getDay() === 0; };
const ehSolenidade = dia => /Solenidade|Natal|Páscoa|Ascensão|Pentecostes|Santíssima Trindade|Corpo e Sangue|Imaculada|Assunção|Todos os Santos|Rei do Universo|Sagrado Coração|Aparecida|São José|Pedro e (São )?Paulo/i.test(dia.celebracao || '');
const temGloria = (d, dia) => ehSolenidade(dia) || /Festa/i.test(dia.celebracao || '')
  || (ehDomingo(d) && !/Advento|Quaresma/.test(dia.tempo || ''));
const temCredo = (d, dia) => ehDomingo(d) || ehSolenidade(dia);

// ── Montagem das telas ──────────────────────────────────────────────────────
function falas(itens) {
  return itens.map(i => i.s ? `<p class="mm-s"><span class="mm-quem">Sacerdote</span>${esc(i.s)}</p>`
    : i.p ? `<p class="mm-p"><span class="mm-quem">Todos</span>${esc(i.p)}</p>`
    : i.r ? `<p class="mm-r">${esc(i.r)}</p>`
    : `<p>${esc(i.t)}</p>`).join('');
}

// Oração própria do dia (se o arquivo local existir); senão, só a rubrica
const propria = (rotulo, texto) => texto
  ? `<div class="mm-propria"><span class="mm-quem">${esc(rotulo)}</span>${esc(texto)}<span class="mm-credito">Missal Romano · © Edições CNBB</span></div>` : '';

function montarPassos(d, dia, missa, or = {}) {
  const passos = [];
  const add = (secao, titulo, html, extra = {}) => passos.push({ secao, titulo, html, ...extra });

  // Ritos iniciais
  const RI = 'Ritos iniciais';
  add(RI, 'Entrada', propria('Antífona de entrada', or.antifonas?.entrada) + falas([R('Canto de entrada. Todos de pé.'), S('Em nome do Pai e do Filho e do Espírito Santo.'), P('Amém.'),
    S('A graça de nosso Senhor Jesus Cristo, o amor do Pai e a comunhão do Espírito Santo estejam convosco.'), P('E com o teu espírito.')]));
  add(RI, 'Ato penitencial', falas([R('O sacerdote convida a reconhecer os pecados. Silêncio.'),
    P('Confesso a Deus todo-poderoso e a vós, irmãos e irmãs, que pequei muitas vezes por pensamentos e palavras, atos e omissões: por minha culpa, minha culpa, minha máxima culpa. E peço à Virgem Maria, a todos os Anjos e Santos e a vós, irmãos e irmãs, que rogueis por mim a Deus, nosso Senhor.'),
    S('Deus todo-poderoso tenha compaixão de nós, perdoe os nossos pecados e nos conduza à vida eterna.'), P('Amém.'),
    R('Pode ser usada outra fórmula; nela também se responde às invocações.')]));
  add(RI, 'Senhor, tende piedade', falas([S('Senhor, tende piedade de nós.'), P('Senhor, tende piedade de nós.'),
    S('Cristo, tende piedade de nós.'), P('Cristo, tende piedade de nós.'), S('Senhor, tende piedade de nós.'), P('Senhor, tende piedade de nós.')]));
  if (temGloria(d, dia)) add(RI, 'Glória', falas([R('Hino de louvor, rezado ou cantado.'), P(GLORIA)]));
  add(RI, 'Oração do dia', falas([S('Oremos.'), R(or.coleta ? 'Silêncio. Depois o sacerdote reza:' : 'Silêncio. O sacerdote reza a oração própria do dia (coleta).')])
    + propria('Coleta', or.coleta) + falas([P('Amém.'), R('Todos se sentam.')]));

  // Liturgia da Palavra
  const LP = 'Liturgia da Palavra';
  for (const s of missa.leituras) {
    if (s.alternativa) continue; // "ou…": a principal basta para acompanhar
    const cab = `<div class="mm-ref">${esc(s.referencia || '')}</div>`;
    if (s.tipo === 'leitura') {
      add(LP, s.rotulo, cab + corpoLeitura(s) + falas([S('Palavra do Senhor.'), P('Graças a Deus.')]), { leitura: true });
    } else if (s.tipo === 'salmo') {
      add(LP, 'Salmo responsorial', cab + falas([R('Todos repetem o refrão (R.) depois de cada estrofe.')]) + corpoLeitura(s), { leitura: true });
    } else if (s.tipo === 'sequencia') {
      add(LP, s.rotulo || 'Sequência', cab + corpoLeitura(s), { leitura: true });
    } else if (s.tipo === 'aclamacao') {
      add(LP, 'Aclamação ao Evangelho', falas([R('Todos de pé.')]) + corpoLeitura(s), { leitura: true });
    } else if (s.tipo === 'evangelho') {
      const ev = EVANGELISTA[(s.referencia || '').split(' ')[0]] || '';
      add(LP, 'Evangelho', cab + falas([S('O Senhor esteja convosco.'), P('E com o teu espírito.'),
        S(`Proclamação do Evangelho de Jesus Cristo${ev ? ` segundo ${ev}` : ''}.`), P('Glória a vós, Senhor.')])
        + corpoLeitura(s) + falas([S('Palavra da Salvação.'), P('Glória a vós, Senhor.')]), { leitura: true, evangelho: true });
    }
  }
  add(LP, 'Homilia', falas([R('Todos sentados. Ouça a homilia: o sacerdote explica a Palavra que acabou de ser proclamada.')])
    + `<p class="mm-calmo">Nada para ler aqui.</p>`);
  if (temCredo(d, dia)) add(LP, 'Profissão de fé', falas([R('Todos de pé.'), P(CREDO_NICENO)])
    + `<details class="mm-alt"><summary>Às vezes se reza o Símbolo dos Apóstolos</summary>${falas([P(CREDO_APOSTOLOS)])}</details>`);
  add(LP, 'Oração dos fiéis', falas([R('Preces pela Igreja, pelo mundo, pelos que sofrem e pela comunidade. A resposta é anunciada no começo; a mais comum:'),
    P('Senhor, escutai a nossa prece.')]));

  // Liturgia Eucarística
  const LE = 'Liturgia Eucarística';
  add(LE, 'Apresentação das oferendas', falas([R('Todos sentados. Canto e coleta. O sacerdote prepara o altar com o pão e o vinho.'),
    R('Se as orações sobre o pão e o vinho forem ditas em voz alta, responde-se:'), P('Bendito seja Deus para sempre.'),
    S('Orai, irmãos e irmãs, para que o meu e o vosso sacrifício seja aceito por Deus Pai todo-poderoso.'),
    P('Receba o Senhor por tuas mãos este sacrifício, para louvor e glória do seu nome, para nosso bem e de toda a sua santa Igreja.'),
    R('Todos de pé. O sacerdote reza a oração sobre as oferendas.')]) + propria('Sobre as oferendas', or.oferendas) + falas([P('Amém.')]));
  add(LE, 'Prefácio e Santo', falas([S('O Senhor esteja convosco.'), P('E com o teu espírito.'), S('Corações ao alto.'), P('O nosso coração está em Deus.'),
    S('Demos graças ao Senhor, nosso Deus.'), P('É digno e justo.'), R('O sacerdote reza o prefácio, um louvor que muda conforme o tempo e a festa.'),
    P('Santo, Santo, Santo, Senhor Deus do universo. O céu e a terra proclamam a vossa glória. Hosana nas alturas! Bendito o que vem em nome do Senhor! Hosana nas alturas!'),
    R('Todos se ajoelham (onde for o costume).')]));
  add(LE, 'Oração Eucarística', `${falas([R('O centro da missa. O sacerdote reza em nome de todos; o povo acompanha em silêncio. Qual delas está sendo rezada?')])}
    <ul class="mm-oe">${ORACOES_EUCARISTICAS.map(([n, nome, desc]) => `<li><button type="button" data-oe="${n}"><strong>${esc(nome)}</strong><span>${esc(desc)}</span></button></li>`).join('')}</ul>
    <p class="mm-nota">O texto completo de cada Oração Eucarística entra depois da autorização da CNBB.</p>`, { oe: true });
  add(LE, 'Consagração', `<p class="mm-recolhe-titulo">Consagração</p>
    <p class="mm-recolhe-texto">O pão e o vinho se tornam o Corpo e o Sangue de Cristo.<br>Olhe para o altar e adore.</p>
    <p class="mm-recolhe-dica">Guarde o celular. Toque em › quando o sacerdote disser “Eis o mistério da fé”.</p>`, { recolhimento: true });
  add(LE, 'Mistério da fé', falas([S('Eis o mistério da fé.'), P('Anunciamos, Senhor, a vossa morte e proclamamos a vossa ressurreição, até que venhais.'),
    R('A oração eucarística continua: o sacerdote reza pela Igreja, pelos vivos e pelos falecidos.'),
    S('Por Cristo, com Cristo e em Cristo, a vós, Deus Pai todo-poderoso, na unidade do Espírito Santo, toda a honra e toda a glória, por todos os séculos dos séculos.'),
    P('Amém.')]));

  // Rito da Comunhão
  const RC = 'Rito da Comunhão';
  add(RC, 'Pai-Nosso', falas([R('Todos de pé.'), P(PAI_NOSSO), R('O sacerdote continua sozinho e pede a paz.'),
    P('Vosso é o reino, o poder e a glória para sempre.')]));
  add(RC, 'Paz e Cordeiro de Deus', falas([S('A paz do Senhor esteja sempre convosco.'), P('E com o teu espírito.'), R('Saudação da paz.'),
    P('Cordeiro de Deus, que tirais o pecado do mundo, tende piedade de nós. Cordeiro de Deus, que tirais o pecado do mundo, tende piedade de nós. Cordeiro de Deus, que tirais o pecado do mundo, dai-nos a paz.')]));
  add(RC, 'Eis o Cordeiro de Deus', falas([S('Felizes os convidados para a ceia do Senhor. Eis o Cordeiro de Deus, que tira o pecado do mundo.'),
    P('Senhor, eu não sou digno de que entreis em minha morada, mas dizei uma só palavra e a minha alma será curada.')]));
  add(RC, 'Comunhão', `<p class="mm-recolhe-titulo">Comunhão</p>
    <p class="mm-recolhe-texto">Guarde o celular e vá em paz ao encontro do Senhor.</p>
    ${or.antifonas?.comunhao ? `<p class="mm-recolhe-dica">${esc(or.antifonas.comunhao)}</p>` : ''}
    <details class="mm-alt mm-recolhe-alt"><summary>Se não for comungar: comunhão espiritual</summary>${falas([P(COMUNHAO_ESPIRITUAL)])}</details>
    <p class="mm-recolhe-dica">Toque em › quando o sacerdote disser “Oremos”.</p>`, { recolhimento: true });
  add(RC, 'Oração depois da comunhão', falas([S('Oremos.'), R(or.comunhao ? 'O sacerdote reza:' : 'O sacerdote reza a oração própria do dia.')])
    + propria('Depois da comunhão', or.comunhao) + falas([P('Amém.'), R('Avisos da comunidade, se houver.')]));

  // Ritos finais
  const RF = 'Ritos finais';
  add(RF, 'Bênção e despedida', falas([S('O Senhor esteja convosco.'), P('E com o teu espírito.'),
    S('Abençoe-vos Deus todo-poderoso, Pai e Filho e Espírito Santo.'), P('Amém.'), S('Ide em paz, e o Senhor vos acompanhe.'), P('Graças a Deus.')])
    + `<p class="mm-calmo">A missa terminou. Boa semana.</p>`);
  return passos;
}

// ── Estado e tela ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };

let passos = [];
let atual = 0;
let chaveDia = '';
let travaTela = null;

async function manterAcesa(sim) {
  try {
    if (sim && !travaTela && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      travaTela = await navigator.wakeLock.request('screen');
      travaTela.addEventListener('release', () => { travaTela = null; });
    } else if (!sim && travaTela) { await travaTela.release(); travaTela = null; }
  } catch { travaTela = null; }
}

function mostrar(i, { rolar = true } = {}) {
  atual = Math.max(0, Math.min(passos.length - 1, i));
  const p = passos[atual];
  $('mm-secao').textContent = p.secao;
  $('mm-passo').textContent = p.titulo;
  const palco = $('mm-palco');
  palco.innerHTML = `<section class="mm-tela${p.leitura ? ' mm-leitura' : ''}${p.evangelho ? ' mm-evangelho' : ''}">${p.html}</section>`;
  if (rolar) palco.scrollTop = 0;
  document.body.classList.toggle('mm-recolhido', !!p.recolhimento);
  manterAcesa(!p.recolhimento);
  $('mm-ant').disabled = atual === 0;
  $('mm-prox').disabled = atual === passos.length - 1;
  for (const [k, el] of [...$('mm-barra').children].entries()) el.classList.toggle('feito', k <= atual);
  for (const li of $('mm-lista').children) li.classList.toggle('atual', +li.dataset.i === atual);
  if (p.oe) {
    const escolhida = ler(`mm-oe-${chaveDia}`);
    palco.querySelectorAll('[data-oe]').forEach(b => {
      b.classList.toggle('escolhida', b.dataset.oe === escolhida);
      b.addEventListener('click', () => { guardar(`mm-oe-${chaveDia}`, b.dataset.oe); mostrar(atual, { rolar: false }); });
    });
  }
  guardar(`mm-pos-${chaveDia}`, String(atual));
}

const ir = n => mostrar(atual + n);

function tamanho(delta) {
  const atualT = parseFloat(ler('mm-tamanho') || '1');
  const novo = Math.max(0.85, Math.min(1.6, +(atualT + delta).toFixed(2)));
  document.documentElement.style.setProperty('--mm-escala', novo);
  guardar('mm-tamanho', String(novo));
}

async function iniciar() {
  const q = new URLSearchParams(location.search).get('data');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : hojeLocal();
  chaveDia = d;
  document.documentElement.style.setProperty('--mm-escala', ler('mm-tamanho') || '1');
  let dia;
  try {
    const r = await fetch(`/data/liturgia/${d}.json`);
    if (!r.ok) throw new Error(r.status);
    dia = await r.json();
  } catch {
    $('mm-palco').innerHTML = '<section class="mm-tela"><p class="mm-calmo">Não encontrei as leituras deste dia.</p></section>';
    $('mm-passo').textContent = d;
    return;
  }
  document.documentElement.style.setProperty('--mm-cor', COR_PONTO[dia.cor] || '#b8972e');
  const n = Math.max(0, Math.min(dia.missas.length - 1, parseInt(new URLSearchParams(location.search).get('missa') || '0', 10) || 0));
  // Orações próprias do dia (scripts/baixa-oracoes-missa.mjs); sem o arquivo, só a rubrica
  let or = {};
  try { const r = await fetch(`/data/liturgia-oracoes/${d}.json`); if (r.ok) or = await r.json(); } catch {}
  passos = montarPassos(d, dia, dia.missas[n], or);
  passos.unshift({ secao: dia.celebracao, titulo: 'Antes de começar', html: `
    <p class="mm-abertura-cel">${esc(dia.celebracao)}</p>
    <p class="mm-abertura-tempo">${esc(dia.tempo || '')}${dia.cor ? ` · cor ${esc(NOME_COR[dia.cor] || dia.cor)}` : ''}</p>
    ${dia.missas.length > 1 ? `<p class="mm-r">Hoje há mais de uma missa: ${dia.missas.map((m, i) => `<a href="?data=${d}&missa=${i}"${i === n ? ' aria-current="true"' : ''}>${esc(m.nome || `missa ${i + 1}`)}</a>`).join(' · ')}</p>` : ''}
    <p class="mm-abertura-dica">Uma parte da missa por tela. Toque em <strong>›</strong> ou deslize para o lado para avançar.
    Na Consagração e na Comunhão a tela escurece: é hora de guardar o celular.</p>
    <p class="mm-abertura-dica">Ponha o celular no silencioso antes de começar.</p>` });

  const barra = $('mm-barra');
  barra.innerHTML = passos.map(() => '<i></i>').join('');
  $('mm-lista').innerHTML = passos.map((p, i) => `${i === 0 || p.secao !== passos[i - 1].secao ? `<li class="mm-lista-secao" aria-hidden="true">${esc(i === 0 ? 'Início' : p.secao)}</li>` : ''}<li data-i="${i}"><button type="button">${esc(p.titulo)}</button></li>`).join('');
  [...$('mm-lista').querySelectorAll('li[data-i]')].forEach(li => li.querySelector('button').addEventListener('click', () => { $('mm-indice').close(); mostrar(+li.dataset.i); }));

  const salvo = parseInt(ler(`mm-pos-${d}`) || '0', 10);
  mostrar(Number.isFinite(salvo) ? salvo : 0);
}

// ── Controles ───────────────────────────────────────────────────────────────
$('mm-ant').addEventListener('click', () => ir(-1));
$('mm-prox').addEventListener('click', () => ir(1));
$('mm-menor').addEventListener('click', () => tamanho(-0.1));
$('mm-maior').addEventListener('click', () => tamanho(0.1));
$('mm-indice-btn').addEventListener('click', () => { $('mm-indice').showModal(); $('mm-lista').querySelector('.atual')?.scrollIntoView({ block: 'center' }); });
$('mm-indice-fechar').addEventListener('click', () => $('mm-indice').close());
document.addEventListener('keydown', e => {
  if ($('mm-indice').open) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') ir(1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') ir(-1);
});
// Deslizar para o lado troca de parte (o rolar vertical continua lendo o texto)
let toque = null;
$('mm-palco').addEventListener('touchstart', e => { const t = e.touches[0]; toque = { x: t.clientX, y: t.clientY }; }, { passive: true });
$('mm-palco').addEventListener('touchend', e => {
  if (!toque) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - toque.x, dy = t.clientY - toque.y;
  toque = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('visibilitychange', () => { if (passos.length && !passos[atual].recolhimento) manterAcesa(true); });

iniciar();
