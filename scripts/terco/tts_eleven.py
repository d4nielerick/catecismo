import json,subprocess,os,hashlib,sys,time
"""ElevenLabs (voz Daniel, eleven_v4) -> voz11/<hash>.wav, 24 kHz mono, sem silêncio nas pontas."""
CHAVE=os.environ.get('ELEVENLABS_API_KEY') or subprocess.check_output(['security','find-generic-password','-a',os.environ['USER'],'-s','elevenlabs-api-key','-w']).decode().strip()
VOZ='onwK4e9ZLuTAKqWW03F9'
os.makedirs('voz11',exist_ok=True)
def gerar(texto,variante=0,modelo='eleven_v4'):
    h=hashlib.sha1(f'{texto}|{variante}|11|{modelo}'.encode()).hexdigest()[:12]; saida=f'voz11/{h}.wav'
    if os.path.exists(saida): return saida
    corpo={'text':texto,'model_id':modelo,'language_code':'pt','voice_settings':{'stability':0.6,'similarity_boost':0.8},'seed':1000+variante}
    for t in range(4):
        r=subprocess.run(['curl','-s','-w','%{http_code}','-o',saida+'.mp3','-H',f'xi-api-key: {CHAVE}','-H','Content-Type: application/json',
            '-d',json.dumps(corpo),f'https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_128'],capture_output=True,text=True)
        if r.stdout.strip()=='200':
            subprocess.run(['ffmpeg','-y','-loglevel','error','-i',saida+'.mp3','-ar','24000','-ac','1',
                '-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',saida],check=True)
            os.remove(saida+'.mp3'); return saida
        print('falhou',r.stdout,open(saida+'.mp3').read()[:200] if os.path.exists(saida+'.mp3') else '',file=sys.stderr); time.sleep(5*(t+1))
    raise SystemExit('ElevenLabs falhou: '+texto[:50])
