// --- DOM Elements ---
const campoBusca = document.getElementById('campo-busca');
const botaoBuscar = document.getElementById('botao-buscar');
const resultadosDiv = document.getElementById('resultados');
const conteudoDiv = document.getElementById('conteudo');
const buscaContainer = document.getElementById('busca-container');
const painelBusca = document.getElementById('painel-busca');
const statusMessagesDiv = document.getElementById('status-messages');

// --- State & Cache ---
let cache = [];
let idsDeTextoNoCache = new Set(); // Para ajudar a prevenir duplicatas exatas de texto
let ultimoArquivoCarregado = null;
let termoAtualBusca = '';
let cacheHTMLInteiro = {};
let proximoIdParagrafo = 0;
let itemSelecionadoAtual = null;
let elementoSelecionadoAtual = null;

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
    idsDeTextoNoCache.clear();
    cache = []; // Limpar cache antes de recarregar
    proximoIdParagrafo = 0; // Resetar contador de ID

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

            let ultimaParteNome = "";
            let ultimoCapituloNome = "";

            // Iterar sobre os elementos do corpo do documento
            const elementosProcessaveis = Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, .paragrafo, .ponto-com-notas, section.capitulo, div.parte'));
            // Ou use doc.body.children se a estrutura for mais plana e direta

            for (const el of elementosProcessaveis) {
                // Pular elementos dentro de notas, a menos que seja a própria nota (que não queremos no cache principal)
                if (el.closest('.nota-associada')) continue;

                // Tentar identificar se é uma marcação de PARTE
                if (el.matches('h1.parte, div.parte, .marcacao.parte') || (el.tagName === 'H1' && el.textContent.toLowerCase().includes("parte"))) {
                    const textoCompletoElementoParte = el.textContent.trim();
                    // Tenta encontrar "PRIMEIRA PARTE", "SEGUNDA PARTE", etc. no início do texto.
                    const matchRegExpParte = textoCompletoElementoParte.match(/^(PRIMEIRA PARTE|SEGUNDA PARTE|TERCEIRA PARTE|QUARTA PARTE)/i);

                    if (matchRegExpParte && matchRegExpParte[0]) {
                        ultimaParteNome = matchRegExpParte[0].toUpperCase(); // Armazena "PRIMEIRA PARTE" em maiúsculas
                    } else {
                        // Fallback se não encontrar o padrão exato, pode usar o nome do arquivo ou um texto genérico
                        // Ou tentar uma extração mais simples se a estrutura for "Parte 1", "Parte 2"
                        // Por agora, se não encontrar, pode ficar vazio ou usar um fallback.
                        // Se o seu HTML sempre tem "PRIMEIRA PARTE", etc. escrito, o match acima deve funcionar.
                        // Se for apenas "Parte 1", você pode querer ajustar a lógica ou o que é armazenado.
                        // Exemplo de fallback mais simples se o acima falhar:
                        if (textoCompletoElementoParte.toLowerCase().startsWith("parte ")) {
                           ultimaParteNome = textoCompletoElementoParte.split(/[:–-]/)[0].trim().toUpperCase(); // Pega "PARTE X"
                        } else {
                           ultimaParteNome = arquivo.nome.toUpperCase(); // Usa o nome do arquivo como "PARTE 1"
                        }
                    }

                    ultimoCapituloNome = ""; // Resetar capítulo ao encontrar nova parte
                    console.log(`Nova Parte Encontrada: ${ultimaParteNome}`);
                    continue;
                }

                // Tentar identificar se é uma marcação de CAPÍTULO
                // (Ex: <section class="capitulo"><h2>Título</h2></section>, <h2 class="capitulo-titulo">)
                let tituloCapituloElement = null;
                if (el.matches('section.capitulo h2, section.capitulo h3, h2.capitulo-titulo')) {
                    tituloCapituloElement = el; // Se 'el' for o próprio H2/H3
                } else if (el.matches('section.capitulo')) {
                    tituloCapituloElement = el.querySelector('h2, h3'); // Busca dentro da section
                } else if (['H2', 'H3'].includes(el.tagName) && el.textContent.trim().length > 10 && !el.closest('section.capitulo')) {
                    // Heurística para H2/H3 soltos que podem ser capítulos
                    tituloCapituloElement = el;
                }


                if (tituloCapituloElement) {
                    let nomeCapitulo = tituloCapituloElement.textContent.trim();
                    nomeCapitulo = nomeCapitulo.replace(/^Capítulo\s*[\w\dºª°]+\s*[:–-]?\s*/i, '').trim();
                    ultimoCapituloNome = nomeCapitulo.split(':')[0].trim();
                    console.log(`Novo Capítulo Encontrado: ${ultimoCapituloNome}`);
                    // Não 'continue' aqui se o título do capítulo também for buscável ou se 'el' for uma section
                    // Se 'el' for o próprio título (H2/H3), ele pode ser tratado como conteúdo abaixo.
                }

                // Identificar conteúdo para cache (parágrafos, pontos)
                let isConteudoParaCache = false;
                if (el.matches('.paragrafo, .ponto-com-notas')) {
                    isConteudoParaCache = true;
                } else if (el.tagName === 'P' && !el.matches('.marcacao, .titulo, .subtitulo')) {
                     // Garante que não é um P de marcação
                    isConteudoParaCache = true;
                }
                // Adicionar títulos (H2, H3 etc.) ao cache se não forem de parte/capítulo já tratados
                // e se contiverem texto substancial.
                else if (['H2','H3','H4','H5','H6'].includes(el.tagName) && el.textContent.trim().length > 15 && !tituloCapituloElement) {
                     // Se não foi identificado como título de capítulo acima, pode ser um subtítulo buscável.
                     isConteudoParaCache = true;
                }


                if (isConteudoParaCache) {
                    const elementoClone = el.cloneNode(true);
                    // Remover notas e referências para limpeza do texto e evitar que o texto delas entre na busca
                    elementoClone.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(notaEl => notaEl.remove());
                    
                    let textoOriginalLimpo = elementoClone.textContent.trim().replace(/\s+/g, ' ');

                    if (textoOriginalLimpo && textoOriginalLimpo.length > 10) { // Mínimo de 10 caracteres
                        if (idsDeTextoNoCache.has(textoOriginalLimpo)) {
                            // console.warn("Texto duplicado no cache ignorado:", textoOriginalLimpo.substring(0, 50));
                            continue;
                        }
                        idsDeTextoNoCache.add(textoOriginalLimpo);

                        const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
                        let numeroParagrafo = "";
                        const matchNumero = textoOriginalLimpo.match(/^(\s*\d+)\s*[.:]?\s+/);
                        if (matchNumero && matchNumero[1]) {
                            numeroParagrafo = matchNumero[1].trim();
                        }

                        cache.push({
                            id: paragrafoId,
                            textoOriginalCompleto: textoOriginalLimpo, // Usado para busca e para encontrar no DOM
                            htmlOriginal: el.outerHTML, // Para referência e renderização se necessário
                            arquivoUrl: arquivo.url,
                            arquivoNome: arquivo.nome,
                            parte: ultimaParteNome,
                            capitulo: ultimoCapituloNome,
                            numero: numeroParagrafo
                        });
                    }
                }
            }
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
        }
    }

    if (cache.length > 0) {
        console.log("Exemplo do primeiro item no cache:", JSON.stringify(cache[0], null, 2));
        if (cache.length > 1) console.log("Exemplo do último item no cache:", JSON.stringify(cache[cache.length -1], null, 2));
    }
}

