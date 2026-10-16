import json,subprocess,os,sys
NOME=sys.argv[1] if len(sys.argv)>1 else 'gozosos'
s=json.load(open(f'roteiro-{NOME}.json'))
dur=lambda f: float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]))
os.makedirs('tmp',exist_ok=True)
# pausa depois de cada segmento
def pausa(i,x):
    nxt=s[i+1] if i+1<len(s) else None
    if x['rotulo']=='Ave-Maria' and nxt and nxt['rotulo']=='Ave-Maria': return 0.55
    if x['tipo']=='meditacao': return 1.1
    if x['tipo'] in('anuncio','evangelho'): return 1.3
    if x['tipo']=='fruto': return 1.6
    if x['tipo']=='intencao': return 0.4
    return 1.0
INI=2.0
lista_a=open('tmp/audio.txt','w'); lista_v=open('tmp/video.txt','w'); t=INI; caps=[]
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t',str(INI),'tmp/ini.wav'],check=True)
lista_a.write("file 'ini.wav'\n")
for i,x in enumerate(s):
    p=pausa(i,x); d=dur(x['wav'])
    sil=f'tmp/sil{int(p*100)}.wav'
    if not os.path.exists(sil): subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t',str(p),sil],check=True)
    lista_a.write(f"file '{os.path.abspath(x['wav'])}'\nfile '{os.path.basename(sil)}'\n")
    ini_q = 0 if i==0 else t
    if x['tipo']=='anuncio': caps.append((t,x['rotulo']))
    if i==0: lista_v.write(f"file '{os.path.abspath(f'quadros-{NOME}/000.jpg')}'\nduration {INI+d+p:.3f}\n")
    else: lista_v.write(f"file '{os.path.abspath(f'quadros-{NOME}/{i:03d}.jpg')}'\nduration {d+p:.3f}\n")
    t+=d+p
lista_v.write(f"file '{os.path.abspath(f'quadros-{NOME}/{len(s)-1:03d}.jpg')}'\nduration 3\n")
lista_a.close(); lista_v.close(); total=t+3
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i','tmp/audio.txt','-ar','48000','tmp/voz.wav'],check=True)
mus='/Users/daniel/catecismo/instagram-posts/reel-teste/trilha-violino.mp3'
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i','tmp/video.txt','-i','tmp/voz.wav','-stream_loop','-1','-i',mus,
  '-filter_complex',f"[0:v]fps=30,format=yuv420p[v];[1:a]apad,atrim=0:{total},loudnorm=I=-16:TP=-1.5:LRA=11[vz];[2:a]atrim=0:{total},volume=0.045,afade=t=in:d=4,afade=t=out:st={total-6}:d=6[m];[vz][m]amix=inputs=2:duration=first:normalize=0[a]",
  '-map','[v]','-map','[a]','-c:v','libx264','-preset','medium','-crf','20','-tune','stillimage','-c:a','aac','-b:a','160k','-t',f'{total:.2f}','-movflags','+faststart',f'terco-{NOME}.mp4'],check=True)
mm=lambda t: f'{int(t//60)}:{int(t%60):02d}'
json.dump({'total':total,'capitulos':[(mm(a),b) for a,b in caps]},open(f'tmp/capitulos-{NOME}.json','w'),ensure_ascii=False)
print('ok',mm(total),caps)
