# AGENTS.md — Liturgia Diária e Catecismo

Instruções para agentes (Codex, Claude Code etc.). Leia **CLAUDE.md** (arquitetura, deploy, geração de dados) e **docs/redes-e-videos.md**
(Instagram, Reels, YouTube e terço — passo a passo de como cada peça é feita e como editar). O resto do contexto:
`docs/ESTRATEGIA.md`, `docs/ideias-futuro.md`, `docs/estudo-assinatura-app.md`, `docs/canto-gregoriano-pesquisa.md`, `HANDOFF.md`.

## Regras que não mudam

- **Produção é a VPS** (rsync + Caddy), não a Vercel. Nunca rodar o rsync de deploy sem ensaio (`-n --itemize-changes`) e sem as
  exclusões do CLAUDE.md; acrescentar `--exclude=/ios/ --exclude=/instagram-posts/ --exclude=/liturgiadiaria/instagram/` (a pasta
  `liturgiadiaria/instagram/reels/` só existe na VPS: o `--delete` a apagaria). Peça o ok do Daniel antes de subir.
- **Nunca editar à mão** o que é gerado: `data/liturgia/`, `data/catecismo.json`, `data/notas.json`, páginas em `liturgiadiaria/AAAA-MM-DD/`,
  `santos/`, `catena/` (ver os scripts `build-*`). O verificador é `node scripts/verifica-liturgia.mjs`.
- **Segredos nunca na conversa nem no git**: tokens do Instagram/ElevenLabs/Gemini ficam no Keychain do Mac (`security find-generic-password`)
  ou no `/opt/mediaserver/.env` da VPS. Não imprimir valores.
- **Texto de São Josemaria** (Santo Rosário, © Fundação Studium): autorizado só para os vídeos do canal; **não vai para o repositório**.
- **Fonte Michelangelus**: licença Microsoft, só no Mac, nunca no repo. Montagem dos Reels usa-a localmente.
- Português do Brasil em tudo que o público lê. Textos que "soam a IA" foram rejeitados pelo dono; frases de leituras são citações **exatas**.
- Comunicação com o dono: curta, sem jargão; mostrar a imagem/vídeo antes de publicar qualquer coisa.

## Mapa rápido

| Quero… | Onde |
|---|---|
| mudar um card/Reel/vídeo já feito | docs/redes-e-videos.md → "Receitas" |
| saber o que é publicado automaticamente | cron `2 * * * *` na VPS (`scripts/publicar-instagram.mjs`) e `0 * * * *` (push) |
| app iPhone | `ios/` (XcodeGen; ver docs/ESTRATEGIA.md → "App de iPhone") |
| santos, frases, pinturas | `data/santos-frases.json`, `data/cards-imagens.json`, `assets/img/cards/` |
