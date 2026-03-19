"""
gerar_relacoes.py
Gera data/relacoes.json mapeando Q&As do São Pio X ↔ parágrafos do CIC.

Estratégia:
  1. Mapeamento estrutural: cada capítulo do Pio X tem um intervalo CIC correspondente.
  2. Dentro desse intervalo, scoring TF-IDF simplificado (sobreposição de termos normalizados).
  3. Guarda top-4 CIC por Q&A (score > threshold) e top-4 Q&As por CIC.
"""

import json
import re
import unicodedata
from collections import defaultdict

# ── Dados ─────────────────────────────────────────────────────────────────────
with open('data/saopiox.json') as f:
    piox = json.load(f)['perguntas']

with open('data/catecismo.json') as f:
    cic = json.load(f)['paragrafos']

cic_por_num = {p['numero']: p for p in cic}

# ── Mapeamento estrutural: (parte, capítulo) → range de §§ do CIC ─────────────
MAPA_CAPS = {
    # Lição Preliminar — Doutrina cristã, o que é ser cristão, as 4 partes
    ('Lição Preliminar', ''):
        [(1, 25), (142, 197)],

    # 1ª Parte — Credo
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo I'):   [(185, 197)],
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo II'):  [(199, 421)],   # Deus Pai, Criação
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo III'): [(422, 455)],   # Jesus Cristo Filho
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo IV'):  [(456, 570)],   # Encarnação, Maria
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo V'):   [(571, 630)],   # Paixão, morte
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VI'):  [(631, 658)],   # Desceu, ressuscitou
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VII'): [(659, 667)],   # Subiu ao céu
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo VIII'):[(668, 682)],   # Julgamento
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo IX'):  [(683, 747)],   # Espírito Santo
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo X'):   [(748, 987)],   # Igreja, comunhão, remissão
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XI'):  [(976, 987)],   # Remissão dos pecados
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XII'): [(988, 1019)],  # Ressurreição da carne
    ('Primeira Parte — Do Símbolo dos Apóstolos', 'Capítulo XIII'):[(1020, 1065)], # Vida eterna

    # 2ª Parte — Oração
    ('Segunda Parte — Da Oração', 'Capítulo I'):  [(2558, 2696)],  # Oração em geral
    ('Segunda Parte — Da Oração', 'Capítulo II'): [(2759, 2865)],  # Pai Nosso
    ('Segunda Parte — Da Oração', 'Capítulo III'):[(2650, 2696)],  # Ave Maria, devoção mariana
    ('Segunda Parte — Da Oração', 'Capítulo IV'): [(956, 975), (2683, 2696)],  # Intercessão dos santos

    # 3ª Parte — Mandamentos
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo I'):  [(2052, 2082)],  # Mandamentos em geral
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo II'): [(2083, 2195)],  # 1º-3º mand.
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo III'):[(2196, 2557)],  # 4º-10º mand.
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo IV'): [(2030, 2051)],  # Mand. da Igreja
    ('Terceira Parte — Dos Mandamentos da Lei de Deus e da Igreja', 'Capítulo V'):  [(2030, 2082)],  # Deveres de estado

    # 4ª Parte — Sacramentos
    ('Quarta Parte — Dos Sacramentos', 'Capítulo I'):   [(1066, 1134)],  # Sacramentos em geral
    ('Quarta Parte — Dos Sacramentos', 'Capítulo II'):  [(1213, 1284)],  # Batismo
    ('Quarta Parte — Dos Sacramentos', 'Capítulo III'): [(1285, 1321)],  # Confirmação
    ('Quarta Parte — Dos Sacramentos', 'Capítulo IV'):  [(1322, 1419)],  # Eucaristia
    ('Quarta Parte — Dos Sacramentos', 'Capítulo V'):   [(1322, 1419)],  # Eucaristia como Sacrifício
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VI'):  [(1422, 1498)],  # Penitência
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VII'): [(1499, 1532)],  # Unção dos enfermos
    ('Quarta Parte — Dos Sacramentos', 'Capítulo VIII'):[(1536, 1600)],  # Ordem
    ('Quarta Parte — Dos Sacramentos', 'Capítulo IX'):  [(1601, 1666)],  # Matrimônio

    # 5ª Parte — Virtudes
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo I'):   [(1803, 1845)],  # Virtudes
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo II'):  [(1830, 1832), (2670, 2672)],  # Dons do Espírito
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo III'): [(1716, 1729)],  # Bem-aventuranças
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo IV'):  [(2443, 2449), (1691, 1698)],  # Boas obras
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo V'):   [(1846, 1876)],  # Pecado
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VI'):  [(1865, 1876)],  # Vícios
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VII'): [(1020, 1065)],  # Novíssimos
    ('Quinta Parte — Das Virtudes Principais e de Outras Coisas que o Cristão Deve Saber', 'Capítulo VIII'):[(2697, 2758)],  # Vida de oração
}