function executarBusca() {
    const termo = campoBusca.value.trim().toLowerCase();
    console.log("Termo buscado:", termo);
    termoAtualBusca = termo;

    resultadosDiv.innerHTML = '';
    conteudoDiv.innerHTML = '';
    conteudoDiv.classList.add('oculto');
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;

    document.querySelectorAll('.introducao').forEach(intro => intro.classList.add('oculto'));

    if (termo.length < MIN_SEARCH_TERM_LENGTH) {
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres.</div>`;
        resultadosDiv.classList.remove('oculto');
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        return;
    }

    resultadosDiv.classList.remove('oculto');

    const resultadosEncontrados = cache.filter(item => {
        return item.textoOriginalCompleto && item.textoOriginalCompleto.toLowerCase().includes(termo);
    });
    console.log(`Resultados encontrados no cache para "${termo}":`, resultadosEncontrados.length);

    if (resultadosEncontrados.length === 0) {
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Nenhum resultado encontrado para "${termo}".</div>`;
        conteudoDiv.classList.add('oculto');
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        return;
    }
    
    conteudoDiv.classList.remove('oculto');

    const headerResultados = document.createElement('div');
    headerResultados.className = 'header-resultados';
    headerResultados.textContent = `${resultadosEncontrados.length} resultado${resultadosEncontrados.length !== 1 ? 's' : ''} encontrado${resultadosEncontrados.length !== 1 ? 's' : ''}`;
    resultadosDiv.appendChild(headerResultados);

    resultadosEncontrados.forEach((item, index) => {
        const divResultado = document.createElement('div');
        divResultado.className = 'resultado-item';
        divResultado.setAttribute('role', 'button');
        divResultado.setAttribute('tabindex', '0');

          // Construir a string de localização (apenas a PARTE)
        let localizacaoDisplay = "";
        if (item.parte && item.parte.trim()) {
            localizacaoDisplay = item.parte; // Já deve estar em maiúsculas e formatado como "PRIMEIRA PARTE"
        } else {
            // Fallback se item.parte não estiver definido (raro se a extração funcionar)
            localizacaoDisplay = (item.arquivoNome || "Contexto Desconhecido").toUpperCase();
        }

        // O trechoHtml já inclui o número do parágrafo se ele estiver no item.textoOriginalCompleto
        // e será formatado com <mark> para o termo buscado.
        const regexTermo = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const trechoMaxChars = 200; // Ou o valor que você preferir
        let textoBaseParaPreview = item.textoOriginalCompleto;
  let numeroParagrafoDetectado = "";
        const matchNumeroNoInicioOriginal = textoBaseParaPreview.match(/^(\s*\d+\s*[.:]?\s*)/);
        if (matchNumeroNoInicioOriginal) {
            numeroParagrafoDetectado = matchNumeroNoInicioOriginal[0]; // Ex: "1601. "
        }

        let textoAposNumero = textoBaseParaPreview.substring(numeroParagrafoDetectado.length); // Texto sem o número inicial

        // A busca pelo termo (startIndex) é feita no texto *após* o número,
        // mas precisamos do índice relativo ao texto completo para a marcação depois.
        let startIndexNoTextoAposNumero = textoAposNumero.toLowerCase().indexOf(termo);
        if (startIndexNoTextoAposNumero === -1) { // O termo deve estar no número em si, ou erro
            startIndexNoTextoAposNumero = 0;
             // Se o termo está no número, o preview vai ser o número e um pouco depois
        }

        // Ajustar trechoMaxChars para considerar o tamanho do número já exibido
        let trechoMaxCharsParaTexto = trechoMaxChars - numeroParagrafoDetectado.length;
        if (trechoMaxCharsParaTexto < 50) trechoMaxCharsParaTexto = 50; // Mínimo para o texto

        let previewStartNoTextoAposNumero = Math.max(0, startIndexNoTextoAposNumero - Math.floor(trechoMaxCharsParaTexto / 3));
        let previewTextoAposNumero = textoAposNumero.substring(previewStartNoTextoAposNumero, previewStartNoTextoAposNumero + trechoMaxCharsParaTexto);

        let prefixoPreview = "";
        if (previewStartNoTextoAposNumero > 0) {
            prefixoPreview = "...";
        }

        let sufixoPreview = "";
        if ((previewStartNoTextoAposNumero + trechoMaxCharsParaTexto) < textoAposNumero.length) {
            sufixoPreview = "...";
        }

        // Montar o previewText final
        // O número sempre vem primeiro (se existir), depois o prefixo ("..."), depois o trecho do texto, depois o sufixo ("...")
        let previewText = numeroParagrafoDetectado + prefixoPreview + previewTextoAposNumero + sufixoPreview;
        
        // A marcação <mark> ainda é aplicada no previewText montado.
        // Se o termo estiver no número, ele será marcado. Se estiver no texto, também.
        const trechoHtml = previewText.replace(regexTermo, '<mark>$1</mark>');

        divResultado.innerHTML = `
          <div class="resultado-localizacao">${localizacaoDisplay}</div>
          <div class="resultado-trecho">${trechoHtml}</div>
        `;
        
        divResultado.addEventListener('click', () => selecionarItemResultado(item, divResultado));
        divResultado.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selecionarItemResultado(item, divResultado);
            }
        });

        resultadosDiv.appendChild(divResultado);

        if (index === 0) {
            selecionarItemResultado(item, divResultado);
        }
    });

    resultadosDiv.scrollTop = 0; 
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";
}

