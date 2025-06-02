// --- DOM Elements ---
const campoBusca = document.getElementById('campo-busca');
const botaoBuscar = document.getElementById('botao-buscar');
const resultadosDiv = document.getElementById('resultados');
const conteudoDiv = document.getElementById('conteudo');
const buscaContainer = document.getElementById('busca-container');
const statusMessagesDiv = document.getElementById('status-messages');

// --- State & Cache ---
let cache = [];
let ultimoArquivoCarregado = null;
let termoAtualBusca = '';
let cacheHTMLInteiro = {};
let proximoIdParagrafo = 0;

// --- Configuration ---
const ARQUIVOS_CATECISMO = [
  { nome: 'Parte 1', url: 'assets/Catecismo Parte 1 Interativo.html' },
  { nome: 'Parte 2', url: 'assets/Catecismo Segunda Parte Interativo.html' },
  { nome: 'Parte 3', url: 'assets/Catecismo Terceira Parte Interativo.html' }
];
const MIN_SEARCH_TERM_LENGTH = 2;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  if (botaoBuscar && campoBusca) {
    botaoBuscar.addEventListener('click', executarBusca);
    campoBusca.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executarBusca();
      }
    });
  } else {
    console.error("Elementos de busca (campo ou botão) não encontrados.");
  }
  carregarTodosOsArquivos();
});

// --- Core Functions ---

