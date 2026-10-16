import json,sys
NOME=sys.argv[1] if len(sys.argv)>1 else 'dolorosos'
from tts_grok import gerar
s=json.load(open(f'roteiro-{NOME}.json'))
feitos={}; chars=0
for x in s:
    k=(x['fala'],x['var'] if x['fala'].startswith('Ave Maria, cheia') else 0)
    if k not in feitos:
        feitos[k]=gerar(*k); chars+=len(k[0]); print('ok',feitos[k],x['rotulo'],flush=True)
    x['wav']=feitos[k]
json.dump(s,open(f'roteiro-{NOME}.json','w'),ensure_ascii=False,indent=1)
print('TUDO_OK caracteres cobrados:',chars)
