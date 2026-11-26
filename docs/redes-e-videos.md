# Instagram, Reels, YouTube e terço — como funciona

> Atualizado em 22/11/2026 (horários, tokens, Reels de cenas, Evangelho ilustrado).

Registro do que foi montado entre 10 e 13/10/2026. Os arquivos gerados (imagens, áudios, vídeos)
ficam fora do git; aqui estão os scripts e o caminho de cada peça.

## Instagram @liturgia_hoje (card + Reel diários, automáticos)

- **Card do dia** (1080×1350): `scripts/build-instagram-liturgia.py` gera `liturgiadiaria/instagram/AAAA-MM-DD.jpg`
  e `.json` (legenda). Quando o card é desenhado à mão no Figma (arquivo "Liturgia Diária · Reels",
  página "Outubro"), o PNG exportado substitui o JPG gerado — **não rodar o gerador por cima** desses dias.
- **Frases da semana:** `data/instagram-frases.json` (frase exata da leitura, referência, tema, pintura).
  Rotina combinada: a cada semana, 3–4 opções de frase por dia (de qualquer leitura) + sugestão de pintura
  clássica em domínio público; o Daniel escolhe; rótulo do card "LITURGIA DE HOJE · <origem>".
- **Reel do dia** (1080×1920): `scripts/reels/base-reel.py` (quadro com a pintura, "Liturgia de hoje", data,
  referência, L + @) e `scripts/reels/montar-reel.py` (frases do Evangelho em Michelangelus com a próxima
  esmaecida, voz de `data/liturgia-audio/<dia>/evangelho.mp3`, trilha `scripts/reels/trilha-violino.mp3`
  em volume 0,07). A Michelangelus é licença Microsoft: fica só no Mac, nunca no repositório.
  Margens seguras do Reels: topo 250 px, base 380 px (texto até y 1540), direita 120 px.
- **Publicação:** `scripts/publicar-instagram.mjs` no container `catecismo-api` da VPS, cron `2 * * * *`;
  publica às 6h de Brasília o card e, se existir `liturgiadiaria/instagram/reels/<dia>.mp4`, o Reel.
  Estado em `/dados/instagram.json`; log `/var/log/instagram-liturgia.log`. Token `IG_LITURGIA_TOKEN`
  no `/opt/mediaserver/.env` (renovação mensal: `/opt/mediaserver/renovar-token-ig.sh`).
- **Link para o site:** só nos Stories, com a figurinha de link nativa (a API não faz; é manual).
  Nada de endereço por extenso no card.

### Horários de publicação (Brasília)

| O quê | Quando | Quem solta |
|---|---|---|
| Card do dia + Reel do dia (`reels/<dia>.mp4`) | ~6h05 (cron no minuto 2, só depois das 6h; o Instagram leva alguns minutos para processar o vídeo) | `publicar-instagram.mjs` |
| Reel extra (`reels/<dia>-2.mp4`, ex.: o Evangelho ilustrado de domingo) | a `hora` de `reels/<dia>-2.json` (padrão 12h), minuto 2 | `publicar-instagram.mjs` |
| Short no YouTube de cada Reel | minuto 8 da hora em que o Reel já saiu no Instagram (6h08, 12h08; se o Instagram atrasar, na hora seguinte) | `publicar-youtube.mjs` |
| Aviso push "Evangelho de hoje" | 6h | `enviar-push.mjs` |

Conferir o que saiu: `ssh vps tail /var/log/instagram-liturgia.log /var/log/youtube-liturgia.log`.

### Tokens e renovações (nada disso passa pela conversa nem pelo git)

| Token | Onde fica | Renovação |
|---|---|---|
| Instagram @liturgia_hoje (`IG_LITURGIA_TOKEN`) | `/opt/mediaserver/.env` na VPS | sozinha, dia 1º às 4h30 (horário do servidor): `/opt/mediaserver/renovar-token-ig.sh`, log em `/var/log/instagram-liturgia.log` |
| YouTube (refresh token) | `/dados/youtube.json` na VPS (cópia do Keychain do Mac) | não vence desde que o app do Google foi publicado (19/11/2026); se cair: `node scripts/youtube.mjs autoriza && node scripts/youtube.mjs vps` |
| Instagram @danierick do n8n (DMs e fila de posts do estúdio) | credencial `Header Auth account` do n8n | sozinha, dia 1º às 4h40: `/opt/n8n/renovar-token-meta.sh`, avisa no Telegram se falhar. Documentado no repositório privado do estúdio (`pompeu-estrategia`, `ferramentas/n8n-instagram.md`), não aqui |

