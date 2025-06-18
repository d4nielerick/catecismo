// --- DOM Elements (certifique-se que todos estão definidos no topo do seu script.js) ---
const campoBusca = document.getElementById('campo-busca');
const botaoBuscar = document.getElementById('botao-buscar');
const resultadosDiv = document.getElementById('resultados'); // Painel esquerdo
const conteudoDiv = document.getElementById('conteudo');   // Painel direito
const buscaContainer = document.getElementById('busca-container'); // Container geral da página
const painelBusca = document.getElementById('painel-busca');     // Container dos painéis resultados/conteúdo
const statusMessagesDiv = document.getElementById('status-messages');

const botaoLerCatecismo = document.getElementById('botao-ler-catecismo');
// Não precisamos de um botão "Voltar para Busca" global, ele será criado no header do índice.
const barraDeBuscaWrapper = document.querySelector('.barra-de-busca-wrapper');
const sugestoesContainerGlobal = document.getElementById('sugestoes-busca-container'); // Renomeado para evitar conflito com var local

// --- State & Cache (como antes) ---
let cache = [];
let idsDeTextoNoCache = new Set();
let ultimoArquivoCarregado = null;
let termoAtualBusca = '';
let cacheHTMLInteiro = {};
let proximoIdParagrafo = 0;
let itemSelecionadoAtual = null;
let elementoSelecionadoAtual = null;

// --- State para Modo Leitura ---
let modoLeituraAtivo = false;
let indiceCatecismo = []; 
let conteudoHtmlCompletoConcatenado = '';
let proximoIdIndice = 0;

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

// --- Initialization (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    if (botaoBuscar && campoBusca) {
        botaoBuscar.addEventListener('click', executarBusca);
        campoBusca.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executarBusca();
            }
        });
        campoBusca.addEventListener('focus', () => {
            if (campoBusca.value.trim() === '' && (!resultadosDiv || resultadosDiv.classList.contains('oculto') || resultadosDiv.innerHTML.trim() === '')) { 
                if (typeof renderizarSugestoes === 'function') renderizarSugestoes();
            }
        });
    } else {
        console.error("Elementos de busca (campo ou botão) não encontrados.");
    }

    if (botaoLerCatecismo) {
        botaoLerCatecismo.addEventListener('click', ativarModoLeitura);
    }
    
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" || event.keyCode === 27) {
            const resultadosEstaoVisiveis = resultadosDiv && !resultadosDiv.classList.contains('oculto') && resultadosDiv.innerHTML.trim() !== '';
            const campoTemTexto = campoBusca && campoBusca.value.trim() !== '';
            if (modoLeituraAtivo) { // Se estiver no modo leitura, ESC volta para busca
                desativarModoLeitura();
            } else if (resultadosEstaoVisiveis || campoTemTexto) { // Se estiver no modo busca e houver algo para limpar
                limparBuscaEResultados();
            }
        }
    });

    carregarTodosOsArquivos(); // Para a busca
    prepararDadosModoLeitura(); // Para o índice e conteúdo completo
    if (typeof renderizarSugestoes === 'function') renderizarSugestoes(); 


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

// --- Funções de Controle de UI e Modo ---

function alternarUiBuscaPrincipal(mostrar) {
    // Controla a barra de busca principal e o botão "Ler Catecismo"
    if (mostrar) {
        if (barraDeBuscaWrapper) barraDeBuscaWrapper.classList.remove('oculto');
        if (botaoLerCatecismo) botaoLerCatecismo.classList.remove('oculto');
        // Sugestões são controladas por renderizarSugestoes()
    } else {
        if (barraDeBuscaWrapper) barraDeBuscaWrapper.classList.add('oculto');
        if (botaoLerCatecismo) botaoLerCatecismo.classList.add('oculto');
        if (sugestoesContainerGlobal) sugestoesContainerGlobal.classList.add('oculto');
    }
}

