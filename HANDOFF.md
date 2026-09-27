# HANDOFF — santadoutrina.com

> Documento de transição de contexto para o dono (Daniel) e para futuras sessões/agentes.
> Sem segredos aqui — credenciais e IPs ficam só na memória privada (`infra-servers`,
> `project-catecismo`). Se você é um agente lendo isto: **não edite dados gerados à mão**
> (ver seção 3) e **não coloque nenhuma credencial neste arquivo**.

---

## 1. O que é o projeto

Plataforma de busca e leitura para textos católicos em português, 100% client-side
(vanilla JS, ES modules, **sem build/bundler/framework**).

| URL | Conteúdo | Dados |
|---|---|---|
| `/` | Catecismo da Igreja Católica (CIC) — 2.865 parágrafos, texto oficial | `data/catecismo.json` |
| `/saopiox/` | Catecismo Maior de São Pio X — 994 perguntas/respostas | `data/saopiox.json` |
| `/liturgiadiaria/` | Liturgia diária (leituras oficiais da CNBB, sem reflexão/IA) | `data/liturgia/` (1096 arquivos) |
| `/perguntas/` | ~40 perguntas populares, resposta citação-first (§§ reais) | `data/perguntas/` |
| `/fontes/` | Documentos-fonte do Magistério hospedados na íntegra (hoje só um, de teste) | `fontes/<slug>/` |
| Bíblia inline | Referências bíblicas viram tooltip com o versículo (Ave-Maria) | `data/biblia/` |

Repo: `d4nielerick/catecismo`, branch `main`. Domínio: **`santadoutrina.com`** (desde 26/09/2026; `santadoutrina.cloud`, `www` e `liturgia.*` redirecionam com 301 no Caddy — o e-mail contato@santadoutrina.cloud continua no .cloud, que tem MX).

---

## 2. Arquitetura & deploy — LEIA COM ATENÇÃO

**A produção real NÃO é a Vercel.** O `CLAUDE.md` e o `FUNCIONALIDADES.txt` no repo
ainda descrevem a Vercel como hospedagem — isso está **desatualizado**. A Vercel existe
e recebe os mesmos pushes (é um espelho útil para preview), mas o domínio apex
`santadoutrina.cloud` aponta para o **VPS Contabo**, servido por **Caddy**.

- Caddy serve estático a partir de `/opt/mediaserver/catecismo` **fora do repo**
  (é uma cópia rsync, não um `git clone` no servidor).
- `/api/*` é proxy do Caddy para um container `catecismo-api` (node, roda
  `api-server.mjs` — esse arquivo **só existe no VPS**, não está no repo/git).
- Config do Caddy (Caddyfile) também fica só no VPS, fora do repo.

**Deploy** (do seu clone local do repo, branch `main` atualizada):

```bash
rsync -az --delete \
  --exclude={.git,.gitignore,api-server.mjs,'.env*',/.claude/,/.vercel/,/catecismo/,'*.bak','*.bak.*',.DS_Store} \
  ./ vps:/opt/mediaserver/catecismo/
```

Se algo em `api/` mudou, depois do rsync: `docker restart catecismo-api` no VPS — **exceto**
se a mudança foi numa variável de ambiente interpolada via `${VAR}` no `docker-compose.yml`
(ex.: `GROK_API_KEY=${GROK_API_KEY}`); nesse caso `restart` **não** reaplica, porque o valor
é resolvido só na criação do container. Use `docker compose up -d --force-recreate catecismo-api`.

**Deploy rápido (poucos arquivos, sem tocar em `api/`):** dá pra pular o rsync completo e
copiar só o que mudou:

```bash
# Backup antes de sobrescrever (convenção adotada em 2026-08) — cria
# /opt/mediaserver/catecismo.bak-<timestamp> como cópia completa do estado anterior
ssh vps "cp -a /opt/mediaserver/catecismo /opt/mediaserver/catecismo.bak-\$(date +%Y%m%d-%H%M%S)"

scp <arquivo-alterado> vps:/opt/mediaserver/catecismo/<mesmo-caminho>
```

Depois, confirme por hash (`md5`/`md5sum`) que o arquivo local e o remoto batem. Vários
`catecismo.bak-*` já se acumularam em `/opt/mediaserver/` — vale podar de tempos em tempos.

Detalhes de IP/SSH/senha: ver memória privada `infra-servers` — **não reproduzidos aqui**.

Outras notas de arquitetura:
- Caddy tem rewrite `/perguntas/{slug}` → `/perguntas/resposta.html` e redirect `www` → apex
  (mesmas regras replicadas em `vercel.json` para o espelho Vercel).
- **Subdomínio `liturgia.santadoutrina.cloud`** (criado 19/ago/2026): CNAME → apex no DNS
  da Hostinger + bloco no Caddyfile que faz `redir` 301 para
  `https://santadoutrina.cloud/liturgiadiaria/`. É só URL curta para divulgação — **não**
  é uma origem separada: o canonical continua no apex, então não há conteúdo duplicado
  nem necessidade de verificar o subdomínio no GSC. Se algum dia virar site próprio,
  aí sim vale reler a seção de SEO antes.
