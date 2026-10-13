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
- **Voz:** ElevenLabs, voz Daniel (`tts_eleven.py`): orações no `eleven_v4`; textos de construção lusitana
  (meditações de São Josemaria) no `eleven_multilingual_v2`, que soa brasileiro. O Gemini TTS (`tts.py`)
  pula o começo de orações conhecidas, lê a instrução em voz alta e, sem `languageCode: pt-BR`, sai em espanhol.
- **Meditações:** São Josemaria Escrivá, "Santo Rosário" (escriva.org), © Fundação Studium —
  **usado com autorização obtida pelo Daniel em 13/10/2026**. O texto (`escriva-<misterios>.json`) fica só na
  pasta de trabalho, fora do repositório; o crédito vai na descrição de cada vídeo.
- Publicados: gozosos sem meditação (https://youtu.be/pv1unI6utZY, passar para não listado) e
  gozosos com São Josemaria (https://youtu.be/l0rlEaHUlpc). Faltam dolorosos, gloriosos (com meditações)
  e luminosos (não estão no livro: anúncio + Evangelho + fruto).
- Pinturas: domínio público na Wikimedia Commons; créditos na descrição. Gozosos: Murillo (Virgem do Rosário),
  Fra Angelico (Anunciação), Ghirlandaio (Visitação), Honthorst (Adoração dos Pastores), Fra Angelico
  (Apresentação), Holman Hunt (Encontro no Templo).

## App iOS

Ver `ios/` e a seção "App de iPhone" em `docs/ESTRATEGIA.md`. Roda no iPhone do Daniel com a conta grátis
(Personal Team NM33KUNYGF, bundle `com.danielerick.liturgia`): expira em 7 dias; reinstalar pelo Xcode ou
`xcodebuild … -allowProvisioningUpdates` + `xcrun devicectl device install app`.