function ativarModoLeitura() {
    if (modoLeituraAtivo) return; // Já está no modo leitura
    modoLeituraAtivo = true;
    alternarUiBuscaPrincipal(false); // Esconde barra de busca e botão "Ler Catecismo"

    resultadosDiv.innerHTML = ''; 
    conteudoDiv.innerHTML = '';   

    resultadosDiv.classList.remove('oculto'); 
    conteudoDiv.classList.remove('oculto');   

    document.body.classList.add('modo-leitura-ativo');
    resultadosDiv.classList.add('painel-indice'); 
    resultadosDiv.classList.remove('painel-resultados-busca'); // Se você usa essa classe

    // --- CRIAR CABEÇALHO DO MODO LEITURA (ÍNDICE) ---
    const headerLeituraContainer = document.createElement('div');
    headerLeituraContainer.className = 'painel-resultados-container cabecalho-modo-leitura'; 

    const headerLeituraInfoDiv = document.createElement('div');
    headerLeituraInfoDiv.className = 'resultados-header-info'; 

    const tituloIndiceDiv = document.createElement('div');
    const tituloIndiceH3 = document.createElement('h3');
    tituloIndiceH3.textContent = 'Índice do Catecismo';
    tituloIndiceDiv.appendChild(tituloIndiceH3);

    const btnVoltarParaBusca = document.createElement('button');
    btnVoltarParaBusca.className = 'botao-nova-busca'; // Reutiliza estilo
    btnVoltarParaBusca.innerHTML = `<svg viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg> Modo Busca`;
    btnVoltarParaBusca.title = "Voltar para o modo de busca";
    btnVoltarParaBusca.addEventListener('click', desativarModoLeitura);

    headerLeituraInfoDiv.appendChild(tituloIndiceDiv);
    headerLeituraInfoDiv.appendChild(btnVoltarParaBusca);
    headerLeituraContainer.appendChild(headerLeituraInfoDiv);
    resultadosDiv.appendChild(headerLeituraContainer);
    // --- FIM DO CABEÇALHO DO MODO LEITURA ---

    const listaIndiceContainer = document.createElement('div');
    listaIndiceContainer.className = "lista-resultados-scrollavel"; // Para a lista rolável do índice
    resultadosDiv.appendChild(listaIndiceContainer);

    if (typeof renderizarIndice === 'function') renderizarIndice(listaIndiceContainer);
    if (typeof renderizarConteudoCompleto === 'function') renderizarConteudoCompleto();
    
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Rola a PÁGINA para o topo
    resultadosDiv.scrollTop = 0; // Garante que o topo do painel do índice esteja visível
}

function desativarModoLeitura() {
    if (!modoLeituraAtivo) return; // Já está no modo busca
    modoLeituraAtivo = false;
    alternarUiBuscaPrincipal(true); // Mostra barra de busca e botão "Ler Catecismo"

    // resultadosDiv.innerHTML = ''; // Será preenchido pela busca ou mensagem de erro
    // conteudoDiv.innerHTML = '';
    // conteudoDiv.classList.add('oculto');

    document.body.classList.remove('modo-leitura-ativo');
    resultadosDiv.classList.remove('painel-indice');
    // resultadosDiv.classList.add('painel-resultados-busca'); // Adicionado por executarBusca se necessário

    limparBuscaEResultados(); // Limpa o estado da busca e mostra sugestões
}

// --- Funções para Modo Leitura (prepararDadosModoLeitura, renderizarIndice, renderizarConteudoCompleto) ---

