---
name: liturgia-janela
description: Mantém a Liturgia Diária completa para os próximos 30 dias — comentário do Evangelho (Catena Aurea traduzida + Catecismo), áudio, resumo e trechos — e faz o deploy. Use quando o Daniel pedir para "rodar a janela", "atualizar a liturgia", "traduzir a Catena", "preencher os próximos dias" ou "fazer a rotina da liturgia".
---

# Janela da Liturgia Diária

Rotina semanal. Os scripts fazem tudo o que é determinístico; a sessão faz só o que exige juízo
(mapear versículos pelos lemas, traduzir do latim, escolher destaques e tema) e **sempre mostra ao
Daniel o resultado antes de gravar e antes do deploy**. Nada é gerado em tempo de execução no site.

## 0. Relatório

```bash
node scripts/janela-liturgia.mjs --dias 30 --lemas
```

Lê `data/` e lista as pendências por dia. Siga a ordem abaixo; pule o que já estiver "ok". Ao final
de cada passo rode o relatório de novo.

## 1. Capítulos da Catena que faltam

```bash
node scripts/scrape-catena.mjs Lc 10      # um por capítulo listado em "capítulos da Catena a baixar"
```

Baixa do Corpus Thomisticum (latim, domínio público), guarda o HTML cru em `data/catena-fonte/` e
estrutura em `data/catena/<Ev>/<cap>.json`. Se o site estiver fora do ar, pare e avise.

## 2. Lectiones sem intervalo de versículos

A fonte não diz que versículos cada lectio (perícope) cobre. O relatório com `--lemas` imprime o
começo de cada lectio sem mapa: o lema do Evangelho aparece dentro do comentário, depois de
"unde dicitur", "sequitur", "unde subditur" ("*unde dicitur audivit autem Herodes tetrarcha*" → Lc 9,7).
Localize o versículo inicial de cada lectio no Evangelho (o texto em português está em
`data/liturgia/<dia>.json`, com os números; em dúvida, leia mais do latim em `data/catena/<Ev>/<cap>.json`).
O fim de uma lectio é o versículo anterior ao início da seguinte; a última vai até o fim do capítulo.

```bash
node scripts/catena-mapa.mjs Lc 10 1=1-12 2=13-16 3=17-24
```

O script recusa intervalos fora de ordem. **Só mapeie o que tiver certeza**; o resto fica pendente.

## 3. Ligar o Evangelho de cada dia

```bash
node scripts/liga-evangelho.mjs 2026-09-24 +30
```

Cruza a referência do Evangelho com a Catena (ponteiros para as lectiones) e com as notas do
Catecismo (§§ que citam o versículo, com a frase exata da citação). Preserva `tema` e `destaques`
já gravados. Rode sempre depois dos passos 1 e 2.

## 4. Traduzir a Catena (subagentes Sonnet, esforço baixo)

```bash
node scripts/catena-traducao.mjs pendentes 2026-09-24 +30 > "$SCRATCH/pendentes.json"
```

**Não traduza na sessão principal**: cada mensagem reenvia todo o contexto, e 200 comentários em
latim no histórico multiplicam o gasto. Divida `pendentes.json` em lotes de ~15 itens
(`$SCRATCH/lote-1.json`, `lote-2.json`…) e dispare **um subagente por lote** (Agent tool,
`model: "sonnet"`, esforço baixo, vários em paralelo), com este prompt:

> Traduza do latim para o português do Brasil cada item do arquivo `<caminho do lote>` (campos
> `latim`, `autor`, `obra`). Grave `<caminho>/traducoes-N.json` no formato
> `{ "por": "claude-sonnet (subagente)", "itens": [{ ev, cap, lectio, i, latim, pt }] }`, copiando
> `latim` exatamente como está. Depois rode `node scripts/catena-traducao.mjs grava <arquivo>` na
> pasta do projeto e responda só com a saída do comando. Regras: tradução literal e sóbria, sem
> acrescentar, resumir nem explicar; frase por frase, na ordem do original; as palavras do
> Evangelho que o Padre cita (depois de "unde dicitur", "sequitur", "unde subditur") vão entre
> aspas duplas; nomes bíblicos como na CNBB (João Batista, Elias, Herodes); "dominus" → "o Senhor",
> "Christus" → "Cristo"; citações de outros livros traduzidas como o Padre cita; se um trecho for
> obscuro, traduza o mais próximo possível e siga. Não edite nenhum outro arquivo.