Os tokens do @liturgia_hoje e do @danierick saem do mesmo app da Meta ("Daniel DM Bot", Casos de uso → API do Instagram → etapa 2, "Gerar token"). Se uma renovação automática falhar por 60 dias, gerar ali de novo; para pôr o token novo sem colar em lugar nenhum, copiar e pedir ao Claude, que lê da área de transferência (`pbpaste`) direto para o servidor.

### Reels de cenas (desde 25/11/2026)

O Reel diário passou a ter 4–5 pinturas por Evangelho (uma por momento da leitura), com zoom lento, dissolvência, as frases no ritmo da voz e o convite final (seguir @liturgia_hoje, liturgia.santadoutrina.com).

1. **Cenas:** uma linha `AAAA-MM-DD-N|cena em inglês` por momento do Evangelho; gerar no Google Flow (Nano Banana, 3:4, x2, 0 crédito) com o prefixo e o sufixo de estilo de `instagram-posts/reels-cenas/prompts-completos.txt`. As imagens vão para `instagram-posts/reels-cenas/flow/cena-<dia>-<n><a|b>.jpg` (fora do git).
2. **Escolha:** `instagram-posts/reels-cenas/escolhas.json` (`{ "2026-12-24": ["1a","2b","3b","4a"] }`). Para conferir: `python3 scripts/reels/folha-trechos.py folha.jpg <dias>` monta a folha com cada pintura e o trecho lido enquanto ela aparece (mesmo corte do montador).
3. **Render:** `scripts/reels/reels-cenas-lote.sh` (usa `montar-reel-cenas.py` e `capa-reel.py`; saída em `instagram-posts/reels-cenas/lote/`). Trilha `trilha-violino.mp3` a 0,07.
4. **Subir:** `scripts/reels/reels-cenas-subir.sh <dias>` (confere md5 e legenda). Prontos até 24/12/2026; o 19/12 é o mais longo (2min38).

### Evangelho ilustrado (Reel extra de domingo)

`scripts/reels/evangelho-ilustrado.py roteiro.json saida.mp4`, com a pasta do dia em `instagram-posts/evangelho-ilustrado/<dia>/` (cenas, narração, trilha, `roteiro.json`). **Volume da trilha:** sai sozinho da voz, 15 dB abaixo (`folga_trilha` no roteiro muda a folga; `vol_trilha` força um valor). O de Cristo Rei (22/11/2026) foi com `vol_trilha` 0,28, só 3 dB abaixo da voz, e o dono achou alto. Depois de pronto: `reels/<dia>-2.mp4`, `reels/<dia>-2.json` (`{ legenda, hora }`) e `reels/capas/<dia>-2.jpg` na VPS.

- **Voz com efeito e trilha trocada sem renderizar de novo** (desde 29/11/2026, 1º Domingo do Advento): copiar
  `scripts/reels/mixa-evangelho-ilustrado.py` para a pasta do dia como `mixa.py` e rodar lá
  `python3 mixa.py <trilha> [--folga 12] [--inicio 39]`. Põe reverb leve na voz (`0.035`) e delay de 2 repetições
  (`[0.16, 0.06]`, abafadas) só nos gritos (`GRITOS`, tempos do Whisper em `narracao/brian.json`), mistura a trilha
  N dB abaixo e troca o áudio do `completo.mp4` → `final.mp4`. `--inicio` = segundo da trilha em que o vídeo começa
  (para o clímax da música cair no clímax do texto). O dono pediu: reverb "pouco", delay "suave, poucos rebotes".