- O redirect `/tv` → `dashboard.santadoutrina.cloud/tv.apk` foi **removido** (19/ago/2026):
  o subdomínio `dashboard` não resolve desde o takedown dos subdomínios de mídia, então
  era um 301 público para o vazio. `/tv` agora responde 404.
- Analytics: Umami, instância própria (`umami` + `umami-db` no compose do mediaserver).
  Acesso e website ID: ver memória privada — não reproduzidos aqui.
- CI: GitHub Actions (`.github/workflows/verifica.yml`), roda em todo PR e push em `main`
  (ver seção 7).

---

## 3. Pipelines de dados (o coração do projeto)

Regra geral: **os `.json` gerados nunca são editados à mão.** Cada um tem uma fonte
bruta + um script que reconstrói + um verificador de CI que prova reprodutibilidade
byte-a-byte. Corrigir um erro de texto = editar a entrada humana (par de grafia, ajuste,
curadoria) e rodar o script — nunca o JSON final.

| Saída final | Construído a partir de | Script gerador | Verificador (CI) |
|---|---|---|---|
| `data/catecismo.json` | `data/fonte-vaticano.json` (scrape oficial vatican.va) + `data/grafia-ptbr-pares.json` (pares palavra-inteira pt-PT→pt-BR) + `data/grafia-ajustes.json` (ajustes por §) | `scripts/aplica-grafia.mjs` (idempotente, com trava de vocabulário) | `scripts/verifica-integridade.mjs` |
| `data/notas.json` | `data/fonte-notas-vaticano.json` (`scripts/scrape-notas-vaticano.mjs`) casado com marcadores `(N)` no texto de `catecismo.json` | `scripts/build-notas.mjs` | `scripts/verifica-notas.mjs` (reprodutibilidade + piso de cobertura, hoje ~99,4%) |
| `data/perguntas/*.json` | Curadoria humana (pergunta → §§ reais) + texto lido ao vivo de `catecismo.json` (citação-first, sem geração por IA) | `scripts/gera-perguntas.js` | `scripts/verifica-citacoes.mjs` (cada citação bate byte-a-byte com o § original) |
| `fontes/<slug>/` + `data/fontes-index.json` + `data/fontes-trechos.json` | `data/fontes-manifest.json` (metadados do documento) + HTML cru do vatican.va em cache local (`../cache-fontes/`, fora do repo) | `scripts/build-fontes.mjs` | — (ainda sem verificador dedicado; só o Nostra Aetate está publicado, como teste) |
| Escritura inline nas notas | Parser de referências (`assets/js/biblia-refs.js`) sobre `data/biblia/` | `assets/js/biblia.js` (`buscarVersiculos`) | — (lógica pura, sem gerador offline) |
| `sitemap.xml` | Estrutura do site + `data/fontes-index.json` | `scripts/gera-sitemap.mjs` | — |
| Motor de busca (`assets/js/search.js`) | — | — | `test-search.mjs` |

Helpers compartilhados: `scripts/lib-html.mjs` (parsing de HTML do vatican.va),
`scripts/lib-grafia.mjs` (aplica pares/ajustes de grafia).

**Como as notas linkam para os documentos hospedados:** `assets/js/fontes.js` (usado por
`leitor.js`/`ui.js`) resolve a nota para a página em `/fontes/<slug>/` e mostra um trecho
no tooltip; o tooltip só abre no clique e fica fixo até o usuário fechar, com botão
"Ler no documento".

---

## 4. Estado atual (o que está no ar, em produção via VPS)

- **Hero fotográfica + busca com scroll-to-reveal (CIC, 2026-08):** hero da home redesenhada
  (foto do papa em duas camadas com parallax sutil, full-width, sem moldura/menu flutuante
  antigos). Campo de busca compacto por padrão, expande ao focar. Digitar não busca mais a
  cada tecla — só ao apertar **Enter**, que dispara scroll suave até a seção de resultados
  (`#resultados-secao`), um card flutuante com margem lateral que sobrepõe levemente a hero.
  Header de resultados (`#busca-topo`) fica *sticky* ao rolar, com "Início" (label + ícone)
  voltando ao estado inicial via transição suave in-page (sem reload de página). Todo o CSS/JS
  compacto/escopado usa o prefixo `#resultados-secao` pra não vazar pro `/saopiox/`, que
  reaproveita as mesmas classes base (`.btn-home`, `#busca-topo #campo-busca`,
  `.busca-topo-inner`, `#btn-ler-header`) — **sempre escopar por `#resultados-secao` ao mexer
  nesses elementos**, nunca editar a regra base sem checar o Pio X antes/depois.
- **Resumo por IA (`/api/resumo.js`) corrigido (2026-08):** estava fora do ar
  porque `GROK_API_KEY` chegava vazia no container — `docker-compose.yml` interpola
  `${GROK_API_KEY}` a partir de `/opt/mediaserver/.env`, que não existia. Criado o `.env` com
  a chave (console.x.ai) e recriado o container. Testado de ponta a ponta (clique real no
  botão em produção → resposta da IA renderizada). Ver gotcha na §6 sobre esse padrão de
  interpolação silenciosamente vazia.
