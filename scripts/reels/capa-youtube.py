"""Capa (thumbnail) 1280×720 dos vídeos horizontais do YouTube: pintura do Evangelho à direita, frase-gancho
grande à esquerda, selo "EVANGELHO DE HOJE" com a data e a referência.

  python3 scripts/reels/capa-youtube.py 2026-11-25 "Permanecei|firmes!" "Lc 21,12-19" [--estilo serif|impacto] [--saida X.jpg]

No gancho, "|" quebra a linha e *palavra* fica em dourado. A pintura é a 1ª cena escolhida do
Evangelho (reels-cenas/escolhas.json) ou liturgia-horizontal/<dia>/evangelho.jpg; --pintura troca. Estilo padrão:
impacto (Anton, maiúsculas), que chama mais atenção na lista do YouTube; --estilo serif é a versão elegante.
"""
import sys, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
F = Path.home() / 'Library/Fonts'
W, H = 1280, 720
dia, gancho, ref = sys.argv[1], sys.argv[2], sys.argv[3]
estilo = sys.argv[sys.argv.index('--estilo') + 1] if '--estilo' in sys.argv else 'impacto'
saida = Path(sys.argv[sys.argv.index('--saida') + 1]) if '--saida' in sys.argv else \
    RAIZ / f'instagram-posts/liturgia-horizontal/{dia}/capa-youtube.jpg'
MESES = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split()
data = f'{int(dia[8:])} de {MESES[int(dia[5:7]) - 1]}'

def fonte(nome, tam):
    return ImageFont.truetype(str(F / nome), tam)

# fundo: a pintura ampliada e desfocada (cobre tudo) + a pintura nítida à direita
import json
def pintura_do_dia():
    if '--pintura' in sys.argv: return Path(sys.argv[sys.argv.index('--pintura') + 1])
    cenas = RAIZ / 'instagram-posts/reels-cenas'
    esc = json.loads((cenas / 'escolhas.json').read_text()).get(dia, []) if (cenas / 'escolhas.json').exists() else []
    for e in esc:
        if (cenas / 'flow' / f'cena-{dia}-{e}.jpg').exists(): return cenas / 'flow' / f'cena-{dia}-{e}.jpg'
    return RAIZ / f'instagram-posts/liturgia-horizontal/{dia}/evangelho.jpg'
pint = Image.open(pintura_do_dia()).convert('RGB')
fundo = pint.resize((W, round(pint.height * W / pint.width))).crop((0, 200, W, 200 + H)).filter(ImageFilter.GaussianBlur(28))
# paletas: fundo (lado do texto), selo, destaque (palavra *entre asteriscos*), texto claro, detalhe (data e referência)
PALETAS = {
    'evangelho': dict(fundo=(18, 10, 8), selo=(200, 30, 40), destaque=(255, 200, 70), texto=(255, 248, 236), detalhe=(255, 214, 120)),
    'azul':      dict(fundo=(8, 18, 48), selo=(40, 90, 200), destaque=(140, 200, 255), texto=(255, 255, 255), detalhe=(170, 210, 255)),
    'roxo':      dict(fundo=(30, 10, 45), selo=(120, 50, 170), destaque=(225, 180, 255), texto=(255, 250, 255), detalhe=(215, 185, 245)),
    'vinho':     dict(fundo=(45, 6, 14), selo=(170, 25, 50), destaque=(255, 205, 140), texto=(255, 246, 240), detalhe=(250, 200, 170)),
    'verde':     dict(fundo=(6, 30, 22), selo=(30, 130, 90), destaque=(170, 240, 190), texto=(250, 255, 250), detalhe=(180, 230, 200)),
}
PAL = PALETAS[sys.argv[sys.argv.index('--paleta') + 1] if '--paleta' in sys.argv else 'evangelho']
img = Image.eval(fundo, lambda v: int(v * 0.45)).convert('RGBA')
# a pintura entra inteira na largura e mostra o alto do quadro (rostos), sem cortar cabeças:
# --topo (0 a 1) desce o recorte quando o assunto está mais embaixo
larg = 620
esc = max(larg / pint.width, H / pint.height)          # cobre a coluna inteira, também com pintura horizontal
p = pint.resize((round(pint.width * esc), round(pint.height * esc)), Image.LANCZOS)
topo = int((p.height - H) * float(sys.argv[sys.argv.index('--topo') + 1])) if '--topo' in sys.argv else 0
fx = float(sys.argv[sys.argv.index('--focox') + 1]) if '--focox' in sys.argv else 0.5   # 0 = esquerda, 1 = direita
esq = int((p.width - larg) * fx)
p = p.crop((esq, topo, esq + larg, topo + H))
mask = Image.new('L', (larg, H), 255)
for x in range(220):   # funde a borda esquerda da pintura no fundo
    for y in range(H): mask.putpixel((x, y), int(255 * (x / 220) ** 1.4))
