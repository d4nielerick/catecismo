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
                    elementoClone.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(notaEl => notaEl.remove());
                    
                    let textoOriginalLimpo = elementoClone.textContent.trim().replace(/\s+/g, ' ');

                    if (textoOriginalLimpo && textoOriginalLimpo.length > 10) {
                        // NORMALIZAÇÃO PARA O ID DE CACHE (EVITAR DUPLICATAS)
                        const textoNormalizadoParaIdCache = removerAcentos(textoOriginalLimpo.toLowerCase()); // Usar texto normalizado para checar duplicatas
                        if (idsDeTextoNoCache.has(textoNormalizadoParaIdCache)) { // Checar com o texto normalizado
                            // console.warn("Texto duplicado (após normalização) no cache ignorado:", textoOriginalLimpo.substring(0, 50));
                            continue;
                        }
                        idsDeTextoNoCache.add(textoNormalizadoParaIdCache); // Adicionar o texto normalizado ao set

                        const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
                        let numeroParagrafo = "";
                        const matchNumero = textoOriginalLimpo.match(/^(\s*\d+)\s*[.:]?\s+/);
                        if (matchNumero && matchNumero[1]) {
                            numeroParagrafo = matchNumero[1].trim();
                        }

                        cache.push({
                            id: paragrafoId,
                            textoOriginalCompleto: textoOriginalLimpo, // Mantém o original para exibição e rolagem precisa
                            textoNormalizadoParaBusca: removerAcentos(textoOriginalLimpo.toLowerCase()), // NOVO: Para a busca
                            htmlOriginal: el.outerHTML,
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
    const termoInputUsuario = campoBusca.value.trim();
    termoAtualBusca = termoInputUsuario.toLowerCase(); // Este é o termo global para highlight
    const termoNormalizadoParaFiltro = removerAcentos(termoAtualBusca); // Para a busca no cache
    // ... restante da função

    console.log("Termo original:", termoInputUsuario, "| Termo para highlight:", termoAtualBusca, "| Termo para filtro:", termoNormalizadoParaFiltro);


    resultadosDiv.innerHTML = '';
    conteudoDiv.innerHTML = '';
    conteudoDiv.classList.add('oculto');
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;

    document.querySelectorAll('.introducao').forEach(intro => intro.classList.add('oculto'));

    // Usar o termo original (ou o normalizado, mas o original é mais intuitivo para o usuário) para a checagem de tamanho
    if (termoInputUsuario.length < MIN_SEARCH_TERM_LENGTH) {
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres.</div>`;
        resultadosDiv.classList.remove('oculto');
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        return;
    }

    resultadosDiv.classList.remove('oculto');

    const resultadosEncontrados = cache.filter(item => {
        // MODIFICADO: Usar o campo normalizado para a busca
        return item.textoNormalizadoParaBusca && item.textoNormalizadoParaBusca.includes(termoNormalizadoParaFiltro);
    });
    console.log(`Resultados encontrados no cache para "${termoNormalizadoParaFiltro}":`, resultadosEncontrados.length);

    if (resultadosEncontrados.length === 0) {
        // Exibir o termo que o usuário digitou originalmente na mensagem
        resultadosDiv.innerHTML = `<div class="aviso-resultado">Nenhum resultado encontrado para "${termoInputUsuario}".</div>`;
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

        let localizacaoDisplay = "";
        if (item.parte && item.parte.trim()) {
            localizacaoDisplay = item.parte;
        } else {
            localizacaoDisplay = (item.arquivoNome || "Contexto Desconhecido").toUpperCase();
        }

        // O highlight <mark> deve usar o termoAtualBusca (que é o input do usuário em minúsculas, mas com acentos se ele digitou)
        // para que "Cânon" seja destacado se o usuário digitou "Cânon", e "canon" se digitou "canon".
        // A busca encontrou o item usando a versão normalizada, mas o destaque visual é no texto original.
        const regexTermoHighlight = new RegExp(`(${termoAtualBusca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        
        const trechoMaxChars = 200;
        let textoBaseParaPreview = item.textoOriginalCompleto; // Usar o texto original para o preview
        let numeroParagrafoDetectado = "";
        const matchNumeroNoInicioOriginal = textoBaseParaPreview.match(/^(\s*\d+\s*[.:]?\s*)/);
        if (matchNumeroNoInicioOriginal) {
            numeroParagrafoDetectado = matchNumeroNoInicioOriginal[0];
        }

        let textoAposNumero = textoBaseParaPreview.substring(numeroParagrafoDetectado.length);
        
        // Encontrar o termo para centralizar o preview.
        // Aqui, podemos usar o termo normalizado para encontrar a POSIÇÃO no texto normalizado,
        // mas o corte será feito no texto original.
        let startIndexNoTextoAposNumeroOriginal = textoAposNumero.toLowerCase().indexOf(termoAtualBusca); // Posição no texto original (com acentos)
        if (startIndexNoTextoAposNumeroOriginal === -1) { // Se não achou com acentos, tenta sem
            startIndexNoTextoAposNumeroOriginal = removerAcentos(textoAposNumero.toLowerCase()).indexOf(termoNormalizadoParaFiltro);
        }
        if (startIndexNoTextoAposNumeroOriginal === -1) { // Fallback se ainda não encontrar (improvável se o item foi selecionado)
             startIndexNoTextoAposNumeroOriginal = 0;
        }


        let trechoMaxCharsParaTexto = trechoMaxChars - numeroParagrafoDetectado.length;
        if (trechoMaxCharsParaTexto < 50) trechoMaxCharsParaTexto = 50;

        let previewStartNoTextoAposNumero = Math.max(0, startIndexNoTextoAposNumeroOriginal - Math.floor(trechoMaxCharsParaTexto / 3));
        let previewTextoAposNumero = textoAposNumero.substring(previewStartNoTextoAposNumero, previewStartNoTextoAposNumero + trechoMaxCharsParaTexto);

        let prefixoPreview = (previewStartNoTextoAposNumero > 0) ? "..." : "";
        let sufixoPreview = ((previewStartNoTextoAposNumero + trechoMaxCharsParaTexto) < textoAposNumero.length) ? "..." : "";
        
        let previewText = numeroParagrafoDetectado + prefixoPreview + previewTextoAposNumero + sufixoPreview;
        
        // Aplicar o highlight no previewText construído
        const trechoHtml = previewText.replace(regexTermoHighlight, '<mark>$1</mark>');

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

    // O setTimeout é para dar uma chance ao navegador de renderizar o conteúdo
    // antes de tentarmos manipular ou rolar.
    setTimeout(() => {
        console.log("RENDERIZAR: Dentro do setTimeout. Termo atual para marcar:", termoAtualBusca); // DEBUG
        
        // 1. Marcar o termo
        marcarTermoNoConteudo(conteudoDiv, termoAtualBusca);
        
        // 2. Resetar o scroll do container ANTES de rolar para o parágrafo específico
        conteudoDiv.scrollTop = 0; 
        
        // 3. Rolar para o parágrafo específico
        rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.textoOriginalCompleto);
        
        // 4. Ativar notas (se houver)
        ativarNotasHover(conteudoDiv);
    }, 150); // 150ms pode ser ajustado se necessário
}

function marcarTermoNoConteudo(container, termo) {
    if (!termo || termo.length < MIN_SEARCH_TERM_LENGTH) {
        console.log("MarcarTermo: Termo muito curto ou ausente:", termo);
        return;
    }
    console.log("MarcarTermo: Iniciando marcação para o termo:", termo, "no container:", container);

    // A regex para encontrar o termo, case-insensitive e global.
    // O termo já deve estar em minúsculas (termoAtualBusca).
    const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

    // Elementos onde o texto pode estar (parágrafos, títulos, etc.)
    const elementosParaMarcar = container.querySelectorAll(
        '.paragrafo, .ponto-com-notas, p:not(.marcacao):not(.titulo), h1, h2, h3, h4, h5, h6, li'
    );

    let matchEncontradoAlgumLugar = false; // Para debug

    elementosParaMarcar.forEach(el => {
        if (el.closest('.nota-associada')) return; // Não marcar dentro de notas

        // Usar um TreeWalker é mais robusto para encontrar todos os nós de texto,
        // mesmo que estejam aninhados dentro de outros elementos como <span>, <b>, <i> etc.
        const walker = document.createTreeWalker(
            el,
            NodeFilter.SHOW_TEXT, // Apenas nós de texto
            {
                acceptNode: function(node) {
                    // Ignorar texto dentro de <script> ou <style> se eles pudessem estar nos elementos selecionados
                    if (node.parentNode.nodeName === 'SCRIPT' || node.parentNode.nodeName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Verificar se o texto do nó contém o termo (case-insensitive)
                    if (node.nodeValue.toLowerCase().includes(termo)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            },
            false // deprecated
        );

        let node;
        const nodesToReplace = []; // Coletar nós para substituir depois, para não modificar a árvore durante a travessia

        while (node = walker.nextNode()) {
            nodesToReplace.push(node);
        }

        nodesToReplace.forEach(textNode => {
            const text = textNode.nodeValue;
            if (text.toLowerCase().includes(termo)) { // termo já é toLowerCase
                matchEncontradoAlgumLugar = true;
                const fragment = document.createDocumentFragment();
                let ultimoIndice = 0;
                text.replace(regex, (match, p1, offset) => {
                    // Adiciona texto antes da correspondência
                    if (offset > ultimoIndice) {
                        fragment.appendChild(document.createTextNode(text.substring(ultimoIndice, offset)));
                    }
                    // Adiciona o <mark>
                    const markElement = document.createElement('mark');
                    markElement.textContent = match; // p1 é o grupo capturado, match é o texto completo encontrado
                    fragment.appendChild(markElement);
                    ultimoIndice = offset + match.length;
                });
                // Adiciona texto restante após a última correspondência
                if (ultimoIndice < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(ultimoIndice)));
                }

                // Substitui o nó de texto original pelo fragmento
                if (textNode.parentNode) {
                    textNode.parentNode.replaceChild(fragment, textNode);
                } else {
                    console.warn("MarcarTermo: Nó de texto não tem pai, não pode ser substituído:", textNode);
                }
            }
        });
    });
    if (matchEncontradoAlgumLugar) {
        console.log("MarcarTermo: Pelo menos uma marcação foi feita para o termo:", termo);
    } else {
        console.log("MarcarTermo: Nenhuma marcação foi feita. O termo:", termo, "não foi encontrado nos nós de texto dos elementos selecionados.");
    }
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

// --- Utility Functions (NOVA SEÇÃO, OU ADICIONE ONDE PREFERIR) ---
function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}