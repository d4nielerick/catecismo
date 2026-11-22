"""Folha de conferência: as pinturas escolhidas de cada dia com o trecho do Evangelho lido enquanto cada uma aparece.
Uso: python3 scripts/reels/folha-trechos.py saida.jpg AAAA-MM-DD [AAAA-MM-DD ...]"""
import json, os, sys, textwrap, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
RAIZ=Path(__file__).resolve().parents[2]; CENAS=Path(os.environ.get('CENAS', RAIZ/'instagram-posts/reels-cenas'))
esc=json.load(open(CENAS/'escolhas.json'))
DS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
def trechos(dia,N):
    a=json.load(open(RAIZ/f'data/liturgia-audio/{dia}/evangelho.json'))
    dur=a['duracao']; ini=[l['t0'] for l in a['linhas']]; c=[0.0]
    for k in range(1,N):
        alvo=dur*k/N; c.append(min((t for t in ini if t>c[-1]+2), key=lambda t:abs(t-alvo), default=alvo))
    c.append(1e9)
    return a.get('referencia',''), [' '.join(l['texto'] for l in a['linhas'] if c[k]<=l['t0']<c[k+1]).replace('"','') for k in range(N)]
ft=ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc',30); fx=ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc',16)
W,H=260,347; TX=250
dias=sys.argv[2:]
im=Image.new('RGB',(5*(W+10)+10, len(dias)*(H+TX+60)+10),(24,22,20)); d=ImageDraw.Draw(im)
for r,dia in enumerate(dias):
    y=r*(H+TX+60)+10; dt=datetime.date.fromisoformat(dia); ref,ts=trechos(dia,len(esc[dia]))
    d.text((12,y+6),f'{DS[dt.weekday()]} {dt.day}/{dt.month} · {ref}',font=ft,fill=(240,215,160))
    for k,(s,t) in enumerate(zip(esc[dia],ts)):
        x=10+k*(W+10); im.paste(Image.open(CENAS/f'flow/cena-{dia}-{s}.jpg').convert('RGB').resize((W,H)),(x,y+50))
        ls=textwrap.wrap(t,31)
        if len(ls)>13: ls=ls[:13]; ls[-1]+='…'
        d.multiline_text((x+2,y+58+H),'\n'.join(ls),font=fx,fill=(225,220,210),spacing=3)
im.save(sys.argv[1],quality=84)