- **Trilha "cinematográfica"** feita pelo dono no Suno (29/11: `Advent Vigil`, 2min38, entrando aos 39 s, 12 dB abaixo).
- **Peso:** o `final.mp4` herda o vídeo do `completo.mp4` (~390 MB em 52 s) e passa do limite de ~300 MB da API do
  Instagram. Sempre recomprimir antes de subir: `ffmpeg -i final.mp4 -c:v libx264 -preset slow -crf 18 -maxrate 20M
  -bufsize 40M -c:a copy final-instagram.mp4` (~130 MB). Capa = um quadro do clímax (`ffmpeg -ss <t> -frames:v 1`).
- **Afiliados:** o dono entrou no programa de afiliados do Mercado Livre (25/11/2026) e marca produtos nos Reels à mão
  pelo app ("Adicionar produtos"); a API do Instagram não faz essa marcação e o Mercado Livre não tem API pública de
  links de afiliado. Ideias não decididas: catálogo `produtos.json`, lembrete no Telegram, DM por palavra-chave, página /indicados.

## YouTube — canal "Liturgia Diária" (@liturgia-santa-doutrina)

- `scripts/youtube.mjs`: `autoriza` (OAuth loopback; cliente em `~/.config/liturgia/youtube-client.json`,
  refresh token no Keychain `youtube-refresh-token`), `canal`, `envia <mp4> --titulo … --descricao-arquivo …
  --publicar-em ISO --capa jpg`, `capa`, `visibilidade <id> public|unlisted|private`.
- O app do Google Cloud ainda não é verificado: o envio sobe **privado com publicação agendada**, e o token
  expira de tempos em tempos (rodar `autoriza` de novo). `visibilidade` precisa reautorizar com o escopo
  `youtube` (hoje só há `youtube.upload`).

### Shorts automáticos (desde 19/11/2026)

- `scripts/publicar-youtube.mjs` roda na VPS (cron `8 * * * *`, log `/var/log/youtube-liturgia.log`) e sobe como Short
  cada Reel que o `publicar-instagram.mjs` já publicou no dia (estado do Instagram em `/dados/instagram.json`): o do dia
  e o extra (`reels/<dia>-2.mp4`). Título = 1ª linha da legenda + #Shorts; descrição = legenda + link do dia.
  Estado em `/dados/youtube-estado.json`. `--ensaio` mostra o que subiria (`YT_DIA=` para outro dia).
- Credenciais em `/dados/youtube.json` (VPS, 600), copiadas do Mac com `node scripts/youtube.mjs vps` depois de
  `autoriza`. O app do Google Cloud foi publicado ("em produção") em 19/11: a autorização não vence mais em 7 dias.
- Política de privacidade (exigida pelo Google): `/privacidade/`.

## Terço em vídeo (YouTube)

- Scripts em `scripts/terco/` (rodar numa pasta de trabalho, ex. `video/terco/`, que é ignorada pelo git):
  `roteiro.py` (segmentos: orações iniciais, 5 mistérios com anúncio, meditação, fruto, Pai-Nosso,
  10 Ave-Marias, Glória, Ó meu Jesus; encerramento) → `gera_vozes.py` (voz) → `quadros.py` (1920×1080:
  pintura à esquerda, texto e 10 contas à direita) → `montar.py` (concatena, trilha baixa, −16 LUFS,
  capítulos em `tmp/capitulos.json`).
- **Voz (a partir de 16/10/2026): Grok TTS (xAI), voz `leo`, `pt-BR`** (`tts_grok.py`, `gera_vozes_grok.py`; chave `xai-api-key`
  no Keychain, nunca no chat). Sem sotaque de Portugal nas meditações, custo de centavos por terço (~8 mil caracteres únicos),
  `POST https://api.x.ai/v1/tts` com `voice_id` e `language: pt-BR`. A clonagem de voz da xAI não vale no Brasil (API só Enterprise,
  console só EUA). Alternativa testada: `orion`. Antes: ElevenLabs voz Daniel (`tts_eleven.py`; orações no `eleven_v4`, meditações no
  `eleven_multilingual_v2`) — os arquivos antigos ficam com final `-eleven`. Descartados: VoiceStudio/OmniVoice local (voz ruim) e Gemini
  TTS (`tts.py`: pula o começo de orações conhecidas, lê a instrução em voz alta, sem `languageCode: pt-BR` sai em espanhol).
