# Catecismo — Guia do Projeto

Plataforma de busca e leitura para dois catecismos católicos em português, 100% client-side, sem framework nem bundler.

## O que é este projeto

Dois mini-sites independentes num mesmo repositório:

| URL | Catecismo | Dados |
|-----|-----------|-------|
| `/` | Catecismo da Igreja Católica (CIC) — 2.865 parágrafos | `data/catecismo.json` |
| `/saopiox/` | Catecismo Maior de São Pio X — 994 perguntas/respostas | `data/saopiox.json` |

Funcionalidades: busca client-side, modo leitura, índice analítico temático, resumos via IA (Grok), coletor de trechos, referências bíblicas em hover, cross-links entre os dois catecismos, doação via PIX.

Hospedagem: **Vercel** (site estático + Edge Function em `api/resumo.js`).

---

## Estrutura de arquivos

```
catecismo/
├── index.html              # App principal (CIC)
├── saopiox/
│   ├── index.html          # App do São Pio X
│   ├── saopiox.js          # Lógica de busca/UI do Pio X
│   ├── saopiox.css
│   └── leitorpiox.js       # Modo leitura do Pio X
│
├── assets/
│   ├── css/
│   │   ├── main.css        # Estilos globais
│   │   ├── search.css      # Painel de busca
│   │   ├── panels.css      # Layout dois painéis
│   │   └── leitor.css      # Modo leitura
│   └── js/
│       ├── ui.js           # Controlador principal — orquestra tudo
│       ├── search.js       # Motor de busca client-side
│       ├── data.js         # Carregamento e cache dos dados JSON
│       ├── leitor.js       # Modo leitura (CIC)
│       ├── coletor.js      # Coleção e exportação de trechos
│       ├── biblia.js       # Lookup de versículos bíblicos
│       ├── variantes.js    # Variações de termos de busca
│       ├── router.js       # Roteamento por URL hash
│       ├── nav.js          # Navegação entre seções
│       └── theme.js        # Gerenciamento de tema claro/escuro
│
├── data/
│   ├── catecismo.json      # 2.865 parágrafos (1,7 MB)
│   ├── saopiox.json        # 994 Q&As (420 KB)
│   ├── indice_analitico.json  # Índice temático (968 KB)
│   ├── notas.json          # Notas de rodapé
│   ├── biblia.json         # Versículos bíblicos (4,5 MB)
│   └── relacoes.json       # Mapeamento Pio X ↔ CIC
│
├── scripts/                # Utilitários Python (processamento offline)
│   ├── gerar_relacoes.py   # Gera relacoes.json via TF-IDF
│   ├── gerar_relacoes_ai.py
│   ├── normalizar_portugues.py
│   └── scrape_indice.py
│
├── api/
│   └── resumo.js           # Edge Function Vercel — resumos via Grok
│
├── vercel.json             # Config de deploy
└── test-search.mjs         # Testes do motor de busca
```

---

## Stack e convenções

- **Vanilla JS (ES6 modules)** — sem npm, sem bundler, sem framework
- Cada arquivo JS é um módulo com responsabilidade única
- Importações via `type="module"` no HTML
- CSS organizado por contexto (global / busca / painéis / leitura)
- Dados em JSON carregados com `fetch()` e cacheados em memória
- O app do São Pio X (`saopiox/`) reutiliza os CSS de `assets/css/` mas tem seu próprio JS independente

### Módulo principal: `assets/js/ui.js`

É o controlador central do CIC. Ele:
1. Carrega os dados via `data.js`
2. Conecta a busca via `search.js`
3. Gerencia os estados da UI: hero → busca → leitura
4. Coordena coletor, leitor, roteamento e tema

### Motor de busca: `assets/js/search.js`

- 100% client-side, zero chamadas de rede
- Normaliza texto (remove acentos, lowercase)
- Matching por fronteira de palavra (evita substring falsas)
- Retorna máx. 200 resultados, agrupados por estrutura do CIC

---

## Desenvolvimento local

Abrir direto no browser não funciona por causa dos módulos ES6 e `fetch()`. Use um servidor local:

```bash
# Python
python3 -m http.server 8000

# Node (se tiver npx)
npx serve .
```

Acesse `http://localhost:8000` para o CIC e `http://localhost:8000/saopiox/` para o Pio X.

Não há build step, lint, nem testes automatizados no CI. O único teste é `test-search.mjs`:

```bash
node test-search.mjs
```

---

## Deploy

O deploy é automático pelo Vercel ao fazer push para `main`. Configurado em `vercel.json`:
- Sem build command
- Raiz do projeto é o diretório estático
- `cleanUrls: true` (sem `.html` nas URLs)

A Edge Function `api/resumo.js` requer a variável de ambiente `GROK_API_KEY` configurada no painel do Vercel.

---

## Scripts Python (processamento offline)

Rodar apenas quando precisar regenerar os dados:

```bash
# Regenerar mapeamento Pio X ↔ CIC
python3 scripts/gerar_relacoes.py

# Normalizar ortografia PT-PT → PT-BR no índice analítico
python3 scripts/normalizar_portugues.py

# Raspar índice analítico do catecismo.net
python3 scripts/scrape_indice.py
```

---

## Contexto e decisões de design

- **Sem dependências externas**: deliberado — facilita hospedagem estática e elimina supply chain risk
- **Dois mini-sites em vez de um**: São Pio X tem estrutura de dados diferente (Q&A vs parágrafos numerados)
- **`relacoes.json`**: cross-links entre os dois catecismos gerados por TF-IDF + revisão manual
- **Grok para resumos**: escolha de API, não arquitetural — pode ser trocada em `api/resumo.js`
- **Dados em PT-BR**: o `normalizar_portugues.py` existe porque fontes originais usam PT-PT
