# Traduzir a Catena Aurea inteira com um Claude na VPS

Estado em 20/10/2026 (`node scripts/catena-traducao.mjs estado`): 15 de 89 capítulos baixados,
211 de ~2.800 itens traduzidos nesses capítulos. A Catena inteira tem ~17 mil itens (Mt 28, Mc 16,
Lc 24, Jo 21 capítulos) — cerca de 1.150 lotes de 15 itens. É trabalho de dias, não de horas: o
Claude da VPS vai bater no limite de uso do plano e retomar depois. Tudo é retomável: o que já tem
`pt` não volta para a fila.

## Ordem

1. **Preparar a VPS (Daniel, uma vez)** — ver abaixo.
2. **Baixar** os 74 capítulos que faltam (`scrape-catena.mjs`), com pausa entre pedidos.
3. **Mapear os versículos** de cada lectio (`catena-mapa.mjs`): é o que liga a Catena ao Evangelho
   do dia. Sem isso, o capítulo traduzido não aparece na Liturgia.
4. **Traduzir** capítulo por capítulo, com subagentes Sonnet em lotes de 15 (`catena-traducao.mjs
   capitulo … --lotes` → subagentes → `grava`).
5. **Conferir** cada capítulo (`catena-traducao.mjs confere`) e retraduzir o que vier suspeito.
6. **Verificar e enviar**: `verifica-liturgia.mjs`, um commit por capítulo, push para a `main`.
7. **Publicar** (Daniel ou o Claude do Mac, nunca o da VPS): `build-paginas-catena.mjs` + deploy.

Prioridade dos capítulos: Mateus (feito em 20–21/10). O Advento de 29/11/2026 abre o **Ano B
(Marcos)**: primeiro os capítulos do Advento e do Natal (Mc 13, Mc 1, Lc 1, Jo 1, Lc 2, Lc 5, Lc 7,
Lc 10), depois o resto de **Marcos**, **João** (Quaresma e Páscoa) e **Lucas**.

Enquanto a VPS traduz, a rotina da janela no Mac **não traduz** (só liga, curadoria e áudio), para
os dois não mexerem no mesmo arquivo de capítulo.

## 1. Preparar a VPS (Daniel)

O site em `/opt/mediaserver/catecismo` é uma cópia de produção, **não** um clone: o trabalho vai
numa pasta separada.

```bash
ssh vps
ssh-keygen -t ed25519 -f ~/.ssh/catena_github -N ""      # chave só para este repositório
cat ~/.ssh/catena_github.pub
```

No GitHub (github.com/d4nielerick/catecismo) → Settings → Deploy keys → Add deploy key → cole a chave pública, marque
**Allow write access**. Depois:

```bash
printf 'Host github-catena\n  HostName github.com\n  IdentityFile ~/.ssh/catena_github\n' >> ~/.ssh/config
git clone git@github-catena:d4nielerick/catecismo.git /srv/catena && cd /srv/catena
git config user.name "Claude (VPS)" && git config user.email "<seu e-mail>"
tmux new -s catena        # para o trabalho seguir com o SSH fechado
claude                    # faça login se pedir; depois cole o prompt abaixo
```

Para ver de fora: `tmux attach -t catena`; andamento: `cd /srv/catena && node scripts/catena-traducao.mjs estado`.

## 2. O prompt (colar no `claude` dentro de /srv/catena)

