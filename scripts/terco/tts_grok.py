import json,subprocess,os,hashlib,sys,time
"""Grok TTS (xAI, pt-BR) -> vozg/<hash>.wav, 24 kHz mono, sem silêncio nas pontas. Chave no Keychain (xai-api-key)."""
CHAVE=os.environ.get('XAI_API_KEY') or subprocess.check_output(['security','find-generic-password','-a',os.environ['USER'],'-s','xai-api-key','-w']).decode().strip()
VOZ=os.environ.get('GROK_VOZ','leo')
os.makedirs('vozg',exist_ok=True)
# corta o silêncio das pontas sem comer o fim da palavra: no fim, limite baixo (-55 dB) e 120 ms de folga depois do ponto
# em que a voz some (o corte antigo, -45 dB sem folga, cortava o "s"/"m" final). O mp3 original fica em vozg/orig/.
CORTE=('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,'
       'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.12,areverse')
def gerar(texto,variante=0,voz=None):
    voz=voz or VOZ
    h=hashlib.sha1(f'{texto}|{variante}|grok|{voz}|v2'.encode()).hexdigest()[:12]; saida=f'vozg/{h}.wav'
    if os.path.exists(saida): return saida
    corpo={'text':texto,'language':'pt-BR','voice_id':voz,'output_format':{'codec':'mp3','sample_rate':44100,'bit_rate':128000}}
    for t in range(4):
        r=subprocess.run(['curl','-s','-m','180','-w','%{http_code}','-o',saida+'.mp3','-H',f'Authorization: Bearer {CHAVE}','-H','Content-Type: application/json',
            '-d',json.dumps(corpo),'https://api.x.ai/v1/tts'],capture_output=True,text=True)
        if r.stdout.strip()=='200':
            subprocess.run(['ffmpeg','-y','-loglevel','error','-i',saida+'.mp3','-ar','24000','-ac','1',
                '-af',CORTE,saida],check=True)
            os.makedirs('vozg/orig',exist_ok=True); os.replace(saida+'.mp3',f'vozg/orig/{h}.mp3'); return saida
        print('falhou',r.stdout,open(saida+'.mp3').read()[:200] if os.path.exists(saida+'.mp3') else '',file=sys.stderr); time.sleep(5*(t+1))
    raise SystemExit('Grok falhou: '+texto[:50])