async function selecionarItemResultado(item, elementoLista) {
    console.log("Item selecionado:", item);

    if (elementoSelecionadoAtual) {
        elementoSelecionadoAtual.classList.remove('selecionado');
    }
    elementoLista.classList.add('selecionado');
    elementoSelecionadoAtual = elementoLista;
    itemSelecionadoAtual = item;

    elementoLista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    conteudoDiv.innerHTML = '<div class="loading-content">Carregando conteúdo...</div>';
    conteudoDiv.classList.remove('oculto'); // Garante visibilidade

    if (cacheHTMLInteiro[item.arquivoUrl]) {
        renderizarConteudoPrincipal(item.arquivoUrl, cacheHTMLInteiro[item.arquivoUrl], item);
    } else {
        try {
            const response = await fetch(item.arquivoUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlCompleto = await response.text();
            cacheHTMLInteiro[item.arquivoUrl] = htmlCompleto;
            renderizarConteudoPrincipal(item.arquivoUrl, htmlCompleto, item);
        } catch (error) {
            console.error("Erro ao buscar HTML completo:", error);
            conteudoDiv.innerHTML = `<div class="error-content">Erro ao carregar o conteúdo de ${item.arquivoNome}.</div>`;
        }
    }
}

function renderizarConteudoPrincipal(urlArquivo, htmlCompleto, itemAlvo) {
    console.log("Renderizando conteúdo principal para:", urlArquivo, "Alvo:", itemAlvo.textoOriginalCompleto.substring(0, 50) + "...");
    ultimoArquivoCarregado = urlArquivo;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlCompleto, 'text/html');
    conteudoDiv.innerHTML = ''; 

    Array.from(doc.body.childNodes).forEach(node => {
        conteudoDiv.appendChild(node.cloneNode(true));
    });

    setTimeout(() => {
        marcarTermoNoConteudo(conteudoDiv, termoAtualBusca);
        conteudoDiv.scrollTop = 0; // Reset scroll ANTES de rolar para o parágrafo específico
        rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.textoOriginalCompleto);
        ativarNotasHover(conteudoDiv);
    }, 150);
}

