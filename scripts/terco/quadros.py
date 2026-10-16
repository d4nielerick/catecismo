import json,os
from PIL import Image,ImageDraw,ImageFont,ImageFilter
F='/Users/daniel/catecismo/ios/LiturgiaDiaria/Fontes/'
inria=lambda t:ImageFont.truetype(F+'inria-serif-400.ttf',t)
inriai=lambda t:ImageFont.truetype(F+'inria-serif-400-italic.ttf',t)
inriab=lambda t:ImageFont.truetype(F+'inria-serif-700.ttf',t)
sans=lambda t,i=5:ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc',t,index=i)
W,H=1920,1080; PW=1000
PAPEL=(252,250,247); TINTA=(26,22,18); SUAVE=(110,100,92); VERM=(203,46,46)
import sys
from conjuntos import C
NOME=sys.argv[1] if len(sys.argv)>1 else 'gozosos'; K=C[NOME]
PINT=[f"{K['pasta']}/{p}" for p in K['pinturas']]
FOCO=K['foco']
def pintura(i):
    o=Image.open(PINT[i]).convert('RGB'); r=PW/H
    if o.width/o.height>r: cw,ch=int(o.height*r),o.height
    else: cw,ch=o.width,int(o.width/r)
    fx,fy=FOCO[i]; x0=min(max(0,int(fx*o.width-cw/2)),o.width-cw); y0=min(max(0,int(fy*o.height-ch/2)),o.height-ch)
    return o.crop((x0,y0,x0+cw,y0+ch)).resize((PW,H),Image.LANCZOS)
def esp(d,xy,t,f,cor,e):
    x,y=xy
    for c in t: d.text((x,y),c,font=f,fill=cor); x+=d.textlength(c,font=f)+e
def quebra(d,t,f,L):
    ls=[];l=''
    for p in t.split():
        x=(l+' '+p).strip()
        if d.textlength(x,font=f)<=L: l=x
        else: ls.append(l); l=p
    return ls+[l]
cache={}
def quadro(s,saida):
    m=s['mist']; idx=0 if m<0 else (6 if m==5 else m+1)
    if idx not in cache: cache[idx]=pintura(idx)
    im=Image.new('RGB',(W,H),PAPEL); im.paste(cache[idx],(0,0))
    d=ImageDraw.Draw(im); X=PW+90; L=W-X-90
    esp(d,(X,96),'TERÇO  ·  '+K['titulo'].upper(),sans(20),VERM,5)
    if 0<=m<5:
        tit=['Primeiro','Segundo','Terceiro','Quarto','Quinto'][m]+' mistério'
        d.text((X,140),tit,font=inriai(30),fill=SUAVE)
        nome=K['curtos'][m]
        d.text((X,182),nome,font=inriab(50),fill=TINTA)
    elif m==5: d.text((X,170),'Encerramento',font=inriab(50),fill=TINTA)
    else: d.text((X,170),'Orações iniciais',font=inriab(50),fill=TINTA)
    d.line((X,272,X+70,272),fill=VERM,width=2)
    # nome da oração
    rot=s['rotulo'] if s['tipo'] not in('anuncio','evangelho','fruto','meditacao') else {'anuncio':'Anúncio','evangelho':'Evangelho','fruto':'Fruto do mistério','meditacao':'São Josemaria · Santo Rosário'}[s['tipo']]
    esp(d,(X,305),rot.upper(),sans(19),SUAVE,4)
    # texto
    t=s['texto']; tam=40 if len(t)<160 else 34 if len(t)<330 else 29
    f=inriai(tam) if s['tipo'] in('evangelho','intencao','fruto','anuncio','meditacao') else inria(tam)
    ls=quebra(d,('“'+t+'”') if s['tipo']=='evangelho' else t,f,L); y=350; lh=int(tam*1.42)
    for l in ls: d.text((X,y),l,font=f,fill=TINTA); y+=lh
    if s['tipo']=='evangelho': d.text((X,y+8),s['ref'].replace(' ',' '),font=sans(22,2),fill=SUAVE)
    # contas
    if s['mist']<5 and (s['rotulo'] in('Ave-Maria','Glória','Ó meu Jesus') or s['mist']>=0):
        n=10 if s['mist']>=0 else 3; acesas=s['conta']
        cx=X; cy=930; r=11; g=34
        for i in range(n):
            on=i<acesas
            d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=VERM if on else None,outline=VERM if on else (200,190,180),width=2)
            cx+=g
    d.text((X,1010),'Liturgia Diária  ·  liturgia.santadoutrina.com',font=sans(18,2),fill=(160,150,140))
    im.save(saida,quality=93)
if __name__=='__main__':
    s=json.load(open(f'roteiro-{NOME}.json')); os.makedirs(f'quadros-{NOME}',exist_ok=True)
    for i,x in enumerate(s): quadro(x,f'quadros-{NOME}/{i:03d}.jpg')
    print('ok',len(s))
