import json,sys
NOME=sys.argv[1] if len(sys.argv)>1 else 'gozosos'
from tts_eleven import gerar
s=json.load(open(f'roteiro-{NOME}.json'))
feitos={}
for x in s:
    med=x['tipo']=='meditacao'   # texto de construção lusitana: o multilingual v2 soa brasileiro
    k=(x['fala'],1 if med else (x['var'] if x['fala'].startswith('Ave Maria, cheia') else 0),'eleven_multilingual_v2' if med else 'eleven_v4')
    if k not in feitos:
        feitos[k]=gerar(*k); print('ok',feitos[k],x['rotulo'],flush=True)
    x['wav']=feitos[k]
json.dump(s,open(f'roteiro-{NOME}.json','w'),ensure_ascii=False,indent=1)
print('TUDO_OK')