function marcarTermoNoConteudo(container, termo) {
    if (!termo || termo.length < MIN_SEARCH_TERM_LENGTH) return;

    const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    // Considerar também os títulos dentro do conteúdo principal
    const elementosParaMarcar = container.querySelectorAll('.paragrafo, .ponto-com-notas, p:not(.marcacao), h1, h2, h3, h4, h5, h6, li');

    elementosParaMarcar.forEach(el => {
        if (el.closest('.nota-associada')) return; // Não marcar dentro de notas

        Array.from(el.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent;
                if (text.toLowerCase().includes(termo.toLowerCase())) {
                    const novoHtml = text.replace(regex, '<mark>$1</mark>');
                    const spanWrapper = document.createElement('span');
                    spanWrapper.innerHTML = novoHtml;
                    const fragment = document.createDocumentFragment();
                    while (spanWrapper.firstChild) {
                        fragment.appendChild(spanWrapper.firstChild);
                    }
                    el.replaceChild(fragment, child);
                }
            }
        });
    });
}

function rolarParaParagrafoNoConteudo(container, textoDoItemDoCache) { // Renomeei para clareza
    console.log("----------------------------------------------------");
    console.log("Tentando rolar para o item com texto (do cache):");
    console.log(`"${textoDoItemDoCache}"`);
    console.log("----------------------------------------------------");

    // Seleciona todos os possíveis parágrafos ou títulos na área de conteúdo
    const todosOsParagrafosNaPagina = container.querySelectorAll(
        '.paragrafo, .ponto-com-notas, p:not(.marcacao):not(.titulo), h2:not(.marcacao), h3:not(.marcacao), h4:not(.marcacao), h5:not(.marcacao), h6:not(.marcacao)'
    );

    let encontrado = false;
    let contadorDeParagrafosChecados = 0;

    for (const paragrafoAtualDaPagina of todosOsParagrafosNaPagina) {
        contadorDeParagrafosChecados++;

        // 1. Clonar o parágrafo da página para não mexer no original ainda
        const cloneDoParagrafo = paragrafoAtualDaPagina.cloneNode(true);

        // 2. Limpeza do clone (REMOVER O QUE NÃO ESTAVA NO TEXTO DO CACHE)

        // a. Remover as marcações <mark> que a busca adicionou
        cloneDoParagrafo.querySelectorAll('mark').forEach(mark => {
            const pai = mark.parentNode;
            if (pai) {
                pai.replaceChild(document.createTextNode(mark.textContent), mark);
                pai.normalize(); // Junta textos, se necessário
            }
        });

        // b. Remover as notas e referências de nota
        cloneDoParagrafo.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(el => el.remove());
        
        // c. Pegar o texto limpo do parágrafo da página
        let textoDoParagrafoDaPaginaLimpo = cloneDoParagrafo.textContent;

        // d. Aplicar a mesma normalização de espaços que foi usada no cache
        textoDoParagrafoDaPaginaLimpo = textoDoParagrafoDaPaginaLimpo.trim().replace(/\s+/g, ' ');
        let textoDoCacheNormalizado = textoDoItemDoCache.trim().replace(/\s+/g, ' '); // Normalizar o do cache também aqui para garantir

        // --- LOGS DE COMPARAÇÃO ---
        // Mostrar apenas alguns para não poluir muito o console
        // Ou se o início do texto parecer promissor
        if (contadorDeParagrafosChecados <= 5 || textoDoParagrafoDaPaginaLimpo.startsWith(textoDoCacheNormalizado.substring(0, 20))) {
            console.log(`\nChecando Parágrafo ${contadorDeParagrafosChecados} da Página:`);
            console.log(`  TEXTO DO CACHE (esperado): "${textoDoCacheNormalizado.substring(0, 100)}..."`);
            console.log(`  TEXTO DA PÁGINA (limpo)  : "${textoDoParagrafoDaPaginaLimpo.substring(0, 100)}..."`);

            if (textoDoParagrafoDaPaginaLimpo.length !== textoDoCacheNormalizado.length) {
                console.warn(`  AVISO: Tamanhos diferentes! CACHE: ${textoDoCacheNormalizado.length}, PÁGINA: ${textoDoParagrafoDaPaginaLimpo.length}`);
            }
        }
        // --- FIM DOS LOGS DE COMPARAÇÃO ---

        if (textoDoParagrafoDaPaginaLimpo === textoDoCacheNormalizado) {
            console.log("### SUCESSO! Parágrafo encontrado! ###");
            console.log(`Texto correspondente: "${textoDoCacheNormalizado.substring(0, 70)}..."`);

            // --- CÓDIGO DE ROLAGEM (o mesmo de antes) ---
            const containerRect = container.getBoundingClientRect();
            const targetRect = paragrafoAtualDaPagina.getBoundingClientRect(); // Usar o elemento original para getBoundingClientRect
            const scrollTopCalculado = container.scrollTop + (targetRect.top - containerRect.top) - (container.clientHeight / 2) + (paragrafoAtualDaPagina.clientHeight / 2);
            
            container.scrollTo({ top: scrollTopCalculado, behavior: 'smooth' });
            paragrafoAtualDaPagina.classList.add('paragrafo-destacado-flash');
            setTimeout(() => paragrafoAtualDaPagina.classList.remove('paragrafo-destacado-flash'), 2500);
            // --- FIM DO CÓDIGO DE ROLAGEM ---

            encontrado = true;
            break; // Para o loop, já encontramos
        }
    }

    if (!encontrado) {
        console.error("### FALHA: Parágrafo alvo NÃO encontrado no DOM após checar " + contadorDeParagrafosChecados + " parágrafos. ###");
        console.error("Verifique os logs acima. O 'TEXTO DO CACHE (esperado)' deve ser idêntico a um dos 'TEXTO DA PÁGINA (limpo)'.");
        console.error("Se houver diferenças (mesmo um espaço ou símbolo), a rolagem não ocorrerá.");
        console.error("Texto do Cache que não foi encontrado na página (primeiros 100 caracteres):");
        console.error(`"${textoDoItemDoCache.substring(0,100)}..."`);
    }
     console.log("----------------------------------------------------");
}

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes flashBackground {
    0% { background-color: transparent; }
    25% { background-color: #fff3c4; }
    75% { background-color: #fff3c4; }
    100% { background-color: transparent; }
  }
  .paragrafo-destacado-flash {
    animation: flashBackground 1.5s ease-out;
    border-radius: 4px;
  }
`;
document.head.appendChild(styleSheet);

function ativarNotasHover(container) {
    const pontosComNotas = container.querySelectorAll(".ponto-com-notas");
    pontosComNotas.forEach(ponto => {
        const refs = ponto.querySelectorAll(".ref-nota");
        // Assumindo que as notas estão logo após o ponto ou dentro de um container específico
        const notasAssociadasNoPonto = ponto.querySelectorAll(".nota-associada");

        refs.forEach(ref => {
            const refNum = ref.dataset.ref;
            if (!refNum) return;

            let targetNotas = [];
            notasAssociadasNoPonto.forEach(nota => {
                // Comparar o início do texto da nota com o número de referência
                if (nota.textContent.trim().startsWith(refNum + ".")) {
                    targetNotas.push(nota);
                    nota.style.display = "none";
                    nota.style.opacity = "0";
                    nota.style.transition = "opacity 0.3s ease-in-out, transform 0.3s ease-in-out";
                   // nota.style.transform = "translateY(5px)";
                }
            });

            if (targetNotas.length > 0) {
                ref.addEventListener("mouseenter", () => {
                    targetNotas.forEach(nota => {
                        nota.style.display = "block";
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                nota.style.opacity = "1";
                               // nota.style.transform = "translateY(0)";
                            });
                        });
                    });
                });

                ref.addEventListener("mouseleave", () => {
                    targetNotas.forEach(nota => {
                        nota.style.opacity = "0";
                       // nota.style.transform = "translateY(5px)";
                        setTimeout(() => {
                            if (nota.style.opacity === "0") {
                                nota.style.display = "none";
                            }
                        }, 300); // Sync with transition duration
                    });
                });
            }
        });
    });
}