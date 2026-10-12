# Assinatura "Apoiador" no app Liturgia Diária: ela se paga?

Estudo de mercado, 12/10/2026. Fontes com link em cada seção. Onde há **estimativa**, ela está marcada e diz de onde partiu. Câmbio usado: US$ 1 = R$ 5,20 (próximo do R$ 5,19 registrado no HANDOFF em 27/09/2026). O modelo de cálculo está em `modelo.py`, na mesma pasta.

---

## Resumo em 10 linhas

1. **Com o público atual, não se paga.** Hoje são 77 cliques orgânicos em 28 dias, 1 inscrito nos avisos e um Instagram recém-criado. Com 1,5% de instalação→pago (a mediana da América Latina na RevenueCat), isso dá **menos de 5 assinantes**.
2. **O custo em dinheiro é baixo**: cerca de R$ 80–200 por mês (conta Apple + voz + parte da VPS). Para cobri-lo bastam **13 a 33 assinantes**.
3. **O custo real é o tempo de desenvolvimento.** O pacote proposto (terço, novenas, jornadas, lectio, Catecismo em 1 ano, offline, anotações, widgets e paywall) leva, por **estimativa**, 200–400 h. Amortizado em 24 meses, o break-even sobe para **cerca de 240 assinantes**.
4. Esses 240 assinantes pedem **cerca de 16 mil instalações iOS**, ou umas 1.300 por mês durante um ano, com a conversão realista. É de 10 a 20 vezes o alcance de hoje.
5. **O risco que vem antes de tudo é a licença.** As leituras são a tradução oficial do Lecionário, que pertence às Edições CNBB. Cobrar dentro de um app que exibe esse texto sem licença é o pior cenário. Os apps que existem com esse texto têm coedição ou parceria com as Edições CNBB.
6. **A concorrência gratuita é forte.** A Liturgia Diária da Canção Nova tem 1 mi+ downloads no Play, nota 4,8 com 56,6 mil avaliações e está em nº 78 em Estilo de vida no iOS. O app oficial da CNBB é grátis. Laudate, iBreviary e Click to Pray também são grátis.
7. **Já o Hallow mostra que o católico brasileiro paga.** São 4,8 mi downloads no Brasil e cerca de US$ 400 mil de receita de jan. a abr. de 2026 (estimativa AppMagic), cobrando R$ 249,90/ano.
8. Nos números da Apple, uma conta de desenvolvedor brasileiro no Small Business Program paga 10% de comissão mais 5% de processamento (IAP). Ficam ~85% do preço e, depois do imposto próprio, ~77% líquido. A regra vale desde 18/06/2026 (acordo com o CADE).
9. **Doação já cobre a meta de R$ 150/mês com menos esforço.** São ~15 apoiadores de R$ 10 via Pix, sem taxa da Apple e sem construir nada. É o mesmo número de pessoas que a assinatura exigiria só para cobrir o custo em dinheiro.
10. **Recomendação:** primeiro tirar a licença CNBB e fazer o público crescer (meta: ≥1.000 instalações iOS/mês com retenção). Até lá, montar o "Apoiador" como **doação recorrente sem trancar nada** (web/Stripe/Pix, ou IAP "gorjeta"). Os recursos premium só valem a pena depois.

---

## 1. Concorrentes e preços

