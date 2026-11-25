"""Tempo real de cada palavra de uma narração, para os textos dos vídeos entrarem junto com a voz.

  python3 scripts/reels/alinhar-palavras.py narracao.mp3 [modelo] [--saida outro.json]

Lê o .json ao lado do mp3 ({ linhas: [{ t0, t1, texto }] }), roda o Whisper local (word timestamps; modelo
padrão "large-v3-turbo") e casa as palavras reconhecidas com o texto conhecido (difflib, sem caixa, acento nem
pontuação). Grava em cada linha `palavras: [{ i, t0 }]`, com `i` = posição da palavra no texto da linha.
Palavras que o Whisper não reconheceu ganham tempo interpolado entre as vizinhas, dentro de [t0, t1] da linha.
Mostra quantas casaram; abaixo de 85% é melhor conferir.
"""
import difflib, json, re, sys, unicodedata
from pathlib import Path
import whisper

_v = sys.argv[1:]
args = [a for k, a in enumerate(_v) if not a.startswith('--') and not (k and _v[k - 1] == '--saida')]
mp3 = Path(args[0]); modelo = args[1] if len(args) > 1 else 'large-v3-turbo'
arq = mp3.with_suffix('.json'); dados = json.loads(arq.read_text())
if '--saida' in sys.argv: arq = Path(sys.argv[sys.argv.index('--saida') + 1])   # grava noutro lugar (não mexe no json original)
plano = lambda s: ''.join((unicodedata.normalize('NFD', c)[0].lower() if c.isalnum() else ' ') for c in s)

# palavras conhecidas: (linha, posição no texto, forma plana)
conhecidas = []
for k, l in enumerate(dados['linhas']):
    for m in re.finditer(r'\S+', l['texto']):
        w = plano(m.group()).strip()
        if w: conhecidas.append((k, m.start(), w.replace(' ', '')))

texto = ' '.join(l['texto'] for l in dados['linhas'])
r = whisper.load_model(modelo).transcribe(str(mp3), language='pt', word_timestamps=True, condition_on_previous_text=False, no_speech_threshold=None, logprob_threshold=None, compression_ratio_threshold=None)
ouvidas = [(plano(w['word']).strip().replace(' ', ''), w['start']) for s in r['segments'] for w in s['words']]
ouvidas = [(w, t) for w, t in ouvidas if w]

tempos = [None] * len(conhecidas)
sm = difflib.SequenceMatcher(None, [w for _, _, w in conhecidas], [w for w, _ in ouvidas], autojunk=False)
for a, b, n in sm.get_matching_blocks():
    for j in range(n): tempos[a + j] = ouvidas[b + j][1]
casou = sum(t is not None for t in tempos)

if casou < 0.9 * len(conhecidas):
    # o Whisper às vezes pula dezenas de segundos de fala numa passada só: refaz em janelas de ~20 s,
    # cortadas nas fronteiras das linhas (os tempos das linhas já vêm do json), e casa de novo
    audio = whisper.load_audio(str(mp3)); SR = 16000
    modelo_w = whisper.load_model(modelo); ouvidas = []; ini = 0
    ls = dados['linhas']
    while ini < len(ls):
        fim = ini
        while fim + 1 < len(ls) and ls[fim + 1]['t1'] - ls[ini]['t0'] <= 20: fim += 1
        a, b = max(0, ls[ini]['t0'] - 0.15), ls[fim]['t1'] + 0.25
        r2 = modelo_w.transcribe(audio[int(a * SR):int(b * SR)], language='pt', word_timestamps=True, condition_on_previous_text=False,
                                 no_speech_threshold=None, logprob_threshold=None, compression_ratio_threshold=None)
        ouvidas += [(plano(w['word']).strip().replace(' ', ''), a + w['start']) for s in r2['segments'] for w in s['words']]
        ini = fim + 1
    ouvidas = [(w, t) for w, t in ouvidas if w]
    tempos = [None] * len(conhecidas)
    sm = difflib.SequenceMatcher(None, [w for _, _, w in conhecidas], [w for w, _ in ouvidas], autojunk=False)
    for a_, b_, n in sm.get_matching_blocks():
        for j in range(n): tempos[a_ + j] = ouvidas[b_ + j][1]
    casou = sum(t is not None for t in tempos)

# a palavra precisa cair dentro da própria linha; o que faltar é interpolado
for idx, (k, _, _) in enumerate(conhecidas):
    l = dados['linhas'][k]
    if tempos[idx] is not None and not (l['t0'] - 0.3 <= tempos[idx] <= l['t1'] + 0.3): tempos[idx] = None
for k, l in enumerate(dados['linhas']):
    ids = [i for i, c in enumerate(conhecidas) if c[0] == k]
    pts = [(l['t0'], -1)] + [(tempos[i], n) for n, i in enumerate(ids) if tempos[i] is not None] + [(l['t1'], len(ids))]
    for n, i in enumerate(ids):
        if tempos[i] is None:
            (ta, na), (tb, nb) = max((p for p in pts if p[1] < n), key=lambda p: p[1]), min((p for p in pts if p[1] > n), key=lambda p: p[1])
            tempos[i] = ta + (tb - ta) * (n - na) / (nb - na)
    l['palavras'] = [{'i': conhecidas[i][1], 't0': round(tempos[i], 2)} for i in ids]
arq.write_text(json.dumps(dados, ensure_ascii=False, indent=2))
print(f'{arq.name}: {casou}/{len(conhecidas)} palavras casadas com o Whisper ({100 * casou / len(conhecidas):.0f}%)')
