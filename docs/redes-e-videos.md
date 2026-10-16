# Instagram, Reels, YouTube e terço — como funciona

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

## YouTube — canal "Liturgia Diária" (@liturgia-santa-doutrina)

- `scripts/youtube.mjs`: `autoriza` (OAuth loopback; cliente em `~/.config/liturgia/youtube-client.json`,
  refresh token no Keychain `youtube-refresh-token`), `canal`, `envia <mp4> --titulo … --descricao-arquivo …
  --publicar-em ISO --capa jpg`, `capa`, `visibilidade <id> public|unlisted|private`.
- O app do Google Cloud ainda não é verificado: o envio sobe **privado com publicação agendada**, e o token
  expira de tempos em tempos (rodar `autoriza` de novo). `visibilidade` precisa reautorizar com o escopo
  `youtube` (hoje só há `youtube.upload`).

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

## Receita 4 — terço em vídeo (YouTube)

1. Pasta de trabalho `video/terco/` (copiar de `scripts/terco/`): `conjuntos.py` define gozosos, dolorosos e gloriosos (nomes, frutos, dias, pinturas, enquadramento); **falta luminosos** (não estão no livro de São Josemaria: usar anúncio + Evangelho + fruto). O texto das meditações vem de escriva.org/pt-br/santo-rosario/<n>/ (gloriosos = 11 a 15), lido pelo Chrome (curl dá 403).
2. `python3 roteiro.py <conjunto>` → `GROK_VOZ=leo python3 gera_vozes_grok.py <conjunto>` (Grok; o antigo `gera_vozes.py` usa ElevenLabs) → `quadros.py <conjunto>` → `montar.py <conjunto>` → `capa_desc.py <conjunto> <pintura-da-capa> <foco> "<créditos>"`.
3. Subir: `node scripts/youtube.mjs envia video/terco/terco-<conjunto>.mp4 --titulo "…" --descricao-arquivo video/terco/descricao-<conjunto>.txt --publicar-em <ISO> --capa video/terco/capa-<conjunto>.jpg` (sobe privado + agendado; o token expira: `autoriza` de novo). Título com até 100 caracteres: sem o " | Liturgia Diária" da 1ª linha da descrição.
4. Pendências YouTube: marcar os vídeos antigos como **Não listado** no Studio (o token atual só tem escopo de envio). `montar.py` usa `tmp/` compartilhado: nunca rodar dois ao mesmo tempo.

## Armadilhas já pisadas

- Gemini TTS: lê a instrução em voz alta se for no mesmo texto, pula o começo de orações conhecidas e sai em espanhol sem `languageCode: pt-BR`; a cota gratuita acaba (429).
- ElevenLabs "português" puxa para Portugal em textos de construção lusitana: usar `eleven_multilingual_v2` nesses trechos.
- `curl` local para `santadoutrina.com` falha: conferir pelo `ssh vps curl …`.
- Figma: não carrega a Michelangelus (clonar nós para manter o texto); WebP não renderiza (usar JPEG); sempre `fills=[]` em frames de título; subir imagem com `upload_assets` (multipart) e aplicar `scaleMode FILL`.
- Wikimedia: 403 sem User-Agent de navegador; 429 → esperar. Conferir licença arquivo a arquivo.
- iOS: conta grátis (Personal Team) expira em 7 dias; reinstalar com `xcodebuild … -allowProvisioningUpdates` + `xcrun devicectl device install app`.
