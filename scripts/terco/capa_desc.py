import json,sys
from PIL import Image,ImageDraw,ImageFont
from conjuntos import C
NOME=sys.argv[1]; K=C[NOME]; pint=sys.argv[2]; foco=float(sys.argv[3])
F='/Users/daniel/catecismo/ios/LiturgiaDiaria/Fontes/'
W,H=1280,720
o=Image.open(f"{K['pasta']}/{pint}").convert('RGB'); r=640/720
if o.width/o.height>r: cw,ch=int(o.height*r),o.height
else: cw,ch=o.width,int(o.width/r)
x0=max(0,min(o.width-cw,int(foco*o.width-cw/2))); y0=0
im=Image.new('RGB',(W,H),(252,250,247)); im.paste(o.crop((x0,y0,x0+cw,y0+ch)).resize((640,720),Image.LANCZOS),(0,0))
d=ImageDraw.Draw(im); X=690
sans=ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc',24,index=5); x=X
for c in 'TERÇO DE HOJE': d.text((x,150),c,font=sans,fill=(203,46,46)); x+=d.textlength(c,font=sans)+6
d.text((X,195),'Mistérios',font=ImageFont.truetype(F+'inria-serif-700.ttf',84),fill=(26,22,18))
d.text((X,290),K['titulo'].split()[1],font=ImageFont.truetype(F+'inria-serif-400-italic.ttf',96),fill=(26,22,18))
d.line((X,430,X+80,430),fill=(203,46,46),width=3)
d.text((X,455),K['dias'],font=ImageFont.truetype(F+'inria-serif-400-italic.ttf',40),fill=(110,100,92))
d.text((X,520),'com São Josemaria',font=ImageFont.truetype(F+'inria-serif-400-italic.ttf',34),fill=(110,100,92))
d.text((X,630),'Liturgia Diária',font=ImageFont.truetype(F+'inria-serif-400-italic.ttf',30),fill=(160,150,140))
im.save(f'capa-{NOME}.jpg',quality=92)
cap=json.load(open(f'tmp/capitulos-{NOME}.json'))['capitulos']
creditos=sys.argv[4]
linhas='\n'.join(f"{cap[i][0]} {i+1}º mistério: {K['nomes'][i] if K['nomes'][i].startswith('Jesus') else K['nomes'][i][0].lower()+K['nomes'][i][1:]}" for i in range(5))
desc=f"""Terço de hoje · {K['titulo']} com São Josemaria ({K['dias']}) | Liturgia Diária

Reze o terço com os {K['titulo'].lower()}, meditados com os textos de São Josemaria Escrivá ("Santo Rosário").

0:00 Orações iniciais
{linhas}

Leituras do dia, áudio e o Evangelho comentado pelos Padres da Igreja: https://liturgia.santadoutrina.com

Meditações: São Josemaria Escrivá, "Santo Rosário" — escriva.org/pt-br/santo-rosario/ (© Fundação Studium, usado com autorização).
Pinturas (domínio público, Wikimedia Commons):
{creditos}

#terço #santoterço #{K['titulo'].lower().replace(' ','').replace('é','e')} #rosario #saojosemaria #nossasenhora #oracao #catolico #liturgiadiaria
"""
open(f'descricao-{NOME}.txt','w').write(desc); print(desc)
