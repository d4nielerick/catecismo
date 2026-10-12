# Liturgia Diária — estratégia, estado e próximos passos

Atualizado em 10/10/2026. Complementa o `HANDOFF.md` (arquitetura e pendências técnicas) e o `CLAUDE.md`
(como rodar cada gerador). Este arquivo guarda o **raciocínio**: onde estamos, o que funciona, o que fazer a seguir.

## 1. Diagnóstico (10/10/2026)

**Produto.** Melhor que o mercado que disputa. Liturgia com Catena Áurea em português, remissões ao Catecismo,
áudio com a linha acesa, cards de compartilhar com pinturas, PWA offline, aviso push, sem anúncio. Nenhum
concorrente brasileiro (Canção Nova, Paulus, CNBB, apps de terço) liga a Catena e o Catecismo ao Evangelho do dia.
**Esse é o diferencial real e único.** "Liturgia de hoje" qualquer um tem.

**Tração.** ~25 visitantes/dia (72% celular). Fontes: direto/WhatsApp > Google > Instagram. Doação: R$ 1 (o teste).
O problema é **distribuição**, não produto: com esse volume nenhuma monetização rende. Ordem certa:
distribuição → retenção → dinheiro.

**Search Console** (domínio `sc-domain:santadoutrina.com`, dados até 6/out; o Google atrasa 2–3 dias):
- 28 dias: 70 cliques, 1,63 mil impressões, posição média 10,6. Antes (28/set–4/out): 59 cliques, 1,3 mil.
- Só ganhamos em consultas **com data** ("liturgia do dia 5 de outubro de 2026", posição ~8). Nas genéricas
  ("liturgia de hoje", "liturgia diária") estamos na posição 35–56: não vamos passar os grandes tão cedo.
- Mudanças recentes (página `/liturgiadiaria/` pré-renderizada, Catena por capítulo, santos) só aparecem nos
  números em 1–2 semanas. **Rever por volta de 20/out.** O sitemap dos santos estava "Não foi possível buscar"
  no 1º envio (arquivo válido, 271 URLs): se persistir após 2 dias, investigar.

**Engenharia.** Disciplina rara para projeto solo (verificadores, reprodutibilidade, SEO por dia, CI). Fraquezas:
- A operação é uma esteira (janela): Catena traduzida cobre só ~26% dos próximos 451 dias; áudio só até 5/nov.
  Se parar duas semanas, o site "envelhece".
- 101 MB de áudio no git (cresce todo mês).
- Token do Telegram em texto puro no `docker-compose.yml` da VPS. Cache de build do Docker com ~60 GB.
- Voz do áudio mista (Brian, Gemini, Daniel v4). Escolher uma e gerar o mês inteiro.
- Risco jurídico latente: o texto do lecionário (CNBB) é protegido; a Catena (latim, domínio público) é o
  conteúdo inquestionavelmente nosso.

## 2. O que já foi feito (out/2026)

| Entrega | Onde |
|---|---|
| Stripe (cartão/Apple Pay/Google Pay) no site | `api/_stripe.mjs`, `menu.mjs`; memória `project-apoio-stripe` |
| PWA: offline, instalar, 7 dias à frente | `sw.js`, `pwa.mjs`; tour ensina a instalar no iPhone |
| Tutorial (tour) com 9 cenas fiéis à interface | `tour.mjs` + CSS `.t-*` |
| `/liturgiadiaria/` com as leituras de hoje no HTML | `scripts/pagina-hoje.mjs`, cron na VPS, regra no Caddy |
| Títulos/descrições pensados para busca; JSON-LD | `render.mjs` (`tituloDoDia`), `build-paginas-liturgia.mjs` |
| **Push "Evangelho de hoje" às 6h** | `api/_push.mjs`, `scripts/enviar-push.mjs`; ver CLAUDE.md |
| **Catena por capítulo** (`/catena/lc/15/`…) | `scripts/build-paginas-catena.mjs` |
| **Santo do dia** (126 santos, 165 datas) | `scripts/build-paginas-santos.mjs` |
| **@liturgia_hoje no Instagram, post diário automático** | `scripts/build-instagram-liturgia.py`, `scripts/publicar-instagram.mjs` |
| Janela até 5/nov (comentário, Catena, áudio Daniel v4) | skill `liturgia-janela` |

### @liturgia_hoje (Instagram) — como está montado
- Conta **profissional (criador)**, sem Página do Facebook (a criação da Página deu erro; não é necessária com a
  "API do Instagram com login do Instagram").
- App da Meta: **"Daniel DM Bot"** (id `1108155648627455`), caso de uso API do Instagram; permissão
  `instagram_business_content_publish` adicionada; @liturgia_hoje é "Testador do Instagram".
- Token (60 dias) em `IG_LITURGIA_TOKEN` no `/opt/mediaserver/.env` da VPS. **Nunca no chat nem no git.**
  Renovação automática: cron `30 4 1 * *` → `/opt/mediaserver/renovar-token-ig.sh` (log `/var/log/instagram-liturgia.log`).
  Se vencer/falhar: Meta for Developers → app → API do Instagram → "Gerar token" para liturgia_hoje, e gravar com
  `read -rs k && ssh vps "sed -i '/^IG_LITURGIA_TOKEN=/d' /opt/mediaserver/.env && echo \"IG_LITURGIA_TOKEN=$k\" >> /opt/mediaserver/.env"`.