// Função prepararDadosModoLeitura (AJUSTADA PARA USAR querySelectorAll)
async function prepararDadosModoLeitura() {
    if (indiceCatecismo.length > 0 && conteudoHtmlCompletoConcatenado) {
        return;
    }
    console.log("INICIANDO: Preparando dados para o modo leitura (Estratégia Marcacao+Titulo com querySelectorAll)...");

    indiceCatecismo = [];
    let htmlConcatenadoTemporario = ''; // Para o conteúdo completo
    let corpoHtmlOriginalInteiro = ''; // Para construir o conteúdo final
    proximoIdIndice = 0;
    
    let ultimoItemNivel1 = null; 
    let ultimoItemNivel2 = null; 
    let ultimoItemNivel3 = null; 
    let ultimoItemNivel4 = null; 

    for (const arquivo of ARQUIVOS_CATECISMO) {
        console.log(`DEBUG QSA: Processando arquivo: ${arquivo.nome}`);
        // Resetar os 'últimos itens' para cada arquivo se a estrutura de cada arquivo for independente
        // Se as partes/seções podem cruzar arquivos, esta lógica de reset precisaria ser mais global.
        // Assumindo por agora que cada arquivo pode ter sua própria estrutura de topo.
        ultimoItemNivel1 = null; 
        ultimoItemNivel2 = null;
        ultimoItemNivel3 = null;
        ultimoItemNivel4 = null;

        try {
            const response = await fetch(arquivo.url);
            if (!response.ok) { /* ... erro ... */ continue; }
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            
            // CONSTRUIR O CONTEÚDO COMPLETO PRIMEIRO, ADICIONANDO IDs AOS TÍTULOS NO 'doc' ORIGINAL
            // Assim, o htmlConcatenadoTemporario terá os IDs corretos.
            
            // Seleciona TODOS os elementos que podem ser títulos ou que são conteúdo relevante.
            // É importante que a ordem seja a ordem do DOM.
            // Os seletores precisam ser precisos para a SUA estrutura HTML.
            const elementosRelevantes = doc.body.querySelectorAll(
                'h1, h2, h3, h4, h5, h6, p.marcacao, p.titulo, p.subtitulo, p.paragrafo, div.ponto-com-notas'
                // Adicione mais seletores se necessário (ex: section, article, etc. se eles próprios
                // devem ter IDs ou se você precisa iterar dentro deles de forma especial).
                // Se você só quer os filhos diretos do body, mantenha doc.body.children e processe recursivamente.
                // Mas para pegar títulos aninhados, querySelectorAll é melhor.
            );
            console.log(`DEBUG QSA: Arquivo ${arquivo.nome} - Encontrados ${elementosRelevantes.length} elementos relevantes.`);

            let textoParteNumericaTemp = ""; 

            for (const el of Array.from(elementosRelevantes)) { // Agora iteramos sobre os elementos selecionados
                const tagName = el.tagName.toLowerCase();
                const textoOriginalElemento = el.textContent.trim();
                const classesElemento = el.className;

                let textoLimpoParaIndice = textoOriginalElemento;
                let nivelIndiceDetectado = 0;
                let idAncoraConteudo = `ancora-idx-${proximoIdIndice}`; // Gera ID potencial
                let novoElementoIndice = null;

                // console.log(`  ---> QSA El: <${tagName} class="${classesElemento}"> | Texto: "${textoOriginalElemento.substring(0, 70)}..."`);

                // --- LÓGICA DE IDENTIFICAÇÃO DE TÍTULOS PARA O ÍNDICE ---
                // Nível 1: PARTE
                if (el.matches('p.marcacao.parte')) { 
                    textoParteNumericaTemp = textoOriginalElemento;
                    // console.log(`    QSA: MARCAÇÃO DE PARTE: "${textoParteNumericaTemp}"`);
                } else if (el.matches('p.titulo[class*="-parte"]') && textoParteNumericaTemp) { 
                    // Este seletor assume que a classe do título contém algo como "primeira-parte", "segunda-parte"
                    // Se for apenas <p class="titulo"> e vier depois de <p class="marcacao parte">, ajuste:
                    // else if (textoParteNumericaTemp && el.matches('p.titulo')) { ... }
                    nivelIndiceDetectado = 1;
                    textoLimpoParaIndice = `${textoParteNumericaTemp} - ${textoOriginalElemento}`;
                    
                    novoElementoIndice = { id: idAncoraConteudo, texto: textoLimpoParaIndice, nivel: nivelIndiceDetectado, filhos: [] };
                    indiceCatecismo.push(novoElementoIndice);
                    ultimoItemNivel1 = novoElementoIndice;
                    ultimoItemNivel2 = null; ultimoItemNivel3 = null; ultimoItemNivel4 = null;
                    textoParteNumericaTemp = ""; 
                    console.log(`    => QSA ADD NÍVEL 1: "${textoLimpoParaIndice}" (ID: ${idAncoraConteudo})`);
                } 
                // Nível 2: SEÇÃO (Antes eram p.subtitulo, ajuste se necessário)
                else if (el.matches('p.subtitulo.secao-principal, h2.secao')) { // SELETOR EXEMPLO
                    nivelIndiceDetectado = 2;
                    textoLimpoParaIndice = textoOriginalElemento; 
                    
                    novoElementoIndice = { id: idAncoraConteudo, texto: textoLimpoParaIndice, nivel: nivelIndiceDetectado, filhos: [] };
                    if (ultimoItemNivel1) {
                        ultimoItemNivel1.filhos.push(novoElementoIndice);
                    } else {
                        console.warn(`    QSA WARN L2: Seção "${textoLimpoParaIndice}" sem PARTE pai. Adicionando à raiz como Nível 1.`);
                        novoElementoIndice.nivel = 1; indiceCatecismo.push(novoElementoIndice); ultimoItemNivel1 = novoElementoIndice;
                    }
                    ultimoItemNivel2 = novoElementoIndice;
                    ultimoItemNivel3 = null; ultimoItemNivel4 = null;
                    console.log(`    => QSA ADD NÍVEL 2: "${textoLimpoParaIndice}" (ID: ${idAncoraConteudo})`);
                }
                // Nível 3: CAPÍTULO
                else if (el.matches('p.subtitulo.capitulo-interno, h3.capitulo')) { // SELETOR EXEMPLO
                    nivelIndiceDetectado = 3;
                    textoLimpoParaIndice = textoOriginalElemento;
                    novoElementoIndice = { id: idAncoraConteudo, texto: textoLimpoParaIndice, nivel: nivelIndiceDetectado, filhos: [] };
                    if (ultimoItemNivel2) ultimoItemNivel2.filhos.push(novoElementoIndice);
                    else if (ultimoItemNivel1) { novoElementoIndice.nivel = 2; ultimoItemNivel1.filhos.push(novoElementoIndice); ultimoItemNivel2 = novoElementoIndice;}
                    else { novoElementoIndice.nivel = 1; indiceCatecismo.push(novoElementoIndice); ultimoItemNivel1 = novoElementoIndice;}
                    ultimoItemNivel3 = novoElementoIndice;
                    ultimoItemNivel4 = null;
                    console.log(`    => QSA ADD NÍVEL 3: "${textoLimpoParaIndice}" (ID: ${idAncoraConteudo})`);
                }
                // Nível 4: ARTIGO
                else if (el.matches('p.marcacao.artigo')) { 
                    textoParteNumericaTemp = textoOriginalElemento; // Assume ARTIGO X
                } else if (el.matches('p.titulo[class*="artigo-"]') && textoParteNumericaTemp) { // Assume p.titulo.artigo-X
                // OU: else if (textoParteNumericaTemp.toUpperCase().includes("ARTIGO") && el.matches('p.titulo')) {
                    nivelIndiceDetectado = 4;
                    textoLimpoParaIndice = `${textoParteNumericaTemp} - ${textoOriginalElemento}`;
                    novoElementoIndice = { id: idAncoraConteudo, texto: textoLimpoParaIndice, nivel: nivelIndiceDetectado, filhos: [] };
                    if (ultimoItemNivel3) ultimoItemNivel3.filhos.push(novoElementoIndice);
                    // ... (fallbacks para aninhar sob Nível 2 ou Nível 1) ...
                    else { novoElementoIndice.nivel = 1; indiceCatecismo.push(novoElementoIndice); ultimoItemNivel1 = novoElementoIndice; }
                    ultimoItemNivel4 = novoElementoIndice;
                    textoParteNumericaTemp = "";
                    console.log(`    => QSA ADD NÍVEL 4: "${textoLimpoParaIndice}" (ID: ${idAncoraConteudo})`);
                }
                // Nível 5: SUBTÍTULO (dentro de Artigo)
                // Se este é <p class="subtitulo"> e NÃO é uma Seção Principal
                else if (el.matches('p.subtitulo') && !el.matches('p.subtitulo.secao-principal, p.subtitulo.capitulo-interno')) { 
                    // ^ Garante que não é um subtitulo de nível mais alto já pego.
                    nivelIndiceDetectado = 5;
                    textoLimpoParaIndice = textoOriginalElemento;
                    novoElementoIndice = { id: idAncoraConteudo, texto: textoLimpoParaIndice, nivel: nivelIndiceDetectado, filhos: [] };
                    if (ultimoItemNivel4) ultimoItemNivel4.filhos.push(novoElementoIndice);
                    // ... (fallbacks) ...
                    else { console.warn(`    QSA WARN L5: Subtítulo "${textoLimpoParaIndice}" sem pai Artigo. Não adicionado estruturado.`); novoElementoIndice = null; }
                    if(novoElementoIndice) console.log(`    => QSA ADD NÍVEL 5: "${textoLimpoParaIndice}" (ID: ${idAncoraConteudo})`);
                }


                // Adicionar o ID diretamente no elemento original DENTRO DO DOC PARSEADO
                // Assim, quando pegarmos o innerHTML do body, os IDs já estarão lá.
                if (novoElementoIndice && nivelIndiceDetectado > 0) { 
                    el.id = idAncoraConteudo; // Modifica o 'el' original no 'doc'
                    proximoIdIndice++; 
                }
                // Não precisamos mais do cloneEl e concatenar aqui se vamos pegar doc.body.innerHTML no final.
            } 
            // Após processar todos os elementos e adicionar IDs aos títulos no 'doc':
            corpoHtmlOriginalInteiro += doc.body.innerHTML; // Concatena o HTML do body inteiro do arquivo atual

        } catch (error) {
            console.error(`DEBUG QSA: Erro CRÍTICO ao processar ${arquivo.url}:`, error);
        }
    } 

    conteudoHtmlCompletoConcatenado = corpoHtmlOriginalInteiro; // Atribui o HTML concatenado
    console.log("CONCLUÍDO: Preparação dos dados para o modo leitura. Itens de raiz no índice:", indiceCatecismo.length);
    if (indiceCatecismo.length === 0) {
        console.warn("DEBUG QSA: NENHUM ITEM FOI ADICIONADO AO ÍNDICE FINAL.");
    } else {
        // Descomente para ver a estrutura completa do índice:
        // console.log("Estrutura do Índice Gerado:", JSON.stringify(indiceCatecismo, null, 2)); 
    }
}

