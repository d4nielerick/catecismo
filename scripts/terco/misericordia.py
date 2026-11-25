"""Terço da Misericórdia (horizontal, YouTube): roteiro, vozes (Grok) e quadros. Depois: python3 montar.py misericordia.

  python3 misericordia.py roteiro    # roteiro-misericordia.json
  python3 misericordia.py vozes      # vozg/*.wav (Grok TTS, chave no Keychain xai-api-key)
  python3 misericordia.py quadros    # quadros-misericordia/NNN.jpg

Orações como no Diário de Santa Faustina (Expirastes 1319, Ó Sangue e Água 84/187, terço 476, Ó Deus eterno 950).
Em cada dezena, um trecho da Paixão (Bíblia Ave-Maria) com a pintura dos mistérios dolorosos (img-dol).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

NOME = 'misericordia'
PASTA = 'img-dol'
# abertura, 5 dezenas, encerramento (foco x, y da pintura)
PINT = ['0-misericordia.jpg', '1-horto.jpg', '2-flagelacao.jpg', '3-coroacao.jpg', '4-cruz.jpg', '5-crucifixao.jpg', '0-misericordia.jpg']
FOCO = [(.5, .3), (.5, .45), (.5, .4), (.45, .4), (.55, .35), (.5, .3), (.5, .3)]

SINAL = 'Em nome do Pai, e do Filho, e do Espírito Santo. Amém.'
EXPIRASTES = ('Expirastes, Jesus, mas a fonte da vida jorrou para as almas, e abriu-se o oceano da misericórdia para o mundo inteiro. '
              'Ó fonte de vida, insondável misericórdia divina, envolvei o mundo inteiro e derramai-vos sobre nós.')
SANGUE = 'Ó Sangue e Água, que jorrastes do Coração de Jesus como fonte de misericórdia para nós, eu confio em vós.'
PAI = ('Pai nosso que estais nos céus, santificado seja o vosso nome, venha a nós o vosso reino, seja feita a vossa vontade, assim na terra como no céu. '
       'O pão nosso de cada dia nos dai hoje, perdoai-nos as nossas ofensas, assim como nós perdoamos a quem nos tem ofendido, '
       'e não nos deixeis cair em tentação, mas livrai-nos do mal. Amém.')
AVE = ('Ave Maria, cheia de graça, o Senhor é convosco, bendita sois vós entre as mulheres, e bendito é o fruto do vosso ventre, Jesus. '
       'Santa Maria, Mãe de Deus, rogai por nós, pecadores, agora e na hora de nossa morte. Amém.')
CREIO = ('Creio em Deus Pai todo-poderoso, criador do céu e da terra. E em Jesus Cristo, seu único Filho, nosso Senhor, '
         'que foi concebido pelo poder do Espírito Santo, nasceu da Virgem Maria, padeceu sob Pôncio Pilatos, foi crucificado, morto e sepultado. '
         'Desceu à mansão dos mortos, ressuscitou ao terceiro dia, subiu aos céus, está sentado à direita de Deus Pai todo-poderoso, '
         'donde há de vir a julgar os vivos e os mortos. Creio no Espírito Santo, na santa Igreja Católica, na comunhão dos santos, '
         'na remissão dos pecados, na ressurreição da carne, na vida eterna. Amém.')
ETERNO = ('Eterno Pai, eu vos ofereço o Corpo e o Sangue, a Alma e a Divindade de vosso diletíssimo Filho, Nosso Senhor Jesus Cristo, '
          'em expiação dos nossos pecados e dos do mundo inteiro.')
PAIXAO = 'Pela sua dolorosa Paixão, tende misericórdia de nós e do mundo inteiro.'
SANTO = 'Deus Santo, Deus Forte, Deus Imortal, tende piedade de nós e do mundo inteiro.'
FINAL = ('Ó Deus eterno, em quem a misericórdia é infinita e o tesouro da compaixão inesgotável, olhai propício para nós e multiplicai em nós '
         'a vossa misericórdia, para que, nos momentos difíceis, não desesperemos nem desanimemos, mas, com grande confiança, '
         'nos submetamos à vossa santa vontade, que é o próprio Amor e a própria Misericórdia. Amém.')
CONFIO = 'Jesus, eu confio em vós.'

ORD = ['Primeira', 'Segunda', 'Terceira', 'Quarta', 'Quinta']
DEZENAS = [  # (título curto, anúncio, evangelho, referência)
    ('A Agonia no Horto', 'a agonia de Jesus no Horto das Oliveiras',
     'Ajoelhando-se, orava: “Pai, se é de teu agrado, afasta de mim este cálice! Não se faça, todavia, a minha vontade, mas sim a tua”. '
     'Apareceu-lhe então um anjo do céu para confortá-lo. Ele entrou em agonia e orava ainda com mais instância, '
     'e seu suor tornou-se como gotas de sangue a escorrer pela terra.', 'Lc 22,41-44'),
    ('A Flagelação', 'a flagelação de Jesus atado à coluna',
     'Querendo Pilatos satisfazer o povo, soltou-lhes Barrabás e entregou Jesus, depois de açoitado, para que fosse crucificado.', 'Mc 15,15'),
    ('A Coroação de Espinhos', 'a coroação de espinhos',
     'Arrancaram-lhe as vestes e colocaram-lhe um manto escarlate. Depois, trançaram uma coroa de espinhos, meteram-lha na cabeça '
     'e puseram-lhe na mão uma vara. Dobrando os joelhos diante dele, diziam com escárnio: “Salve, rei dos judeus!”.', 'Mt 27,28-29'),
    ('Jesus carrega a Cruz', 'Jesus carregando a Cruz para o Calvário',
     'Levaram então consigo Jesus. Ele próprio carregava a sua cruz para fora da cidade, em direção ao lugar chamado Calvário, '
     'em hebraico Gólgota.', 'Jo 19,16-17'),
    ('A Crucifixão', 'a crucifixão e morte de Jesus',
     'Chegados que foram ao lugar chamado Calvário, ali o crucificaram, como também os ladrões, um à direita e outro à esquerda. '
     'E Jesus dizia: “Pai, perdoa-lhes; porque não sabem o que fazem”.', 'Lc 23,33-34'),
]
LADO = ('Um dos soldados abriu-lhe o lado com uma lança e, imediatamente, saiu sangue e água.', 'Jo 19,34')
REPETE = ('Ó Sangue e Água', 'Pela sua dolorosa Paixão', 'Deus Santo', 'Jesus, eu confio em vós')


def roteiro():
    seg = []
    def add(texto, rot, m=-1, conta=0, var=0, tipo='oracao', ref='', fala=None):
        seg.append(dict(texto=texto, fala=fala or texto, rotulo=rot, mist=m, conta=conta, var=var, tipo=tipo, ref=ref))
    add(SINAL, 'Sinal da Cruz'); add(EXPIRASTES, 'Oração inicial')
    add(LADO[0], 'Evangelho', tipo='evangelho', ref=LADO[1])
    for n in range(3): add(SANGUE, 'Ó Sangue e Água', conta=n + 1, var=n)
    add(PAI, 'Pai-Nosso'); add(AVE, 'Ave-Maria'); add(CREIO, 'Creio')
    k = 0
    for i, (curto, anuncio, ev, ref) in enumerate(DEZENAS):
        add(f'{ORD[i]} dezena. Contemplamos {anuncio}.', f'{ORD[i]} dezena', m=i, tipo='anuncio')
        add(ev, 'Evangelho', m=i, tipo='evangelho', ref=ref, fala=ev.replace('“', '').replace('”', ''))
        add(ETERNO, 'Eterno Pai', m=i, var=i % 2)
        for n in range(10):
            add(PAIXAO, 'Pela sua dolorosa Paixão', m=i, conta=n + 1, var=k % 4); k += 1
    for n in range(3): add(SANTO, 'Deus Santo', m=5, conta=n + 1, var=n)
    add(FINAL, 'Oração final', m=5)
    for n in range(3): add(CONFIO, 'Jesus, eu confio em vós', m=5, conta=n + 1, var=n)
    add(SINAL, 'Sinal da Cruz', m=5)
    json.dump(seg, open(f'roteiro-{NOME}.json', 'w'), ensure_ascii=False, indent=1)
    print(len(seg), 'segmentos;', len({(s['fala'], s['var']) for s in seg}), 'falas diferentes')


def vozes():
    from tts_grok import gerar
    s = json.load(open(f'roteiro-{NOME}.json')); feitos = {}; chars = 0
    for x in s:
        k = (x['fala'], x['var'])
        if k not in feitos:
            feitos[k] = gerar(*k); chars += len(k[0]); print('ok', feitos[k], x['rotulo'], flush=True)
        x['wav'] = feitos[k]
    json.dump(s, open(f'roteiro-{NOME}.json', 'w'), ensure_ascii=False, indent=1)
    print('TUDO_OK caracteres:', chars)


F = '/Users/daniel/catecismo/ios/LiturgiaDiaria/Fontes/'
inria = lambda t: ImageFont.truetype(F + 'inria-serif-400.ttf', t)
inriai = lambda t: ImageFont.truetype(F + 'inria-serif-400-italic.ttf', t)
inriab = lambda t: ImageFont.truetype(F + 'inria-serif-700.ttf', t)
sans = lambda t, i=5: ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', t, index=i)
W, H, PW = 1920, 1080, 1000
PAPEL = (252, 250, 247); TINTA = (26, 22, 18); SUAVE = (110, 100, 92); VERM = (203, 46, 46)


def pintura(i):
    o = Image.open(f'{PASTA}/{PINT[i]}').convert('RGB'); r = PW / H
    if o.width / o.height > r: cw, ch = int(o.height * r), o.height
    else: cw, ch = o.width, int(o.width / r)
    fx, fy = FOCO[i]
    x0 = min(max(0, int(fx * o.width - cw / 2)), o.width - cw); y0 = min(max(0, int(fy * o.height - ch / 2)), o.height - ch)
    return o.crop((x0, y0, x0 + cw, y0 + ch)).resize((PW, H), Image.LANCZOS)


def esp(d, xy, t, f, cor, e):
    x, y = xy
    for c in t: d.text((x, y), c, font=f, fill=cor); x += d.textlength(c, font=f) + e


def quebra(d, t, f, L):
    ls, l = [], ''
    for p in t.split():
        x = (l + ' ' + p).strip()
        if d.textlength(x, font=f) <= L: l = x
        else: ls.append(l); l = p
    return ls + [l]


def quadros():
    s = json.load(open(f'roteiro-{NOME}.json')); os.makedirs(f'quadros-{NOME}', exist_ok=True); cache = {}
    for n, x in enumerate(s):
        m = x['mist']; idx = 0 if m < 0 else (6 if m == 5 else m + 1)
        if idx not in cache: cache[idx] = pintura(idx)
        im = Image.new('RGB', (W, H), PAPEL); im.paste(cache[idx], (0, 0))
        d = ImageDraw.Draw(im); X = PW + 90; L = W - X - 90
        esp(d, (X, 96), 'TERÇO DA MISERICÓRDIA', sans(20), VERM, 5)
        if 0 <= m < 5:
            d.text((X, 140), f'{ORD[m]} dezena', font=inriai(30), fill=SUAVE)
            d.text((X, 182), DEZENAS[m][0], font=inriab(50), fill=TINTA)
        else:
            d.text((X, 170), 'Encerramento' if m == 5 else 'Orações iniciais', font=inriab(50), fill=TINTA)
        d.line((X, 272, X + 70, 272), fill=VERM, width=2)
        rot = {'anuncio': 'Anúncio', 'evangelho': 'Evangelho'}.get(x['tipo'], x['rotulo'])
        esp(d, (X, 305), rot.upper(), sans(19), SUAVE, 4)
        t = x['texto']; tam = 40 if len(t) < 160 else 34 if len(t) < 330 else 29
        f = inriai(tam) if x['tipo'] in ('evangelho', 'anuncio') else inria(tam)
        y = 350; lh = int(tam * 1.42)
        for l in quebra(d, ('“' + t + '”') if x['tipo'] == 'evangelho' else t, f, L): d.text((X, y), l, font=f, fill=TINTA); y += lh
        if x['tipo'] == 'evangelho': d.text((X, y + 8), x['ref'], font=sans(22, 2), fill=SUAVE)
        # contas: 10 na dezena; 3 nas orações repetidas três vezes
        n_contas = 10 if 0 <= m < 5 else 3 if x['rotulo'] in REPETE else 0
        cx, cy, r, g = X, 930, 11, 34
        for i in range(n_contas):
            on = i < x['conta']
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=VERM if on else None, outline=VERM if on else (200, 190, 180), width=2); cx += g
        d.text((X, 1010), 'Liturgia Diária  ·  liturgia.santadoutrina.com', font=sans(18, 2), fill=(160, 150, 140))
        im.save(f'quadros-{NOME}/{n:03d}.jpg', quality=93)
    print('ok', len(s))


if __name__ == '__main__': {'roteiro': roteiro, 'vozes': vozes, 'quadros': quadros}[sys.argv[1]]()