- **Meditações:** São Josemaria Escrivá, "Santo Rosário" (escriva.org), © Fundação Studium —
  **usado com autorização obtida pelo Daniel em 13/10/2026**. O texto (`escriva-<misterios>.json`) fica só na
  pasta de trabalho, fora do repositório; o crédito vai na descrição de cada vídeo.
- Publicados (voz Grok, agendados em 16/10/2026): dolorosos https://youtu.be/9W6FV7l2R2Q (16/10), gozosos https://youtu.be/fW8XsbV2Ogw
  (sábado 17/10, 6h) e gloriosos https://youtu.be/tD2SDC5IfT0 (domingo 18/10, 6h). Os vídeos antigos (ElevenLabs: gozosos
  pv1unI6utZY e l0rlEaHUlpc, dolorosos da 1ª versão) devem ir para **Não listado** no Studio. Faltam luminosos (não estão no livro:
  anúncio + Evangelho + fruto).
- Pinturas: domínio público na Wikimedia Commons; créditos na descrição. Gozosos: Murillo (Virgem do Rosário),
  Fra Angelico (Anunciação), Ghirlandaio (Visitação), Honthorst (Adoração dos Pastores), Fra Angelico
  (Apresentação), Holman Hunt (Encontro no Templo).

## App iOS

Ver `ios/` e a seção "App de iPhone" em `docs/ESTRATEGIA.md`. Roda no iPhone do Daniel com a conta grátis
(Personal Team NM33KUNYGF, bundle `com.danielerick.liturgia`): expira em 7 dias; reinstalar pelo Xcode ou
`xcodebuild … -allowProvisioningUpdates` + `xcrun devicectl device install app`.


---

# Receitas (para quem for editar: Codex, Claude Code ou o Daniel)

## Onde estão as coisas

| Peça | Fonte da verdade | Observação |
|---|---|---|
| Cards do Instagram desenhados à mão | **Figma** `6B78fgqHoMeh3gmyQ8A1Zr`, página "Outubro" (seção por dia: Reel, card, card de santo) | Cards 13–19/10 e Teresa extra (nó 33:2); card de 12/10 = nó 18:39. Exportar com `get_screenshot` (1080×1350) → salvar em `liturgiadiaria/instagram/AAAA-MM-DD.jpg` |
| Cards/Reels já no ar | VPS `/opt/mediaserver/catecismo/liturgiadiaria/instagram/` (`AAAA-MM-DD.jpg/.json` e `reels/AAAA-MM-DD.mp4`) | Os Reels **só existem na VPS e em `instagram-posts/reel-teste/reel-AAAA-MM-DD.mp4`** (local, fora do git) |
| Frases escolhidas | `data/instagram-frases.json` (12–31/10) e `liturgiadiaria/instagram/AAAA-MM-DD.json` (legenda) | Frase = citação exata de uma leitura do dia (validar por busca no texto de `data/liturgia/`) |
| Pinturas | Wikimedia Commons (domínio público), cortadas pelo `ponto_focal`; créditos nas legendas/descrições | A pasta de trabalho temporária foi perdida: rebaixar do Commons (`Special:FilePath/<arquivo>?width=2400`, User-Agent de navegador, pausas p/ evitar 429) |
| Santo Carlo Acutis | `assets/img/cards/sao-carlo-acutis.webp` (+`mini/`), `instagram-posts/acervo/` | Imagem gerada por IA, **não é retrato**; registrado como tal em `data/cards-imagens.json` |
| Terço (vídeo) | `scripts/terco/` + pasta de trabalho `video/terco/` (ignorada pelo git) | Textos de São Josemaria em `video/terco/escriva-*.json` (fora do git) |

