// --- DOM Elements ---
const campoBusca = document.getElementById('campo-busca');
const botaoBuscar = document.getElementById('botao-buscar');
const resultadosDiv = document.getElementById('resultados');
const conteudoDiv = document.getElementById('conteudo');
const buscaContainer = document.getElementById('busca-container'); // Main container for search UI
const painelBusca = document.getElementById('painel-busca'); // The flex container for results and content
const statusMessagesDiv = document.getElementById('status-messages');

// --- State & Cache ---
let cache = [];
let ultimoArquivoCarregado = null;
let termoAtualBusca = '';
let cacheHTMLInteiro = {};
let proximoIdParagrafo = 0;
let itemSelecionadoAtual = null; // Keep track of the selected item's data
let elementoSelecionadoAtual = null; // Keep track of the selected list item's DOM element

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
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            let ultimaParte = "";
            let ultimoCapitulo = "";
            const todosElementosRelevantes = doc.querySelectorAll('body .marcacao, body .titulo, body .paragrafo, body .ponto-com-notas, body .subtitulo, body h1, body h2, body h3, body h4, body h5, body h6, body p');
            console.log(`Encontrados ${todosElementosRelevantes.length} elementos relevantes em ${arquivo.url}`);

            todosElementosRelevantes.forEach(el => {
                if (el.classList.contains('marcacao')) {
                    if (el.classList.contains('parte')) {
                        ultimaParte = el.textContent.trim();
                        ultimoCapitulo = "";
                    } else if (el.classList.contains('capitulo') || el.closest('.capitulo')) {
                        let textoCapitulo = el.textContent.trim();
                        if (el.closest('.capitulo')) {
                            const sectionCapitulo = el.closest('.capitulo');
                            const h2Capitulo = sectionCapitulo ? sectionCapitulo.querySelector('h2') : null;
                            if (h2Capitulo) textoCapitulo = h2Capitulo.textContent.trim();
                        }
                        ultimoCapitulo = textoCapitulo;
                    }
                    return;
                }

                let isConteudoParaCache = el.classList.contains('paragrafo') || el.classList.contains('ponto-com-notas');
                if (el.tagName === 'P' && !el.classList.contains('marcacao') && !el.classList.contains('titulo')) {
                    isConteudoParaCache = true;
                }

                if (isConteudoParaCache) {
                    const elementoClone = el.cloneNode(true);
                    elementoClone.querySelectorAll('.nota-associada').forEach(nota => nota.remove());
                    const textoLimpo = elementoClone.textContent.trim();

                    if (textoLimpo) {
                        const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
                        let localizacaoFormatada = "";
                        if (ultimaParte && ultimoCapitulo) {
                            localizacaoFormatada = `${ultimaParte} – ${ultimoCapitulo}`;
                        } else if (ultimaParte) {
                            localizacaoFormatada = ultimaParte;
                        } else if (ultimoCapitulo) {
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

    console.log(`FINALIZADO: Cache preenchido com ${cache.length} itens.`);
    if (statusMessagesDiv) {
        if (arquivosCarregados === ARQUIVOS_CATECISMO.length && cache.length > 0) {
            statusMessagesDiv.textContent = `Catecismo carregado. Pronto para busca. (${cache.length} parágrafos indexados)`;
            setTimeout(() => { if (statusMessagesDiv && statusMessagesDiv.textContent.startsWith("Catecismo carregado")) statusMessagesDiv.textContent = ""; }, 5000);
        } else if (cache.length === 0 && arquivosCarregados > 0) {
            statusMessagesDiv.textContent = 'Nenhum conteúdo indexado. Verifique a estrutura dos arquivos HTML.';
            console.warn("Nenhum item foi adicionado ao cache, mas os arquivos parecem ter sido carregados.");
        } else if (arquivosCarregados === 0 && ARQUIVOS_CATECISMO.length > 0) {
            statusMessagesDiv.textContent = 'Erro: Nenhum arquivo do Catecismo pôde ser carregado.';
            console.error("Nenhum arquivo do Catecismo pôde ser carregado.");
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
    console.log("Termo buscado:", termo);
    termoAtualBusca = termo;

    resultadosDiv.innerHTML = '';
    conteudoDiv.innerHTML = '';
    // Hide content panel initially, it will be shown if there are results
    conteudoDiv.classList.add('oculto');
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;

    document.querySelectorAll('.introducao').forEach(intro => {
        intro.classList.add('oculto');
    });

    if (termo.length < MIN_SEARCH_TERM_LENGTH) {
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres.</div>`;
        resultadosDiv.classList.remove('oculto'); // Show results panel for the message
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        console.log("Termo de busca muito curto.");
        return;
    }

    resultadosDiv.classList.remove('oculto'); // Show results panel

    const resultadosEncontrados = cache.filter(item => {
        return item.texto.toLowerCase().includes(termo);
    });
    console.log(`Resultados encontrados no cache para "${termo}":`, resultadosEncontrados.length);

    if (resultadosEncontrados.length === 0) {
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Nenhum resultado encontrado para "${termo}".</div>`;
        conteudoDiv.classList.add('oculto'); // Ensure content panel is hidden
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        return;
    }
    
    // If we have results, ensure both panels could be visible
    conteudoDiv.classList.remove('oculto'); // Show content panel area

    const headerResultados = document.createElement('div');
    headerResultados.className = 'header-resultados';
    headerResultados.textContent = `${resultadosEncontrados.length} resultado${resultadosEncontrados.length !== 1 ? 's' : ''} encontrado${resultadosEncontrados.length !== 1 ? 's' : ''}`;
    resultadosDiv.appendChild(headerResultados);

    resultadosEncontrados.forEach((item, index) => {
        const divResultado = document.createElement('div');
        divResultado.className = 'resultado-item';
        divResultado.setAttribute('role', 'button');
        divResultado.setAttribute('tabindex', '0');
        // Store item reference directly on the element for easier access if needed, though closure is fine
        // divResultado.dataset.itemId = item.id; 

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
        
        // Pass item and the element itself to the handler
        divResultado.addEventListener('click', () => selecionarItemResultado(item, divResultado));
        divResultado.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selecionarItemResultado(item, divResultado);
            }
        });

        resultadosDiv.appendChild(divResultado);

        // Automatically select and load the first item
        if (index === 0) {
            selecionarItemResultado(item, divResultado);
        }
    });

    // Scroll the #resultados panel to the top if needed, not the whole window
    resultadosDiv.scrollTop = 0; 

    if (statusMessagesDiv) statusMessagesDiv.textContent = "";
}

async function selecionarItemResultado(item, elementoLista) {
    console.log("Item selecionado:", item);

    // Remove selection from previously selected item
    if (elementoSelecionadoAtual) {
        elementoSelecionadoAtual.classList.remove('selecionado');
    }

    // Add selection to the new item
    elementoLista.classList.add('selecionado');
    elementoSelecionadoAtual = elementoLista;
    itemSelecionadoAtual = item;

    // Scroll the selected item into view within the results list if necessary
    // Use 'nearest' to avoid unnecessary scrolling if already visible.
    elementoLista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    conteudoDiv.innerHTML = '<div class="loading-content">Carregando conteúdo...</div>';
    // No need to toggle 'oculto' for conteudoDiv here if it's already shown by executarBusca

    // Scroll main window to bring content area into view if it's far down.
    // Only scroll if #painel-busca is not fully visible.
    // const painelBuscaRect = painelBusca.getBoundingClientRect();
    // if (painelBuscaRect.top < 0 || painelBuscaRect.bottom > window.innerHeight) {
    //     painelBusca.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // }
    // Decided against aggressive scrolling of main window here, sticky should handle visibility of results.

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
}


function renderizarConteudoPrincipal(urlArquivo, htmlCompleto, itemAlvo) {
    console.log("Renderizando conteúdo principal para:", urlArquivo, "Alvo:", itemAlvo.texto.substring(0, 50) + "...");
    ultimoArquivoCarregado = urlArquivo;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlCompleto, 'text/html');

    conteudoDiv.innerHTML = ''; // Clear previous content (like loading message)

    // DO NOT add a back button or hide resultadosDiv here
    // const backButton = document.createElement('button');
    // ... (removal of back button logic)

    Array.from(doc.body.childNodes).forEach(node => {
        conteudoDiv.appendChild(node.cloneNode(true));
    });

    // Ensure rendering is complete before marking and scrolling
    setTimeout(() => {
        console.log("Após timeout: marcando termo e rolando no conteúdo.");
        marcarTermoNoConteudo(conteudoDiv, termoAtualBusca);
        rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.texto);
        ativarNotasHover(conteudoDiv);
        // Scroll the content pane to the top before scrolling to the specific item
        // to ensure the item is positioned correctly relative to the content pane's viewport
        conteudoDiv.scrollTop = 0;
        rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.texto); // Call again after scrollTop reset
    }, 100); 
}