```text
Você vai traduzir a Catena Aurea de São Tomás de Aquino (latim) para o português do Brasil, capítulo
por capítulo, neste repositório (/srv/catena). Leia antes CLAUDE.md, AGENTS.md e a seção "4. Traduzir
a Catena" de .claude/skills/liturgia-janela/SKILL.md. Trabalhe sozinho até acabar ou até o limite de
uso; ao voltar, retome de onde parou (o que já tem `pt` não volta para a fila).

LIMITES (não negociáveis)
- Nunca toque em /opt/mediaserver/ nem rode rsync, deploy, docker ou qualquer coisa de produção.
- Só edite data/catena/, data/catena-fonte/ e data/catena-mapa/. Não edite scripts nem outros dados;
  se um script falhar de um jeito que pareça bug, pare aquele capítulo, anote em
  /srv/catena-notas.md e siga para o próximo.
- Não traduza na sessão principal: o latim vai só para os subagentes (economia de contexto).
- Nunca use `git push --force` nem reescreva histórico.

ORDEM DOS CAPÍTULOS
Primeiro os do Advento e do Natal de 2026 (Ano B): Mc 13, Mc 1, Lc 1, Jo 1, Lc 2, Lc 5, Lc 7,
Lc 10. Depois o resto de Marcos (2→16), João (2→21) e Lucas (1→24). Pule os já completos
(`node scripts/catena-traducao.mjs estado` mostra "completos").

PARA CADA CAPÍTULO <Ev> <cap>
1. git pull --rebase origin main
2. Se data/catena/<Ev>/<cap com 2 dígitos>.json não existe: node scripts/scrape-catena.mjs <Ev> <cap>
   (espere 5 s entre capítulos: é um site acadêmico pequeno). O Marcos ainda não tem mapa: o script
   cria as lectiones sem versículos, e o passo 3 resolve.
3. Mapa de versículos: para cada lectio sem `versos`, um subagente Sonnet lê o lema (o texto do
   Evangelho em latim que abre a lectio, em data/catena-fonte/<Ev>/<cap>.html, fora do itálico) e o
   capítulo em data/biblia/ (português) e devolve o intervalo de versículos. Grave com
   node scripts/catena-mapa.mjs <Ev> <cap> <lectio>=<a>-<b> … (o script recusa intervalo sem
   sentido). As lectiones são contíguas e crescentes; na dúvida, compare com o capítulo vizinho.
4. node scripts/catena-traducao.mjs capitulo <Ev> <cap> --lotes /srv/lotes/<Ev>-<cap> 15
5. Um subagente por lote (Agent tool, model "sonnet", até 6 em paralelo), com o prompt da seção
   "4. Traduzir a Catena" da skill, trocando o caminho do lote, mas o subagente SÓ escreve
   traducoes-N.json (não roda `grava`). Depois você roda `node scripts/catena-traducao.mjs grava
   <arquivo>` para cada lote, um por vez (em paralelo corrompe o JSON do capítulo, ver Mt 18).
   Se um lote falhar, reenvie só ele (no máximo 2 vezes; depois anote em /srv/catena-notas.md).
6. node scripts/catena-traducao.mjs confere <Ev> <cap>. Para os itens suspeitos, um subagente Opus
   relê latim e tradução e regrava os que estiverem errados (mesmo formato, mesmo `grava`).
   Aspas: as palavras do Evangelho que o Padre cita vão entre aspas duplas.
7. node scripts/verifica-liturgia.mjs (tem de passar).
8. git add data/catena data/catena-fonte data/catena-mapa &&
   git commit -m "catena: <Ev> <cap> traduzido (N itens)" && git push origin main
   Se o rebase ou o push der conflito, rode git rebase --abort, anote o capítulo em
   /srv/catena-notas.md e siga para o próximo.
9. Apague /srv/lotes/<Ev>-<cap>.

A CADA 5 CAPÍTULOS
Rode `node scripts/catena-traducao.mjs estado` e acrescente a saída, com data e hora, em
/srv/catena-progresso.md.

QUALIDADE (o que os subagentes precisam seguir — está na skill, repita no prompt deles)
Tradução literal e sóbria, sem acrescentar, resumir nem explicar; frase por frase, na ordem do
original; nomes bíblicos como na CNBB; "dominus" → "o Senhor"; citações do Evangelho entre aspas
duplas; trecho obscuro: o mais próximo possível, sem nota.
```

## Lições da primeira rodada (Mateus, 20–21/10/2026)

- Mateus inteiro (28 capítulos, 4.848 itens) saiu em cerca de um dia, sem nenhum item suspeito no
  `confere`. Parou em Mt 28 a pedido; João, Lucas e Marcos continuam pendentes.
- **Subagentes só escrevem `traducoes-N.json`; a sessão principal roda `grava` em série.** Com muitos
  lotes gravando o mesmo arquivo de capítulo em paralelo, há risco de um sobrescrever o outro
  (aconteceu em Mt 18 e foi refeito). Ao retomar, troque o passo 5 do prompt para isso.
- **Mt 6,1-4 está no arquivo de Mt 5** (lectiones 22 e 23 de `data/catena/Mt/05.json`, sem `versos`):
  no Corpus Thomisticum o "Caput 5" vai até a esmola. Precisa de ajuste antes da **Quarta-feira de
  Cinzas (10/02/2027)**, cujo Evangelho é Mt 6,1-6.16-18. Notas completas da VPS em
  `/srv/catena-notas.md` (também há diferenças de numeração entre a CNBB e a Vulgata).

## 3. Depois (Mac)

- `git pull`, revisar uma amostra por capítulo (ler 5 itens ao acaso de cada um).
- `node scripts/build-paginas-catena.mjs` e deploy: os capítulos completos viram páginas em
  `/catena/<ev>/<cap>/` e o link "Ler … inteiro comentado pelos Padres" aparece nos dias.
- Com a Catena completa, o resumo diário ("O que os Padres dizem hoje") tem material para todos os
  dias, inclusive os que caem em capítulos ainda não baixados hoje (ex.: Lc 16–19 em novembro).
