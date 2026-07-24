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

Se algo em `api/` mudou, depois do rsync: `docker restart catecismo-api` no VPS.

Detalhes de IP/SSH/senha: ver memória privada `infra-servers` — **não reproduzidos aqui**.

Outras notas de arquitetura:
- Caddy tem rewrite `/perguntas/{slug}` → `/perguntas/resposta.html` e redirect `www` → apex
  (mesmas regras replicadas em `vercel.json` para o espelho Vercel).
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

- **SEO/técnico:** sitemap, robots.txt, canonical/OG/JSON-LD, meta tag de verificação do
  Google Search Console no `<head>` do `index.html`. GSC verificado, sitemap enviado e
  processado (44 páginas na última checagem).
- **`/perguntas/`:** ~40 respostas citação-first no ar.
- **Sem IA de runtime:** a homilia/reflexão do Evangelho do dia gerada por Grok foi
  **removida** (soava artificial e alucinava fatos). `/liturgiadiaria/` e o widget da
  home mostram só as leituras oficiais. `scripts/gerar-reflexoes.mjs` continua no repo
  como ferramenta offline, não é mais chamado em nenhuma página nem função de API.
- **Sem modal PIX:** removido porque a chave exposta era o CPF do Daniel.
- **Catecismo Íntegro:** texto oficial completo dos 2.865 §§ (476 estavam truncados;
  o §1439 tinha o texto errado — trecho do §2439 no lugar da parábola do filho pródigo),
  com adaptação ortográfica pt-BR e CI garantindo reprodutibilidade.
- **Revisão ortográfica §-a-§:** 57 correções de artefatos de OCR/grafia da fonte oficial
  (a integridade por si só não pega erro de conteúdo da fonte, só reprodutibilidade).
- **Notas de rodapé reconstruídas:** ~99,4% de cobertura dos marcadores "(N)".
- **Escritura inline:** referências bíblicas com intervalos e múltiplas refs viram
  tooltip com o(s) versículo(s) reais.
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
- **`GROK_API_KEY` vazio no container de produção** → `/api/resumo.js` (resumo por IA
  da busca/coleção) está quebrado em prod. Decidir: repor a chave ou remover a
  funcionalidade do front.
- **Doação:** trocar a chave PIX (que era o CPF do Daniel, removida) por uma chave
  anônima e recriar uma página dedicada `/apoie` (o modal antigo foi removido, não
  substituído ainda).
- **21 marcadores de nota sem texto** (de ~3.650) por OCR danificado na fonte
  (ex.: número de nota "101" saiu grudado como "10.1"). Baixo impacto, documentado.
- Ideias de maior prazo (ver `FUNCIONALIDADES.txt`, gerado março/2026 — trata a Vercel
  como produção, desatualizado nesse ponto mas as ideias continuam válidas): links
  compartilháveis de trechos, pergunta livre à IA com citação, PWA, planos de estudo
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
- **`Cache-Control` no Caddy precisa de restart, não reload.** `caddy reload` a quente
  não aplicou o novo header; só `docker restart caddy` aplicou.
- **Certificados TLS de subdomínios antigos ficam permanentemente em CT logs
  públicos** (ex.: os subdomínios de mídia removidos de sob `santadoutrina.cloud`)
  — não é possível "apagar" esse rastro, é público por design do Certificate Transparency.
- **O texto oficial é adaptação pt-BR do texto livre do Vaticano** (originalmente em
  português europeu), **não é a tradução da CNBB**. Sempre creditar a fonte
  corretamente ao mexer em textos/rodapés.
- **Sem build/bundler:** abrir `index.html` direto no browser não funciona (ES modules +
  `fetch()` exigem um servidor, mesmo local — ver seção 7).

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
```

CI (`.github/workflows/verifica.yml`) roda esses quatro passos em todo PR e push em
`main`, nessa mesma ordem. Se algum falhar, o problema quase sempre é edição manual de
um `.json` gerado (seção 3) — corrija a entrada humana, não a saída.
