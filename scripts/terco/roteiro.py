import json,re,os
ESC=json.load(open('escriva-gozosos.json'))['misterios']
B=lambda liv,c,v1,v2=None: ' '.join(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','data','biblia',f'{liv}.json')))[str(c)][str(v)] for v in range(v1,(v2 or v1)+1))
SINAL='Em nome do Pai, e do Filho, e do Espírito Santo. Amém.'
OFER=('Divino Jesus, nós vos oferecemos este terço que vamos rezar, contemplando os mistérios da nossa redenção. '
      'Concedei-nos, pela intercessão da Virgem Maria, Mãe de Deus e nossa Mãe, as virtudes que nos são necessárias para bem rezá-lo.')
CREIO=('Creio em Deus Pai todo-poderoso, criador do céu e da terra. E em Jesus Cristo, seu único Filho, nosso Senhor, '
       'que foi concebido pelo poder do Espírito Santo, nasceu da Virgem Maria, padeceu sob Pôncio Pilatos, foi crucificado, morto e sepultado. '
       'Desceu à mansão dos mortos, ressuscitou ao terceiro dia, subiu aos céus, está sentado à direita de Deus Pai todo-poderoso, '
       'donde há de vir a julgar os vivos e os mortos. Creio no Espírito Santo, na santa Igreja Católica, na comunhão dos santos, '
       'na remissão dos pecados, na ressurreição da carne, na vida eterna. Amém.')
PAI=('Pai nosso que estais nos céus, santificado seja o vosso nome, venha a nós o vosso reino, seja feita a vossa vontade, assim na terra como no céu. '
     'O pão nosso de cada dia nos dai hoje, perdoai-nos as nossas ofensas, assim como nós perdoamos a quem nos tem ofendido, '
     'e não nos deixeis cair em tentação, mas livrai-nos do mal. Amém.')
AVE=('Ave Maria, cheia de graça, o Senhor é convosco, bendita sois vós entre as mulheres, e bendito é o fruto do vosso ventre, Jesus. '
     'Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora de nossa morte. Amém.')
GLORIA='Glória ao Pai, e ao Filho, e ao Espírito Santo. Como era no princípio, agora e sempre. Amém.'
FATIMA=('Ó meu Jesus, perdoai-nos, livrai-nos do fogo do inferno, levai as almas todas para o céu '
        'e socorrei principalmente as que mais precisarem.')
SALVE=('Salve, Rainha, Mãe de misericórdia, vida, doçura e esperança nossa, salve! A vós bradamos, os degredados filhos de Eva. '
       'A vós suspiramos, gemendo e chorando neste vale de lágrimas. Eia, pois, advogada nossa, esses vossos olhos misericordiosos a nós volvei. '
       'E depois deste desterro, mostrai-nos Jesus, bendito fruto do vosso ventre. Ó clemente, ó piedosa, ó doce sempre Virgem Maria.')
ROGAI='Rogai por nós, santa Mãe de Deus, para que sejamos dignos das promessas de Cristo. Amém.'
MIST=[
 ('Primeiro mistério gozoso','A Anunciação do Anjo a Nossa Senhora',('Lc',1,38),'Peçamos a graça da humildade.'),
 ('Segundo mistério gozoso','A visita de Nossa Senhora a sua prima Isabel',('Lc',1,42),'Peçamos a graça da caridade para com o próximo.'),
 ('Terceiro mistério gozoso','O nascimento de Jesus em Belém',('Lc',2,7),'Peçamos a graça do desapego das coisas do mundo.'),
 ('Quarto mistério gozoso','A apresentação do Menino Jesus no Templo',('Lc',2,22),'Peçamos a graça da obediência e da pureza.'),
 ('Quinto mistério gozoso','A perda e o encontro do Menino Jesus no Templo',('Lc',2,49),'Peçamos a graça de buscar sempre a Jesus.'),
]
ORD=['No primeiro mistério','No segundo mistério','No terceiro mistério','No quarto mistério','No quinto mistério']
seg=[]
def add(texto,rot,m=-1,conta=0,var=0,tipo='oracao',ref='',fala=None):
    seg.append(dict(texto=texto,fala=fala or texto,rotulo=rot,mist=m,conta=conta,var=var,tipo=tipo,ref=ref))
add(SINAL,'Sinal da Cruz'); add(OFER,'Oferecimento'); add(CREIO,'Creio'); add(PAI,'Pai-Nosso')
for i,int_ in enumerate(['pelo aumento da fé','pelo aumento da esperança','pelo aumento da caridade']):
    add(f'Ave-Maria, {int_}.','Ave-Maria',tipo='intencao',conta=i+1)
    add(AVE,'Ave-Maria',conta=i+1,var=i%4)
add(GLORIA,'Glória')
k=0
for i,(tit,nome,(lv,c,v),fruto) in enumerate(MIST):
    anuncio=f'{ORD[i]} gozoso, contemplamos {nome[0].lower()+nome[1:]}.'
    add(anuncio,tit,m=i,tipo='anuncio')
    for par in ESC[i]:
        fala=re.sub(r'\s*\((?:Lc|Mt|Mc|Jo)[^)]*\)','',par).replace(' - ',', ').replace('…','... ').strip()
        add(par,tit,m=i,tipo='meditacao',fala=fala)
    add(fruto,tit,m=i,tipo='fruto')
    add(PAI,'Pai-Nosso',m=i)
    for n in range(10):
        add(AVE,'Ave-Maria',m=i,conta=n+1,var=k%4); k+=1
    add(GLORIA,'Glória',m=i,conta=10); add(FATIMA,'Ó meu Jesus',m=i,conta=10)
add(SALVE,'Salve-Rainha',m=5); add(ROGAI,'Salve-Rainha',m=5); add(SINAL,'Sinal da Cruz',m=5)
json.dump(seg,open('roteiro-gozosos.json','w'),ensure_ascii=False,indent=1)
print(len(seg),'segmentos;',len({(s['texto'],s['var']) for s in seg}),'únicos')