- **Hub "Pergunte ao Catecismo" — publicação silenciosa (2026-09-14):** `/perguntar/` está no
  ar, mas **sem link** (convite da hero com `hidden` em `index.html`, atalho da busca desligado por
  `HUB_ABERTO = false` em `assets/js/ui.js`) e com `noindex`. Abrir = tirar o `hidden`, trocar para
  `true` e remover o `noindex`. Pipeline (`api/pergunta.js`):
  1. **Planejador** (xAI, JSON validado por `lerPlano`): escopo, assunto, termos e uma frase
     hipotética no estilo do Catecismo usada só na busca. Fora do escopo não chama o redator.
  2. **Busca determinística** (`api/_recuperar.mjs`): BM25 com radical + índice analítico + léxico;
     pergunta, assunto, hipótese (peso 0,5) e termos (0,5) fundidos por RRF (K=5); completa blocos
     de subtema curto do índice. O servidor lê o texto dos §§ — o cliente só manda a pergunta.
  3. **Seletor** (xAI): lê o começo de até 48 candidatos (12 fundidos + 10 primeiros de cada
     consulta) e escolhe até 8 pelo assunto doutrinal — só números da lista. Os escolhidos vão
     **na frente** dos fundidos (até 16); substituindo, ele já trocou os §§ certos por outros.
  4. **Redator** (xAI, JSON): um parágrafo que responde e raciocina ("Segundo o Catecismo, …"),
     e para cada § citado um **trecho copiado literalmente** dele.
  5. **Travas sem IA** (`api/_guardas.mjs`): trecho conferido palavra por palavra contra o §
     (ignora pontuação/caixa/acento); citação sem trecho verificado cai com a frase; frase com
     apoio lexical < 0,2 sai e < 0,5 vai para o registro como aviso (frase de conclusão sem
     citação também pode usar as palavras da pergunta); nada de pé = "não encontrei". A página
     mostra os trechos literais entre aspas. Não pega conclusão errada escrita com as palavras
     certas, nem trecho literal pouco pertinente — por isso os avisos vão para o registro.
  Custos/limites: ~US$ 0,0013 por pergunta (três chamadas curtas), 5–7 s (até ~15 s com reforço); cache por pergunta normalizada, 6 novas por IP/10 min,
  **teto de 100/dia**. **Registro anônimo** (sem IP) em JSONL dentro do container:
  `ssh vps 'docker exec catecismo-api cat /tmp/catecismo-perguntas-registro.jsonl'` (pergunta,
  tipo, §§ citados, frases cortadas, ms, tokens). Fica no `/tmp` do container: sobrevive a
  `docker restart`, some em `--force-recreate`. Rota registrada à mão no `api-server.mjs` da VPS.
- **SEO/técnico:** sitemap, robots.txt, canonical/OG/JSON-LD, meta tag de verificação do
  Google Search Console no `<head>` do `index.html`. GSC verificado, sitemap enviado e
  processado (44 páginas na última checagem).
- **`/perguntas/`:** ~40 respostas citação-first no ar.
- **Homilia por IA removida:** a homilia/reflexão do Evangelho do dia gerada por Grok foi
  **removida** (soava artificial e alucinava fatos). `/liturgiadiaria/` e o widget da
  home mostram só as leituras oficiais. `scripts/gerar-reflexoes.mjs` continua no repo
  como ferramenta offline, não é mais chamado em nenhuma página nem função de API.
- **Sem modal PIX:** removido porque a chave exposta era o CPF do Daniel.
- **Catecismo Íntegro:** texto oficial completo dos 2.865 §§ (476 estavam truncados;
  o §1439 tinha o texto errado — trecho do §2439 no lugar da parábola do filho pródigo),
  com adaptação ortográfica pt-BR e CI garantindo reprodutibilidade.
- **Revisão ortográfica §-a-§:** 57 correções de artefatos de OCR/grafia da fonte oficial
  (a integridade por si só não pega erro de conteúdo da fonte, só reprodutibilidade).
- **Notas de rodapé reconstruídas:** 100% dos marcadores "(N)" resolvidos (`verifica-notas`),
  49 notas órfãs para revisão editorial.
- **Escritura inline:** referências bíblicas com intervalos e múltiplas refs viram
  tooltip com o(s) versículo(s) reais. **Salmos corrigidos (2026-09-14):** as notas usam a
  numeração hebraica e `data/biblia/Sl.json` a da Vulgata; `salmoParaVulgata()` em
  `assets/js/biblia-refs.js` converte (78 das 89 citações de versículo de Salmo abriam o endereço
  errado). Rótulo no padrão das Bíblias católicas: "Salmos 22(21),2".
- **Hospedagem de documentos-fonte:** teste em produção com o **Nostra Aetate** —
  página própria em `/fontes/nostra-aetate/`, linkada a partir das notas que o citam,
  com trecho no tooltip.
