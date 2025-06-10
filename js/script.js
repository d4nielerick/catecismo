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
let termoAtualBusca = ''; // Termo como o usuário digitou, em minúsculas (com acentos)
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

// --- Utility Functions ---
function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


// --- Core Functions ---
// Função carregarTodosOsArquivos (COMPLETA E REFINADA para extrair o "ponto" do parágrafo)
async function carregarTodosOsArquivos() {
    if (statusMessagesDiv) statusMessagesDiv.textContent = 'Carregando dados do Catecismo...';
    resultadosDiv.classList.add('oculto');
    conteudoDiv.classList.add('oculto');
    idsDeTextoNoCache.clear();
    cache = [];
    proximoIdParagrafo = 0;

    let arquivosCarregados = 0;
    // console.log("INICIANDO CARREGAMENTO DE ARQUIVOS PARA CACHE");

    for (const arquivo of ARQUIVOS_CATECISMO) {
        // console.log(`Processando arquivo: ${arquivo.url}`);
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
            const elementosProcessaveis = Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, .paragrafo, .ponto-com-notas, section.capitulo, div.parte'));

            for (const el of elementosProcessaveis) {
                if (el.closest('.nota-associada')) continue;

                if (el.matches('h1.parte, div.parte, .marcacao.parte') || (el.tagName === 'H1' && el.textContent.toLowerCase().includes("parte"))) {
                    const textoCompletoElementoParte = el.textContent.trim();
                    const matchRegExpParte = textoCompletoElementoParte.match(/^(PRIMEIRA PARTE|SEGUNDA PARTE|TERCEIRA PARTE|QUARTA PARTE)/i);
                    if (matchRegExpParte && matchRegExpParte[0]) {
                        ultimaParteNome = matchRegExpParte[0].toUpperCase();
                    } else {
                        if (textoCompletoElementoParte.toLowerCase().startsWith("parte ")) {
                           ultimaParteNome = textoCompletoElementoParte.split(/[:–-]/)[0].trim().toUpperCase();
                        } else {
                           ultimaParteNome = arquivo.nome.toUpperCase();
                        }
                    }
                    ultimoCapituloNome = "";
                    continue;
                }

                let tituloCapituloElement = null;
                if (el.matches('section.capitulo h2, section.capitulo h3, h2.capitulo-titulo')) {
                    tituloCapituloElement = el;
                } else if (el.matches('section.capitulo')) {
                    tituloCapituloElement = el.querySelector('h2, h3');
                } else if (['H2', 'H3'].includes(el.tagName) && el.textContent.trim().length > 10 && !el.closest('section.capitulo')) {
                    tituloCapituloElement = el;
                }
                if (tituloCapituloElement) {
                    let nomeCapitulo = tituloCapituloElement.textContent.trim();
                    nomeCapitulo = nomeCapitulo.replace(/^Capítulo\s*[\w\dºª°]+\s*[:–-]?\s*/i, '').trim();
                    ultimoCapituloNome = nomeCapitulo.split(':')[0].trim();
                }

                let isConteudoParaCache = false;
                if (el.matches('.paragrafo, .ponto-com-notas')) {
                    isConteudoParaCache = true;
                } else if (el.tagName === 'P' && !el.matches('.marcacao, .titulo, .subtitulo')) {
                    isConteudoParaCache = true;
                } else if (['H2','H3','H4','H5','H6'].includes(el.tagName) && el.textContent.trim().length > 15 && !tituloCapituloElement) {
                     isConteudoParaCache = true;
                }

                if (isConteudoParaCache) {
                    const elementoClone = el.cloneNode(true);
                    elementoClone.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(notaEl => notaEl.remove());
                    
                    let textoExtraidoDoElementoOriginal = elementoClone.textContent.trim().replace(/\s+/g, ' ');

                    let numeroDoPonto = ""; // Ex: "1619"
                    let prefixoVisualParaLimpeza = ""; // Ex: "1619.A" ou "1619."
                    let textoAposPontoParaBusca = textoExtraidoDoElementoOriginal;

                    // Tenta extrair o "ponto" do parágrafo (número, opcionalmente com . e/ou letra maiúscula)
                    const matchNumInicial = textoExtraidoDoElementoOriginal.match(/^(\s*\d+)/);
                    if (matchNumInicial) {
                        const numeroDetectado = matchNumInicial[1].trim(); // Ex: "1619"
                        let posAposNumero = matchNumInicial[0].length; // Posição no texto original após os dígitos e seus espaços
                        let prefixoVisualConstruido = numeroDetectado;

                        // Verifica se há um ponto após o número
                        if (posAposNumero < textoExtraidoDoElementoOriginal.length && textoExtraidoDoElementoOriginal[posAposNumero] === '.') {
                            prefixoVisualConstruido += '.';
                            posAposNumero++;
                            // Verifica se há uma letra maiúscula após o ponto
                            if (posAposNumero < textoExtraidoDoElementoOriginal.length && 
                                textoExtraidoDoElementoOriginal[posAposNumero] >= 'A' && 
                                textoExtraidoDoElementoOriginal[posAposNumero] <= 'Z') {
                                prefixoVisualConstruido += textoExtraidoDoElementoOriginal[posAposNumero];
                                posAposNumero++;
                            }
                        } 
                        // Verifica se há uma letra maiúscula diretamente após o número (sem ponto) - menos comum para "pontos"
                        // else if (posAposNumero < textoExtraidoDoElementoOriginal.length && 
                        //          textoExtraidoDoElementoOriginal[posAposNumero] >= 'A' && 
                        //          textoExtraidoDoElementoOriginal[posAposNumero] <= 'Z') {
                        //     prefixoVisualConstruido += textoExtraidoDoElementoOriginal[posAposNumero];
                        //     posAposNumero++;
                        // }

                        // Avança sobre quaisquer espaços após o prefixo visual construído
                        let posicaoFinalPrefixoParaCorte = posAposNumero;
                        while (posicaoFinalPrefixoParaCorte < textoExtraidoDoElementoOriginal.length && 
                               textoExtraidoDoElementoOriginal[posicaoFinalPrefixoParaCorte] === ' ') {
                            posicaoFinalPrefixoParaCorte++;
                        }

                        // Validação:
                        // O prefixo é considerado válido se:
                        // 1. Houve espaços significativos após o prefixo visual (posicaoFinalPrefixoParaCorte > posAposNumero), OU
                        // 2. O prefixo visual é mais do que apenas os dígitos (tem . ou Letra), OU
                        // 3. Há texto restante após o prefixo completo.
                        // 4. Ou se o texto original é apenas o número detectado (ex: "123")
                        const temTextoApos = posicaoFinalPrefixoParaCorte < textoExtraidoDoElementoOriginal.length;
                        const prefixoTemPontuacaoOuLetra = prefixoVisualConstruido.length > numeroDetectado.length;
                        const houveEspacosAposPrefixoVisual = posicaoFinalPrefixoParaCorte > posAposNumero;
                        const textoOriginalEhApenasONumero = (textoExtraidoDoElementoOriginal.trim() === numeroDetectado);


                        if (houveEspacosAposPrefixoVisual || prefixoTemPontuacaoOuLetra || temTextoApos || textoOriginalEhApenasONumero) {
                            numeroDoPonto = numeroDetectado;
                            prefixoVisualParaLimpeza = prefixoVisualConstruido;
                            if (textoOriginalEhApenasONumero && !temTextoApos) { // Caso especial: texto é SÓ o número
                                textoAposPontoParaBusca = "";
                            } else if (temTextoApos || houveEspacosAposPrefixoVisual) { // Condição normal para remover prefixo
                                textoAposPontoParaBusca = textoExtraidoDoElementoOriginal.substring(posicaoFinalPrefixoParaCorte);
                            } else {
                                // Se não se encaixa acima (ex: "1234Foobar" sem espaço), não considera um prefixo válido
                                // para fins de remoção, mas o numeroDoPonto pode ainda ser útil se for o único conteúdo.
                                // Resetamos para o estado inicial se não for um prefixo claro.
                                numeroDoPonto = ""; // Reset se não for um prefixo claro separando o texto
                                prefixoVisualParaLimpeza = "";
                                textoAposPontoParaBusca = textoExtraidoDoElementoOriginal;
                            }
                        }
                        // Se não entrou no if de validação, numeroDoPonto e prefixoVisual continuam vazios,
                        // e textoAposPontoParaBusca permanece o texto original completo.
                    }
                    
                    // Condição mínima para considerar um item para o cache (pode ser ajustada)
                    if (textoExtraidoDoElementoOriginal && textoExtraidoDoElementoOriginal.length >= 1) { 
                        const textoIdCacheNormalizado = removerAcentos(textoAposPontoParaBusca.toLowerCase());
                        let chaveDuplicata = "";

                        if (textoAposPontoParaBusca.length > 5) {
                            chaveDuplicata = textoIdCacheNormalizado;
                        } else if (numeroDoPonto) { // Se o texto após o ponto é curto/vazio, usa o número como parte da chave
                            chaveDuplicata = `num:${numeroDoPonto}|${textoIdCacheNormalizado}`;
                        } else { // Sem número e texto curto
                            chaveDuplicata = textoIdCacheNormalizado;
                        }

                        if (chaveDuplicata && idsDeTextoNoCache.has(chaveDuplicata)) { 
                            continue;
                        }
                        if (chaveDuplicata) { // Adiciona apenas se uma chave válida foi gerada
                            idsDeTextoNoCache.add(chaveDuplicata);
                        }

                        const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
                        cache.push({
                            id: paragrafoId,
                            textoOriginalCompleto: textoExtraidoDoElementoOriginal,
                            textoNormalizadoParaBusca: removerAcentos(textoAposPontoParaBusca.toLowerCase()),
                            htmlOriginal: el.outerHTML,
                            arquivoUrl: arquivo.url,
                            arquivoNome: arquivo.nome,
                            parte: ultimaParteNome,
                            capitulo: ultimoCapituloNome,
                            numero: numeroDoPonto, // Ex: "1619"
                            prefixoVisual: prefixoVisualParaLimpeza // Ex: "1619.A" ou "1619."
                        });
                    }
                }
            }
            arquivosCarregados++;
            // console.log(`Arquivo ${arquivo.url} processado. Cache atual com ${cache.length} itens.`);
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

    // if (cache.length > 0) {
    //     console.log("Exemplo do primeiro item no cache:", JSON.stringify(cache[0], null, 2));
    //     if (cache.length > 1) console.log("Exemplo do último item no cache:", JSON.stringify(cache[cache.length -1], null, 2));
    // }
}

// Função executarBusca (COMPLETA E AJUSTADA)
function executarBusca() {
    const termoInputUsuario = campoBusca.value.trim();
    termoAtualBusca = termoInputUsuario.toLowerCase(); // Com acentos, se digitado. Para highlight no conteúdo principal.
    const termoNormalizadoParaFiltro = removerAcentos(termoAtualBusca); // Sem acentos. Para filtrar cache e marcar previews.

    // console.log("ExecutarBusca - Termo Original:", termoInputUsuario, "| Termo Atual (Highlight):", termoAtualBusca, "| Termo Normalizado (Filtro):", termoNormalizadoParaFiltro);

    resultadosDiv.innerHTML = ''; 
    conteudoDiv.innerHTML = '';
    conteudoDiv.classList.add('oculto');
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;
    document.querySelectorAll('.introducao').forEach(intro => intro.classList.add('oculto'));

    if (termoInputUsuario.length < MIN_SEARCH_TERM_LENGTH) {
        const headerContainer = document.createElement('div');
        headerContainer.className = 'painel-resultados-container'; 
        const headerInfoDiv = document.createElement('div');
        headerInfoDiv.className = 'resultados-header-info';
        headerInfoDiv.innerHTML = `<div><h3>Busca Inválida</h3><span class="termo-buscado-display">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres.</span></div><button class="botao-nova-busca" id="btnNovaBuscaHeaderErro" title="Limpar busca e resultados"><svg viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>Nova busca</button>`;
        headerContainer.appendChild(headerInfoDiv);
        resultadosDiv.appendChild(headerContainer);
        resultadosDiv.classList.remove('oculto');
        document.getElementById('btnNovaBuscaHeaderErro').addEventListener('click', () => { campoBusca.value = ''; resultadosDiv.innerHTML = ''; resultadosDiv.classList.add('oculto'); conteudoDiv.classList.add('oculto'); document.querySelectorAll('.introducao').forEach(intro => intro.classList.remove('oculto')); campoBusca.focus(); });
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        return;
    }
    resultadosDiv.classList.remove('oculto');

    const resultadosEncontrados = cache.filter(item => {
        // item.textoNormalizadoParaBusca foi criado a partir do texto APÓS o prefixo numérico
        return item.textoNormalizadoParaBusca && item.textoNormalizadoParaBusca.includes(termoNormalizadoParaFiltro);
    });

    const headerContainer = document.createElement('div');
    headerContainer.className = 'painel-resultados-container';
    const headerInfoDiv = document.createElement('div');
    headerInfoDiv.className = 'resultados-header-info';
    const countText = document.createElement('div');
    const countTextH3 = document.createElement('h3');
    countTextH3.textContent = `${resultadosEncontrados.length} resultado${resultadosEncontrados.length !== 1 ? 's' : ''} encontrados`;
    const termoDisplay = document.createElement('span');
    termoDisplay.className = 'termo-buscado-display';
    termoDisplay.textContent = `para "${termoInputUsuario}"`;
    countText.appendChild(countTextH3);
    countText.appendChild(termoDisplay);
    const novaBuscaButton = document.createElement('button');
    novaBuscaButton.className = 'botao-nova-busca';
    novaBuscaButton.id = 'btnNovaBuscaHeader';
    novaBuscaButton.title = 'Limpar busca e resultados';
    novaBuscaButton.innerHTML = `<svg viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>Nova busca`;
    novaBuscaButton.addEventListener('click', () => { campoBusca.value = ''; resultadosDiv.innerHTML = ''; resultadosDiv.classList.add('oculto'); conteudoDiv.classList.add('oculto'); document.querySelectorAll('.introducao').forEach(intro => intro.classList.remove('oculto')); campoBusca.focus(); });
    headerInfoDiv.appendChild(countText);
    headerInfoDiv.appendChild(novaBuscaButton);
    headerContainer.appendChild(headerInfoDiv);
    
    const listaResultadosContainer = document.createElement('div');
    listaResultadosContainer.className = "lista-resultados-scrollavel";

    if (resultadosEncontrados.length === 0) {
        const aviso = document.createElement('div');
        aviso.className = 'aviso-resultado';
        aviso.textContent = `Nenhum resultado encontrado para "${termoInputUsuario}".`;
        listaResultadosContainer.appendChild(aviso);
        conteudoDiv.classList.add('oculto');
    } else {
        conteudoDiv.classList.remove('oculto');

        resultadosEncontrados.forEach((item, index) => {
            const divResultadoCard = document.createElement('div');
            divResultadoCard.className = 'resultado-item-card';
            divResultadoCard.setAttribute('role', 'button');
            divResultadoCard.setAttribute('tabindex', '0');

            const metaTopoDiv = document.createElement('div');
            metaTopoDiv.className = 'resultado-meta-topo';

            const tagParagrafoSpan = document.createElement('span');
            tagParagrafoSpan.className = 'resultado-tag-paragrafo';
            if (item.numero && item.numero.trim() !== "") { // item.numero são só os dígitos
                tagParagrafoSpan.textContent = `§ ${item.numero}`;
            } else {
                const matchIdNum = item.id.match(/\d+$/);
                tagParagrafoSpan.textContent = matchIdNum ? `§ ${matchIdNum[0]}` : "Ref."; // Fallback
            }

            const localizacaoSpan = document.createElement('span');
            localizacaoSpan.className = 'resultado-item-localizacao';
            let localizacaoDisplay = "";
            if (item.parte && item.parte.trim()) {
                localizacaoDisplay = item.parte;
                if (item.capitulo && item.capitulo.trim()) {
                    let nomeCapituloCurto = item.capitulo;
                    if (nomeCapituloCurto.length > 35) { nomeCapituloCurto = nomeCapituloCurto.substring(0, 32) + "..."; }
                    localizacaoDisplay += ` - ${nomeCapituloCurto}`;
                }
            } else { localizacaoDisplay = (item.arquivoNome || "Contexto").toUpperCase(); }
            localizacaoSpan.textContent = localizacaoDisplay;

            metaTopoDiv.appendChild(tagParagrafoSpan);
            metaTopoDiv.appendChild(localizacaoSpan);

            // Conteúdo do Resultado (Trecho)
            let textoBaseDoItemCompletoOriginal = item.textoOriginalCompleto; // Contém o prefixo numérico
            let textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal; // Inicialmente, o texto completo

            // REMOVER O PREFIXO ANTES DE PROCESSAR PARA O PREVIEW
            // Usamos item.prefixoVisual que deve ser como "1210." ou "1210" (sem espaços ao redor)
            if (item.prefixoVisual && item.prefixoVisual.trim() !== "") {
                const prefixoEscapado = item.prefixoVisual.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Regex para encontrar o prefixoVisual no início, seguido por um ou mais espaços.
                const regexParaRemover = new RegExp(`^${prefixoEscapado}\\s+`);
                const matchPrefixoReal = textoBaseDoItemCompletoOriginal.match(regexParaRemover);

                if (matchPrefixoReal) {
                    // matchPrefixoReal[0] é o prefixo + os espaços que o seguem. Ex: "1210. "
                    textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal.substring(matchPrefixoReal[0].length);
                } else {
                    // Fallback: se não encontrou com espaço, tenta remover só o prefixoVisual se estiver no começo
                    // Isso pode acontecer se não houver espaço após o ponto/número.
                    if (textoBaseDoItemCompletoOriginal.toLowerCase().startsWith(item.prefixoVisual.toLowerCase())) {
                        textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal.substring(item.prefixoVisual.length).trimStart();
                    }
                    // Se ainda assim não removeu, textoParaPreviewOriginal continua sendo textoBaseDoItemCompletoOriginal,
                    // o que significa que o preview pode incluir o número se o item.prefixoVisual não foi bem detectado
                    // ou não correspondeu à forma como o texto começa.
                }
            }
            // Agora, textoParaPreviewOriginal DEVE ser o texto APÓS o número/ponto.

            const textoParaPreviewNormalizado = removerAcentos(textoParaPreviewOriginal.toLowerCase());

            const trechoMaxChars = 180;
            let startIndexNoPreviewNormalizado = textoParaPreviewNormalizado.indexOf(termoNormalizadoParaFiltro);
            if (startIndexNoPreviewNormalizado === -1) {
                 // Se o termo não estiver no corpo do texto do preview (após o número),
                 // verificamos se ele está no NÚMERO em si.
                 const numNormalizado = removerAcentos(item.numero.toLowerCase()); // item.numero são só os dígitos
                 if (numNormalizado.includes(termoNormalizadoParaFiltro)) {
                     // O termo está no número. Não há o que centralizar no texto principal.
                     // O preview do texto começará do início.
                     startIndexNoPreviewNormalizado = 0; // Ou um valor que indique para não cortar
                 } else {
                    startIndexNoPreviewNormalizado = 0; // Termo não encontrado nem no número nem no texto, mostra início.
                 }
            }

            let corteInicioOriginal = 0;
            if (startIndexNoPreviewNormalizado > 0 && textoParaPreviewOriginal.length > 0) { // Apenas se houver texto e o índice for positivo
                 let charCountNorm = 0;
                 for (let i = 0; i < textoParaPreviewOriginal.length; i++) {
                    if (charCountNorm >= startIndexNoPreviewNormalizado) {
                        corteInicioOriginal = i;
                        break;
                    }
                    charCountNorm += (removerAcentos(textoParaPreviewOriginal[i].toLowerCase()).length || 1);
                    if (i === textoParaPreviewOriginal.length - 1) { // Se chegou ao fim do loop
                        corteInicioOriginal = (charCountNorm >= startIndexNoPreviewNormalizado) ? i : textoParaPreviewOriginal.length;
                    }
                 }
            }
            
            let previewStartPosOriginal = Math.max(0, corteInicioOriginal - Math.floor(trechoMaxChars / 3));
            let previewConteudoCortado = textoParaPreviewOriginal.substring(
                previewStartPosOriginal,
                previewStartPosOriginal + trechoMaxChars
            );

            let prefixoEllipsis = (previewStartPosOriginal > 0) ? "..." : "";
            let sufixoEllipsis = ((previewStartPosOriginal + trechoMaxChars) < textoParaPreviewOriginal.length) ? "..." : "";
            
            let previewTextParaMarcar = prefixoEllipsis + previewConteudoCortado + sufixoEllipsis;

            let trechoHtmlMarcado = "";
            const previewTextNormalizadoParaMatch = removerAcentos(previewTextParaMarcar.toLowerCase());
            // Usar termoNormalizadoParaFiltro para encontrar no previewTextNormalizadoParaMatch
            const regexTermoNormalizadoParaHighlight = new RegExp(termoNormalizadoParaFiltro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            let ultimoIndiceOriginalNoPreview = 0;
            let matchNormalizadoNoPreview;

            if (termoNormalizadoParaFiltro === "" || !previewTextNormalizadoParaMatch.includes(termoNormalizadoParaFiltro)) {
                trechoHtmlMarcado = previewTextParaMarcar.replace(/</g, "<").replace(/>/g, ">");
            } else {
                while ((matchNormalizadoNoPreview = regexTermoNormalizadoParaHighlight.exec(previewTextNormalizadoParaMatch)) !== null) {
                    const inicioMatchNorm = matchNormalizadoNoPreview.index;
                    const fimMatchNorm = inicioMatchNorm + matchNormalizadoNoPreview[0].length;
                    let inicioMatchOrig = -1, fimMatchOrig = -1;
                    let currentNormPos = 0, iOrigPreview = 0;
                    let encontrouInicio = false;

                    for (iOrigPreview = 0; iOrigPreview < previewTextParaMarcar.length; iOrigPreview++) {
                        const charOrig = previewTextParaMarcar[iOrigPreview];
                        const charNorm = removerAcentos(charOrig.toLowerCase());
                        const lenCharNorm = charNorm.length;
                        if (!encontrouInicio) { if(currentNormPos <= inicioMatchNorm && (currentNormPos + lenCharNorm > inicioMatchNorm || (lenCharNorm === 0 && currentNormPos === inicioMatchNorm)) ){ inicioMatchOrig = iOrigPreview; encontrouInicio = true; }}
                        if (encontrouInicio) { if (currentNormPos < fimMatchNorm && currentNormPos + lenCharNorm >= fimMatchNorm) { fimMatchOrig = iOrigPreview + 1; break; }}
                        if (lenCharNorm > 0) { currentNormPos += lenCharNorm; } else if (currentNormPos === inicioMatchNorm && encontrouInicio && currentNormPos < fimMatchNorm){} else if (encontrouInicio && currentNormPos < fimMatchNorm) {} else if (!encontrouInicio && currentNormPos > inicioMatchNorm && lenCharNorm === 0){}
                    }
                    if (encontrouInicio && fimMatchOrig === -1 && currentNormPos >= fimMatchNorm) { fimMatchOrig = previewTextParaMarcar.length; }
                    if (encontrouInicio && fimMatchOrig === -1 && iOrigPreview === previewTextParaMarcar.length && currentNormPos === fimMatchNorm){ fimMatchOrig = previewTextParaMarcar.length; }

                    if (inicioMatchOrig !== -1 && fimMatchOrig !== -1 && fimMatchOrig >= inicioMatchOrig) {
                        trechoHtmlMarcado += previewTextParaMarcar.substring(ultimoIndiceOriginalNoPreview, inicioMatchOrig).replace(/</g, "<").replace(/>/g, ">");
                        trechoHtmlMarcado += '<mark>' + previewTextParaMarcar.substring(inicioMatchOrig, fimMatchOrig).replace(/</g, "<").replace(/>/g, ">") + '</mark>';
                        ultimoIndiceOriginalNoPreview = fimMatchOrig;
                    } else {
                        trechoHtmlMarcado += previewTextParaMarcar.substring(ultimoIndiceOriginalNoPreview).replace(/</g, "<").replace(/>/g, ">");
                        ultimoIndiceOriginalNoPreview = previewTextParaMarcar.length;
                        break; 
                    }
                }
                if (ultimoIndiceOriginalNoPreview < previewTextParaMarcar.length) {
                    trechoHtmlMarcado += previewTextParaMarcar.substring(ultimoIndiceOriginalNoPreview).replace(/</g, "<").replace(/>/g, ">");
                }
            }

            const conteudoDivResultado = document.createElement('div');
            conteudoDivResultado.className = 'resultado-item-conteudo';
            conteudoDivResultado.innerHTML = trechoHtmlMarcado;

            divResultadoCard.appendChild(metaTopoDiv);
            divResultadoCard.appendChild(conteudoDivResultado);
            divResultadoCard.addEventListener('click', () => selecionarItemResultado(item, divResultadoCard));
            divResultadoCard.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionarItemResultado(item, divResultadoCard); }});
            listaResultadosContainer.appendChild(divResultadoCard);

            if (index === 0 && resultadosEncontrados.length > 0) {
                selecionarItemResultado(item, divResultadoCard);
            }
        });
    }

    resultadosDiv.appendChild(headerContainer);
    resultadosDiv.appendChild(listaResultadosContainer);
    resultadosDiv.scrollTop = 0;
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";
}