| App | Modelo / preço | Tamanho / avaliações | Observação |
|---|---|---|---|
| **Hallow** (católico, EUA, com PT-BR) | Freemium. App Store BR lista **R$ 249,90/ano** e itens mensais de R$ 39,99 a R$ 55,90 (há vários SKUs; outro de R$ 10,90 e um anual de R$ 349,90). Nos EUA: **US$ 9,99/mês, US$ 69,99/ano**, família US$ 119,99/ano | App Store BR: 4,9 com **41 mil avaliações**, nº 45 em Referência. **4,8 mi downloads no Brasil** desde 2022. Receita BR **~US$ 400 mil em jan–abr/2026 (AppMagic)**. Global: ~US$ 9,7–10 mi líquidos no pico da Quaresma (Appfigures). 22 mi+ downloads globais (fev/2025) | Conteúdo local com Felipe Aquino, Pe. Reginaldo Manzotti e Michel Teló. Série C de US$ 50 mi (jun/2026, Homebrew) |
| **Liturgia Diária – Canção Nova** | Grátis | Play: **1 mi+**, 4,8 (56,6 mil avaliações). iOS: 4,7 (5,9 mil), **nº 78 em Estilo de vida** | Leituras, homilia em texto, áudio e vídeo, santo do dia, orações. Concorrente direto e grátis |
| **CNBB** (app oficial) | Grátis | — | Liturgia diária, Liturgia das Horas e notícias. Texto oficial, licenciado na origem |
| **iLiturgia** (coedição Edições CNBB) | **R$ 24,90**, compra única | — | Liturgia das Horas e Lecionários oficiais, funciona offline. Exemplo de licença CNBB em app pago |
| **Liturgia Diária da Missa** e outros independentes | Grátis com compras no app | — | Diz buscar as leituras "da CNBB e do Vaticano", sem vínculo oficial |
| **Laudate** | Grátis | "#1 Catholic App" (EUA) | Sem camada paga encontrada |
| **iBreviary** | Grátis, sem anúncios, pede doação (Pro Terra Sancta) | 9 idiomas | Começou pago (€ 0,79) e virou grátis |
| **Click to Pray** (Rede Mundial de Oração do Papa) | Grátis | 900 mil usuários (2018). App Store ES: 3,7 com 23 avaliações | Tem PT |
| **Glorify** (cristão, origem evangélica) | US$ 6,99/mês, US$ 69,99/ano | ~10 mi downloads (não está claro se só no Brasil). Retenção de 4% em 3 meses (AppMagic) | Chegou ao Brasil em 2021 |
| **Pray.com** | Freemium. Plus em torno de US$ 9,99/mês ou US$ 49,99/ano (fontes divergem) | — | Fonte agregadora, preço não confirmado na loja |
| **Bíblias católicas** (Play) | Grátis, quase sempre com anúncios | As maiores em 100 mil–1 mi (AppBrain) | Nenhuma católica com 10 mi encontrada |

**Leitura:** o público já tem **liturgia de graça** e de fonte oficial. O que vende no Hallow é a **oração guiada em áudio com vozes conhecidas e conteúdo sazonal** (Quaresma e Advento), não a leitura do dia. O "Apoiador" proposto (terço, novenas, jornadas, lectio) disputa esse mesmo terreno. O Hallow já cobra R$ 250/ano ali, com orçamento de marketing e estrelas católicas.