- **Correção de cache:** `Cache-Control: no-cache` configurado no bloco do apex no
  Caddyfile do VPS (fora do repo) — sem isso, atualizações não chegavam a quem já
  tinha visitado o site.
- Um projeto separado de "palpites" (bolão) e a exposição de subdomínios de mídia sob
  `santadoutrina.cloud` foram removidos/dados baixa — **não fazem parte deste projeto**,
  mencionados aqui só para não confundir em buscas de histórico.

Texto oficial usado é a adaptação ortográfica do texto **livre** publicado pelo
Vaticano (português europeu → pt-BR), **não** é a tradução oficial da CNBB — a fonte
é sempre creditada.

---

## 5. Roadmap / pendências

- **Escalar hospedagem de fontes:** hoje só o Nostra Aetate está publicado (teste).
  Inventário completo (`data/citacoes-inventario.json`, gerado por
  `scripts/inventario-citacoes.mjs`) mapeia ~33 documentos do Magistério citados nas
  notas (destaques: Lumen Gentium, Direito Canônico, Gaudium et Spes, Concílio de Trento).
  **Próximo alvo: Catecismo Romano / de Trento** — é domínio público, mas ainda falta
  achar um texto em português livre de direitos (não está hospedado no vatican.va como
  os documentos do Vaticano II).
- **Padres da Igreja / Doutores e Denzinger:** decisão adiada — traduções em português
  costumam ter direitos autorais, então provavelmente serão **linkados** para a fonte
  externa em vez de hospedados na íntegra.
- **Doação:** trocar a chave PIX (que era o CPF do Daniel, removida) por uma chave
  anônima e recriar uma página dedicada `/apoie` (o modal antigo foi removido, não
  substituído ainda).
- **Hub: ajustar com o registro e abrir** — perguntas reais que falharem viram casos em
  `scripts/avalia-recuperacao.mjs`; decidir redator estrito ("é pecado torcer contra o rival?"
  dá "não encontrei") e trava de inversão de sentido; depois abrir (ver §4) e subir a versão.
- **`/api/resumo` sem trava de citação:** o resumo antigo acrescenta coisas que não estão nos §§
  recebidos (visto em 2026-09-14). Candidato a usar `_guardas.mjs` como o hub.
- **Notas sem correspondência no tooltip** (mapa de 2026-09-14, 3.643 notas; 48,5% mostram algo):
  ~700 citam o Vaticano II sem documento hospedado (hospedar LG, GS, DV, SC cobre a maior fatia);
  ~1.060 citam Padres/Denzinger/papas/liturgia/Direito Canônico (link externo, por direitos);
  52 são referências bíblicas que o parser não lê por OCR ("Lc 24. 25-27", "Lc 1 , 3 1 .") —
  24 delas de Evangelho; 33 citam só capítulo ("Cf. Lc 15"); 7 são "Ibid.".
- **Jev (TypeSafe AI) no seletor do hub — só se o volume crescer:** modelo "System One"
  lançado em 15/09/2026, não gera texto — recebe um estado e N perguntas tipadas, responde
  todas em paralelo com score de confiança calibrado (sem string para parsear). A etapa 3 de
  `api/pergunta.js` (ler até 48 candidatos e escolher até 8) é exatamente esse formato: 48
  decisões booleanas sobre o mesmo estado, e o score daria um ranking em vez do corte binário
  de hoje. **Não fazer agora:** com `TETO_DIARIO = 100` não há volume que justifique (o
  argumento do Jev é custo/latência em escala), está em early access, e acrescentaria mais um
  fornecedor e mais uma chave a um projeto cuja premissa é não ter dependência externa. Os
  "200x mais rápido / 400x mais barato" são número da própria empresa, sem verificação de
  terceiros. Reavaliar quando o hub sair da fase silenciosa e o teto diário cair; a busca
  determinística no meio do pipeline permite medir contra o seletor atual.
- Ideias de maior prazo (ver `FUNCIONALIDADES.txt`, gerado março/2026 — trata a Vercel
  como produção, desatualizado nesse ponto mas as ideias continuam válidas): links
  compartilháveis de trechos, PWA, planos de estudo
  guiados, parcerias institucionais.

### Liturgia Diária — planos futuros

(Projeto próprio no mesmo repo; não misturar com os planos do catecismo acima.)

