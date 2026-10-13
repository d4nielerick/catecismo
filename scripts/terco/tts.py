import json,subprocess,base64,sys,os,hashlib,time
"""Gemini TTS de um texto curto -> voz/<hash>.wav (24 kHz mono). Uso: python3 tts.py "texto" [n_variante]"""
CHAVE=subprocess.check_output(['security','find-generic-password','-a',os.environ['USER'],'-s','gemini-api-key','-w']).decode().strip()
MODELO=os.environ.get('GEMINI_MODELO','gemini-3.8-flash-tts')
INSTR='Read aloud in Brazilian Portuguese, in a calm, serene and reverent voice, like someone leading the rosary in a church, unhurried and natural:'
import re,unicodedata
def _n(w): return re.sub(r'[^a-z]','',unicodedata.normalize('NFD',w.lower()).encode('ascii','ignore').decode())
def inicio_do_texto(wav,texto):
    """O Gemini lê a instrução antes do texto: acha (Whisper) onde começa o texto e corta ali."""
    tmp='/tmp/tts-wh'; os.makedirs(tmp,exist_ok=True)
    subprocess.run(['whisper',wav,'--model','small','--language','pt','--word_timestamps','True','--output_format','json',
                    '--output_dir',tmp,'--fp16','False'],capture_output=True)
    j=json.load(open(os.path.join(tmp,os.path.basename(wav).rsplit('.',1)[0]+'.json')))
    pal=[(w['start'],_n(w['word'])) for s in j['segments'] for w in s.get('words',[])]
    import difflib
    alvo=''.join(_n(w) for w in texto.split())[:18]
    melhor=(0,None)
    for i in range(len(pal)):
        junto=''
        for p in pal[i:i+8]:
            junto+=p[1]
            if len(junto)>=len(alvo): break
        r=difflib.SequenceMatcher(None,junto[:len(alvo)],alvo).ratio()
        if r>melhor[0]+0.001: melhor=(r,i)
        if r>=0.9: break
    if melhor[0]>=0.7: return max(0,pal[melhor[1]][0]-0.12)
    raise RuntimeError('não achei o começo do texto: '+' '.join(p[1] for p in pal))
def gerar_um(texto,variante=0):
    h=hashlib.sha1(f'{texto}|{variante}'.encode()).hexdigest()[:12]
    saida=f'voz/{h}.wav'
    if os.path.exists(saida): return saida
    corpo={'contents':[{'parts':[{'text':texto}]}],   # sem instrução: o Gemini lia a instrução em voz alta
           'generationConfig':{'responseModalities':['AUDIO'],'speechConfig':{'languageCode':'pt-BR','voiceConfig':{'prebuiltVoiceConfig':{'voiceName':'Algenib'}}}}}
    if variante: corpo['generationConfig']['seed']=variante
    for tent in range(5):
        r=subprocess.run(['curl','-s','--max-time','300','-H','Content-Type: application/json','-H',f'x-goog-api-key: {CHAVE}',
            '-d',json.dumps(corpo),f'https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent'],capture_output=True)
        j=json.loads(r.stdout or b'{}')
        try:
            p=j['candidates'][0]['content']['parts'][0]['inlineData']
            pcm=base64.b64decode(p['data'])
            open(saida+'.pcm','wb').write(pcm)
            bruto=saida+'.bruto.wav'
            subprocess.run(['ffmpeg','-y','-loglevel','error','-f','s16le','-ar','24000','-ac','1','-i',saida+'.pcm',bruto],check=True)
            ini=0
            subprocess.run(['ffmpeg','-y','-loglevel','error','-ss',f'{ini:.2f}','-i',bruto,
                            '-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',saida],check=True)
            os.remove(saida+'.pcm'); os.remove(bruto); return saida
        except Exception as e:
            print("erro:",repr(e)[:300],file=sys.stderr)
            print('falhou',tent,json.dumps(j)[:300],file=sys.stderr); time.sleep(8*(tent+1))
    raise SystemExit('Gemini recusou: '+texto[:60])
def gerar(texto,variante=0):
    """Orações longas e muito conhecidas: o Gemini pula o começo. Vai frase por frase e junta."""
    partes=[p.strip() for p in re.split(r'(?<=[.!?])\s+',texto) if p.strip()]
    junta=[]
    for p in partes:   # frase muito curta ("Amém.") fica com a anterior
        if junta and (len(p)<12 or len(junta[-1])<12): junta[-1]+=' '+p
        else: junta.append(p)
    if len(junta)<=1: return gerar_um(texto,variante)
    h=hashlib.sha1(f'{texto}|{variante}|frases'.encode()).hexdigest()[:12]; saida=f'voz/{h}.wav'
    if os.path.exists(saida): return saida
    arqs=[gerar_um(p,variante) for p in junta]
    sil='voz/_sil.wav'
    if not os.path.exists(sil): subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t','0.35',sil],check=True)
    lst=saida+'.txt'; open(lst,'w').write(''.join(f"file '{os.path.abspath(a)}'\nfile '{os.path.abspath(sil)}'\n" for a in arqs))
    subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',lst,'-af','areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',saida],check=True)
    os.remove(lst); return saida
if __name__=='__main__':
    print(gerar(sys.argv[1],int(sys.argv[2]) if len(sys.argv)>2 else 0))