- Cards 1080×1350 em `liturgiadiaria/instagram/AAAA-MM-DD.jpg|json` (fora do git; vão no deploy). Gerar **no Mac**
  (usa fontes do macOS): `python3 scripts/build-instagram-liturgia.py [data] [+N]` e subir. A VPS tenta de hora em
  hora (`2 * * * *`) e publica uma vez por dia depois das 6h de Brasília (estado em `/dados/instagram.json`).
- Primeiro post automático: 13/10/2026. Os de 10–12/10 foram à mão (`instagram-posts/`).
- Link da bio é texto (editar link clicável só pelo app do celular). Nome: "Liturgia Diária • Evangelho de Hoje".

## 3. Prioridades (ordem)

1. **WhatsApp primeiro.** O tráfego já é majoritariamente compartilhamento direto. **Canal do WhatsApp** com
   card + link às 6h (mesmo pipeline do Instagram) — alavanca mais barata para público católico brasileiro.
2. **Rodar a janela toda semana** (comentário, áudio, Catena, **cards do Instagram**, páginas). Sem isso o
   Instagram e o push ficam sem conteúdo no fim do mês (cards gerados até 31/12; comentário/áudio só até 5/nov).
3. **SEO onde dá para vencer** — páginas evergreen que só nós temos: Catena por capítulo (feito, crescer com a
   tradução), santo do dia (feito), "Evangelho comentado". Traduzir primeiro os capítulos que mais faltam:
   Lc 21, Mt 5 (feito), Jo 6, Mt 9, Mc 1 (Marcos inteiro falta).
4. **Reduzir a esteira:** traduzir por capítulo em lotes; escolher **uma** voz e gerar o mês; tirar o áudio do git.
5. **Revisar as traduções da Catena** (estão `revisado: false` e agora em páginas públicas).
6. Memórias **facultativas** do calendário (hoje só vêm as obrigatórias): tabela própria (~90 santos) com
   "Hoje a Igreja também lembra…". Faustina e João Paulo II hoje só aparecem como frase.

## 4. Monetização (realista)

- **Pessoas: sempre grátis.** Cobrar pela liturgia mata SEO e compartilhamento. Doação (PIX/cartão) recorrente
  ("Apoiador R$ 9,90/mês") com contador de apoiadores; só rende com ~10× o tráfego atual.
- **Paróquias (receita mais plausível):** card e mensagem diária com nome/brasão da paróquia, posting automático
  no Instagram/WhatsApp dela, folha semanal em PDF. R$ 49–99/mês; ~11 mil paróquias. Já existe ~90% do pipeline
  (esta semana o post automático). Começar com **piloto de 3 paróquias**, antes de qualquer painel.
- **A Catena como produto:** e-book anual "Evangelho comentado pelos Padres 2027" (Amazon, sob demanda) ou um
  volume por Evangelho. Margem real, vende sem tráfego grande.
- **Formação:** o Catecismo com busca é funil para um curso próprio (vídeo já produzido).
- **Parcerias:** "leia a obra completa" com editoras católicas, por afiliado.
- **Não:** anúncios; cobrar pelas leituras.

## 5. Ideias de funcionalidades (backlog)
- Modo leitor (texto grande, sem distração, para ler na missa).
- Reels diários a partir do vídeo das 5h (rotina ainda não montada).
- Push também por celebração/santo; segmentar por horário.
- Painel da paróquia (só depois do piloto).
- Marcar capítulos traduzidos como "revisado" após revisão humana.

## 6. Lembretes operacionais
- Deploy: ver `CLAUDE.md`. **Se o `api/` na VPS mudou fora do git, sincronizar antes** (aconteceu com `_modelo.mjs`).
- Qualquer trabalho em andamento de outra sessão fica fora do rsync (`--exclude`) até commitar.
- Cron na VPS (Europe/Berlin, sem fuso por tarefa): push `0 * * * *`, hoje.html `5 * * * *`, Instagram `2 * * * *`:
  todos rodam de hora em hora e o script decide pelo horário de Brasília.

## App de iPhone (ios/)

SwiftUI nativo (iOS 17+), projeto gerado por XcodeGen (`cd ios && xcodegen generate`), que lê do site os mesmos
`data/liturgia/AAAA-MM-DD.json` e `data/liturgia-audio/`. **Fica fora do rsync de deploy (`--exclude=/ios/`).**
Hoje: leituras do dia, navegação por dia, áudio (com tela de bloqueio) e aviso local às 6h. Pendente: widget,
Catena, santos, Xcode no Mac (ainda não instalado) e conta Apple Developer (não há; US$ 99/ano) para iPhone e loja.
`Models.swift` e `Texto.swift` foram conferidos contra os 1.461 dias do site; as telas ainda não foram compiladas.
