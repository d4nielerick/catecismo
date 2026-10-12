# Ideias para o futuro — Liturgia Diária e Catecismo

Registro das ideias discutidas em 12/10/2026 (app iOS, monetização, conteúdo). Nada aqui está decidido;
é o banco de ideias para quando houver público e tempo. Estudos de apoio:
[estudo-assinatura-app.md](estudo-assinatura-app.md) (mercado e contas) e
[canto-gregoriano-pesquisa.md](canto-gregoriano-pesquisa.md) (gravações e partituras livres).

## Regra de ouro

A liturgia continua **de graça** (leituras, áudio, aviso das 6h, compartilhar). Cobra-se pelo que
aprofunda a oração e o estudo, de preferência conteúdo **nosso** (áudios, Catena traduzida, cards,
pinturas), nunca pelo texto da CNBB.

## Antes de cobrar qualquer coisa

- **Licença dos textos litúrgicos — Edições CNBB.** Não há política pública para apps; quem usa o texto
  oficial tem acordo (app da CNBB; iLiturgia em coedição). Pedir autorização por escrito.
- **Catecismo da Igreja Católica** — tradução da Libreria Editrice Vaticana (a do vatican.va). Pedir
  autorização antes de cobrar. O **Catecismo de São Pio X** (1912) tem bem menos risco.
- **Conta Apple Developer** (US$ 99/ano) para TestFlight, App Store e app que não expira em 7 dias.

## O que o estudo de mercado concluiu (12/10/2026)

- Com o público atual (77 cliques do Google em 28 dias, 1 inscrito no push), **a assinatura não se paga**.
- Custo de caixa: R$ 80–600/mês → 13 a 98 assinantes. Pagando também ~R$ 30 mil de desenvolvimento:
  ~236 assinantes ≈ 1.300 instalações/mês no iPhone (conversão de 1,5%, América Latina, RevenueCat).
- Líquido por assinante ≈ R$ 6/mês (Apple 15% + impostos; mix mensal/anual).
- Hallow: R$ 249,90/ano, 4,8 mi downloads no Brasil — católico brasileiro paga por app de oração.
- Ordem recomendada: licença CNBB → "Apoiador" como doação sem trancar nada (se em 3 meses não houver
  15–30 apoiadores, assinatura também não teria) → medir instalações e retenção → crescer até ~1.000
  instalações/mês mirando a Quaresma → só então recursos pagos → testar com 2–3 paróquias.

## Modelos de receita

| Modelo | Ideia | Observação |
|---|---|---|
| Apoiador (assinatura) | R$ 9,90/mês ou R$ 79,90/ano, 7 dias grátis | Só quando houver público |
| Gorjeta avulsa | R$ 5 / 15 / 50 pela compra dentro do app | Dentro do app, só pela Apple (Pix/Stripe só para entidade sem fins lucrativos) |
| Jornada avulsa | R$ 19,90 (Quaresma, Advento) | Para quem não quer assinar |
| Patrocínio | "Esta semana, oferecido por…" (editoras, lojas, cursos católicos) | Melhor que anúncio de rede |
| Afiliados | Livros e missais ligados ao dia | Comissão de 4–10% |
| Paróquias | Versão com nome da paróquia, avisos, horários de missa | Maior receita, pede atendimento |

## Recursos para o app

**Oração**
1. Terço guiado — mistérios do dia, narrado (voz Daniel v4), contas avançando na tela.
2. Novenas ligadas ao calendário ("começa hoje a novena de…"), 9 dias com áudio e lembrete.
3. Jornadas sazonais — Quaresma e Advento (ver abaixo).
4. Lectio Divina guiada do Evangelho do dia (ler, meditar, rezar, contemplar), com cronômetro.
5. Exame de consciência / preparação para a confissão — só no aparelho.
6. Ângelus ao meio-dia (Regina Caeli no tempo pascal) — aviso às 12h + oração em áudio.

**Estudo**
7. Catecismo em 1 ano — um trecho por dia, áudio e progresso.
8. Os Padres completos — Catena Aurea inteira do Evangelho do dia, em áudio e offline.
9. Planos de leitura bíblica (Evangelhos em 90 dias, Bíblia em 1 ano).

