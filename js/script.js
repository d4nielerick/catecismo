// --- DOM Elements ---
const campoBusca = document.getElementById('campo-busca');
const botaoBuscar = document.getElementById('botao-buscar');
const resultadosDiv = document.getElementById('resultados');
const conteudoDiv = document.getElementById('conteudo');
const buscaContainer = document.getElementById('busca-container');
const painelBusca = document.getElementById('painel-busca');
const statusMessagesDiv = document.getElementById('status-messages');
const sugestoesBuscaContainer = document.getElementById('sugestoes-busca-container');

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

// --- Configuration ---
// ... (ARQUIVOS_CATECISMO e MIN_SEARCH_TERM_LENGTH como antes) ...

const TEMAS_SUGERIDOS = [
    { nome: "Os Sacramentos", termoBusca: "sacramentos" },
    { nome: "Mandamentos", termoBusca: "dez mandamentos" },
    { nome: "Oração do Pai Nosso", termoBusca: "pai nosso" },
    { nome: "Bem-aventuranças", termoBusca: "bem-aventuranças" },
    { nome: "Santíssima Trindade", termoBusca: "trindade" },
    { nome: "Maria, Mãe de Deus", termoBusca: "maria mãe de deus" },
    { nome: "A Igreja", termoBusca: "igreja Una Santa" },
    { nome: "Vida Eterna", termoBusca: "vida eterna" },
    { nome: "Pecado Original", termoBusca: "pecado original" },
    { nome: "Eucaristia", termoBusca: "eucaristia presença real" }
    // Adicione mais temas conforme necessário
];

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

        // Mostrar sugestões quando o campo de busca está vazio e recebe foco
        campoBusca.addEventListener('focus', () => {
            if (campoBusca.value.trim() === '' && resultadosDiv.classList.contains('oculto')) { // Só mostra se não houver resultados ativos
                renderizarSugestoes();
            }
        });

        // Opcional: esconder sugestões quando o usuário começa a digitar
        // campoBusca.addEventListener('input', () => {
        //     const container = document.getElementById('sugestoes-busca-container');
        //     if (container && campoBusca.value.trim() !== '') {
        //         container.classList.add('oculto');
        //     }
        // });

        // Opcional: esconder sugestões ao clicar fora
        // document.addEventListener('click', function(event) {
        //     const container = document.getElementById('sugestoes-busca-container');
        //     const isClickInsideCampo = campoBusca.contains(event.target);
        //     const isClickInsideSugestoes = container ? container.contains(event.target) : false;

        //     if (!isClickInsideCampo && !isClickInsideSugestoes && container) {
        //         container.classList.add('oculto');
        //     }
        // });

    } else {
        console.error("Elementos de busca (campo ou botão) não encontrados.");
    }
    carregarTodosOsArquivos();

    renderizarSugestoes(); // <<<<<< MOSTRAR SUGESTÕES INICIALMENTE

     // --- ADICIONAR ESTE LISTENER PARA A TECLA ESC ---
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" || event.keyCode === 27) {
            // Verificar se há resultados visíveis ou se o campo de busca tem texto
            // para decidir se o ESC deve limpar a busca.
            // Isso evita que o ESC limpe tudo se o usuário só abriu a página e apertou ESC.
            const resultadosEstaoVisiveis = resultadosDiv && !resultadosDiv.classList.contains('oculto') && resultadosDiv.innerHTML.trim() !== '';
            const campoTemTexto = campoBusca && campoBusca.value.trim() !== '';

            if (resultadosEstaoVisiveis || campoTemTexto) {
                limparBuscaEResultados();
            }
        }
    });
    // --- FIM DO LISTENER PARA A TECLA ESC ---

});

