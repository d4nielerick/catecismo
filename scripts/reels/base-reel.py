"""Quadro-base do Reel (1080×1920): pintura no topo, "Liturgia de hoje", data e referência.
Uso: python3 base-reel.py <DD> <foco_x> <foco_y> <zoom> "<ref>" "<data por extenso>" <pintura.jpg> [saida.png]"""
import sys,json
from PIL import Image, ImageDraw, ImageFont
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
dia,foc_x,foc_y,zoom,ref,data=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),sys.argv[5],sys.argv[6]
src=sys.argv[7]   # pintura do dia (JPEG grande)
W,H,ALT=1080,1920,1230
MIC='/Users/daniel/Library/Fonts/Michelangelus-Regular.ttf'; MICI='/Users/daniel/Library/Fonts/Michelangelus-Italic.ttf'
mic=lambda t:ImageFont.truetype(MIC,t); mici=lambda t:ImageFont.truetype(MICI,t)
sans=lambda t,i=5:ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc',t,index=i)
def esp(d,xy,t,fo,cor,e):
    x,y=xy
    for c in t: d.text((x,y),c,font=fo,fill=cor); x+=d.textlength(c,font=fo)+e
im=Image.new('RGB',(W,H),(226,217,205))
o=Image.open(src).convert('RGB')
r=W/ALT
cw=min(o.width,o.height*r); ch=cw/r
if ch>o.height: ch=o.height; cw=ch*r
cw*=zoom; ch*=zoom
x0=max(0,min(o.width-cw,foc_x*o.width-cw/2)); y0=max(0,min(o.height-ch,foc_y*o.height-ch/2))
p=o.crop((int(x0),int(y0),int(x0+cw),int(y0+ch))).resize((W,ALT),Image.LANCZOS); im.paste(p,(0,0))
g=Image.linear_gradient('L').resize((W,640)).point(lambda v:min(255,int(v*1.05)))
im.paste(Image.new('RGB',(W,640),(14,9,6)),(0,ALT-640),g)
t=Image.linear_gradient('L').rotate(180).resize((W,420)).point(lambda v:int(v*0.55))
im.paste(Image.new('RGB',(W,420),(14,9,6)),(0,0),t)
d=ImageDraw.Draw(im)
logo=Image.open(os.path.join(AQUI,'logo-L.png')).convert('RGBA').resize((80,79),Image.LANCZOS); im.paste(logo,(84,270),logo)
esp(d,(178,296),'@liturgia_hoje',sans(30,2),(232,224,214),2)
m=84
esp(d,(m,950),'LITURGIA DIÁRIA',sans(24),(236,84,76),9)
d.text((445,948),data,font=sans(28,2),fill=(240,232,222))
d.text((m-8,980),'Liturgia',font=mic(104),fill=(255,255,255)); w=d.textlength('Liturgia ',font=mic(104))
d.text((m-8+w,980),'de hoje',font=mici(104),fill=(255,255,255))
bw=int(d.textlength(ref,font=sans(26,2)))+44
d.rectangle((74,1128,74+bw,1172),outline=(240,232,222),width=1); d.text((96,1134),ref,font=sans(26,2),fill=(240,232,222))
im.save(sys.argv[8] if len(sys.argv)>8 else f'base-{dia}.png')