function marcarTermoNoConteudo(container, termo) {
    if (!termo || termo.length < MIN_SEARCH_TERM_LENGTH) {
        return;
    }
    const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const elementosParaMarcar = container.querySelectorAll('.paragrafo, .ponto-com-notas, .titulo, .subtitulo, p, li, h1, h2, h3, h4, h5, h6');

    elementosParaMarcar.forEach(el => {
        Array.from(el.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent;
                if (text.toLowerCase().includes(termo.toLowerCase())) { // Ensure case-insensitive check here too
                    const novoHtml = text.replace(regex, '<mark>$1</mark>');
                    const spanWrapper = document.createElement('span'); // Use a temporary element
                    spanWrapper.innerHTML = novoHtml;
                    
                    const fragment = document.createDocumentFragment();
                    while(spanWrapper.firstChild) {
                        fragment.appendChild(spanWrapper.firstChild);
                    }
                    // Replace the original text node with the new nodes (text and mark elements)
                    el.replaceChild(fragment, child);
                }
            }
        });
    });
}

function rolarParaParagrafoNoConteudo(container, textoExatoDoItem) {
    const elementosCandidatos = container.querySelectorAll('.paragrafo, .ponto-com-notas');
    let encontrado = false;
    for (let p of elementosCandidatos) {
        const cloneP = p.cloneNode(true);
        // Remove marks for accurate text comparison
        cloneP.querySelectorAll('mark').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize(); // Merges adjacent text nodes
        });
        
        if (cloneP.textContent.trim() === textoExatoDoItem.trim()) {
            console.log("rolarParaParagrafoNoConteudo: Parágrafo encontrado!", p);
            // Scroll within the #conteudo div, not the whole window
            const containerRect = container.getBoundingClientRect();
            const targetRect = p.getBoundingClientRect();
            const scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - (container.clientHeight / 2) + (p.clientHeight / 2);
            
            container.scrollTo({ top: scrollTop, behavior: 'smooth' });

            p.classList.add('paragrafo-destacado-flash'); // Use a different class for temporary highlight
            setTimeout(() => p.classList.remove('paragrafo-destacado-flash'), 2500);
            encontrado = true;
            break; 
        }
    }
    if (!encontrado) console.warn("rolarParaParagrafoNoConteudo: Parágrafo alvo não encontrado no DOM. Texto buscado:", textoExatoDoItem.substring(0,50));
}

