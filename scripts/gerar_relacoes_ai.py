"""
gerar_relacoes_ai.py
Gera data/relacoes.json usando IA (Grok) para matching preciso.

Para cada capítulo do Pio X:
  1. Pré-filtra os §§ CIC pelo mapeamento estrutural
  2. Envia todos os Q&As do capítulo + candidatos CIC para o Grok
  3. Grok retorna quais §§ são realmente relevantes para cada Q&A
  4. Salva relacoes.json

Custo estimado: ~38 chamadas de API (1 por capítulo).
"""

import json, re, os, time, unicodedata
from collections import defaultdict
from openai import OpenAI

API_KEY = os.environ.get('GROK_API_KEY') or open('/tmp/.env.vercel').read().split('GROK_API_KEY="')[1].split('"')[0]
client = OpenAI(api_key=API_KEY, base_url='https://api.x.ai/v1')

# ── Dados ─────────────────────────────────────────────────────────────────────
with open('data/saopiox.json') as f:
    piox_todos = json.load(f)['perguntas']

with open('data/catecismo.json') as f:
    cic_todos = json.load(f)['paragrafos']

cic_por_num = {p['numero']: p for p in cic_todos}

# ── Mapeamento estrutural ─────────────────────────────────────────────────────
MAPA_CAPS = {
    ('Lição Preliminar', ''):
        [(1, 25), (142, 197)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo I'):   [(185, 197)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo II'):  [(199, 421)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo III'): [(422, 455)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo IV'):  [(456, 570)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo V'):   [(571, 630)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VI'):  [(631, 658)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VII'): [(659, 667)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VIII'):[(668, 682)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo IX'):  [(683, 747)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo X'):   [(748, 987)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XI'):  [(976, 987)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XII'): [(988, 1019)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XIII'):[(1020, 1065)],
    ('Segunda Parte — Da Oração', 'Capítulo I'):  [(2558, 2696)],
    ('Segunda Parte — Da Oração', 'Capítulo II'): [(2759, 2865)],
    ('Segunda Parte — Da Oração', 'Capítulo III'):[(2650, 2696)],
    ('Segunda Parte — Da Oração', 'Capítulo IV'): [(956, 975), (2683, 2696)],
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo I'):  [(2052, 2082)],
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo II'): [(2083, 2195)],
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo III'):[(2196, 2557)],
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo IV'): [(2030, 2051)],
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo V'):  [(2030, 2082)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo I'):   [(1066, 1134)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo II'):  [(1213, 1284)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo III'): [(1285, 1321)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo IV'):  [(1322, 1419)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo V'):   [(1322, 1419)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VI'):  [(1422, 1498)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VII'): [(1499, 1532)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VIII'):[(1536, 1600)],
    ('Quarta Parte — Dos Sacramentos', 'Capítulo IX'):  [(1601, 1666)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo I'):   [(1803, 1845)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo II'):  [(1830, 1832), (2670, 2672)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo III'): [(1716, 1729)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo IV'):  [(2443, 2449), (1691, 1698)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo V'):   [(1846, 1876)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VI'):  [(1865, 1876)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VII'): [(1020, 1065)],
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VIII'):[(2697, 2758)],
}

# ── Pré-filtro por termos (reduz candidatos antes de enviar à IA) ─────────────
STOPWORDS = {
    'a','ao','aos','as','com','da','das','de','do','dos','e','em','é',
    'ela','ele','eles','elas','essa','esse','isso','isto','mais','mas',
    'me','mesmo','na','nas','no','nos','num','numa','o','os','ou','pela',
    'pelas','pelo','pelos','por','que','se','sem','ser','seu','seus',
    'sua','suas','são','também','te','toda','todas','todo','todos','um',
    'uma','uns','umas','já','não','foi','para','lhe','lhes','muito',
    'qual','quais','quando','porque','como','onde','há','ter','isto',
    'aquele','aquela','este','esta','entre','sobre','até','após',
}

def termos(texto):
    s = unicodedata.normalize('NFD', texto.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return set(p for p in re.findall(r'[a-z]{4,}', s) if p not in STOPWORDS)

cic_termos = {p['numero']: termos(p['texto']) for p in cic_todos}

# ── Agrupa capítulos ──────────────────────────────────────────────────────────
from collections import OrderedDict
caps = OrderedDict()
for q in piox_todos:
    key = (q['parte'], q['capitulo'])
    if key not in caps:
        caps[key] = []
    caps[key].append(q)

# ── Processa capítulo por capítulo ────────────────────────────────────────────
piox_para_cic = {}
total_caps = len(caps)

def candidatos_para_cap(chave):
    ranges = MAPA_CAPS.get(chave, [])
    return [num for (lo, hi) in ranges for num in range(lo, hi+1) if num in cic_por_num]

def prompt_para_cap(qs, candidatos_nums):
    cic_lines = '\n'.join(
        f'§{n}: {cic_por_num[n]["texto"][:220]}'
        for n in candidatos_nums
    )
    qa_lines = '\n'.join(
        f'Q.{q["numero"]}: P: {q["pergunta"]} | R: {q["resposta"][:180]}'
        for q in qs
    )
    return f"""Você é um teólogo católico. Para cada Q&A do Catecismo de São Pio X abaixo, indique quais parágrafos do CIC (Catecismo da Igreja Católica) tratam DIRETAMENTE do mesmo ponto doutrinal.

Retorne APENAS um JSON no formato: {{"Q.15": [185, 194], "Q.16": [], ...}}
- Máximo 3 §§ por questão. Se nenhum for relevante, retorne lista vazia.
- Inclua apenas §§ que tratem explicitamente do mesmo tema/sacramento/virtude/mandamento.
- NÃO inclua §§ que apenas mencionem o tema de passagem.

=== Q&As (São Pio X) ===
{qa_lines}

=== Parágrafos candidatos (CIC) ===
{cic_lines}"""

print(f'Processando {total_caps} capítulos...\n')

for i, (chave, qs) in enumerate(caps.items()):
    parte, cap = chave
    label = f'{parte} / {cap}' if cap else parte
    print(f'[{i+1}/{total_caps}] {label} ({len(qs)} Q&As)', end=' ', flush=True)

    candidatos_nums = candidatos_para_cap(chave)
    if not candidatos_nums:
        print('→ sem mapeamento, pulando')
        continue

    # Pré-filtra: para cada Q, mantém candidatos com ≥1 termo em comum
    # (melhora foco e reduz tokens)
    candidatos_relevantes = set()
    for q in qs:
        tq = termos(q['pergunta'] + ' ' + q['resposta'])
        for num in candidatos_nums:
            if len(tq & cic_termos.get(num, set())) >= 1:
                candidatos_relevantes.add(num)

    candidatos_relevantes = sorted(candidatos_relevantes)
    if not candidatos_relevantes:
        print('→ sem candidatos com overlap')
        continue

    # Limita a 80 candidatos por chamada para não explodir tokens
    # Se > 80, divide em sub-batches por Q&A
    MAX_CANDS = 80
    if len(candidatos_relevantes) > MAX_CANDS:
        candidatos_relevantes = candidatos_relevantes[:MAX_CANDS]

    prompt = prompt_para_cap(qs, candidatos_relevantes)

    try:
        resp = client.chat.completions.create(
            model='grok-4-1-fast-non-reasoning',
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0,
            max_tokens=1200,
        )
        texto = resp.choices[0].message.content.strip()

        # Extrai JSON da resposta
        m = re.search(r'\{[\s\S]*\}', texto)
        if not m:
            print(f'→ JSON não encontrado: {texto[:80]}')
            continue

        resultado = json.loads(m.group())
        for q_key, nums in resultado.items():
            q_num = int(re.search(r'\d+', q_key).group())
            if isinstance(nums, list) and nums:
                # Filtra só números que existem e são do range correto
                validos = [n for n in nums if n in cic_por_num and n in set(candidatos_relevantes)]
                if validos:
                    piox_para_cic[str(q_num)] = validos[:3]

        print(f'→ {sum(1 for v in resultado.values() if v)} com refs')
        time.sleep(0.3)  # rate limit

    except Exception as e:
        print(f'→ ERRO: {e}')
        time.sleep(2)

# ── Inverso: cic_para_piox ────────────────────────────────────────────────────
cic_para_piox = defaultdict(list)
for q_num_str, cic_nums in piox_para_cic.items():
    for cic_num in cic_nums:
        cic_para_piox[str(cic_num)].append(int(q_num_str))

# Limita a 4 Q&As por § CIC (os de maior relevância)
cic_para_piox_final = {}
for cic_num_str, q_nums in cic_para_piox.items():
    cic_num = int(cic_num_str)
    tc = cic_termos.get(cic_num, set())
    scored = []
    for q_num in q_nums:
        q = next((x for x in piox_todos if x['numero'] == q_num), None)
        if q:
            tq = termos(q['pergunta'] + ' ' + q['resposta'])
            scored.append((len(tq & tc), q_num))
    scored.sort(reverse=True)
    cic_para_piox_final[cic_num_str] = [n for (_, n) in scored[:4]]

# ── Salva ─────────────────────────────────────────────────────────────────────
resultado = {
    'piox_para_cic': piox_para_cic,
    'cic_para_piox': cic_para_piox_final,
}
with open('data/relacoes.json', 'w', encoding='utf-8') as f:
    json.dump(resultado, f, ensure_ascii=False, separators=(',', ':'))

q_com = len(piox_para_cic)
print(f'\n✓ {q_com}/{len(piox_todos)} Q&As com referências CIC ({100*q_com//len(piox_todos)}%)')
print(f'✓ {len(cic_para_piox_final)} §§ CIC com referências Pio X')
print('✓ Salvo em data/relacoes.json')