async function carregarTodosOsArquivos() {
  if (statusMessagesDiv) statusMessagesDiv.textContent = 'Carregando dados do Catecismo...';
  resultadosDiv.classList.add('oculto');
  conteudoDiv.classList.add('oculto');

  let arquivosCarregados = 0;
  console.log("INICIANDO CARREGAMENTO DE ARQUIVOS PARA CACHE");

  for (const arquivo of ARQUIVOS_CATECISMO) {
    console.log(`Processando arquivo: ${arquivo.url}`);
    try {
      const response = await fetch(arquivo.url);
      if (!response.ok) {
        console.error(`Erro HTTP ao carregar ${arquivo.url}: ${response.status} ${response.statusText}`);
        continue;
      }
      const html = await response.text();
      // console.log(`HTML de ${arquivo.url} (primeiros 500 chars):`, html.substring(0, 500));

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      let ultimaParte = "";
      let ultimoCapitulo = "";
      // MUDANÇA AQUI: Selecionar todos os elementos que podem ser marcadores OU conteúdo textual
      // Isso garante que processamos na ordem do documento.
      const todosElementosRelevantes = doc.querySelectorAll('body .marcacao, body .titulo, body .paragrafo, body .ponto-com-notas, body .subtitulo, body h1, body h2, body h3, body h4, body h5, body h6, body p');
      // Adicionei mais seletores comuns como h*, p para garantir que pegamos texto mesmo sem classes específicas,
      // mas priorizaremos os que têm as classes que você usa.

      console.log(`Encontrados ${todosElementosRelevantes.length} elementos relevantes (marcadores, títulos, parágrafos) em ${arquivo.url}`);

      todosElementosRelevantes.forEach(el => {
        // console.log("Processando elemento:", el.tagName, el.className, el.textContent.substring(0, 50)); // Log detalhado

        // Lógica para atualizar marcadores de PARTE e CAPÍTULO
        if (el.classList.contains('marcacao')) {
          if (el.classList.contains('parte')) {
            ultimaParte = el.textContent.trim();
            ultimoCapitulo = ""; // Resetar capítulo ao encontrar nova parte
            // console.log("Nova Parte detectada:", ultimaParte);
          } else if (el.classList.contains('capitulo') || el.closest('.capitulo')) { // Se a classe 'capitulo' estiver no elemento ou em um ancestral próximo
            // Tenta pegar o texto do h2 dentro da section.capitulo, se for essa a estrutura
            let textoCapitulo = el.textContent.trim();
            if (el.closest('.capitulo')) { // Se 'el' for um .marcacao dentro de um .capitulo
                const sectionCapitulo = el.closest('.capitulo');
                const h2Capitulo = sectionCapitulo ? sectionCapitulo.querySelector('h2') : null;
                if (h2Capitulo) textoCapitulo = h2Capitulo.textContent.trim();
            }
            ultimoCapitulo = textoCapitulo;
            // console.log("Novo Capítulo detectado:", ultimoCapitulo);
          }
          // Se for um marcador, não é conteúdo para cache, então pulamos o resto do loop para este elemento
          return;
        }

        // Lógica para adicionar PARÁGRAFOS e PONTOS COM NOTAS ao cache
        // Adicionamos uma verificação mais genérica para <p> sem classe específica, mas priorizamos suas classes.
        // Também verificamos se o elemento não é um título já tratado por marcacao.
        let isConteudoParaCache = el.classList.contains('paragrafo') || el.classList.contains('ponto-com-notas');
        
        // Se for um <p> genérico, sem ser um marcador ou título já processado, consideramos também.
        if (el.tagName === 'P' && !el.classList.contains('marcacao') && !el.classList.contains('titulo')) {
            isConteudoParaCache = true;
        }

        if (isConteudoParaCache) {
          const elementoClone = el.cloneNode(true);
          elementoClone.querySelectorAll('.nota-associada').forEach(nota => nota.remove());
          const textoLimpo = elementoClone.textContent.trim();
          // console.log(`[${arquivo.nome}] Elemento (${el.tagName}.${el.className}): Texto limpo para cache: "${textoLimpo}"`);

          if (textoLimpo) {
            const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
            let localizacaoFormatada = "";
            if (ultimaParte && ultimoCapitulo) {
              localizacaoFormatada = `${ultimaParte} – ${ultimoCapitulo}`;
            } else if (ultimaParte) {
              localizacaoFormatada = ultimaParte;
            } else if (ultimoCapitulo) { // Menos provável se parte reseta capítulo
              localizacaoFormatada = ultimoCapitulo;
            }

            cache.push({
              id: paragrafoId,
              texto: textoLimpo,
              htmlOriginal: el.outerHTML,
              arquivoUrl: arquivo.url,
              arquivoNome: arquivo.nome,
              localizacao: localizacaoFormatada
            });
            // console.log("Item adicionado ao cache. Cache agora com:", cache.length, "itens.");
          } else {
            // console.log(`[${arquivo.nome}] Texto limpo estava vazio para o elemento (${el.tagName}.${el.className}).`);
          }
        }
      });
      arquivosCarregados++;
      console.log(`Arquivo ${arquivo.url} processado. Cache atual com ${cache.length} itens.`);
    } catch (error) {
      console.error(`Falha CRÍTICA ao processar o arquivo ${arquivo.url}:`, error);
      if (statusMessagesDiv) statusMessagesDiv.textContent = `Erro ao carregar ${arquivo.nome}. Tente recarregar a página.`;
    }
  }

  console.log(`FINALIZADO: Cache preenchido com ${cache.length} itens.`); // Este é o log que você já viu
  if (statusMessagesDiv) {
    if (arquivosCarregados === ARQUIVOS_CATECISMO.length && cache.length > 0) {
      statusMessagesDiv.textContent = `Catecismo carregado. Pronto para busca. (${cache.length} parágrafos indexados)`;
      setTimeout(() => { if(statusMessagesDiv && statusMessagesDiv.textContent.startsWith("Catecismo carregado")) statusMessagesDiv.textContent = ""; }, 5000);
    } else if (cache.length === 0 && arquivosCarregados > 0) {
      statusMessagesDiv.textContent = 'Nenhum conteúdo indexado. Verifique a estrutura dos arquivos HTML.';
      console.warn("Nenhum item foi adicionado ao cache, mas os arquivos parecem ter sido carregados. Verifique os seletores CSS e a estrutura do HTML dos arquivos do Catecismo.");
    } else if (arquivosCarregados === 0 && ARQUIVOS_CATECISMO.length > 0) {
      statusMessagesDiv.textContent = 'Erro: Nenhum arquivo do Catecismo pôde ser carregado.';
      console.error("Nenhum arquivo do Catecismo pôde ser carregado. Verifique os caminhos dos arquivos e a aba 'Network' para erros de fetch.");
    } else if (cache.length === 0 && arquivosCarregados === 0 && ARQUIVOS_CATECISMO.length === 0) {
        statusMessagesDiv.textContent = 'Nenhum arquivo configurado para carregar.';
    }
  }

  if (cache.length > 0) {
    console.log("Exemplo do primeiro item no cache:", JSON.stringify(cache[0], null, 2));
  }
}

