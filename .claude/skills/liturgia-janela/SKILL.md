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

## 4. Traduzir a Catena

```bash
node scripts/catena-traducao.mjs pendentes 2026-09-24 +30 > "$SCRATCH/pendentes.json"
```

Traduza **na sessão** cada item de `pendentes.json` e grave em `$SCRATCH/traducoes.json` como
`{ "por": "claude-<modelo> (sessão)", "itens": [{ ev, cap, lectio, i, latim, pt }] }` — copie `latim`
exatamente como veio (o script confere). Regras da tradução:

- Literal e sóbria, em português do Brasil corrente, sem acrescentar, resumir nem explicar.
- Frase por frase; mantenha a ordem dos argumentos do Padre.
- As palavras do Evangelho que o Padre cita (o lema: "unde dicitur…", "sequitur…") vão **entre
  aspas duplas**, traduzidas de modo a bater com a leitura do dia em português quando possível
  (a página põe em itálico o que está entre aspas). O resto do texto sem aspas.
- Nomes bíblicos como na CNBB (João Batista, Elias, Herodes); "dominus" → "o Senhor"; "Christus" → "Cristo".
- Citações de outros livros dentro do comentário: traduza como o Padre cita, sem trocar pela Bíblia da CNBB.
- Não invente o que o latim não diz; se um trecho for obscuro, traduza o mais próximo possível e
  siga (a tradução fica marcada `revisado: false`).

Lotes grandes: traduza em partes de ~15 itens e grave cada parte (o script aceita vários arquivos,
um por chamada):

```bash
node scripts/catena-traducao.mjs grava "$SCRATCH/traducoes.json"
```

## 5. Curadoria: tema e destaques por dia

Para cada dia em "sem tema/destaques": leia o Evangelho do dia (`data/liturgia/<dia>.json`) e os
itens traduzidos das lectiones do dia (`data/liturgia-comentario/<dia>.json` → `catena` → lectio em
`data/catena/<Ev>/<cap>.json`). Escolha:

- **2 a 4 destaques** (`{ lectio, i }`): 30–120 palavras cada; que se sustentem sozinhos (nada que
  comece com "Por isso…" dependendo do item anterior); autores variados quando der; de preferência
  o que explica a frase central da perícope (no Evangelho, as palavras de Jesus). Evite os itens só
  de harmonia entre evangelistas (Agostinho, *De consensu*) e os de pura crítica textual.
- **um tema** de 4–12 palavras, sem ponto final, em itálico na página, como o título da leitura
  patrística no Ofício das Leituras: nomeia o assunto dos destaques, não interpreta ("O medo do
  pecador e a pergunta de Herodes").

Grave `$SCRATCH/curadoria.json` = `[{ "data", "tema", "destaques": [{ "lectio", "i" }] }]` e:

```bash
node scripts/grava-curadoria.mjs "$SCRATCH/curadoria.json"
```

**Antes de gravar, mostre ao Daniel** uma tabela dia → tema → autores dos destaques, e pergunte se
aprova. Ele pode pedir troca; regrave.

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
```

Commit só do que mudou em `data/catena*`, `data/liturgia-comentario/`, `data/liturgia-audio/` (dias
completos), `data/liturgia-resumos/`, `data/liturgia-trechos/`. Mensagem no padrão
`data(liturgia): janela até AAAA-MM-DD — Catena Lc 10–11 traduzida, 30 dias curados, áudio 2 dias`.

Deploy (o rsync manda tudo o que está na pasta; as exclusões são obrigatórias):

```bash
rsync -az --delete --exclude={.git,.gitignore,api-server.mjs,'.env*',/.claude/,/.vercel/,/catecismo/,'*.bak','*.bak.*',.DS_Store,.vscode,HANDOFF.md} ./ vps:/opt/mediaserver/catecismo/
```

Depois, confira um dia no ar (`curl -s https://santadoutrina.cloud/data/liturgia-comentario/<dia>.json`)
e diga ao Daniel o que a janela cobre agora e o que ficou pendente.

## Não fazer

- Não escrever texto de comentário próprio (nem "de ligação"): só tradução e escolha.
- Não usar a tradução brasileira publicada da Catena (Ecclesiae): é protegida. Só o latim.
- Não editar `data/liturgia/`, `data/catena/*.json` ou `data/liturgia-comentario/*.json` à mão:
  sempre pelos scripts (o verificador e o CI dependem disso).
- Não fazer deploy com o verificador falhando.