// --- Utility Functions ---
function removerAcentos(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


// --- Functions for Suggestions ---

function renderizarSugestoes() {
    let containerParaSugestoes = document.getElementById('sugestoes-busca-container');

    // Se o container não existe no HTML (Opção B), cria e insere
    if (!containerParaSugestoes) {
        containerParaSugestoes = document.createElement('div');
        containerParaSugestoes.id = 'sugestoes-busca-container';
        containerParaSugestoes.className = 'sugestoes-busca-container'; // Adicionaremos estilo para esta classe
        
        const barraDeBuscaWrapperEl = document.querySelector('.barra-de-busca-wrapper');
        if (barraDeBuscaWrapperEl && barraDeBuscaWrapperEl.parentNode) {
            // Insere o container de sugestões DEPOIS do wrapper da barra de busca
            barraDeBuscaWrapperEl.parentNode.insertBefore(containerParaSugestoes, barraDeBuscaWrapperEl.nextSibling);
        } else {
            console.error("Wrapper da barra de busca não encontrado para inserir sugestões.");
            return; // Não pode renderizar sem um lugar para colocar
        }
    }

    containerParaSugestoes.innerHTML = ''; // Limpa sugestões anteriores

    if (TEMAS_SUGERIDOS.length > 0) {
        const tituloSugestoes = document.createElement('p');
        tituloSugestoes.className = 'sugestoes-titulo';
        tituloSugestoes.textContent = 'Experimente pesquisar por:';
        containerParaSugestoes.appendChild(tituloSugestoes);

        const listaSugestoesUl = document.createElement('ul');
        listaSugestoesUl.className = 'sugestoes-lista';

        TEMAS_SUGERIDOS.forEach(tema => {
            const listItem = document.createElement('li');
            const buttonItem = document.createElement('button');
            buttonItem.className = 'sugestao-item-botao';
            buttonItem.textContent = tema.nome;
            buttonItem.type = 'button'; // Importante para não submeter forms
            buttonItem.addEventListener('click', () => {
                campoBusca.value = tema.termoBusca;
                executarBusca(); // Executa a busca com o termo da sugestão
                // Opcional: esconder sugestões após clique
                // containerParaSugestoes.classList.add('oculto'); 
            });
            listItem.appendChild(buttonItem);
            listaSugestoesUl.appendChild(listItem);
        });
        containerParaSugestoes.appendChild(listaSugestoesUl);
        containerParaSugestoes.classList.remove('oculto'); // Mostra o container
    } else {
        containerParaSugestoes.classList.add('oculto'); // Esconde se não houver sugestões
    }
}

// --- Core Functions ---
// Função carregarTodosOsArquivos (COMPLETA E REFINADA com herança de "ponto")
async function carregarTodosOsArquivos() {
    if (statusMessagesDiv) statusMessagesDiv.textContent = 'Carregando dados do Catecismo...';
    resultadosDiv.classList.add('oculto');
    conteudoDiv.classList.add('oculto');
    idsDeTextoNoCache.clear();
    cache = [];
    proximoIdParagrafo = 0;

    let arquivosCarregados = 0;

    for (const arquivo of ARQUIVOS_CATECISMO) {
        try {
            const response = await fetch(arquivo.url);
            if (!response.ok) { /* ... erro ... */ continue; }
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            let ultimaParteNome = "";
            let ultimoCapituloNome = "";
            
            // --- NOVAS VARIÁVEIS PARA HERANÇA DE PONTO ---
            let ultimoNumeroDoPontoValido = "";
            let ultimoPrefixoVisualValido = "";
            // --- FIM DAS NOVAS VARIÁVEIS ---

            const elementosProcessaveis = Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, .paragrafo, .ponto-com-notas, section.capitulo, div.parte'));

            for (const el of elementosProcessaveis) {
                if (el.closest('.nota-associada')) continue;

                // Lógica de PARTE (reinicia o último ponto válido)
                if (el.matches('h1.parte, div.parte, .marcacao.parte') || (el.tagName === 'H1' && el.textContent.toLowerCase().includes("parte"))) {
                    const textoCompletoElementoParte = el.textContent.trim();
                    const matchRegExpParte = textoCompletoElementoParte.match(/^(PRIMEIRA PARTE|SEGUNDA PARTE|TERCEIRA PARTE|QUARTA PARTE)/i);
                    if (matchRegExpParte && matchRegExpParte[0]) {
                        ultimaParteNome = matchRegExpParte[0].toUpperCase();
                    } else { /* ... fallback de parte ... */ }
                    ultimoCapituloNome = "";
                    ultimoNumeroDoPontoValido = ""; // Reinicia ao encontrar nova PARTE
                    ultimoPrefixoVisualValido = ""; // Reinicia ao encontrar nova PARTE
                    continue;
                }

                // Lógica de CAPÍTULO (também pode reiniciar o último ponto, dependendo da sua estrutura)
                // Se um capítulo sempre começa com um novo ponto, não precisa reiniciar aqui.
                // Se um capítulo pode conter continuações de pontos anteriores, não reinicie.
                // Por agora, vamos assumir que um capítulo PODE continuar pontos.
                let tituloCapituloElement = null;
                if (el.matches('section.capitulo h2, section.capitulo h3, h2.capitulo-titulo')) { /* ... */ }
                // ... (resto da lógica de capítulo como antes) ...
                if (tituloCapituloElement) {
                    let nomeCapitulo = tituloCapituloElement.textContent.trim();
                    nomeCapitulo = nomeCapitulo.replace(/^Capítulo\s*[\w\dºª°]+\s*[:–-]?\s*/i, '').trim();
                    ultimoCapituloNome = nomeCapitulo.split(':')[0].trim();
                    // NÃO reiniciamos ultimoNumeroDoPontoValido aqui, para permitir herança através de títulos de capítulo
                    // se o primeiro parágrafo do capítulo não tiver seu próprio número.
                }

                let isConteudoParaCache = false;
                // ... (lógica de isConteudoParaCache como antes) ...
                if (el.matches('.paragrafo, .ponto-com-notas')) { isConteudoParaCache = true; }
                else if (el.tagName === 'P' && !el.matches('.marcacao, .titulo, .subtitulo')) { isConteudoParaCache = true; }
                else if (['H2','H3','H4','H5','H6'].includes(el.tagName) && el.textContent.trim().length > 15 && !tituloCapituloElement) { isConteudoParaCache = true; }


                if (isConteudoParaCache) {
                    const elementoClone = el.cloneNode(true);
                    elementoClone.querySelectorAll('.nota-associada, .ref-nota, sup.ref-nota').forEach(notaEl => notaEl.remove());
                    let textoExtraidoDoElementoOriginal = elementoClone.textContent.trim().replace(/\s+/g, ' ');

                    let numeroDoPontoAtual = ""; 
                    let prefixoVisualAtual = ""; 
                    let textoAposPontoParaBuscaAtual = textoExtraidoDoElementoOriginal;
                    let ehUmNovoPonto = false; // Flag para saber se este parágrafo definiu seu próprio ponto

                    const matchNumInicial = textoExtraidoDoElementoOriginal.match(/^(\s*\d+)/);
                    if (matchNumInicial) {
                        const numeroDetectado = matchNumInicial[1].trim();
                        let posAposNumero = matchNumInicial[0].length;
                        let prefixoVisualConstruido = numeroDetectado;

                        if (posAposNumero < textoExtraidoDoElementoOriginal.length && textoExtraidoDoElementoOriginal[posAposNumero] === '.') {
                            prefixoVisualConstruido += '.';
                            posAposNumero++;
                            if (posAposNumero < textoExtraidoDoElementoOriginal.length && 
                                textoExtraidoDoElementoOriginal[posAposNumero] >= 'A' && 
                                textoExtraidoDoElementoOriginal[posAposNumero] <= 'Z') {
                                prefixoVisualConstruido += textoExtraidoDoElementoOriginal[posAposNumero];
                                posAposNumero++;
                            }
                        } 
                        
                        let posicaoFinalPrefixoParaCorte = posAposNumero;
                        while (posicaoFinalPrefixoParaCorte < textoExtraidoDoElementoOriginal.length && 
                               textoExtraidoDoElementoOriginal[posicaoFinalPrefixoParaCorte] === ' ') {
                            posicaoFinalPrefixoParaCorte++;
                        }

                        const temTextoApos = posicaoFinalPrefixoParaCorte < textoExtraidoDoElementoOriginal.length;
                        const prefixoTemPontuacaoOuLetra = prefixoVisualConstruido.length > numeroDetectado.length;
                        const houveEspacosAposPrefixoVisual = posicaoFinalPrefixoParaCorte > posAposNumero;
                        const textoOriginalEhApenasONumero = (textoExtraidoDoElementoOriginal.trim() === numeroDetectado && !temTextoApos);

                        if (houveEspacosAposPrefixoVisual || prefixoTemPontuacaoOuLetra || temTextoApos || textoOriginalEhApenasONumero) {
                            numeroDoPontoAtual = numeroDetectado;
                            prefixoVisualAtual = prefixoVisualConstruido;
                            ehUmNovoPonto = true; // Este parágrafo definiu seu próprio ponto

                            if (textoOriginalEhApenasONumero) {
                                textoAposPontoParaBuscaAtual = "";
                            } else {
                                textoAposPontoParaBuscaAtual = textoExtraidoDoElementoOriginal.substring(posicaoFinalPrefixoParaCorte);
                            }
                            // ATUALIZA O ÚLTIMO PONTO VÁLIDO ENCONTRADO
                            ultimoNumeroDoPontoValido = numeroDoPontoAtual;
                            ultimoPrefixoVisualValido = prefixoVisualAtual;
                        }
                    }
                    
                    // Se este parágrafo NÃO definiu seu próprio ponto, ele herda o último válido
                    // E não é um título (títulos não herdam o número do ponto para exibição como tag)
                    if (!ehUmNovoPonto && !['H2','H3','H4','H5','H6'].includes(el.tagName)) {
                        numeroDoPontoAtual = ultimoNumeroDoPontoValido;
                        prefixoVisualAtual = ultimoPrefixoVisualValido;
                        // textoAposPontoParaBuscaAtual já é textoExtraidoDoElementoOriginal, o que é correto
                        // pois não há prefixo a remover deste texto específico.
                    }

                    // Se for um título H2-H6 e não definiu seu próprio ponto, ele não recebe número de ponto.
                    if (['H2','H3','H4','H5','H6'].includes(el.tagName) && !ehUmNovoPonto) {
                        numeroDoPontoAtual = ""; // Títulos não devem ter a tag "§ NNNN" a menos que comecem com NNNN.
                        prefixoVisualAtual = "";
                    }
                    
                    if (textoExtraidoDoElementoOriginal && textoExtraidoDoElementoOriginal.length >= 1) {
                        // Usar textoAposPontoParaBuscaAtual para o ID do cache (se ehUmNovoPonto)
                        // ou textoExtraidoDoElementoOriginal se não for um novo ponto (pois não houve remoção de prefixo).
                        let textoBaseParaIdCache = ehUmNovoPonto ? textoAposPontoParaBuscaAtual : textoExtraidoDoElementoOriginal;
                        const textoIdCacheNormalizado = removerAcentos(textoBaseParaIdCache.toLowerCase());
                        
                        let chaveDuplicata = "";
                        if (textoBaseParaIdCache.length > 5) {
                            chaveDuplicata = textoIdCacheNormalizado;
                        } else if (numeroDoPontoAtual) { 
                            chaveDuplicata = `num:${numeroDoPontoAtual}|${textoIdCacheNormalizado}`;
                        } else { 
                            chaveDuplicata = textoIdCacheNormalizado;
                        }

                        if (chaveDuplicata && idsDeTextoNoCache.has(chaveDuplicata)) { 
                            continue;
                        }
                        if (chaveDuplicata) { 
                            idsDeTextoNoCache.add(chaveDuplicata);
                        }

                        const paragrafoId = `paragrafo-${proximoIdParagrafo++}`;
                        cache.push({
                            id: paragrafoId,
                            textoOriginalCompleto: textoExtraidoDoElementoOriginal,
                            textoNormalizadoParaBusca: removerAcentos(textoBaseParaIdCache.toLowerCase()), // Importante: usa o texto que foi usado para chaveDuplicata
                            htmlOriginal: el.outerHTML,
                            arquivoUrl: arquivo.url,
                            arquivoNome: arquivo.nome,
                            parte: ultimaParteNome,
                            capitulo: ultimoCapituloNome,
                            numero: numeroDoPontoAtual, // Pode ser o próprio ou herdado
                            prefixoVisual: prefixoVisualAtual // Pode ser o próprio ou herdado
                        });
                    }
                }
            }
            arquivosCarregados++;
        } catch (error) { /* ... */ }
    }
    // ... (mensagens de finalização como antes) ...
}

// Função executarBusca (COMPLETA E AJUSTADA com limparBuscaEResultados)
function executarBusca() {
    const termoInputUsuario = campoBusca.value.trim();
    termoAtualBusca = termoInputUsuario.toLowerCase(); 
    const termoNormalizadoParaFiltro = removerAcentos(termoAtualBusca);

    // Esconder sugestões assim que uma busca é iniciada (se a busca for válida)
    if (termoInputUsuario.length >= MIN_SEARCH_TERM_LENGTH) {
        const containerSugestoes = document.getElementById('sugestoes-busca-container');
        if (containerSugestoes) {
            containerSugestoes.classList.add('oculto');
        }
    }

    // Limpeza inicial ANTES de verificar MIN_SEARCH_TERM_LENGTH,
    // pois mesmo uma busca inválida deve limpar resultados anteriores.
    if (resultadosDiv) {
        resultadosDiv.innerHTML = ''; 
    }
    if (conteudoDiv) {
        conteudoDiv.innerHTML = '';
        conteudoDiv.classList.add('oculto');
    }
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
        resultadosDiv.appendChild(headerContainer); // Adiciona o header de erro
        resultadosDiv.classList.remove('oculto'); // Mostra o painel de resultados com o erro
        
        const btnErro = document.getElementById('btnNovaBuscaHeaderErro');
        if(btnErro) {
            btnErro.addEventListener('click', limparBuscaEResultados); // <<< USA A NOVA FUNÇÃO
        }
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        
        // Rolagem após busca inválida
        if (buscaContainer) { 
            setTimeout(() => {
                 const barraDeBuscaWrapperEl = document.querySelector('.barra-de-busca-wrapper');
                 if (barraDeBuscaWrapperEl) {
                    const yOffset = -10; 
                    const y = barraDeBuscaWrapperEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
                    window.scrollTo({top: y, behavior: 'smooth'});
                 } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                 }
            }, 50);
        }
        return;
    }
    // Se a busca for válida (passou do MIN_SEARCH_TERM_LENGTH), aí sim mostra resultadosDiv
    resultadosDiv.classList.remove('oculto'); 

    // A linha abaixo foi movida para o início de executarBusca (antes da checagem de MIN_SEARCH_TERM_LENGTH)
    // const containerSugestoes = document.getElementById('sugestoes-busca-container');
    // if (containerSugestoes) {
    //     containerSugestoes.classList.add('oculto');
    // }

    const resultadosEncontrados = cache.filter(item => {
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
    
    // Removido o if(btnHeader) porque novaBuscaButton é criado aqui, então sempre existirá.
    novaBuscaButton.addEventListener('click', limparBuscaEResultados); // <<< USA A NOVA FUNÇÃO
    
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
        conteudoDiv.classList.add('oculto'); // Garante que o conteúdo não apareça se não houver resultados
    } else {
        conteudoDiv.classList.remove('oculto');
        // ... (o seu loop forEach para renderizar os resultadosEncontrados permanece aqui, idêntico à sua última versão)
        resultadosEncontrados.forEach((item, index) => {
            const divResultadoCard = document.createElement('div');
            divResultadoCard.className = 'resultado-item-card';
            divResultadoCard.setAttribute('role', 'button');
            divResultadoCard.setAttribute('tabindex', '0');

            const metaTopoDiv = document.createElement('div');
            metaTopoDiv.className = 'resultado-meta-topo';

            const tagParagrafoSpan = document.createElement('span');
            tagParagrafoSpan.className = 'resultado-tag-paragrafo';
            if (item.numero && item.numero.trim() !== "") { 
                tagParagrafoSpan.textContent = `§ ${item.numero}`;
            } else {
                const matchIdNum = item.id.match(/\d+$/);
                tagParagrafoSpan.textContent = matchIdNum ? `§ ${matchIdNum[0]}` : "Ref.";
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

            let textoBaseDoItemCompletoOriginal = item.textoOriginalCompleto; 
            let textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal; 

            if (item.prefixoVisual && item.prefixoVisual.trim() !== "") {
                const prefixoEscapado = item.prefixoVisual.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regexParaRemover = new RegExp(`^${prefixoEscapado}\\s+`);
                const matchPrefixoReal = textoBaseDoItemCompletoOriginal.match(regexParaRemover);
                if (matchPrefixoReal) {
                    textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal.substring(matchPrefixoReal[0].length);
                } else {
                    if (textoBaseDoItemCompletoOriginal.toLowerCase().startsWith(item.prefixoVisual.toLowerCase())) {
                        textoParaPreviewOriginal = textoBaseDoItemCompletoOriginal.substring(item.prefixoVisual.length).trimStart();
                    }
                }
            }
            
            const textoParaPreviewNormalizado = removerAcentos(textoParaPreviewOriginal.toLowerCase());
            const trechoMaxChars = 180;
            let startIndexNoPreviewNormalizado = textoParaPreviewNormalizado.indexOf(termoNormalizadoParaFiltro);

            if (startIndexNoPreviewNormalizado === -1) {
                 const numNormalizado = removerAcentos(item.numero.toLowerCase());
                 if (item.numero && numNormalizado.includes(termoNormalizadoParaFiltro)) { // Adicionada checagem se item.numero existe
                     startIndexNoPreviewNormalizado = 0; 
                 } else {
                    startIndexNoPreviewNormalizado = 0; 
                 }
            }

            let corteInicioOriginal = 0;
            if (startIndexNoPreviewNormalizado > 0 && textoParaPreviewOriginal.length > 0) {
                 let charCountNorm = 0;
                 for (let i = 0; i < textoParaPreviewOriginal.length; i++) {
                    if (charCountNorm >= startIndexNoPreviewNormalizado) {
                        corteInicioOriginal = i;
                        break;
                    }
                    charCountNorm += (removerAcentos(textoParaPreviewOriginal[i].toLowerCase()).length || 1);
                    if (i === textoParaPreviewOriginal.length - 1) { 
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
            const regexTermoNormalizadoParaHighlight = new RegExp(termoNormalizadoParaFiltro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            let ultimoIndiceOriginalNoPreview = 0;
            let matchNormalizadoNoPreview;

            // Correção: o escape para HTML estava incorreto antes. Deve ser < e >
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
        }); // Fim do forEach
    }

    resultadosDiv.appendChild(headerContainer);
    resultadosDiv.appendChild(listaResultadosContainer);
    resultadosDiv.scrollTop = 0; 
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";

    // --- SEÇÃO DE ROLAGEM DA PÁGINA ---
    if (resultadosEncontrados.length > 0 || termoInputUsuario.length >= MIN_SEARCH_TERM_LENGTH) {
        setTimeout(() => {
            const elementoAlvoParaScroll = painelBusca; 
            if (elementoAlvoParaScroll) {
                const yOffset = -20; 
                const elementoRect = elementoAlvoParaScroll.getBoundingClientRect();
                const y = elementoRect.top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 100); 
    }
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

// --- Utility Functions --- (ou onde você preferir colocar)
function removerAcentos(texto) { // Sua função existente
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function limparBuscaEResultados() {
    console.log("limparBuscaEResultados chamada"); // Para depuração

    if (campoBusca) { // Verifica se campoBusca existe
        campoBusca.value = '';
    }

    if (resultadosDiv) { // Verifica se resultadosDiv existe
        resultadosDiv.innerHTML = ''; 
        resultadosDiv.classList.add('oculto');
    }

    if (conteudoDiv) { // Verifica se conteudoDiv existe
        conteudoDiv.innerHTML = '';
        conteudoDiv.classList.add('oculto');
    }
    
    // Resetar estados globais relacionados à seleção
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;
    termoAtualBusca = ''; // Limpa o termo de busca atual
    
    // Mostrar introdução de volta (se houver elementos com essa classe)
    const introducoes = document.querySelectorAll('.introducao');
    if (introducoes.length > 0) {
        introducoes.forEach(intro => intro.classList.remove('oculto'));
    }

    if (campoBusca) {
        campoBusca.focus();
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Renderizar sugestões se a função existir e o campo estiver vazio
    // Adicione a verificação de 'typeof renderizarSugestoes'
    if (typeof renderizarSugestoes === 'function' && campoBusca && campoBusca.value.trim() === '') {
        renderizarSugestoes(); 
    } else if (typeof renderizarSugestoes === 'function') {
        // Se a função existe, mas o campo não está vazio (improvável aqui),
        // você pode decidir esconder as sugestões ou não fazer nada.
        // Por agora, chamamos se o campo estiver vazio.
        // Se o campo não estiver vazio, talvez você não queira mostrar sugestões imediatamente.
        // A lógica de mostrar/esconder sugestões pode ser mais complexa
        // e gerenciada pela própria função renderizarSugestoes ou pelos seus gatilhos.
        const containerSugestoes = document.getElementById('sugestoes-busca-container');
        if (containerSugestoes) { // Se o container existe, e não vamos renderizar novas, esconde
            if (campoBusca && campoBusca.value.trim() !== '') {
                 containerSugestoes.classList.add('oculto');
            } else {
                 renderizarSugestoes(); // Campo está vazio, então renderiza/mostra
            }
        }
    }
}