O script `grava` recusa tradução fora do lugar (latim diferente) ou curta demais; se um subagente
falhar, reenvie só aquele lote. A sessão principal só recebe "gravado, N itens".

## 5. Curadoria: tema e destaques por dia (subagente Opus, esforço normal)

Para os dias em "sem tema/destaques", dispare **um subagente** (`model: "opus"`) por bloco de até
7 dias, com este prompt:

> Para cada dia da lista `<dias>`: leia o Evangelho em `data/liturgia/<dia>.json` e, em
> `data/liturgia-comentario/<dia>.json`, o campo `catena` (lectiones); leia os itens dessas lectiones
> em `data/catena/<Ev>/<cap>.json` (só os que têm `pt`). Escolha 2 a 4 destaques `{ lectio, i }`:
> 30–120 palavras cada; que se sustentem sozinhos (nada que dependa do item anterior); autores
> variados quando der; de preferência o que explica a frase central da perícope (as palavras de
> Jesus); evite itens de harmonia entre evangelistas (Agostinho, *De consensu*) e de crítica textual.
> Escreva um tema de 4–12 palavras, sem ponto final, como o título da leitura patrística no Ofício
> das Leituras: nomeia o assunto dos destaques, não interpreta (ex.: "O medo do pecador e a pergunta
> de Herodes"). Grave `<caminho>/curadoria.json` = `[{ data, tema, destaques }]` e responda com uma
> tabela dia · Evangelho · tema · autores dos destaques. Não grave nada em `data/`.

**Mostre a tabela ao Daniel e pergunte se aprova**; ele pode pedir troca. Só então:

```bash
node scripts/grava-curadoria.mjs "$SCRATCH/curadoria.json"
```

O script recusa ponteiro para item inexistente, fora da perícope do dia, ou sem tradução.

## 6. Áudio (Gemini, grátis e devagar)

```bash
export K="$(security find-generic-password -a "$USER" -s gemini-api-key -w)"; GEMINI_API_KEY="$K" node scripts/build-audio-liturgia.mjs 2026-10-02 todas --gemini
```

Um dia por vez, do mais próximo para o mais distante; o script para sozinho em 429/503 (cota do
dia). Salmo bloqueado pelo filtro: tente `GEMINI_MODELO=gemini-3.8-flash-lite-tts`. **Nunca** imprima a
chave. Só dias completos vão para o commit.

## 7. Resumos e trechos

Se o relatório listar dias sem resumo ou sem trechos, siga os fluxos já existentes
(`scripts/grava-resumos.mjs`, `scripts/grava-trechos.mjs`; regras no CLAUDE.md e no HANDOFF).
Não bloqueiam o deploy do comentário.

## 8. Verificar, páginas, commit, deploy

```bash
node scripts/verifica-liturgia.mjs
node scripts/build-paginas-liturgia.mjs
python3 scripts/build-og-liturgia.py
node scripts/build-paginas-catena.mjs
node scripts/build-paginas-santos.mjs
python3 scripts/build-instagram-liturgia.py      # cards do @liturgia_hoje (hoje +30); a VPS publica às 6h
```

Commit só do que mudou em `data/catena*`, `data/liturgia-comentario/`, `data/liturgia-audio/` (dias
completos), `data/liturgia-resumos/`, `data/liturgia-trechos/`. Mensagem no padrão
`data(liturgia): janela até AAAA-MM-DD — Catena Lc 10–11 traduzida, 30 dias curados, áudio 2 dias`.

Deploy (o rsync manda tudo o que está na pasta; as exclusões são obrigatórias):

```bash
rsync -az --delete --exclude={.git,.gitignore,api-server.mjs,'.env*',/.claude/,/.vercel/,/catecismo/,'*.bak','*.bak.*',.DS_Store,.vscode,HANDOFF.md} ./ vps:/opt/mediaserver/catecismo/
```

Depois, confira um dia no ar (`curl -s https://santadoutrina.com/data/liturgia-comentario/<dia>.json`)
e diga ao Daniel o que a janela cobre agora e o que ficou pendente.

## Não fazer

- Não escrever texto de comentário próprio (nem "de ligação"): só tradução e escolha.
- Não usar a tradução brasileira publicada da Catena (Ecclesiae): é protegida. Só o latim.
- Não editar `data/liturgia/`, `data/catena/*.json` ou `data/liturgia-comentario/*.json` à mão:
  sempre pelos scripts (o verificador e o CI dependem disso).
- Não fazer deploy com o verificador falhando.