function executarBusca() {
  const termo = campoBusca.value.trim().toLowerCase();
  console.log("Termo buscado:", termo); // Log do termo
  termoAtualBusca = termo;

  resultadosDiv.innerHTML = '';
  conteudoDiv.innerHTML = '';
  conteudoDiv.classList.add('oculto');

  document.querySelectorAll('.introducao').forEach(intro => {
    intro.classList.add('oculto');
  });

  if (termo.length < MIN_SEARCH_TERM_LENGTH) {
    resultadosDiv.innerHTML = `<div class="aviso-resultado">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres.</div>`;
    resultadosDiv.classList.remove('oculto');
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";
    console.log("Termo de busca muito curto.");
    return;
  }

  resultadosDiv.classList.remove('oculto');

  const resultadosEncontrados = cache.filter(item => {
    return item.texto.toLowerCase().includes(termo);
  });
  console.log(`Resultados encontrados no cache para "${termo}":`, resultadosEncontrados.length);
  // if (resultadosEncontrados.length > 0) console.log("Primeiro resultado encontrado:", resultadosEncontrados[0]); // Descomente para ver o primeiro resultado

  if (resultadosEncontrados.length === 0) {
    resultadosDiv.innerHTML = `<div class="aviso-resultado">Nenhum resultado encontrado para "${termo}".</div>`;
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";
    return;
  }

  const headerResultados = document.createElement('div');
  headerResultados.className = 'header-resultados';
  headerResultados.textContent = `${resultadosEncontrados.length} resultado${resultadosEncontrados.length !== 1 ? 's' : ''} encontrado${resultadosEncontrados.length !== 1 ? 's' : ''}`;
  resultadosDiv.appendChild(headerResultados);

  resultadosEncontrados.forEach(item => {
    const divResultado = document.createElement('div');
    divResultado.className = 'resultado-item';
    divResultado.setAttribute('role', 'button');
    divResultado.setAttribute('tabindex', '0');

    const regexTermo = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const trechoMaxChars = 200;
    let trechoTexto = item.texto;
    let startIndex = item.texto.toLowerCase().indexOf(termo);
    if (startIndex === -1) startIndex = 0;

    let previewStart = Math.max(0, startIndex - Math.floor(trechoMaxChars / 3));
    let previewText = item.texto.substring(previewStart, previewStart + trechoMaxChars);
    if (previewStart > 0) previewText = "..." + previewText;
    if (previewStart + trechoMaxChars < item.texto.length) previewText = previewText + "...";
    
    const trechoHtml = previewText.replace(regexTermo, '<mark>$1</mark>');

    divResultado.innerHTML = `
      <div class="resultado-localizacao">${item.localizacao || item.arquivoNome || ''}</div>
      <div class="resultado-trecho">${trechoHtml}</div>
    `;

    const handleResultClick = async () => {
      console.log("Resultado clicado:", item); // Log do item clicado
      conteudoDiv.innerHTML = '<div class="loading-content">Carregando conteúdo...</div>';
      conteudoDiv.classList.remove('oculto');
      resultadosDiv.classList.add('oculto');

      conteudoDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (cacheHTMLInteiro[item.arquivoUrl]) {
        console.log("Renderizando conteúdo do cacheHTMLInteiro para:", item.arquivoUrl);
        renderizarConteudoPrincipal(item.arquivoUrl, cacheHTMLInteiro[item.arquivoUrl], item);
      } else {
        console.log("Buscando HTML completo para:", item.arquivoUrl);
        try {
          const response = await fetch(item.arquivoUrl);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const htmlCompleto = await response.text();
          cacheHTMLInteiro[item.arquivoUrl] = htmlCompleto;
          console.log("HTML completo buscado e cacheado. Renderizando.");
          renderizarConteudoPrincipal(item.arquivoUrl, htmlCompleto, item);
        } catch (error) {
          console.error("Erro ao buscar HTML completo:", error);
          conteudoDiv.innerHTML = `<div class="error-content">Erro ao carregar o conteúdo de ${item.arquivoNome}. Tente novamente.</div>`;
        }
      }
    };
    
    divResultado.addEventListener('click', handleResultClick);
    divResultado.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleResultClick();
        }
    });

    resultadosDiv.appendChild(divResultado);
  });

  if (buscaContainer) {
    const offset = buscaContainer.offsetTop;
    window.scrollTo({
      top: offset - 20,
      behavior: 'smooth'
    });
  }
  if (statusMessagesDiv) statusMessagesDiv.textContent = "";
}