- **Leitura em voz alta — tela sem distração, estilo "Letras" do Apple Music** (plano):
  - *Voz:* áudio gerado **fora do site, com antecedência** (TTS de voz natural: ElevenLabs,
    MiniMax ou Magnific), um arquivo por leitura por dia, com a **marcação de tempo de cada
    trecho** (a própria ferramenta de voz dá o alinhamento; se não der, Whisper local sobre o
    áudio gerado). Nada de IA em tempo de execução: a voz lê o texto oficial, não escreve nada.
    Alternativa grátis e sem arquivos: a voz do próprio aparelho (Web Speech API), mas soa
    robótica em português e a sincronia palavra a palavra falha no iPhone — só como reserva.
  - *Texto falado:* sem números de versículo; abreviações por extenso ("Sl" → "Salmo"); no
    salmo, o refrão lido como refrão; cabeçalho curto ("Primeira leitura, do livro dos
    Provérbios").
  - *Pipeline:* `scripts/build-audio-liturgia.mjs` → `data/liturgia-audio/AAAA-MM-DD/<leitura>.m4a`
    (voz mono ~48 kbps, ~1 MB por leitura) + `.json` com [início, fim, trecho]. Janela móvel
    (próximos 30–60 dias) para controlar custo e espaço. O `verifica-liturgia.mjs` passa a exigir:
    todo trecho do texto exibido tem tempo, áudio existe, duração plausível, e o áudio some se as
    leituras do dia mudarem (como o resumo).
  - *Tela:* botão "Ouvir" em cada leitura (e "Ouvir todas" no topo). Abre em tela cheia, fundo
    na cor litúrgica do dia (ou a pintura do card, bem escurecida e desfocada); só o texto em letra
    grande: o trecho atual em destaque, os já lidos esmaecendo, os próximos mais apagados;
    rolagem automática suave que mantém o trecho atual no centro; tocar num trecho pula o áudio
    para ele. Controles mínimos embaixo (tocar/pausar, voltar/avançar 15s, velocidade, progresso),
    que somem depois de alguns segundos. Continua tocando com a tela bloqueada, com os controles
    na tela de bloqueio (Media Session: "Evangelho — Lc 9,1-6", ícone da Liturgia). Com "reduzir
    movimento", sem desfoque nem escala.
  - *Etapas:* (1) protótipo de um dia com 2–3 vozes para escolher; (2) a tela; (3) pipeline de
    30 dias + verificador; (4) no ar. Mesma pendência de licença dos textos (áudio é obra
    derivada do texto das Edições CNBB).
- **Trechos dos cards de compartilhar para os próximos dias** (plano): hoje só 23/09/2026 tem.
  - *Quem escolhe:* o Claude propõe em lote, **fora do site** (como os resumos), e o Daniel revisa
    numa página de conferência antes de gravar. Nenhuma IA em tempo de execução.
  - *Critérios:* um por leitura (1ª, salmo, 2ª quando houver, evangelho); até 35 palavras;
    palavra por palavra do texto; que se sustente sozinho (sem começar com "ele", "isso", "e");
    no evangelho, de preferência palavras de Jesus; no salmo, normalmente o refrão; o centro da
    leitura, não o detalhe.
  - *Ferramentas:* `scripts/grava-trechos.mjs lote.json` (irmão do `grava-resumos.mjs`): calcula a
    assinatura das leituras de cada dia, grava `data/liturgia-trechos/AAAA-MM-DD.json` e já confere
    o que o verificador exige; campo opcional `imagens` para festas (pintura específica). O
    verificador ganha um **aviso** (não erro) listando os dias dos próximos 30 sem trechos.
  - *Ritmo:* um mês por lote (~100–130 trechos). Começar pelo resto de setembro e outubro–dezembro
    de 2026 (~350 trechos).
- **Roteiro de boas-vindas para quem chega** (plano, 24/09/2026): um tour curto na 1ª visita
  mostrando o que a página faz — navegar pelos dias, ouvir as leituras, compartilhar trechos e a
  frase do santo. Discreto, pulável, e só uma vez (guardar em localStorage que já viu).
- **Pedido de doação depois de um tempo de uso** (plano, 24/09/2026): não na chegada; só depois de
  alguma interação real (ex.: ouviu uma leitura inteira, compartilhou, ou voltou em dias diferentes).
  Convite gentil com PIX (o Catecismo já tem doação via PIX — reaproveitar), fácil de fechar e sem
  repetir com frequência.
- **Aumento de fonte:** controle de tamanho do texto das leituras (A− / A+), guardado no
  aparelho; a capitular e a entrelinha acompanham.
- **App na App Store (Capacitor) — depende antes da licença dos textos:** as leituras são a
  tradução oficial do Lecionário, de propriedade das Edições CNBB (uso sem autorização é
  proibido, diz o site da CNBB). Os apps que existem têm acordo: o app da própria CNBB, o
  "Igreja em Oração" (Edições CNBB + Minha Paróquia) e o iLiturgia (coedição com as Edições
  CNBB). Plano: (1) pedir autorização/parceria às Edições CNBB — vale também para o site, que
  hoje já publica esses textos; (2) com a licença, empacotar com Capacitor, com as páginas e as
  leituras dentro do app (funciona sem internet) e o que a Apple exige além de um "site
  embrulhado" (regra 4.2): notificação diária, widget com a leitura do dia, leitura em voz
  alta; (3) conta Apple Developer (US$ 99/ano; D-U-N-S se for organização), Xcode, ficha no
  App Store Connect (ícone 1024px, capturas, política de privacidade, rótulo de privacidade
  com o Umami), TestFlight e revisão. Enquanto isso, a página já instala como app pelo
  Safari ("Adicionar à Tela de Início").
- Pendências já conhecidas: link curto para medir os compartilhamentos (aguarda o domínio);
  trechos dos cards só existem para 23/09/2026; faltam pinturas específicas (santos, Maria,
  Pantocrator) no acervo `data/cards-imagens.json`.

### Liturgia Diária — PLANO: "Evangelho comentado" (Catena Aurea + Catecismo)

(Escrito em 24/09/2026 para ser executado numa sessão própria. Regra de ouro, herdada da
decisão de tirar a homilia por IA: **nenhum texto explicativo gerado em tempo de execução, nem
gerado e publicado sem passar por revisão**. O bloco é feito só de citações reais, com fonte.)

**O que a pessoa vê**, abaixo do Evangelho de cada dia:

1. *"Os Padres sobre este Evangelho"* — 2 a 4 trechos curtos da Catena Aurea de São Tomás,
   cada um com o autor ("São João Crisóstomo", "Santo Agostinho", "Beda") e o versículo a que se
   refere; botão "Ler o comentário inteiro" abre a perícope completa num modal (mesmo estilo do
   "Saiba mais" do santo). Ao lado de cada trecho, um "latim" discreto que mostra o original.
2. *"No Catecismo"* — os §§ do Catecismo que citam esse trecho do Evangelho, com a 1ª linha de
   cada um e link para `/#§N` (o Catecismo já está no mesmo site). Sem citação direta, o bloco
   não aparece.
3. Nada de parágrafo de ligação. Se um dia se quiser uma frase de abertura, ela é escrita fora
   do site e gravada como os resumos (`data/liturgia-resumos/`), com o verificador exigindo que
   todo nome próprio esteja no texto.

**Fontes e direitos**

- Catena Aurea: original latino em domínio público. Usar o texto estruturado do Corpus
  Thomisticum (catena in Mt/Mc/Lc/Jo, organizada por capítulo e *lectio*, cada lectio com o
  intervalo de versículos); confirmar as URLs e o formato no início da sessão, e guardar o HTML
  cru em `data/catena-fonte/` (intocado, como `data/liturgia-fonte/`). **Não usar** a tradução
  brasileira publicada (Ecclesiae): é protegida. A tradução é nossa, feita do latim.
- Catecismo: já em `data/catecismo.json` + `data/notas.json` (1.853 §§ com notas). O parser de
  referências bíblicas das notas é `assets/js/biblia-refs.js` (`extrairReferencias`,
  `expandirVersos`, `normalizarLivro`, `salmoParaVulgata`) — reaproveitar, não reescrever.
- Leituras: continuam sendo o ponto sensível (Edições CNBB). Este bloco aumenta a visibilidade
  da página; o pedido de licença deve andar junto.

**Pipeline (tudo offline, determinístico onde der, com verificador)**

1. `scripts/scrape-catena.mjs` → `data/catena-fonte/<Ev>/<cap>.html` (cru) e
   `data/catena/<Ev>/<cap>.json` = `[{ lectio, versos: [a, b], itens: [{ autor, obra?, latim }] }]`.
   Normalizar os nomes dos autores para uma tabela (`data/catena-autores.json`: "Chrysostomus" →
   "São João Crisóstomo", com século e uma linha de quem foi, para o tooltip). Falhar em lectio
   sem intervalo de versículos reconhecível.
2. `scripts/liga-evangelho.mjs` → `data/liturgia-comentario/AAAA-MM-DD.json`:
   - lê a referência do Evangelho do dia (`missas[0].leituras[].tipo === 'evangelho'`; nos dias
     com alternativas, só a principal), expande os versículos com `expandirVersos`;
   - **Catena:** todas as lectiones cujo intervalo cruza o do dia;
   - **Catecismo:** todos os §§ cujas notas citam o mesmo livro/capítulo com pelo menos um
     versículo em comum (usar `extrairReferencias` sobre `notas.json`); ordenar por número de
     versículos em comum, depois por §; limitar a 8, o resto fica em "ver mais";
   - grava a **assinatura das leituras** do dia (como os resumos), para o arquivo cair se as
     leituras mudarem.
3. **Tradução** (único passo com IA, offline): `scripts/traduz-catena.mjs` traduz os itens
   latinos das lectiones que o passo 2 precisa, num lote por janela (próximos 30 dias, depois 60),
   e grava `pt` ao lado de `latim` em `data/catena/`. Regras do prompt: tradução literal e sóbria,
   sem acrescentar nem resumir; nomes dos livros bíblicos na abreviação da CNBB; citações
   bíblicas dentro do comentário ficam como o Padre cita, não como a Bíblia Ave-Maria. Guardar
   modelo e data em cada item. Cache: item já traduzido não volta ao modelo.
4. **Escolha dos 2–4 trechos do dia** (curadoria): `scripts/escolhe-catena.mjs` propõe, por dia,
   os trechos (critérios: 30–90 palavras; que se sustentem sozinhos; autores variados; de
   preferência o que explica a frase central da perícope), grava em
   `data/liturgia-comentario/AAAA-MM-DD.json` como `destaques: [{ ev, cap, lectio, i }]`
   (ponteiros, nunca texto copiado), e o Daniel revisa numa página de conferência local
   (`scratchpad`, não no site) antes de commitar — mesmo fluxo dos trechos dos cards.
5. **Verificador** — acrescentar a `scripts/verifica-liturgia.mjs`: todo `destaque` aponta para
   um item existente com `pt` e `latim`; assinatura das leituras bate; todo § listado existe e
   sua nota cita mesmo aquele livro/capítulo; aviso (não erro) para os dias dos próximos 30 sem
   comentário. CI prova reprodutibilidade dos passos 1 e 2 (rodar de novo dá igual).
6. **Página**: bloco novo em `liturgiadiaria/render.mjs` (para o HTML pronto e o JS ficarem
   idênticos, como as leituras) + estilos; modal da perícope inteira; o "latim" abre inline. No
   HTML pronto por dia (`build-paginas-liturgia.mjs`) o bloco entra também — é conteúdo único e
   bom para o Google ("comentário dos Padres sobre Lc 9,7-9"). Título/descrição da página passam
   a mencionar "com comentário dos Padres da Igreja e do Catecismo".
7. **Tour**: a cena 2 ("O resumo, antes de ler") ganha uma frase sobre o comentário, ou uma cena
   nova; atualizar também as cenas de Ouvir/Compartilhar, que ainda mostram os botões antigos.

**Ordem de execução sugerida** (cada etapa fecha com commit; deploy só a partir da 6):
(1) scraper + JSON da Catena para Lc (o ano C começa no Advento de 2027, mas Lc cobre muitos
dias de semana) → (2) ligador para os próximos 30 dias, mostrar ao Daniel o resultado de hoje
(Lc 9,7-9: quais lectiones e quais §§) **antes de traduzir** → (3) traduzir esses 30 dias →
(4) curadoria dos destaques → (5) verificador → (6) página e HTML pronto → (7) tour. Depois,
janela contínua: o mesmo comando que gera áudio/trechos passa a puxar a Catena.

**Custos**: tradução de ~30 dias ≈ 30 perícopes × ~1.500 palavras latinas ≈ 45 mil palavras
de entrada; centavos a poucos dólares por lote com Sonnet/Opus. Zero custo em runtime.

**Fora do escopo desta etapa**: comentário das outras leituras (a Catena só cobre os
Evangelhos; para 1ª leitura/salmo o Catecismo sozinho já serve); qualquer texto "de ligação"
gerado; app.

### Liturgia Diária — modelo de negócio (direção, 24/09/2026)

Três camadas, da mais segura para a mais ambiciosa. Premissa que amarra as três: **pedir a
licença às Edições CNBB** (ver o plano do app acima) — sem ela, qualquer cobrança fica em cima
de texto que não é nosso; com ela, a CNBB vira parceira em vez de risco.

1. **Para as pessoas, sempre grátis.** As leituras são texto da CNBB; cobrar por elas é o pior
   cenário jurídico e mata o SEO e o compartilhamento, que são o motor de crescimento. Receita
   aqui é só a doação por PIX depois de uso real (plano acima), com opção de apoio recorrente
   ("apoie com R$ 10/mês"), **sem trancar nenhuma funcionalidade**.
2. **Paróquias como clientes (prioridade).** Dor real: o pároco quer falar com o povo todo dia e
   faz isso à mão no WhatsApp. Produto: "Liturgia da Paróquia" — página com a cara da paróquia
   (`paroquia.santadoutrina.cloud/<nome>` ou domínio próprio), horários de missa, avisos, e um
   **envio diário automático** das leituras + comentário no grupo/canal do WhatsApp da paróquia.
   Cobrança mensal por paróquia, plano por diocese. A infraestrutura (páginas por dia, OG,
   áudio, comentário) já existe; falta o painel da paróquia e o envio. Uma paróquia pagando vale
   mais que centenas de doações e ainda traz o público dela para o site.
3. **Parcerias de conteúdo.** O bloco da Catena e do Catecismo abre espaço natural para "leia a
   obra completa" com editoras católicas (Ecclesiae, Paulus, Cultor de Livros), por afiliado ou
   patrocínio fixo. Receita pequena, mas alinhada com o site e sem cara de anúncio.

Ordem: licença CNBB em paralelo com tudo → doação (já planejada) → piloto com 2–3 paróquias
conhecidas antes de construir painel genérico → parcerias quando o comentário estiver no ar.

---

## 6. Gotchas & armadilhas

- **Produção é VPS + Caddy, não Vercel.** A Vercel roda em paralelo como espelho, mas
  qualquer debug de "por que não refletiu" deve olhar o VPS primeiro. `CLAUDE.md` e
  `FUNCIONALIDADES.txt` ainda dizem "Vercel" — desatualizado, não confie neles nesse ponto.
- **`api-server.mjs` só existe no VPS.** Nunca vai aparecer no `git status` local; se
  sumir do servidor sem querer (ex.: rsync sem `--exclude`), quebra `/api/*` em produção.
- **Nunca editar à mão:** `catecismo.json`, `notas.json`, `data/perguntas/*.json`
  (mexer sempre na entrada humana + rodar o gerador — seção 3).
- **Editar o Caddyfile: use `cp`, nunca `mv`.** O Caddyfile é bind-mount de **arquivo
  único** (`/opt/mediaserver/caddy/Caddyfile` → `/etc/caddy/Caddyfile`). `mv` troca o
  inode e o container continua preso ao inode antigo: o arquivo no host muda, mas o
  Caddy segue lendo o conteúdo velho e o `caddy reload` roda com sucesso sem aplicar
  nada. Sintoma: `docker exec caddy md5sum /etc/caddy/Caddyfile` difere do `md5sum` no
  host. Escreva sempre *dentro* do arquivo existente (`cp novo Caddyfile`), aí
  `caddy reload` funciona normalmente. Se já usou `mv`, só `docker restart caddy`
  religa o mount. (Era essa a causa do antigo "Cache-Control precisa de restart, não
  reload" — não havia nada de especial no header.)
- **Certificados TLS de subdomínios antigos ficam permanentemente em CT logs
  públicos** (ex.: os subdomínios de mídia removidos de sob `santadoutrina.cloud`)
  — não é possível "apagar" esse rastro, é público por design do Certificate Transparency.
- **O texto oficial é adaptação pt-BR do texto livre do Vaticano** (originalmente em
  português europeu), **não é a tradução da CNBB**. Sempre creditar a fonte
  corretamente ao mexer em textos/rodapés.
- **Sem build/bundler:** abrir `index.html` direto no browser não funciona (ES modules +
  `fetch()` exigem um servidor, mesmo local — ver seção 7).
- **Variável `${VAR}` no `docker-compose.yml` do mediaserver resolve pra vazio em silêncio**
  se o `.env` correspondente (`/opt/mediaserver/.env`, fora do repo) não existir ou não tiver
  a chave — o container sobe normalmente, `docker inspect` mostra o *nome* da variável, mas
  o valor fica `""`. Sintoma típico: a feature falha com um erro específico de "chave não
  configurada" em vez de o container simplesmente não subir. `docker restart` não corrige;
  precisa `docker compose up -d --force-recreate <serviço>` depois de criar/corrigir o `.env`.
- **`python3 -m http.server` local não manda `Cache-Control`** — o navegador pode cachear
  agressivamente `.css`/`.js` durante desenvolvimento ativo e "não refletir" edições mesmo
  após salvar. Não é bug do site; ou força reload sem cache (DevTools → Network → Disable
  cache) ou rode um servidor que force `Cache-Control: no-store` (ex.: um wrapper simples
  em cima de `http.server` sobrescrevendo `end_headers`).
- **A xAI às vezes não responde por ~30 s** (1 em ~20 chamadas, medido de dentro do container
  com conexão nova e IPv4 forçado — TCP e TLS abrem em ~30 ms; a espera é do servidor). Toda
  chamada ao modelo passa por `api/_xai.mjs`: prazo total + **reforço** (segunda chamada idêntica
  se a primeira não responde em poucos segundos; vale a que chegar antes). Nunca chamar `fetch`
  direto para a xAI sem prazo — o `/api/resumo` já ficou 301 s pendurado assim.
- **`api-server.mjs` (só na VPS) lista as rotas à mão**: `/api/correcao`, `/api/resumo` e
  `/api/pergunta`. Os `api/_*.mjs` são módulos auxiliares, não rotas.
- **Cuidado com `rsync --delete` do clone inteiro:** outras sessões deixam arquivos sem commit no
  working tree (ex.: dados de liturgia e santos) — o rsync os publicaria. Para deploy parcial,
  mande a lista explícita de arquivos e confira hashes antes (produção == versão anterior) e depois.
- **Acesso à VPS só por `ssh vps`** (Cloudflare Tunnel); a porta 22 do IP direto é fechada.

---

## 7. Como rodar/verificar localmente

Servidor estático (obrigatório por causa de ES modules + `fetch()`):

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Acesse `http://localhost:8000` (CIC) e `http://localhost:8000/saopiox/` (Pio X).

Não há build nem lint. Verificadores (os mesmos que rodam no CI):

```bash
node scripts/verifica-integridade.mjs   # catecismo.json reproduz fonte + grafia
node scripts/verifica-citacoes.mjs      # perguntas citam §§ reais, byte-a-byte
node scripts/verifica-notas.mjs         # notas.json reproduz + piso de cobertura (99%)
node test-search.mjs                    # smoke tests do motor de busca
node test-notas.mjs                     # regressões de notas, fontes e Salmos
node test-hub.mjs                       # endpoint do hub com modelo simulado (sem chave)
node scripts/avalia-recuperacao.mjs     # busca do hub: §§ certos no top 12 (32 perguntas)
node scripts/calibra-guardas.mjs        # trava de sustentação separa frase fiel de inventada
```

CI (`.github/workflows/verifica.yml`) roda esses verificadores (e os de remissões, léxico e
liturgia) em todo PR e push em `main`. Se algum falhar, o problema quase sempre é edição manual de
um `.json` gerado (seção 3) — corrija a entrada humana, não a saída.