// Add a simple CSS for the flash effect
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes flashBackground {
    0% { background-color: transparent; }
    25% { background-color: #fff3c4; } /* Light yellow flash */
    75% { background-color: #fff3c4; }
    100% { background-color: transparent; }
  }
  .paragrafo-destacado-flash {
    animation: flashBackground 1.5s ease-out;
    border-radius: 4px; /* Optional: round corners of flash */
  }
`;
document.head.appendChild(styleSheet);


function ativarNotasHover(container) {
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
                    nota.style.transition = "opacity 0.3s ease-in-out, display 0s linear 0.3s"; // Delay hiding
                }
            });

            if (targetNotas.length > 0) {
                ref.addEventListener("mouseenter", () => {
                    targetNotas.forEach(nota => {
                        nota.style.transition = "opacity 0.3s ease-in-out"; // Reset transition for display
                        nota.style.display = "block";
                        requestAnimationFrame(() => { // Force reflow
                            requestAnimationFrame(() => { // Apply opacity change
                                nota.style.opacity = "1";
                            });
                        });
                    });
                });

                ref.addEventListener("mouseleave", () => {
                    targetNotas.forEach(nota => {
                        nota.style.opacity = "0";
                        // The display:none is now handled by the delayed transition on display property
                    });
                });
            }
        });
    });
}