function renderizarConteudoPrincipal(urlArquivo, htmlCompleto, itemAlvo) {
  console.log("Renderizando conteúdo principal para:", urlArquivo, "Alvo:", itemAlvo.texto.substring(0,50) + "...");
  ultimoArquivoCarregado = urlArquivo;
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlCompleto, 'text/html');
  
  conteudoDiv.innerHTML = ''; 
  
  const backButton = document.createElement('button');
  backButton.textContent = '‹ Voltar aos Resultados';
  backButton.className = 'botao-voltar';
  backButton.addEventListener('click', () => {
      conteudoDiv.classList.add('oculto');
      conteudoDiv.innerHTML = '';
      resultadosDiv.classList.remove('oculto');
      if (buscaContainer) {
          buscaContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  });
  conteudoDiv.appendChild(backButton);

  Array.from(doc.body.childNodes).forEach(node => {
    conteudoDiv.appendChild(node.cloneNode(true));
  });

  setTimeout(() => {
    console.log("Após timeout: marcando termo e rolando.");
    marcarTermoNoConteudo(conteudoDiv, termoAtualBusca);
    rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.texto);
    ativarNotasHover(conteudoDiv);
  }, 100);
}

function marcarTermoNoConteudo(container, termo) {
  if (!termo || termo.length < MIN_SEARCH_TERM_LENGTH) {
    // console.log("marcarTermoNoConteudo: Termo inválido ou curto demais", termo);
    return;
  }
  // console.log("marcarTermoNoConteudo: Marcando termo:", termo);

  const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const elementosParaMarcar = container.querySelectorAll('.paragrafo, .ponto-com-notas, .titulo, .subtitulo, p, li, h1, h2, h3, h4, h5, h6');
  
  elementosParaMarcar.forEach(el => {
    Array.from(el.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent;
            if (text.toLowerCase().includes(termo)) {
                const novoHtml = text.replace(regex, '<mark>$1</mark>');
                const spanWrapper = document.createElement('span');
                spanWrapper.innerHTML = novoHtml;
                // Não se pode usar replaceChild diretamente em el com spanWrapper se spanWrapper contém múltiplos nós após innerHTML.
                // É preciso inserir os filhos do spanWrapper.
                const fragment = document.createDocumentFragment();
                while(spanWrapper.firstChild) {
                    fragment.appendChild(spanWrapper.firstChild);
                }
                el.replaceChild(fragment, child);
            }
        }
    });
  });
}

function rolarParaParagrafoNoConteudo(container, textoExatoDoItem) {
  // console.log("rolarParaParagrafoNoConteudo: Procurando por texto:", textoExatoDoItem.substring(0,50) + "...");
  const elementosCandidatos = container.querySelectorAll('.paragrafo, .ponto-com-notas');
  let encontrado = false;
  for (let p of elementosCandidatos) {
    const cloneP = p.cloneNode(true);
    cloneP.querySelectorAll('mark').forEach(mark => mark.outerHTML = mark.innerHTML);
    
    if (cloneP.textContent.trim() === textoExatoDoItem.trim()) {
      // console.log("rolarParaParagrafoNoConteudo: Parágrafo encontrado!", p);
      p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      p.classList.add('paragrafo-destacado');
      setTimeout(() => p.classList.remove('paragrafo-destacado'), 2500);
      encontrado = true;
      break;
    }
  }
  // if (!encontrado) console.warn("rolarParaParagrafoNoConteudo: Parágrafo alvo não encontrado no DOM após renderização.");
}

function ativarNotasHover(container) {
  // console.log("ativarNotasHover: Ativando hover para notas.");
  const pontosComNotas = container.querySelectorAll(".ponto-com-notas");
  pontosComNotas.forEach(ponto => {
    const refs = ponto.querySelectorAll(".ref-nota");
    const notasAssociadas = ponto.querySelectorAll(".nota-associada");

    refs.forEach(ref => {
      const refNum = ref.dataset.ref;
      if (!refNum) return;

      let targetNotas = [];
      notasAssociadas.forEach(nota => {
        if (nota.textContent.trim().startsWith(refNum + ".")) {
          targetNotas.push(nota);
          nota.style.display = "none";
          nota.style.opacity = "0";
          nota.style.transition = "opacity 0.3s ease-in-out";
        }
      });

      if(targetNotas.length > 0){
        ref.addEventListener("mouseenter", () => {
          targetNotas.forEach(nota => {
            nota.style.display = "block";
            // eslint-disable-next-line no-unused-expressions
            nota.offsetHeight; 
            nota.style.opacity = "1";
          });
        });

        ref.addEventListener("mouseleave", () => {
          targetNotas.forEach(nota => {
            nota.style.opacity = "0";
            setTimeout(() => {
              if (nota.style.opacity === "0") {
                nota.style.display = "none";
              }
            }, 300);
          });
        });
      }
    });
  });
}