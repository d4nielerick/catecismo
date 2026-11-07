"""Capa do Reel (1080×1920): o primeiro quadro do próprio Reel (pintura, "Liturgia de hoje", data e
referência) com a frase do Evangelho no painel claro, que no vídeo começa vazio. A grade do perfil
mostra o miolo 3:4 (y 240–1680): tudo o que importa fica ali dentro.

Uso: python3 scripts/reels/capa-reel.py <reel.mp4> <AAAA-MM-DD> [saida.jpg]
A frase vem da 1ª linha da legenda do card (liturgiadiaria/instagram/<dia>.json), sem a referência.
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
reel, dia = sys.argv[1], sys.argv[2]
saida = sys.argv[3] if len(sys.argv) > 3 else f'{dia}-capa.jpg'
MIC = '/Users/daniel/Library/Fonts/Michelangelus-Regular.ttf'
SANS = '/System/Library/Fonts/Avenir Next.ttc'
COR = (38, 31, 26); VERMELHO = (196, 64, 56)
X0, W0, LS = 98, 884, -2.4
TOPO, FUNDO = 1300, 1640          # área da frase, dentro do miolo 3:4

with tempfile.TemporaryDirectory() as tmp:
    q = Path(tmp) / 'q.png'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', '0', '-i', reel, '-frames:v', '1', str(q)], check=True)
    im = Image.open(q).convert('RGB')

legenda = json.loads((RAIZ / 'liturgiadiaria' / 'instagram' / f'{dia}.json').read_text())['legenda']
frase = re.sub(r'\s*\([^)]*\)\s*$', '', legenda.split('\n')[0]).strip()

d = ImageDraw.Draw(im)
fundo = im.getpixel((540, 1700))
d.rectangle((0, 1240, 1080, 1920), fill=fundo)      # limpa o painel (o 1º quadro pode já ter texto)

def largura(t, f): return sum(d.textlength(c, font=f) for c in t) + LS * (len(t) - 1)
def quebra(t, f, w=W0):
    ls, l = [], ''
    for p in t.split():
        x = (l + ' ' + p).strip()
        if largura(x, f) <= w: l = x
        else: ls.append(l); l = p
    ls = ls + [l]
    if w == W0:   # equilibra: a menor largura que mantém o mesmo número de linhas
        while w > 300 and len(quebra(t, f, w - 10)) == len(ls): w -= 10
        ls = quebra(t, f, w) if w < W0 else ls
    return ls

rot = 'OUÇA O EVANGELHO'
fr = ImageFont.truetype(SANS, 24, index=5)
x = (1080 - (sum(d.textlength(c, font=fr) for c in rot) + 9 * (len(rot) - 1))) / 2
for c in rot: d.text((x, TOPO), c, font=fr, fill=VERMELHO); x += d.textlength(c, font=fr) + 9

for tam in (78, 72, 66, 60, 56, 52, 48):
    f = ImageFont.truetype(MIC, tam); ls = quebra(frase, f); lh = int(tam * 1.18)
    if TOPO + 70 + len(ls) * lh <= FUNDO: break
y = TOPO + 70 + (FUNDO - TOPO - 70 - len(ls) * lh) // 2
for l in ls:
    x = X0 + (W0 - largura(l, f)) / 2
    for c in l: d.text((x, y), c, font=f, fill=COR); x += d.textlength(c, font=f) + LS
    y += lh

im.save(saida, quality=92)
print(saida)