async function selecionarItemResultado(item, elementoLista) {
    // console.log("Item selecionado:", item);

    if (elementoSelecionadoAtual) {
        elementoSelecionadoAtual.classList.remove('selecionado');
    }
    elementoLista.classList.add('selecionado');
    elementoSelecionadoAtual = elementoLista;
    itemSelecionadoAtual = item;

    elementoLista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    conteudoDiv.innerHTML = '<div class="loading-content">Carregando conteúdo...</div>';
    conteudoDiv.classList.remove('oculto'); 

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
    // console.log("Renderizando conteúdo principal para:", urlArquivo, "Alvo:", itemAlvo.textoOriginalCompleto.substring(0, 50) + "...");
    ultimoArquivoCarregado = urlArquivo;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlCompleto, 'text/html');
    conteudoDiv.innerHTML = ''; 

    Array.from(doc.body.childNodes).forEach(node => {
        conteudoDiv.appendChild(node.cloneNode(true));
    });

    setTimeout(() => {
        // console.log("RENDERIZAR: Dentro do setTimeout. Termo atual para marcar:", termoAtualBusca);
        
        marcarTermoNoConteudo(conteudoDiv, termoAtualBusca); // termoAtualBusca tem acentos, se digitado
        
        conteudoDiv.scrollTop = 0; 
        rolarParaParagrafoNoConteudo(conteudoDiv, itemAlvo.textoOriginalCompleto);
        ativarNotasHover(conteudoDiv);
    }, 150);
}