Pinturas do mês (12–31/10; título — autor): 12 Bodas de Caná — Murillo · 13 (Reel) cálice e patena, imagem gerada; (card) trigal com pessoa de braços abertos, gerada ·
14 vitral da Pomba do Espírito Santo — Bernini (CC0) · 15 Santa Teresa — Frías y Escalante · 16 Sagrada Família do Passarinho — Murillo ·
17 Homem e Mulher Contemplando a Lua — Friedrich · 18 O Tributo da Moeda — Ticiano · 19 Retorno do Filho Pródigo — Rembrandt ·
20 Alegoria da Justiça e da Paz — Giaquinto · 21 Resposta de Daniel ao Rei — Rivière · 22 Sagrado Coração — Batoni (foto de altar; trocar por El Greco, Pentecostes, se houver dúvida de direitos) ·
23 Jesus lava os pés de Pedro — Ford Madox Brown · 24 Interior da Basílica de São Pedro — Panini · 25 A Cananeia — Drouais · 26 A Luz do Mundo — Holman Hunt ·
27 Casamento da Virgem — Perugino · 28 Cristo no Getsêmani — Carl Bloch · 29 São Miguel — Guido Reni · 30 São Paulo escrevendo — Valentin de Boulogne · 31 Conversão de São Paulo — Caravaggio.

## Receita 1 — trocar a frase ou a pintura de um card

1. Escolher a frase: citação **exata** de uma das leituras do dia (`data/liturgia/AAAA-MM-DD.json`); rótulo "LITURGIA DE HOJE · 1ª LEITURA|SALMO|ACLAMAÇÃO|EVANGELHO" + referência numa linha pequena.
2. Editar o card no Figma (nó do card do dia: retângulo 1080×760 com a pintura; frase em Inria Serif Itálico, 3 linhas no máximo, abaixo da linha fina fica a data em vermelho e `@liturgia_hoje`). **Não** escrever endereço do site no card.
3. Exportar PNG 1080×1350 → JPG qualidade ~93 → `liturgiadiaria/instagram/AAAA-MM-DD.jpg`; atualizar a 1ª linha da legenda em `AAAA-MM-DD.json` (`“frase” (Ref)`).
4. `rsync -t` do jpg/json para `vps:/opt/mediaserver/catecismo/liturgiadiaria/instagram/` e conferir com `ssh vps curl -sI https://santadoutrina.com/liturgiadiaria/instagram/AAAA-MM-DD.jpg`. Sai às 6h (Brasília) sozinho.
5. **Nunca** rodar `scripts/build-instagram-liturgia.py` para um dia cujo card foi feito à mão (ele sobrescreve).

## Receita 2 — refazer o Reel de um dia

1. Pintura (JPG grande) e ponto focal (x,y de 0 a 1). `python3 scripts/reels/base-reel.py DD fx fy zoom "Lc 11,37-41" "Terça-feira, 13 de outubro" pintura.jpg base-DD.png`.
2. `python3 scripts/reels/montar-reel.py trilha.mp3 reel-AAAA-MM-DD.mp4 0.07 AAAA-MM-DD base-DD.png` (precisa da Michelangelus em `~/Library/Fonts`, do áudio `data/liturgia-audio/<dia>/evangelho.mp3|.json` e de `ffmpeg`). Trilha: `scripts/reels/trilha-violino.mp3`, volume **0,07** (o dono achou alto acima disso). Sem desfoque no topo da imagem.
3. Margens seguras (Reels): topo 250 px, base 380 px (conteúdo até y 1540), direita 120 px.
4. Subir para `vps:/opt/mediaserver/catecismo/liturgiadiaria/instagram/reels/AAAA-MM-DD.mp4` (chmod 644). O mesmo cron publica o Reel depois do card.
5. A voz do Evangelho de alguns dias é do Gemini (Algenib) e não a Daniel v4 (ver `voz` em `data/liturgia-audio/<dia>/evangelho.json`); o dono aceitou assim.

## Receita 3 — card de um santo / memória nova (exemplo: São Carlo Acutis, 13/10)

