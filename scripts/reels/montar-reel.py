import json, subprocess, shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
RAIZ=Path('/Users/daniel/catecismo'); DIA=sys.argv[4] if len(sys.argv)>4 else '2026-10-15'
BASE=sys.argv[5] if len(sys.argv)>5 else 'base.png'
TRILHA=sys.argv[1]; SAIDA=sys.argv[2]; VOL_TRILHA=float(sys.argv[3]) if len(sys.argv)>3 else 0.22
aud=json.load(open(RAIZ/f'data/liturgia-audio/{DIA}/evangelho.json'))
mp3=RAIZ/f'data/liturgia-audio/{DIA}/evangelho.mp3'
FONT='/Users/daniel/Library/Fonts/Michelangelus-Regular.ttf'
COR=(38,31,26); LS=-2.4; LH=94; X0,W0,Y0=98,884,1288; PAINEL_Y=1248
def largura(d,t,f): return sum(d.textlength(c,font=f) for c in t)+LS*(len(t)-1)
def quebra(d,t,f):
    ls=[];l=''
    for p in t.split():
        x=(l+' '+p).strip()
        if largura(d,x,f)<=W0: l=x
        else: ls.append(l); l=p
    return ls+[l]
# aspas tipográficas (o estado de abre/fecha segue o Evangelho inteiro)
abre=True; textos=[]
for l in aud['linhas']:
    s=''
    for ch in l['texto']:
        if ch=='"': s+='“' if abre else '”'; abre=not abre
        else: s+=ch
    textos.append(s)
pasta=Path('linhas'); shutil.rmtree(pasta,ignore_errors=True); pasta.mkdir()
d0=ImageDraw.Draw(Image.new('RGBA',(10,10)))
for i,t in enumerate(textos):
    for tam in (80,72,66,60,54):
        f=ImageFont.truetype(FONT,tam); ls=quebra(d0,t,f)
        lh=int(LH*tam/80)
        if len(ls)*lh<=252: break
    im=Image.new('RGBA',(1080,1920-PAINEL_Y),(0,0,0,0)); d=ImageDraw.Draw(im); y=Y0-PAINEL_Y
    for l in ls:
        x=X0+(W0-largura(d,l,f))/2
        for c in l: d.text((x,y),c,font=f,fill=COR+(255,)); x+=d.textlength(c,font=f)+LS
        y+=lh
    fim_atual=y
    if i+1<len(textos):
        prox=textos[i+1]
        if prox.strip().lower().startswith('palavra d'): prox=prox   # a última linha também aparece
        LIMITE=1600   # um pouco além da área segura: é só uma pista apagada da próxima frase
        lp=None
        for tp in (50,46,42):
            fp=ImageFont.truetype(FONT,tp); lhp=int(tp*1.2); cand=quebra(d0,prox,fp)
            while cand and fim_atual+PAINEL_Y+30+len(cand)*lhp>LIMITE: cand=cand[:-1]; cortou=True
            if cand and len(cand)==len(quebra(d0,prox,fp)): lp=cand; break
        if lp is None:   # não coube inteira: mostra só o começo, com reticências
            fp=ImageFont.truetype(FONT,42); lhp=int(42*1.2); cand=quebra(d0,prox,fp)
            n=max(1,(LIMITE-(fim_atual+PAINEL_Y+30))//lhp)
            lp=cand[:n]
            if len(cand)>n: lp[-1]=lp[-1].rstrip(',.;: ')+'…'
        if lp:
            yp=fim_atual+30
            for l in lp:
                x=X0+(W0-largura(d,l,fp))/2
                for c in l: d.text((x,yp),c,font=fp,fill=COR+(255,)); x+=d.textlength(c,font=fp)+LS
                yp+=lhp
            # rebaixa a opacidade só da próxima frase (a atual fica 100%)
            a=im.split()[3]; box=(0,fim_atual+10,1080,1920-PAINEL_Y)
            reg=a.crop(box).point(lambda v:int(v*0.34)); a.paste(reg,box)
            im.putalpha(a)
    im.save(pasta/f'{i:02d}.png')
dur=aud['duracao']; total=dur+1.2
ini=[l['t0'] for l in aud['linhas']]
cmd=['ffmpeg','-y','-loglevel','error','-loop','1','-framerate','30','-t',f'{total}','-i',BASE]
fc=[]; ent=1
for i,t0 in enumerate(ini):
    t1=(ini[i+1]+0.25) if i+1<len(ini) else total
    cmd+=['-loop','1','-framerate','30','-t',f'{t1-t0:.3f}','-i',str(pasta/f'{i:02d}.png')]
    fi=0.22; fo=0.22
    fc.append(f'[{i+1}:v]format=rgba,fade=t=in:st=0:d={fi}:alpha=1,fade=t=out:st={max(0,t1-t0-fo):.3f}:d={fo}:alpha=1,setpts=PTS+{t0:.3f}/TB[l{i}]')
cur='[0:v]format=rgba'
fc.insert(0,'[0:v]format=rgba[b0]')
for i in range(len(ini)):
    fc.append(f'[b{i}][l{i}]overlay=0:{PAINEL_Y}:eof_action=pass[b{i+1}]')
fc.append(f'[b{len(ini)}]format=yuv420p[v]')
cmd+=['-i',str(mp3),'-stream_loop','-1','-i',TRILHA,'-filter_complex',';'.join(fc+[f'[{len(ini)+2}:a]atrim=0:{total},asetpts=PTS-STARTPTS,volume={VOL_TRILHA},afade=t=in:st=0:d=3,afade=t=out:st={total-4:.2f}:d=4[m]',f'[{len(ini)+1}:a]adelay=500|500,apad[v0]',f'[v0][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[a]']),'-map','[v]','-map','[a]','-c:v','libx264','-preset','medium','-crf','18','-r','30','-c:a','aac','-b:a','160k','-t',f'{total}','-movflags','+faststart',SAIDA]
subprocess.run(cmd,check=True); print('ok',dur,total)