**Comodidades**
10. Tudo offline (semana de leituras e áudios).
11. Anotações, marca-texto, diário espiritual (iCloud).
12. Widgets (Evangelho na tela de bloqueio, frase do dia), temas nas cores litúrgicas, ícones alternativos.
13. Apple Watch e CarPlay.

Prioridade sugerida: terço → novenas → jornada da Quaresma. Terço e novenas são terreno do Hallow;
o que nos diferencia é Catecismo em 1 ano, Catena e offline.

## Catecismo como produto (provavelmente monetiza melhor que a Liturgia)

A Liturgia é a porta de entrada (público grande, não paga); o Catecismo é o que se vende (público
menor que paga: catequistas, crisma, RICA, professores de ensino religioso, seminaristas, escolas).

- **Plano catequista** (~R$ 19,90/mês): encontro pronto por tema (CIC + Pio X + Bíblia + perguntas +
  dinâmica), exportável em PDF.
- **Licença paróquia/escola** (R$ 50–150/mês): várias contas, turmas, acompanhamento dos catequizandos,
  quiz.
- **Pergunte ao Catecismo** com parágrafos citados (já existe `api/pergunta.js`): grátis com limite.
- **Cursos curtos** avulsos ("Os sacramentos em 7 dias", "Preparação para a crisma").
- Busca perene ("o que a Igreja diz sobre…") — SEO do ano todo.
- Antes: medir no Search Console quanto o Catecismo recebe (os 77 cliques eram quase todos da Liturgia).

## Jornadas da Quaresma e do Advento

**Quaresma** (2027 começa em 10/02):
- Leitura do dia + trecho dos Padres (Catena) + parágrafo do Catecismo ligado ao tema + pergunta de
  reflexão + propósito (jejum, esmola, oração).
- Sextas: Via-Sacra de Santo Afonso de Ligório (domínio público), narrada.
- Semana Santa: guia do Tríduo.
- Referências da Igreja: Mensagem do Papa para a Quaresma (vatican.va); Campanha da Fraternidade (CNBB,
  com direitos); jejum e abstinência (Código de Direito Canônico; Catecismo §1434–1439).

**Advento** (2026 começa em 29/11 — bom teste antes da Quaresma):
- Duas fases: até 16/12 (vinda final) e 17–24/12 (preparação do Natal).
- Coroa do Advento aos domingos (uma vela por semana, oração de bênção).
- Antífonas do Ó, 17–23/12 (domínio público).
- Novena de Natal própria com as leituras (o livreto da CNBB tem direitos).

## Música sacra e canto gregoriano

- **Partituras:** GregoBase é CC0 (GABC; dump em github.com/bacor/gregobasecorpus). Renderizar com
  Gregorio (GPLv3/OFL) ou exsurge (MIT). Graduale 1908 em domínio público; o de 1974 (Solesmes) é
  cinzento — desenhar a partir do GABC, nunca reproduzir as páginas.
- **"Canto do dia":** Intróito/Comunhão dos domingos e festas + cantos fixos por tempo (Salve Regina,
  Veni Creator, Rorate Caeli, Victimae Paschali…). Não há tabela livre domingo→canto: montar a partir do
  Ordo Cantus Missae com as transferências do Brasil.
- **Áudio:** quase não há gravação livre de qualidade. Wikimedia Commons tem ~12 arquivos aproveitáveis
  (amadores). Diocese de La Crosse tem MP3 de todos os Intróitos (pedir autorização). Definitivo: gravar
  ~30 cantos com uma schola (estimativa R$ 10–30 mil, com cessão de direitos mundial).
- **Alternativas próprias:** música sacra instrumental CC0 do Musopen (Palestrina, Victoria, Allegri,
  Bach) como trilha opcional; trilhas originais geradas (Lyria) para transições.

## Site e Google

- Domínio novo (santadoutrina.com desde 26/09/2026): 356 páginas indexadas, 1.146 "detectadas, mas não
  indexadas". Paciência de 4–8 semanas; reconferir por volta de 20/10.
- Sitemap focado nos próximos 30 dias + santos + Catena (as páginas antigas gastam rastreamento).
- Links de fora: bio e stories do Instagram, paróquias e blogs católicos, diretórios.
- Cada dia apontando para o seguinte, para o santo e para o capítulo da Catena.