1. Calendário: `FIXAS` em `scripts/lib-calendario-liturgico.mjs` (`'MM-DD': ['M', 'Nome']`); se for muito popular, acrescentar o nome em `SANTOS_DE_DEVOCAO` (ponto dourado no calendário) em `scripts/build-liturgia.mjs`.
2. `data/santos-fonte.json` (nome → título do artigo da pt.wikipedia), `data/santos-frases.json › frases[Nome]` (frase, fonte, `imagem`), `data/cards-imagens.json` (id, titulo, `recriacao`/aviso de que é imagem gerada).
3. Imagem 1280×960 webp em `assets/img/cards/<id>.webp` e 200×150 em `mini/`. Para santo, **pintura do próprio santo** (preferência do dono); quando não houver pintura livre, imagem gerada e marcada como tal.
4. `node scripts/build-liturgia.mjs && node scripts/build-santos.mjs && node scripts/verifica-liturgia.mjs && node scripts/build-paginas-liturgia.mjs && python3 scripts/build-og-liturgia.py && node scripts/build-paginas-santos.mjs`; apagar antes os `liturgiadiaria/og/AAAA-MM-DD.jpg` dos dias que mudaram. Commit, push, depois deploy (ver regras acima).
5. Card do Instagram do santo: layout igual aos de frase, rótulo "SANTO DO DIA · …"; exemplo em `instagram-posts/acervo/card-2026-10-13-carlo-acutis.jpg`.

## Terço da Misericórdia animado e lives diárias (25/11/2026)

Formato novo, mais animado que os terços dos mistérios. Scripts em `scripts/terco/` (rodar em `video/terco/`):

- `misericordia.py` — textos das orações (Diário de Santa Faustina: Expirastes 1319, Ó Sangue e Água 84/187, terço 476,
  Ó Deus eterno 950), as 5 dezenas com um trecho da Paixão (Bíblia Ave-Maria) e as pinturas dos Dolorosos (`img-dol/`).
  Abertura e encerramento: Jesus Misericordioso de **Kazimirowski (1934)**, domínio público, baixado da Wikimedia
  Commons para `img-dol/0-misericordia.jpg`.
- `animado.py completo` → `terco-misericordia.mp4` (10min26, 1920×1080, 30 fps, ~30 min de render). Desenha quadro a
  quadro: zoom lento e dissolvência nas pinturas; cada dezena abre em tela cheia com o título e o painel de texto desliza;
  palavras acendem junto com a voz (tempo proporcional ao tamanho da palavra); 10 bolinhas por dezena (3 nas orações repetidas três
  vezes) com a conta atual brilhando (o terço inteiro desenhado foi testado e o dono preferiu as bolinhas); raios da Misericórdia pulsando (cone a partir do coração); textos sem bolinhas (Creio) usam o painel inteiro; no fim, convite "Curta e inscreva-se · todo dia às 15h e às 3h, ao vivo" com botão e voz.
  `animado.py teste` faz só 47 s. O render grava em `<saida>.parcial` e só troca o vídeo no fim (um arquivo saiu corrompido antes disso). `SO_AUDIO=1` troca só o áudio do vídeo já renderizado. Capítulos em
  `terco-misericordia-capitulos.json`.