# ── Normalização de texto ─────────────────────────────────────────────────────
STOPWORDS = {
    'a','ao','aos','as','com','da','das','de','do','dos','e','em','é',
    'ela','ele','eles','elas','essa','esse','isso','isto','mais','mas',
    'me','mesmo','na','nas','no','nos','num','numa','o','os','ou','pela',
    'pelas','pelo','pelos','por','que','se','sem','ser','seu','seus',
    'sua','suas','são','também','te','toda','todas','todo','todos','um',
    'uma','uns','umas','já','não','foi','para','lhe','lhes','muito',
    'qual','quais','quando','porque','como','onde','há','ter','isto',
    'aquele','aquela','este','esta','entre','sobre','até','após','seu',
}

def normalizar(texto):
    # Remove acentos, lowercase, extrai palavras ≥4 chars, remove stopwords
    s = unicodedata.normalize('NFD', texto.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    palavras = re.findall(r'[a-z]{4,}', s)
    return set(p for p in palavras if p not in STOPWORDS)

# Pré-computar termos de cada CIC
cic_termos = {p['numero']: normalizar(p['texto']) for p in cic}

# ── Matching ──────────────────────────────────────────────────────────────────
TOP_N = 4
THRESHOLD = 2  # mínimo de termos em comum

piox_para_cic = {}   # str(Q_num) → [§nums]
cic_para_piox = defaultdict(list)  # str(§_num) → [Q_nums]

for q in piox:
    chave = (q['parte'], q['capitulo'])
    ranges = MAPA_CAPS.get(chave)
    if not ranges:
        continue

    # Candidatos CIC dentro dos ranges mapeados
    candidatos = [
        num for (lo, hi) in ranges
        for num in range(lo, hi + 1)
        if num in cic_por_num
    ]

    termos_q = normalizar(q['pergunta'] + ' ' + q['resposta'])
    if not termos_q:
        continue

    scores = []
    for num in candidatos:
        termos_c = cic_termos.get(num, set())
        score = len(termos_q & termos_c)
        if score >= THRESHOLD:
            scores.append((score, num))

    scores.sort(reverse=True)
    top = [num for (_, num) in scores[:TOP_N]]

    if top:
        piox_para_cic[str(q['numero'])] = top
        for num in top:
            cic_para_piox[str(num)].append(q['numero'])

# ── Ordenar e limitar cic_para_piox ──────────────────────────────────────────
cic_para_piox_final = {}
for cic_num, q_nums in cic_para_piox.items():
    # manter os mais relevantes: ordenar por score descendente
    q_scores = []
    termos_c = cic_termos.get(int(cic_num), set())
    for q_num in q_nums:
        q = next((x for x in piox if x['numero'] == q_num), None)
        if q:
            termos_q = normalizar(q['pergunta'] + ' ' + q['resposta'])
            q_scores.append((len(termos_q & termos_c), q_num))
    q_scores.sort(reverse=True)
    cic_para_piox_final[cic_num] = [n for (_, n) in q_scores[:TOP_N]]

# ── Salvar ────────────────────────────────────────────────────────────────────
resultado = {
    'piox_para_cic': piox_para_cic,
    'cic_para_piox': cic_para_piox_final,
}

with open('data/relacoes.json', 'w', encoding='utf-8') as f:
    json.dump(resultado, f, ensure_ascii=False, separators=(',', ':'))

# ── Estatísticas ──────────────────────────────────────────────────────────────
q_com = sum(1 for v in piox_para_cic.values() if v)
cic_com = len(cic_para_piox_final)
print(f'Q&As do Pio X com referências CIC: {q_com}/{len(piox)} ({100*q_com//len(piox)}%)')
print(f'Parágrafos CIC com referências Pio X: {cic_com}/{len(cic)}')
print(f'\nExemplos:')
for q_num in [15, 254, 552, 831, 857]:
    refs = piox_para_cic.get(str(q_num), [])
    print(f'  Q.{q_num} → CIC §§ {refs}')
for cic_num in [199, 1213, 1601, 1846]:
    refs = cic_para_piox_final.get(str(cic_num), [])
    print(f'  CIC §{cic_num} → Pio X Q.{refs}')
