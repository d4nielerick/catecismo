"""Corrige um áudio da Liturgia já gravado: corta o começo (instrução lida em voz alta) ou o fim
(frase repetida) e refaz os tempos t0/t1 de cada linha pela voz, com o Whisper.

  python3.14 scripts/realinha-audio.py AAAA-MM-DD/tipo                 # só mostra os tempos novos
  python3.14 scripts/realinha-audio.py AAAA-MM-DD/tipo --de=19.2       # corta antes de 19,2 s
  python3.14 scripts/realinha-audio.py AAAA-MM-DD/tipo --ate=41.7      # corta depois de 41,7 s
  python3.14 scripts/realinha-audio.py AAAA-MM-DD/tipo ... --gravar    # grava mp3 e json

tipo = evangelho, primeira-leitura, salmo ou segunda-leitura. Usa o python do whisper
(/opt/homebrew/opt/python@3.14/bin/python3.14). Transcreve em janelas de 25 s (no áudio inteiro o
Whisper se perde em salmo com refrão) e casa cada linha, na ordem, com as palavras ouvidas. Não grava
se alguma linha casar mal (< 0,8). Depois: node scripts/verifica-liturgia.mjs e enviar à VPS.
"""
import json, re, shutil, subprocess, sys, unicodedata, difflib
from pathlib import Path
import whisper

RAIZ = Path(__file__).resolve().parents[1]
alvo = sys.argv[1]
opc = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[2:] if '=' in a}
de, ate, gravar = float(opc.get('--de', 0)), opc.get('--ate'), '--gravar' in sys.argv
src = RAIZ / 'data' / 'liturgia-audio' / f'{alvo}.mp3'
arq_json = src.with_suffix('.json')
out = Path('/tmp/realinha.mp3')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(de), '-i', str(src)]
               + (['-t', str(float(ate) - de)] if ate else []) + ['-b:a', '96k', str(out)], check=True)
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out)]))

m = whisper.load_model('large-v3-turbo')
ws, t = [], 0.0
while t < dur:
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(t), '-t', '28', '-i', str(out), '-ar', '16000', '-ac', '1', '/tmp/realinha.wav'], check=True)
    for s in m.transcribe('/tmp/realinha.wav', language='pt', fp16=False, word_timestamps=True)['segments']:
        for x in s['words']:
            a = x['start'] + t
            if a >= t + (1.5 if t else 0) and (not ws or a > ws[-1][1] + 0.05): ws.append((x['word'], a, x['end'] + t))
    t += 25

n = lambda s: re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).split()
flat = [(tk, a, b) for w, a, b in ws for tk in n(w)]
j = json.loads(arq_json.read_text())
p, novas, pior = 0, [], 1.0
for l in j['linhas']:
    L = n(l['texto']); best = (0, None)
    for i in range(p, min(len(flat), p + 40)):
        r = difflib.SequenceMatcher(None, [x[0] for x in flat[i:i + len(L)]], L).ratio()
        if r > best[0] + 1e-9: best = (r, i)
        if r >= 0.75: best = (r, i); break   # a 1ª ocorrência boa: o refrão se repete e não pode ser pulado
    r, i = best
    if i is None: sys.exit(f'sem casamento: {l["texto"]}')
    e = i + len(L) - 1
    novas.append({**l, 't0': round(max(0, flat[i][1] - 0.05), 2), 't1': round(flat[e][2], 2)})
    print(f'{r:.2f} {l["t0"]:6.2f} → {novas[-1]["t0"]:6.2f}-{novas[-1]["t1"]:6.2f}  {l["texto"][:60]}')
    pior, p = min(pior, r), e + 1
novas[0]['t0'] = 0
print(f'pior casamento {pior:.2f} · duração {dur:.2f} s · palavras ouvidas depois da última linha: {len(flat) - p}')
if gravar:
    if pior < 0.8: sys.exit('casamento ruim: não gravo')
    j['linhas'], j['duracao'] = novas, round(dur, 2)
    shutil.copy(out, src)
    arq_json.write_text(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
    print('gravado')