img.paste(p, (W - larg, 0), mask)
# escurece o lado do texto
grad = Image.new('L', (W, 1))
for x in range(W): grad.putpixel((x, 0), int(235 * max(0, 1 - x / 760) ** 1.2))
img.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), c) for c in PAL['fundo']] + [grad.resize((W, H))]))
d = ImageDraw.Draw(img)

# selo e data
fb = fonte('Inter-Black.otf', 30)
selo = sys.argv[sys.argv.index('--selo') + 1] if '--selo' in sys.argv else 'EVANGELHO DE HOJE'   # ex.: TERÇO DE HOJE
bw = d.textlength(selo, font=fb) + 36
d.rounded_rectangle([56, 56, 56 + bw, 106], 8, fill=PAL['selo'])
d.text((56 + 18, 81), selo, font=fb, fill='white', anchor='lm')
rot = sys.argv[sys.argv.index('--rotulo') + 1] if '--rotulo' in sys.argv else data   # texto ao lado do selo (padrão: a data)
d.text((56 + bw + 18, 81), rot.upper(), font=fb, fill=PAL['detalhe'], anchor='lm')

# gancho
linhas = gancho.split('|')
# a letra cresce até a linha mais longa ocupar a coluna do texto (até 600 px), sem invadir a pintura
nome_f = 'Anton-Regular.ttf' if estilo == 'impacto' else 'InstrumentSerif-Italic.ttf'
limpo = [re.sub(r'\*', '', l).upper() if estilo == 'impacto' else re.sub(r'\*', '', l) for l in linhas]
tam = 240 if len(linhas) == 1 else 170 if len(linhas) == 2 else 130
med = ImageDraw.Draw(Image.new('L', (1, 1)))
while tam > 60 and max(med.textlength(l, font=fonte(nome_f, tam)) for l in limpo) > 600: tam -= 4
fg = fonte(nome_f, tam)
passo, sombra = fg.size * (1.02 if estilo == 'impacto' else 0.92), 10 if estilo == 'impacto' else 8
y = (130 + (H - 160 - 130) / 2) - passo * len(linhas) / 2 - fg.size * 0.12   # centrado entre o selo e a referência
camada = Image.new('RGBA', (W, H)); dc = ImageDraw.Draw(camada)
for l in linhas:
    x = 56
    for parte in re.split(r'(\*[^*]+\*)', l):
        if not parte: continue
        ouro = parte.startswith('*')
        txt = parte.strip('*').upper() if estilo == 'impacto' else parte.strip('*')
        cor = PAL['destaque'] if ouro else PAL['texto']
        dc.text((x, y), txt, font=fg, fill=cor, stroke_width=4 if estilo == 'impacto' else 0, stroke_fill=(20, 10, 5))
        x += dc.textlength(txt, font=fg)
    y += passo
som = Image.new('RGBA', (W, H)); som.putalpha(camada.getchannel('A').filter(ImageFilter.GaussianBlur(sombra)).point(lambda v: int(v * 0.8)))
img.alpha_composite(som, (4, 8)); img.alpha_composite(camada)

# referência e marca
fr = fonte('Inter-Bold.otf', 34)
d = ImageDraw.Draw(img)
d.text((58, H - 150), ref, font=fr, fill=PAL['detalhe'])
logo = Image.open(RAIZ / 'scripts/reels/logo-L.png').convert('RGBA')
logo = logo.resize((64, round(logo.height * 64 / logo.width)))
img.alpha_composite(logo, (56, H - 96))
d.text((56 + 80, H - 96 + logo.height / 2), 'Liturgia Diária', font=fonte('InstrumentSerif-Italic.ttf', 46), fill='white', anchor='lm')
img.convert('RGB').save(saida, quality=92)
print(saida)
