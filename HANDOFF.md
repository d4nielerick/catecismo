# HANDOFF — santadoutrina.cloud

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

Repo: `d4nielerick/catecismo`, branch `main`. Domínio: `santadoutrina.cloud`.

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
rsync -az --delete --exclude={.git,api-server.mjs,.gitignore} ./ vps:/opt/mediaserver/catecismo/
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
- Ideias de maior prazo (ver `FUNCIONALIDADES.txt`, gerado março/2026 — trata a Vercel
  como produção, desatualizado nesse ponto mas as ideias continuam válidas): links
  compartilháveis de trechos, PWA, planos de estudo
  guiados, parcerias institucionais.

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