function renderizarIndice(containerParaListaIndice) {
    if (!containerParaListaIndice) {
        console.error("Container para lista do índice não fornecido a renderizarIndice.");
        return;
    }
    containerParaListaIndice.innerHTML = ''; // Limpa apenas o container da lista

    const ul = document.createElement('ul');
    ul.className = 'lista-indice-principal cic-indice-lista'; // Classe geral para a lista

    function criarItensIndiceRecursivo(itens, parentUl, nivelAtual) { // Adiciona nivelAtual
        itens.forEach(item => {
            const li = document.createElement('li');
            li.className = `cic-indice-item cic-indice-nivel-${nivelAtual}`; // Nível atual
            
            const toggleWrapper = document.createElement('div');
            toggleWrapper.className = 'cic-indice-toggle-wrapper';

            // Botão de Toggle (seta) se houver filhos
            if (item.filhos && item.filhos.length > 0) {
                const toggleButton = document.createElement('button');
                toggleButton.className = 'cic-indice-toggle-btn';
                toggleButton.setAttribute('aria-expanded', 'false'); // Inicialmente recolhido
                toggleButton.innerHTML = '<svg viewBox="0 0 16 16" class="cic-indice-seta"><path d="M6 12l6-6-6-6"/></svg>'; // Seta para a direita
                toggleWrapper.appendChild(toggleButton);
            }

            const a = document.createElement('a');
            a.href = `#${item.id}`;
            a.textContent = item.texto;
            // ... (seu event listener para o link 'a' permanece o mesmo) ...
            a.addEventListener('click', (e) => { /* ... scroll e classe ativo ... */ });
            toggleWrapper.appendChild(a);
            li.appendChild(toggleWrapper);
            parentUl.appendChild(li);

            if (item.filhos && item.filhos.length > 0) {
                const subUl = document.createElement('ul');
                subUl.className = 'cic-indice-sublista oculto'; // Sub-listas começam ocultas
                criarItensIndiceRecursivo(item.filhos, subUl, nivelAtual + 1);
                li.appendChild(subUl);

                // Event listener para o botão de toggle
                const toggleButton = li.querySelector('.cic-indice-toggle-btn');
                if (toggleButton) {
                    toggleButton.addEventListener('click', (e) => {
                        e.stopPropagation(); // Evita que o clique no botão também dispare o clique no link 'a'
                        const sublista = li.querySelector('.cic-indice-sublista');
                        const isExpanded = sublista.classList.toggle('oculto');
                        toggleButton.setAttribute('aria-expanded', String(!isExpanded));
                        toggleButton.classList.toggle('aberto', !isExpanded); // Para estilizar a seta
                    });
                }
            }
        });
    }
    criarItensIndiceRecursivo(indiceCatecismo, ul, 1); // Começa no nível 1
    containerParaListaIndice.appendChild(ul);
}