Fontes: [Hallow App Store BR](https://apps.apple.com/BR/app/id1405323394) · [Hallow preços EUA](https://help.hallow.com/en/articles/2880438-how-much-does-the-subscription-cost) · [Exame, fev/2025](https://exame.com/tecnologia/com-aporte-de-us-100-mi-e-apoio-do-vice-dos-eua-app-cristao-aposta-no-brasil-para-crescer) · [Agora RN / AppMagic, jun/2026](https://agorarn.com.br/ultimas/inteligencia-artificial-entra-na-rotina-de-oracao/) · [Appfigures: pico da Quaresma](https://appfigures.com/resources/insights/hallow-lent-surge-prayer-app-revenue) · [Homebrew: Série C](https://www.homebrew.co/blog-posts/hallow-raises-usd50-million-series-c-after-becoming-first-religious-app-to-reach-apple-top-10) · [Canção Nova iOS](https://apps.apple.com/BR/app/id914272972) · [Canção Nova Play](https://play.google.com/store/apps/details?id=com.cancaonova.liturgia) · [iLiturgia](https://apps.apple.com/BR/app/id366297822) · [App CNBB](https://apps.apple.com/us/app/-/id6480573775) · [Liturgia Diária da Missa](https://apps.apple.com/BR/app/id1558173003) · [Laudate](https://apps.apple.com/us/app/-/id499428207) · [iBreviary / Pro Terra Sancta](https://www.proterrasancta.org/en/support-ibreviary-app) · [Click to Pray](https://apps.apple.com/es/app/click-to-pray/id934935942) · [JB 2018](https://www.jb.com.br/cultura/noticias/2018/03/06/app-para-rezar-pelas-intencoes-do-papa-e-lancado-em-italiano.html) · [Glorify App Store](https://apps.apple.com/US/app/id1490587079) · [Pray.com (agregador)](https://subger.com/en/service/pray-com) · [Bíblia Católica (Apptopia)](https://apptopia.com/google-play/app/biblia.catolica.offline/about)

---

## 2. Tamanho de mercado

| Dado | Valor | Fonte |
|---|---|---|
| Católicos no Brasil (10 anos ou mais), Censo 2022 | **100,2 milhões (56,7%)**, contra 65,1% em 2010 | [Agência Gov / IBGE](https://agenciagov.ebc.com.br/noticias/202506/censo-2022-catolicos-seguem-em-queda-evangelicos-e-sem-religiao-crescem-no-pais) · [Congresso em Foco](https://www.congressoemfoco.com.br/noticia/109200/censo-2022-1-em-4-brasileiros-e-evangelico-catolicos-caem-para-56-7) |
| Participação do iOS no celular, Brasil, set/2026 | **21,2%** (Android 78,8%) | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/brazil) |
| Católicos com iPhone (**estimativa**) | Teto teórico de ~15–20 mi: 100 mi × ~21%, descontando quem não tem smartphone. Só serve de ordem de grandeza: o mercado endereçável real é **quem usa app de liturgia no iPhone**, uma fração pequena disso | Cálculo próprio |
| App católico pago já no país | Hallow: 4,8 mi downloads (todas as plataformas), ~US$ 100 mil/mês de receita (AppMagic, jan–abr/2026). Por **estimativa**, isso equivale a uns 25 mil assinantes no plano anual, ou **~0,5% dos downloads acumulados** | Agora RN / AppMagic. Conta própria: US$ 100 mil × 5,2 ÷ (R$ 249,90/12) |
| Brasil é o 2º mercado mais lucrativo para apps de oração (atrás dos EUA) | — | Agora RN |
| Volume de busca de "liturgia diária" / "liturgia de hoje" | **Não há fonte pública confiável.** O Google Trends só dá índice relativo. Use o Keyword Planner (conta Google Ads) com local Brasil | [Olhar Digital (sobre ferramentas)](https://olhardigital.com.br/2025/05/11/dicas-e-tutoriais/quer-se-conectar-mais-com-sua-fe-veja-5-aplicativos-que-podem-ajudar/) |
| Alcance atual do projeto | Search Console (28 d): 77 cliques, 1.750 impressões, posição média 11. Instagram com poucos seguidores, push com 1 inscrito | Dado do projeto |

O domínio é de set/2026 e está em posição média 11, quase todo fora da 1ª página. O Canção Nova, o app da CNBB e os portais grandes dominam a busca. O tráfego vai subir com as páginas por dia, por santo e da Catena, mas hoje o funil de entrada do app é praticamente zero.

---

## 3. Benchmarks de conversão (RevenueCat, *State of Subscription Apps 2026*, dados de 2025)

| Métrica | Valor | Observação |
|---|---|---|
| Download→teste (D30), Saúde e Fitness | 6,9% de mediana | Categoria mais parecida com oração guiada |
| Teste→pago, Saúde e Fitness | 37,7% de mediana (quartil de cima >51,4%) | |
| Download→pago (D35), Saúde e Fitness | **2,9%** de mediana (quartil de cima >6,2%) | |
| Download→pago (D35), **América Latina** | **1,5%** de mediana | Teste→pago na AL: ~20–23%. Download→teste: 3,0–3,7% |
| Download→pago, **freemium × paywall duro** | **2,1% × 10,7%** | Nosso caso é freemium com o núcleo grátis, ou seja, a conversão puxa para baixo |
| Teste→pago por duração do teste | ≤4 d: 25,5%. **5–9 d: 37,4%**. 17–32 d: 42,5% | Os 7 dias propostos estão no meio |
| Cancelamento no dia 0 | 39,8% nos testes de 7 dias | |
| Preço mediano | Anual US$ 34,80, mensal ~US$ 8–10 | R$ 79,90/ano ≈ US$ 15. Barato em dólar, alinhado ao poder de compra |
| Receita por instalação (D60) | Global US$ 0,34. Saúde e Fitness US$ 0,66. Freemium US$ 0,38 | América Latina perto do D14 de ~US$ 0,10 |
| Renovação | Anual 83,4% × mensal 39,2% (resumo do heise). 35% dos cancelamentos anuais acontecem no 1º mês | Métricas com definições diferentes; trate como ordem de grandeza |
| Mix de receita, Saúde e Fitness | Planos anuais geram ~59% da receita | Justifica 60% anual no modelo |

**Churn mensal:** o relatório não traz um número único de churn mensal. No modelo uso **7–15%/mês para quem assina o plano mensal**, uma **suposição** compatível com a renovação mensal de ~39% em 12 meses que o resumo cita. Para o anual, uso churn zero dentro dos 12 meses, porque ele só renova no mês 13.

Fontes: [RevenueCat, relatório 2026](https://revenuecat.com/report) · [RevenueCat 2025](https://revenuecat.com/state-of-subscription-apps-2025) · [heise: renovação](https://heise.de/-11310636) · [RevenueCat: renovação por categoria](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category.md)

---

## 4. Custos do nosso lado

| Item | Custo | Fonte / nota |
|---|---|---|
| Apple Developer Program | US$ 99/ano ≈ **R$ 43/mês** | Preço público da Apple |
| Comissão Apple no Brasil (desde 18/06/2026) | **10%** (Small Business, ou assinatura depois do 1º ano) + **5%** de processamento IAP = **15%**. Fora do programa: 21% + 5%. Link para pagar na web: 15%, ou 10% no programa | [Apple Newsroom, jun/2026](https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/) · [MacRumors](https://www.macrumors.com/2026/06/18/apple-announces-ios-app-store-changes-in-brazil/) |
| Impostos que a Apple retém | Para **desenvolvedor brasileiro**, a Apple não recolhe tributo local, e o recolhimento é responsabilidade dele. A CIDE de 10% vale só para dev estrangeiro | [Termos Apple, Brasil (PDF)](https://developer.apple.com/support/downloads/terms/exhibits/Exhibits-to-Schedule-2-and-3-20250821-Portuguese-Brazil.pdf) · [MacMagazine, CIDE](https://macmagazine.com.br/post/2025/05/16/app-store-brasileira-recolhera-novo-imposto-de-desenvolvedores-estrangeiros/) |
| IOF de 3,5% nas compras da App Store | A Apple passou a recolher em ago/2025. **Não está claro** se sai da receita do dev ou se vai para o preço. No modelo, entra como custo (conservador) | [MacMagazine, IOF](https://macmagazine.com.br/post/2025/08/21/app-store-passa-a-recolher-35-de-iof-sobre-compras-e-assinaturas-no-brasil/) |
| Imposto próprio (**estimativa**) | ~6% (Simples Nacional, Anexo III, faixa inicial). Como pessoa física pelo carnê-leão pode ir a 27,5%. **Confirmar com contador** | — |
| Voz: ElevenLabs | ~210 mil caracteres/mês (HANDOFF, 27/09). Com Multilingual v2 (1 crédito/caractere), cabe só no **Pro: US$ 99/mês ≈ R$ 515** (600 mil créditos). Com Flash/Turbo (0,5–1 crédito/caractere), pode caber no **Creator: US$ 22 ≈ R$ 114** (121 mil créditos). Terço, novenas e jornadas são gravações **únicas**, que podem caber num mês de Pro | [ElevenLabs, preços](https://elevenlabs.io/pricing) |
| Voz: alternativa | Gemini flash TTS pago ≈ US$ 4/mês (R$ 21) em 2026 e ≈ US$ 8 em 2027 | HANDOFF §5, 27/09/2026 |
| VPS Contabo | Já existe. Cloud VPS 10/20 sai por €4,50–7/mês e a VPS 30, €14. **Custo marginal do app ≈ 0–R$ 40** | [Preços Contabo (onedollarvps)](https://onedollarvps.com/pricing/contabo-pricing) |
| RevenueCat | **Grátis até US$ 2.500 de MTR**, depois 1%. Dá também para usar só StoreKit 2 | [RevenueCat, preços](https://www.revenuecat.com/pricing/) |
| Licença Edições CNBB | **Desconhecido.** Não há política pública. Pode haver royalties ou exigência de coedição | Ver §6 |
| Desenvolvimento (**estimativa**) | Paywall, StoreKit 2 e restauração: ~20–30 h. Terço guiado (áudio + UI): ~30–50 h. Novenas (texto + agenda + avisos): ~30–40 h. Jornadas Quaresma/Advento (conteúdo de 40 + 28 dias): ~60–100 h, quase tudo curadoria. Lectio: ~15–25 h. Catecismo em 1 ano (o texto já existe no repo): ~15–25 h. Offline: ~15–30 h. Anotações: ~15–25 h. Widgets: ~15–25 h. **Total ~200–400 h**. A R$ 100/h de custo de oportunidade, dá **R$ 20–40 mil** | Estimativa minha, para um dev solo com IA, com app SwiftUI já existente |

**Custo fixo em dinheiro por mês, em 3 faixas:**
- **Enxuto, R$ 80:** Apple R$ 43 + Gemini R$ 21 + VPS ~R$ 15.
- **Médio, R$ 200:** Apple + ElevenLabs Creator R$ 114 + VPS ~R$ 40.
- **Alto, R$ 600:** Apple + ElevenLabs Pro R$ 515 + VPS.

---

## 5. Modelo: ponto de equilíbrio e cenários

### Receita líquida por assinante

Fator líquido = (1 − 15% Apple) × (1 − 3,5% IOF) × (1 − 6% imposto) = **0,771**

| Plano | Preço | Líquido | Por mês |
|---|---|---|---|
| Mensal | R$ 9,90 | R$ 7,63 | R$ 7,63 |
| Anual | R$ 79,90 | R$ 61,61 | R$ 5,13 |
| **Média com 60% anual** | | | **R$ 6,13** |

### Ponto de equilíbrio (assinantes ativos)

| Custo a cobrir | R$/mês | Assinantes |
|---|---|---|
| Caixa enxuto | 80 | **13** |
| Caixa médio | 200 | **33** |
| Caixa alto (ElevenLabs Pro) | 600 | **98** |
| Caixa médio + desenvolvimento (R$ 30 mil em 24 meses = R$ 1.250/mês) | 1.450 | **~236** |

**Quantos usuários isso exige.** Com a conversão realista de **1,5% das instalações em assinantes pagos** (mediana da América Latina na RevenueCat), 236 assinantes pedem **~16 mil instalações iOS**, o que dá umas **1.300 por mês durante 12 meses**. Isso supõe uma retenção de 30–40% das instalações, uma **estimativa**. Em MAU, são ~5–6 mil usuários ativos no iPhone. Só para o caixa médio (33 assinantes), bastam ~2,2 mil instalações.

Visto pelo lado do MAU: com uma base paga de 1–3% do MAU (faixa usual em freemium, **estimativa**; o Hallow BR fica em ~0,5% dos downloads acumulados), os números ficam assim:
- **2 mil MAU:** 20–60 assinantes. Paga o caixa, não paga o desenvolvimento.
- **10 mil MAU:** 100–300 assinantes. Paga caixa e desenvolvimento.
- **50 mil MAU:** 500–1.500 assinantes.

### Cenários de 12 meses

Instalações iOS constantes por mês. Conversão instalação→pago. Parte anual. Churn mensal do plano mensal. Saída de `modelo.py`:

| Cenário | Instal./mês | Instal.→pago | % anual | Churn mensal | Assinantes no mês 12 | **Receita líquida recorrente no mês 12** | Caixa líquido em 12 m | Custo de caixa em 12 m | Saldo (sem o tempo de dev) |
|---|---|---|---|---|---|---|---|---|---|
| Pessimista | 150 | 0,5% | 50% | 15% | **7** | **R$ 39/mês** | R$ 413 | R$ 2.400 | **−R$ 1.987** |
| Realista | 800 | 1,5% | 60% | 10% | **121** | **R$ 706/mês** | R$ 7.353 | R$ 2.400 | **+R$ 4.953** |
| Otimista | 4.000 | 3,0% | 70% | 7% | **1.307** | **R$ 7.457/mês** | R$ 78.883 | R$ 7.200 | **+R$ 71.683** |

O que esses números dizem:
- O **cenário realista paga o caixa, mas não paga o desenvolvimento** no 1º ano: R$ 4,9 mil de saldo contra R$ 20–40 mil de horas. Ele já supõe **800 instalações iOS por mês**, umas 10 vezes o que o site manda hoje para o Google, e uma conversão na mediana regional, otimista para um freemium com o núcleo grátis.
- O **cenário pessimista é o mais provável com a audiência de hoje.**
- O **otimista** pede uma escala de ~48 mil instalações por ano, cerca de 1% do que o Hallow fez no Brasil em 3 anos e meio. Só é plausível com uma vitrine forte: parceria CNBB, paróquias, um nome conhecido ou destaque na App Store.

### Comparação com doação e patrocínio

| Fonte | Para R$ 150/mês líquidos | Esforço | Observação |
|---|---|---|---|
| **Doação recorrente Pix/Stripe (web)** | ~15 apoiadores de R$ 10 (Pix sem taxa; no cartão Stripe, uns 4% de taxa, **verificar**) | Já existe no site | Nada fica trancado e o compartilhamento não é atrapalhado. Dentro do app iOS, um link externo para pagar na web custa 10–15% desde jun/2026. Doação por IAP "gorjeta" (consumível ou assinatura sem conteúdo) é aceita pela Apple, com os mesmos 15% |
| **Assinatura com recursos premium** | ~25 assinantes (R$ 150 ÷ R$ 6,13) | 200–400 h + conteúdo + manutenção | Precisa de um volume de instalações que não existe hoje |
| **Patrocínio / afiliado** (editoras católicas: Ecclesiae, Paulus, Cultor de Livros) | **Estimativa**: R$ 200–1.000/mês por patrocinador fixo, só com audiência comprovada (milhares de usuários diários) | Comercial | Sem dado público de preço. O HANDOFF já prevê isso como "parcerias de conteúdo" |
| **Paróquias (B2B)**, o plano do HANDOFF | 1 paróquia a R$ 50–150/mês (**estimativa**) | Painel + envio por WhatsApp | Uma paróquia pagando vale mais do que dezenas de assinantes e ainda traz o público dela |

---

## 6. Conclusão honesta

**A assinatura se paga?** Os **custos de caixa** (R$ 80–200/mês) se pagam com poucas dezenas de assinantes. O **investimento de desenvolvimento** (200–400 h) não se paga em 12 meses com nenhum cenário compatível com o público de hoje. A conta só fecha com **≥ ~1.000 instalações iOS por mês e retenção**, ou ~5 mil+ usuários ativos no iPhone.

**Em que condições ela se paga:**
1. **Licença das Edições CNBB resolvida.** O próprio HANDOFF registra que o site da CNBB proíbe o uso sem autorização. Os apps que usam o texto oficial do Lecionário têm acordo (app CNBB, iLiturgia em coedição). Não encontrei uma **política pública de licenciamento** das Edições CNBB para apps. O caminho é pedir por escrito, detalhando grátis/pago, offline, reprodução integral e ausência de anúncios. Cobrar assinatura num app que exibe esse texto sem licença expõe o projeto à remoção da loja e a uma notificação extrajudicial. Mesmo que a parte paga "não seja a leitura", o app inteiro roda em cima dela. Fontes: [Conjur, jun/2026](https://www.conjur.com.br/2026-jun-20/a-protecao-autoral-das-obras-religiosas-no-ambito-da-igreja-catolica/) · [Paulus: Missal exclusivo das Edições CNBB (PDF)](https://deg.paulus.com.br/6568.pdf) · [iLiturgia, coedição](https://apps.apple.com/BR/app/id366297822).
2. **Audiência antes de paywall.** O motor de crescimento é o SEO (páginas por dia, santos, Catena), o compartilhamento dos cards e os avisos às 6h. Meta antes de construir o premium: **≥ 1.000 instalações iOS por mês e retenção D30 ≥ 20%** (**sugestão**). O pico de downloads de apps católicos é a **Quaresma**: no Hallow, Quarta-feira de Cinzas é o maior dia do ano (Appfigures). A Quaresma de 2027 começa em 10/02/2027. **Estimativa:** lançar "Jornada da Quaresma" como 1º conteúdo premium (ou como chamariz grátis) nessa data vale mais do que o pacote completo em qualquer outro mês.
3. **Produto diferente do Hallow.** Concorrer em "oração guiada com vozes famosas" contra R$ 250 milhões em capital é inviável. O diferencial do projeto é **profundidade**: Catena Aurea, Catecismo ligado ao dia, Padres da Igreja e liturgia sem IA alucinando. Um "Apoiador" que oferece **Catecismo em 1 ano + Catena completa + offline + anotações** é coerente com isso e barato de fazer (o texto já existe). Terço com áudio e novenas são commodity: o Hallow e o YouTube já dão de graça ou quase.

**O que fazer antes, em ordem:**
1. **Carta às Edições CNBB pedindo licença ou parceria.** Bloqueia tudo o que é pago. Pode até virar coedição, como no iLiturgia.
2. **"Apoiador" como doação recorrente sem trancar nada.** No iOS, pode ser um IAP "gorjeta" ou uma assinatura de apoio que só dá um selo e um agradecimento. Fora do iOS, Pix/Stripe na web, já existente. Isso testa a disposição a pagar com **zero desenvolvimento de recursos**. Se em 3 meses não houver 15–30 apoiadores, a assinatura com recursos premium também não teria.
3. **Medir o funil do app:** instalações por mês, D1/D7/D30 e quem ouve o áudio. Hoje esses números não aparecem. Sem eles, qualquer cenário é chute.
4. **Recursos premium só quando a audiência passar do limite.** Comece pelo mais barato e diferenciado: Catecismo em 1 ano e offline.
5. **Em paralelo, o piloto com 2–3 paróquias** (plano B2B do HANDOFF). A conta mostra que uma paróquia pagante vale mais do que dezenas de assinantes individuais.

---

### Suposições do modelo (para recalcular)
- Preços R$ 9,90 e R$ 79,90. Apple 15%. IOF 3,5% descontado (conservador). Imposto 6%.
- Mix de 50/60/70% anual. Churn mensal de 15/10/7%. Anual sem churn em 12 meses. Reembolsos ignorados.
- Instalações constantes por mês. Conversão instalação→pago de 0,5/1,5/3% (âncoras: freemium 2,1%, América Latina 1,5%, Saúde e Fitness 2,9%, RevenueCat 2026).
- Câmbio de R$ 5,20. Custo de caixa de R$ 200/mês (realista e pessimista) e R$ 600/mês (otimista, com ElevenLabs Pro).
- Fora do modelo: custo da licença CNBB (desconhecido), marketing pago, tempo de produção de conteúdo (novenas e jornadas) e o fato de que só o iOS (~21% dos celulares) tem acesso ao IAP.