- **Vozes:** guia = Grok `leo`; respostas ("tende misericórdia…", "em expiação…", "tende piedade…", "Jesus, eu confio
  em vós") = `coro.py`, **dueto Ara + Castor** (Grok), a 2ª voz 70 ms depois, cada uma num lado do estéreo, reverb
  leve, sem esticar a fala. Testados e recusados: 10 vozes esticadas para a mesma duração (soou metálico/"estranho").
  Volume da resposta: pico 0,62 contra 0,68 da guia (`VOL_CORO`); o dono pediu "um pouco mais baixa".
- Capa: `python3 scripts/reels/capa-youtube.py <dia> "Terço da|*Misericórdia*" "Jesus, eu confio em vós" --paleta vinho
  --selo TERÇO --rotulo "TODO DIA ÀS 15H" --pintura img-dol/0-misericordia.jpg --topo 0.12 --saida capa-misericordia.jpg`.
  Descrição com capítulos e créditos: `video/terco/descricao-misericordia.txt`.
- **Lives às 15h e às 3h (Brasília):** `scripts/live-terco.mjs`, no host da VPS. Aos 50 min de cada hora, se a próxima
  hora cheia é 15h ou 3h: cria a transmissão agendada (pública, título por horário, descrição, capa), liga ao stream
  fixo do canal (id em `/opt/mediaserver/lives/estado.json`) e, na hora, transmite `terco-misericordia-live.mp4` com
  `ffmpeg -re -c copy` (início e fim automáticos). Falha → aviso no Telegram. Arquivos em `/opt/mediaserver/lives/`
  (fora do rsync do site). O arquivo da live é recodificado para 5 Mbps com quadro-chave a cada 2 s (`-g 60`).
  ffmpeg instalado no host (apt) em 25/11/2026. Teste: `--agora --nao-listado`; `--ensaio` só mostra.
  O canal foi liberado para lives em 25/11/2026 (Studio → Transmitir ao vivo); a 1ª live de teste, não listada,
  funcionou do começo ao fim: https://youtu.be/dfJ6L7Njl9Q. Vídeo normal: https://youtu.be/tXEnzRI63jI (25/11/2026). **Cron ativo desde 25/11/2026** (1ª live: 26/11, 3h):
  `50 * * * * cd /opt/mediaserver/catecismo && /usr/bin/node scripts/live-terco.mjs >> /var/log/live-terco.log 2>&1`.
  Título honesto (oração transmitida, não "ao vivo com alguém rezando"); o YouTube pode tratar o mesmo vídeo diário
  como repetitivo: variar com o tempo (vozes, pinturas).

## Receita 4 — terço em vídeo (YouTube)

1. Pasta de trabalho `video/terco/` (copiar de `scripts/terco/`): `conjuntos.py` define gozosos, dolorosos e gloriosos (nomes, frutos, dias, pinturas, enquadramento); **falta luminosos** (não estão no livro de São Josemaria: usar anúncio + Evangelho + fruto). O texto das meditações vem de escriva.org/pt-br/santo-rosario/<n>/ (gloriosos = 11 a 15), lido pelo Chrome (curl dá 403).
2. `python3 roteiro.py <conjunto>` → `GROK_VOZ=leo python3 gera_vozes_grok.py <conjunto>` (Grok; o antigo `gera_vozes.py` usa ElevenLabs) → `quadros.py <conjunto>` → `montar.py <conjunto>` → `capa_desc.py <conjunto> <pintura-da-capa> <foco> "<créditos>"`.
3. Subir: `node scripts/youtube.mjs envia video/terco/terco-<conjunto>.mp4 --titulo "…" --descricao-arquivo video/terco/descricao-<conjunto>.txt --publicar-em <ISO> --capa video/terco/capa-<conjunto>.jpg` (sobe privado + agendado; o token expira: `autoriza` de novo). Título com até 100 caracteres: sem o " | Liturgia Diária" da 1ª linha da descrição.
4. Pendências YouTube: marcar os vídeos antigos como **Não listado** no Studio (o token atual só tem escopo de envio). `montar.py` usa `tmp/` compartilhado: nunca rodar dois ao mesmo tempo.

## Armadilhas já pisadas

- **Fim das falas cortado nos terços (até 25/11/2026):** os `tts*.py` tiravam o silêncio com `silenceremove` a -45 dB
  sem folga e comiam o "s"/"m" final ("vós", "Amém"); as falas terminavam a ~-35 dB do pico. Corrigido em
  `tts_grok.py` (fim a -55 dB com 120 ms de folga; mp3 original guardado em `vozg/orig/`). Os terços publicados antes
  (gozosos, dolorosos, gloriosos, luminosos) têm o defeito; `tts.py` e `tts_eleven.py` ainda usam o corte antigo.
- Gemini TTS: lê a instrução em voz alta se for no mesmo texto, pula o começo de orações conhecidas e sai em espanhol sem `languageCode: pt-BR`; a cota gratuita acaba (429).
- ElevenLabs "português" puxa para Portugal em textos de construção lusitana: usar `eleven_multilingual_v2` nesses trechos.
- `curl` local para `santadoutrina.com` falha: conferir pelo `ssh vps curl …`.
- Figma: não carrega a Michelangelus (clonar nós para manter o texto); WebP não renderiza (usar JPEG); sempre `fills=[]` em frames de título; subir imagem com `upload_assets` (multipart) e aplicar `scaleMode FILL`.
- Wikimedia: 403 sem User-Agent de navegador; 429 → esperar. Conferir licença arquivo a arquivo.
- iOS: conta grátis (Personal Team) expira em 7 dias; reinstalar com `xcodebuild … -allowProvisioningUpdates` + `xcrun devicectl device install app`.
