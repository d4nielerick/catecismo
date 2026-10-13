import json
from tts_eleven import gerar
s=json.load(open('roteiro-gozosos.json'))
feitos={}
for x in s:
    k=(x['fala'],x['var'] if x['fala'].startswith('Ave Maria, cheia') else 0)
    if k not in feitos:
        feitos[k]=gerar(*k); print('ok',feitos[k],x['rotulo'],flush=True)
    x['wav']=feitos[k]
json.dump(s,open('roteiro-gozosos.json','w'),ensure_ascii=False,indent=1)
print('TUDO_OK')