function marcarTermoNoConteudo(container, termoBuscadoComAcentos) { 
    const termoBuscadoNormalizado = removerAcentos(termoBuscadoComAcentos);

    if (!termoBuscadoNormalizado || termoBuscadoNormalizado.length < MIN_SEARCH_TERM_LENGTH) {
        return;
    }

    const elementosParaMarcar = container.querySelectorAll(
        '.paragrafo, .ponto-com-notas, p:not(.marcacao):not(.titulo), h1, h2, h3, h4, h5, h6, li'
    );

    elementosParaMarcar.forEach(el => {
        if (el.closest('.nota-associada')) return;

        const walker = document.createTreeWalker(
            el,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (node.parentNode.nodeName === 'SCRIPT' || node.parentNode.nodeName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (removerAcentos(node.nodeValue.toLowerCase()).includes(termoBuscadoNormalizado)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            },
            false
        );

        let node;
        const nodesParaProcessar = []; 
        while (node = walker.nextNode()) {
            nodesParaProcessar.push(node);
        }

        nodesParaProcessar.forEach(textNode => {
            const originalNodeText = textNode.nodeValue; 
            const normalizedNodeText = removerAcentos(originalNodeText.toLowerCase()); 
            
            if (normalizedNodeText.includes(termoBuscadoNormalizado)) {
                const fragment = document.createDocumentFragment();
                let ultimoIndiceNoOriginal = 0;
                const regexNormalizado = new RegExp(termoBuscadoNormalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                let matchNormalizado;

                while ((matchNormalizado = regexNormalizado.exec(normalizedNodeText)) !== null) {
                    const inicioMatchNormalizado = matchNormalizado.index;
                    const fimMatchNormalizado = inicioMatchNormalizado + matchNormalizado[0].length;

                    let inicioMatchOriginal = -1;
                    let fimMatchOriginal = -1; 
                    let currentNormalizedPos = 0;
                    let iOriginal = 0;
                    let encontrouInicioOriginal = false;

                    for (iOriginal = 0; iOriginal < originalNodeText.length; iOriginal++) {
                        const charOriginal = originalNodeText[iOriginal];
                        const charNormalizado = removerAcentos(charOriginal.toLowerCase());
                        const lenCharNormalizado = charNormalizado.length;

                        if (!encontrouInicioOriginal) {
                             if(currentNormalizedPos <= inicioMatchNormalizado && (currentNormalizedPos + lenCharNormalizado > inicioMatchNormalizado || (lenCharNormalizado === 0 && currentNormalizedPos === inicioMatchNormalizado)) ){
                                inicioMatchOriginal = iOriginal;
                                encontrouInicioOriginal = true;
                            }
                        }
                        
                        if (encontrouInicioOriginal) {
                            if (currentNormalizedPos < fimMatchNormalizado && currentNormalizedPos + lenCharNormalizado >= fimMatchNormalizado) {
                                fimMatchOriginal = iOriginal + 1;
                                break; 
                            }
                        }
                        
                        if (lenCharNormalizado > 0 || encontrouInicioOriginal) { // Avança se tem comprimento ou se já achou o início e pode ser um diacrítico
                           currentNormalizedPos += lenCharNormalizado;
                        }
                    }

                    if (encontrouInicioOriginal && fimMatchOriginal === -1 && currentNormalizedPos >= fimMatchNormalizado) {
                         fimMatchOriginal = originalNodeText.length;
                    }
                    if (encontrouInicioOriginal && fimMatchOriginal === -1 && iOriginal === originalNodeText.length && currentNormalizedPos === fimMatchNormalizado){
                        fimMatchOriginal = originalNodeText.length;
                    }


                    if (inicioMatchOriginal !== -1 && fimMatchOriginal !== -1 && fimMatchOriginal >= inicioMatchOriginal) {
                        if (inicioMatchOriginal > ultimoIndiceNoOriginal) {
                            fragment.appendChild(document.createTextNode(originalNodeText.substring(ultimoIndiceNoOriginal, inicioMatchOriginal)));
                        }
                        const markElement = document.createElement('mark');
                        markElement.textContent = originalNodeText.substring(inicioMatchOriginal, fimMatchOriginal);
                        fragment.appendChild(markElement);
                        ultimoIndiceNoOriginal = fimMatchOriginal;
                    } else {
                        // console.warn("MarcarTermoNoConteudo: Falha ao mapear.", {originalNodeText, normalizedNodeText, termoBuscadoNormalizado, matchNormalizado, inicioMatchOriginal, fimMatchOriginal});
                        if (ultimoIndiceNoOriginal < originalNodeText.length) {
                           fragment.appendChild(document.createTextNode(originalNodeText.substring(ultimoIndiceNoOriginal)));
                        }
                        ultimoIndiceNoOriginal = originalNodeText.length;
                        break; 
                    }
                } 
                
                if (ultimoIndiceNoOriginal < originalNodeText.length) {
                    fragment.appendChild(document.createTextNode(originalNodeText.substring(ultimoIndiceNoOriginal)));
                }

                if (fragment.childNodes.length > 0 && textNode.parentNode) {
                    if (fragment.childNodes.length !== 1 || fragment.firstChild.nodeType !== Node.TEXT_NODE || fragment.firstChild.nodeValue !== originalNodeText) {
                         textNode.parentNode.replaceChild(fragment, textNode);
                    }
                }
            } 
        }); 
    }); 
}


function rolarParaParagrafoNoConteudo(container, textoDoItemDoCache) {
    // console.log("----------------------------------------------------");
    // console.log("Tentando rolar para o item com texto (do cache):", `"${textoDoItemDoCache.substring(0,70)}..."`);
    // console.log("----------------------------------------------------");

    const todosOsParagrafosNaPagina = container.querySelectorAll(
        '.paragrafo, .ponto-com-notas, p:not(.marcacao):not(.titulo), h2:not(.marcacao), h3:not(.marcacao), h4:not(.marcacao), h5:not(.marcacao), h6:not(.marcacao)'
    );

    let encontrado = false;

    for (const paragrafoAtualDaPagina of todosOsParagrafosNaPagina) {
        const cloneDoParagrafo = paragrafoAtualDaPagina.cloneNode(true);
        cloneDoParagrafo.querySelectorAll('mark').forEach(mark => {
            const pai = mark.parentNode;
            if (pai) {
                pai.replaceChild(document.createTextNode(mark.textContent), mark);
                pai.normalize(); 
            }
        });
        cloneDoParagrafo.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(el => el.remove());
        
        let textoDoParagrafoDaPaginaLimpo = cloneDoParagrafo.textContent.trim().replace(/\s+/g, ' ');
        let textoDoCacheNormalizado = textoDoItemDoCache.trim().replace(/\s+/g, ' ');

        if (textoDoParagrafoDaPaginaLimpo === textoDoCacheNormalizado) {
            // console.log("### SUCESSO! Parágrafo encontrado para rolagem! ###");
            const containerRect = container.getBoundingClientRect();
            const targetRect = paragrafoAtualDaPagina.getBoundingClientRect();
            const scrollTopCalculado = container.scrollTop + (targetRect.top - containerRect.top) - (container.clientHeight / 2) + (paragrafoAtualDaPagina.clientHeight / 2);
            
            container.scrollTo({ top: scrollTopCalculado, behavior: 'smooth' });
            paragrafoAtualDaPagina.classList.add('paragrafo-destacado-flash');
            setTimeout(() => paragrafoAtualDaPagina.classList.remove('paragrafo-destacado-flash'), 2500);
            encontrado = true;
            break; 
        }
    }

    // if (!encontrado) {
        // console.error("### FALHA: Parágrafo alvo NÃO encontrado no DOM para rolagem.");
        // console.error(`Texto do Cache que não foi encontrado: "${textoDoItemDoCache.substring(0,100)}..."`);
    // }
    // console.log("----------------------------------------------------");
}

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes flashBackground {
    0% { background-color: transparent; }
    25% { background-color: #fff3c4; } /* Amarelo claro para flash */
    75% { background-color: #fff3c4; }
    100% { background-color: transparent; }
  }
  .paragrafo-destacado-flash {
    animation: flashBackground 1.5s ease-out;
    border-radius: 4px;
  }
  /* Estilo para <mark> se quiser customizar */
  /* mark { background-color: #ffda77; padding: 0.1em 0; } */
`;
document.head.appendChild(styleSheet);

function ativarNotasHover(container) {
    const pontosComNotas = container.querySelectorAll(".ponto-com-notas");
    pontosComNotas.forEach(ponto => {
        const refs = ponto.querySelectorAll(".ref-nota");
        const notasAssociadasNoPonto = ponto.querySelectorAll(".nota-associada");

        refs.forEach(ref => {
            const refNum = ref.dataset.ref;
            if (!refNum) return;

            let targetNotas = [];
            notasAssociadasNoPonto.forEach(nota => {
                if (nota.textContent.trim().startsWith(refNum + ".")) {
                    targetNotas.push(nota);
                    nota.style.display = "none";
                    nota.style.opacity = "0";
                    nota.style.transition = "opacity 0.3s ease-in-out, transform 0.3s ease-in-out";
                }
            });

            if (targetNotas.length > 0) {
                ref.addEventListener("mouseenter", () => {
                    targetNotas.forEach(nota => {
                        nota.style.display = "block";
                        requestAnimationFrame(() => { // Forçar reflow para transição
                            requestAnimationFrame(() => {
                                nota.style.opacity = "1";
                            });
                        });
                    });
                });
                ref.addEventListener("mouseleave", () => {
                    targetNotas.forEach(nota => {
                        nota.style.opacity = "0";
                        setTimeout(() => {
                            if (nota.style.opacity === "0") { // Checar se ainda deve estar escondida
                                nota.style.display = "none";
                            }
                        }, 300); 
                    });
                });
            }
        });
    });
}