function renderizarConteudoCompleto() {
    if (conteudoDiv) {
        conteudoDiv.innerHTML = conteudoHtmlCompletoConcatenado;
        ativarNotasHover(conteudoDiv); 
        // Resetar scroll do conteúdo para o topo ao renderizar
        conteudoDiv.scrollTop = 0;
    }
}


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

// Função executarBusca (COMPLETA E AJUSTADA para busca por número exato)
function executarBusca() {
    const termoInputUsuario = campoBusca.value.trim();
    termoAtualBusca = termoInputUsuario.toLowerCase(); 
    const termoNormalizadoParaFiltro = removerAcentos(termoAtualBusca);

    // Esconder sugestões
    if (termoInputUsuario.length > 0) { // Esconde se houver qualquer input, mesmo que curto
        const containerSugestoes = document.getElementById('sugestoes-busca-container');
        if (containerSugestoes) containerSugestoes.classList.add('oculto');
    }

    // Limpeza inicial dos painéis de resultados e conteúdo
    if (resultadosDiv) resultadosDiv.innerHTML = ''; 
    if (conteudoDiv) { conteudoDiv.innerHTML = ''; conteudoDiv.classList.add('oculto'); }
    itemSelecionadoAtual = null;
    elementoSelecionadoAtual = null;
    document.querySelectorAll('.introducao').forEach(intro => intro.classList.add('oculto'));

    // Se o campo de busca estiver vazio, não faz nada além de limpar e mostrar sugestões (se houver)
    if (termoInputUsuario.length === 0) {
        if (typeof renderizarSugestoes === 'function') renderizarSugestoes();
        // Garante que o painel de resultados (que pode ter tido um header de erro) seja ocultado
        if (resultadosDiv) resultadosDiv.classList.add('oculto'); 
        return;
    }
    
    // Validação do comprimento do termo (exceto se for puramente numérico)
    const ehApenasNumero = /^\d+$/.test(termoInputUsuario);
    if (!ehApenasNumero && termoInputUsuario.length < MIN_SEARCH_TERM_LENGTH) {
        const headerContainer = document.createElement('div');
        headerContainer.className = 'painel-resultados-container'; 
        const headerInfoDiv = document.createElement('div');
        headerInfoDiv.className = 'resultados-header-info';
        headerInfoDiv.innerHTML = `<div><h3>Busca Inválida</h3><span class="termo-buscado-display">Por favor, digite pelo menos ${MIN_SEARCH_TERM_LENGTH} caracteres (ou apenas números).</span></div><button class="botao-nova-busca" id="btnNovaBuscaHeaderErro" title="Limpar busca e resultados"><svg viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>Nova busca</button>`;
        headerContainer.appendChild(headerInfoDiv);
        resultadosDiv.appendChild(headerContainer);
        resultadosDiv.classList.remove('oculto');
        const btnErro = document.getElementById('btnNovaBuscaHeaderErro');
        if(btnErro) btnErro.addEventListener('click', limparBuscaEResultados);
        if (statusMessagesDiv) statusMessagesDiv.textContent = "";
        
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
    resultadosDiv.classList.remove('oculto'); 

    let resultadosEncontrados = [];
    let buscaPorNumeroExatoBemSucedida = false;

    if (ehApenasNumero) {
        // console.log("Tentando busca por número exato:", termoInputUsuario);
        resultadosEncontrados = cache.filter(item => item.numero === termoInputUsuario);
        if (resultadosEncontrados.length > 0) {
            buscaPorNumeroExatoBemSucedida = true;
            // console.log(`Encontrado(s) ${resultadosEncontrados.length} item(ns) para o número ${termoInputUsuario}`);
        } else {
            // console.log(`Nenhum item para o número exato ${termoInputUsuario}. Tentando busca textual...`);
        }
    }

    if (!buscaPorNumeroExatoBemSucedida && termoInputUsuario.length >= MIN_SEARCH_TERM_LENGTH) {
        // console.log("Procedendo com busca textual para:", termoNormalizadoParaFiltro);
        resultadosEncontrados = cache.filter(item => {
            // item.textoNormalizadoParaBusca (do cache) já está sem prefixo e normalizado
            return item.textoNormalizadoParaBusca && item.textoNormalizadoParaBusca.includes(termoNormalizadoParaFiltro);
        });
    }

    // --- RENDERIZAÇÃO DOS RESULTADOS ---
    const headerContainer = document.createElement('div');
    headerContainer.className = 'painel-resultados-container cabecalho-modo-busca'; // Adicionada classe para diferenciar do modo leitura
    const headerInfoDiv = document.createElement('div');
    headerInfoDiv.className = 'resultados-header-info';
    const countText = document.createElement('div');
    const countTextH3 = document.createElement('h3');
    
    let textoContagemResultados = `${resultadosEncontrados.length} resultado${resultadosEncontrados.length !== 1 ? 's' : ''} encontrados`;
    if (buscaPorNumeroExatoBemSucedida) {
        textoContagemResultados = `Parágrafo ${termoInputUsuario} encontrado`;
        if (resultadosEncontrados.length > 1) { // Caso raro, mas possível se houver duplicatas de número
             textoContagemResultados = `${resultadosEncontrados.length} correspondências para o § ${termoInputUsuario}`;
        }
    }
    countTextH3.textContent = textoContagemResultados;

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
    novaBuscaButton.addEventListener('click', limparBuscaEResultados);
    
    headerInfoDiv.appendChild(countText);
    headerInfoDiv.appendChild(novaBuscaButton);
    headerContainer.appendChild(headerInfoDiv);
    
    const listaResultadosContainer = document.createElement('div');
    listaResultadosContainer.className = "lista-resultados-scrollavel";

    if (resultadosEncontrados.length === 0) {
        const aviso = document.createElement('div');
        aviso.className = 'aviso-resultado';
        if (ehApenasNumero && !buscaPorNumeroExatoBemSucedida) { // Tentou número e falhou
            aviso.textContent = `Nenhum parágrafo encontrado com o número "${termoInputUsuario}".`;
        } else {
            aviso.textContent = `Nenhum resultado encontrado para "${termoInputUsuario}".`;
        }
        listaResultadosContainer.appendChild(aviso);
        if (conteudoDiv) conteudoDiv.classList.add('oculto');
    } else {
        if (conteudoDiv) conteudoDiv.classList.remove('oculto');
        
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
            // Se a busca foi por número exato, termoNormalizadoParaFiltro será esse número.
            // A lógica de indexOf ainda tentará centralizar se o número aparecer no texto.
            // Se não aparecer (o que é provável se textoParaPreviewOriginal já foi limpo do número),
            // o preview começará do início, o que é aceitável.
            let startIndexNoPreviewNormalizado = textoParaPreviewNormalizado.indexOf(termoNormalizadoParaFiltro);

            if (startIndexNoPreviewNormalizado === -1) {
                startIndexNoPreviewNormalizado = 0; // Se o termo não está no preview, começa do início
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
            // termoNormalizadoParaFiltro é usado para o highlight. Se foi busca por número, ele é o número.
            const regexTermoNormalizadoParaHighlight = new RegExp(termoNormalizadoParaFiltro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); // 'gi' para pegar todas as ocorrências e ser case-insensitive
            let ultimoIndiceOriginalNoPreview = 0;
            let matchNormalizadoNoPreview;

            if (termoNormalizadoParaFiltro === "" || !previewTextNormalizadoParaMatch.includes(termoNormalizadoParaFiltro)) {
                trechoHtmlMarcado = previewTextParaMarcar.replace(/</g, "<").replace(/>/g, ">");
            } else {
                // A lógica de marcação aqui usa termoNormalizadoParaFiltro para encontrar
                // no previewTextNormalizadoParaMatch, e depois destaca o correspondente no previewTextParaMarcar.
                // Se a busca foi por número exato, e o número não está no texto do preview,
                // nada será marcado, o que é correto.
                // Se o número (como texto) ESTIVER no preview, ele será marcado.
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

    if (resultadosDiv) {
        resultadosDiv.appendChild(headerContainer);
        resultadosDiv.appendChild(listaResultadosContainer);
        resultadosDiv.scrollTop = 0; 
    }
    if (statusMessagesDiv) statusMessagesDiv.textContent = "";

    // Rolagem da página
    if (resultadosEncontrados.length > 0 || ehApenasNumero || termoInputUsuario.length >= MIN_SEARCH_TERM_LENGTH) {
        setTimeout(() => {
            const elementoAlvoParaScroll = painelBusca; 
            if (elementoAlvoParaScroll) {
                const yOffset = -20; 
                const elementoRect = elementoAlvoParaScroll.getBoundingClientRect();
                let yScroll = elementoRect.top + window.pageYOffset + yOffset;

                // Ajuste para não rolar acima do topo da página
                if (yScroll < 0) yScroll = 0;
                
                window.scrollTo({ top: yScroll, behavior: 'smooth' });
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