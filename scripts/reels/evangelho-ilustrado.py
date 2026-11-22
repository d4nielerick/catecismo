"""Reel do Evangelho ilustrado (domingos): várias pinturas seguindo o texto narrado, com a câmera
avançando em Z para o ponto de interesse de cada uma, a pintura seguinte entrando numa pincelada de
tinta (ink wipe) com push in e motion blur, e o lettering das frases aparecendo junto com a voz.

  python3.14 scripts/reels/evangelho-ilustrado.py roteiro.json saida.mp4

roteiro.json:
{ "dia": "AAAA-MM-DD", "ate": 19.0,                      (ate: opcional, corta o vídeo)
  "rotulo": ["EVANGELHO DO DOMINGO", "Mt 25,31-46 · Cristo Rei"],
  "cenas": [{ "imagem": "a.jpg", "t0": 0.0, "foco": [0.5, 0.5], "alvo": [0.5, 0.25] }, ...],
  "textos": [{ "linha": 2, "itens": [
      { "txt": "Quando o Filho do Homem", "estilo": "serif", "tam": 66, "y": 1250 },
      { "txt": "glória,", "estilo": "italico", "tam": 300, "y": 1520, "cor": "OURO", "chave": true } ] }, ...] }

Tempos em segundos do VÍDEO (a voz entra com 0,5 s de atraso). `foco` corta a pintura para 9:16;
`alvo` é para onde a câmera avança. Cada item de texto aparece quando a voz diz a palavra (o tempo
sai de data/liturgia-audio/<dia>/evangelho.json, linha `linha`, proporcional aos caracteres); um
bloco some quando começa o seguinte. A cena sem texto (o anúncio do Evangelho) fica só com a pintura.
O véu sob o texto é escuro ou claro conforme o brilho da pintura. Só numpy e Pillow; quadros direto
para o ffmpeg. Áudio: a voz do dia com a trilha de violino por baixo, como nos Reels diários.
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
FONTES = RAIZ / 'scripts' / 'fontes'
W, H, FPS = 1080, 1920, 30
ATRASO = 0.5           # a voz entra aqui
# área segura do Reels: fora dela ficam o cabeçalho, a legenda, o nome e os botões da direita
SEG_X0, SEG_X1, SEG_Y0, SEG_Y1 = 70, 950, 250, 1450
LARG_MAX = SEG_X1 - SEG_X0 - 2 * max(0, 540 - (SEG_X0 + SEG_X1) / 2)   # linha centrada em 540 que cabe na área
TRANS = 1.1            # duração da pincelada (s)
ZOOM_POR_S = 0.012     # avanço contínuo em Z (escala por segundo)
EMPURRAO = 0.2         # push in de cada cena nova durante a pincelada
roteiro = json.loads(Path(sys.argv[1]).read_text()); saida = sys.argv[2]
dia = roteiro['dia']
mp3 = (Path(sys.argv[1]).parent / roteiro['audio']) if roteiro.get('audio') else RAIZ / 'data' / 'liturgia-audio' / dia / 'evangelho.mp3'   # `audio`: outra narração (mp3 + json ao lado)
linhas = json.loads(mp3.with_suffix('.json').read_text())['linhas']
dur_audio = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)]))
total = min(roteiro.get('ate', 1e9), dur_audio + 1.2 + roteiro.get('extra', 0))   # `extra`: segundos depois da voz (CTA final)
cenas = roteiro['cenas']

# ---------- pinturas ----------
def carregar(c):
    """Pintura cortada para 9:16 em torno do foco, em resolução maior que a tela (o avanço não perde nitidez)."""
    im = Image.open(c['imagem']).convert('RGB')
    fx, fy = c.get('foco', [0.5, 0.5])
    alvo = 9 / 16
    if im.width / im.height > alvo:
        w = im.height * alvo; x0 = min(max(0, fx * im.width - w / 2), im.width - w); caixa = (x0, 0, x0 + w, im.height)
    else:
        h = im.width / alvo; y0 = min(max(0, fy * im.height - h / 2), im.height - h); caixa = (0, y0, im.width, y0 + h)
    return np.asarray(im.crop(tuple(map(int, caixa))).resize((int(W * 1.35), int(H * 1.35)), Image.LANCZOS), dtype=np.float32)

T_ATUAL = 0.0
FOLGA_WIGGLE = 1.05    # a câmera nunca mostra a pintura inteira: sobra margem para o balanço

def wiggle(t):
    """Balanço de câmera na mão, lento: deslocamento (px da tela) e giro (graus), soma de senoides."""
    dx = 9 * np.sin(2 * np.pi * 0.11 * t + 0.7) + 5 * np.sin(2 * np.pi * 0.23 * t + 2.1) + 2 * np.sin(2 * np.pi * 0.41 * t + 4.0)
    dy = 7 * np.sin(2 * np.pi * 0.13 * t + 1.9) + 4 * np.sin(2 * np.pi * 0.29 * t + 0.3) + 2 * np.sin(2 * np.pi * 0.47 * t + 5.1)
    rot = 0.28 * np.sin(2 * np.pi * 0.09 * t + 3.3) + 0.12 * np.sin(2 * np.pi * 0.19 * t + 1.2)
    return dx, dy, rot

def enquadrar(arr, escala, alvo=(0.5, 0.5)):
    """Recorte que corresponde a `escala` (1 = quase a pintura inteira); quanto mais a câmera entra, mais
    o centro caminha para o `alvo` (o ponto de interesse). Por cima, o balanço lento da câmera (wiggle)."""
    escala = max(1.0, escala) * FOLGA_WIGGLE
    h, w = arr.shape[:2]
    cw, ch = w / escala, h / escala
    k = min(1.0, (escala / FOLGA_WIGGLE - 1) / 0.3)
    cx = (0.5 + (alvo[0] - 0.5) * k) * w; cy = (0.5 + (alvo[1] - 0.5) * k) * h
    cx = min(max(cw / 2, cx), w - cw / 2); cy = min(max(ch / 2, cy), h - ch / 2)
    dx, dy, rot = wiggle(T_ATUAL)
    s = cw / W   # pixels da pintura por pixel da tela
    cx += dx * s; cy += dy * s
    a = np.radians(rot); ca, sa = np.cos(a) * s, np.sin(a) * s
    # tela (u, v) -> pintura: gira em torno do centro da tela e escala
    coef = (ca, -sa, cx - ca * W / 2 + sa * H / 2, sa, ca, cy - sa * W / 2 - ca * H / 2)
    im = PIL_DE[id(arr)].transform((W, H), Image.AFFINE, coef, resample=Image.BILINEAR)
    return np.asarray(im, dtype=np.float32)

def borrado(arr, escalas, alvo):
    """Motion blur radial: média de alguns recortes em escalas vizinhas (rastro do movimento em Z)."""
    return sum(enquadrar(arr, e, alvo) for e in escalas) / len(escalas)

# ---------- pincelada (ink wipe) ----------
def ruido(escalas=(6, 12, 24, 48), seed=0):
    r = np.random.default_rng(seed); acc = np.zeros((H, W), np.float32); amp, soma = 1.0, 0.0
    for s in escalas:
        g = r.random((s * 16 // 9 + 2, s + 2)).astype(np.float32)
        acc += amp * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
        soma += amp; amp *= 0.5
    return acc / soma

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)

def vruido(u, v, seed):
    r = np.random.default_rng(seed)
    iu, iv = np.floor(u).astype(np.int64), np.floor(v).astype(np.int64)
    fu, fv = u - iu, v - iv
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    iu -= iu.min(); iv -= iv.min()
    g = r.random((iu.max() + 2, iv.max() + 2)).astype(np.float32)
    a, b, c, d = g[iu, iv], g[iu + 1, iv], g[iu, iv + 1], g[iu + 1, iv + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv

def campo_pincel(seed, angulo):
    """Campo da pincelada (0..1 na direção do movimento) e as fibras do pincel (riscos paralelos ao movimento)."""
    ca, sa = np.cos(np.radians(angulo)), np.sin(np.radians(angulo))
    x, y = XX / H, YY / H
    ao_longo, atraves = x * ca + y * sa, -x * sa + y * ca
    fibras = sum(vruido(ao_longo * k1, atraves * k2, seed + j) * w for j, (k1, k2, w) in enumerate([(2, 70, 0.5), (4, 160, 0.3), (8, 340, 0.2)]))
    mancha = vruido(ao_longo * 3, atraves * 3, seed + 9)
    c = ao_longo + 0.16 * (fibras - 0.5) + 0.14 * (mancha - 0.5)
    c = (c - c.min()) / (c.max() - c.min())
    return c, fibras, (ca, sa)

def pincel(campo, p):
    lim = -0.12 + p * 1.26
    m = np.clip((lim - campo) / 0.025 + 0.5, 0, 1)
    faixa = np.exp(-((campo - lim) / 0.09) ** 2)
    return m, faixa

def arrastar(img, desloc, direcao):
    ca, sa = direcao
    xs = np.clip((XX - desloc * ca).astype(np.int32), 0, W - 1)
    ys = np.clip((YY - desloc * sa).astype(np.int32), 0, H - 1)
    return img[ys, xs]

# ---------- lettering ----------
CORES = {'escuro': dict(BR=(255, 248, 236), OURO=(240, 200, 120), CREME=(226, 206, 170), APAGADO=(150, 128, 104)),
         'claro': dict(BR=(44, 30, 20), OURO=(150, 40, 32), CREME=(120, 92, 64), APAGADO=(140, 116, 92))}
VEU = {'escuro': np.array([10, 6, 4], np.float32), 'claro': np.array([248, 242, 231], np.float32)}

def fonte(estilo, tam):
    if estilo == 'italico': return ImageFont.truetype(str(FONTES / 'InstrumentSerif-Italic.ttf'), tam)
    if estilo == 'serif': return ImageFont.truetype(str(FONTES / 'InstrumentSerif-Regular.ttf'), tam)
    f = ImageFont.truetype(str(FONTES / 'Inter-Variable.ttf'), tam)
    try: f.set_variation_by_axes([600 if estilo == 'caixa' else 450])
    except Exception: pass
    return f

def sprite(txt, estilo, tam, cor, tema, track=0):
    """Texto num RGBA justo (com folga para o desfoque e a sombra)."""
    f = fonte(estilo, tam); d0 = ImageDraw.Draw(Image.new('L', (1, 1)))
    larg = sum(d0.textlength(c, font=f) for c in txt) + track * (len(txt) - 1) if track else d0.textlength(txt, font=f)
    asc, desc = f.getmetrics(); folga = 60
    im = Image.new('RGBA', (int(larg) + 2 * folga, asc + desc + 2 * folga), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if track:
        x = folga
        for c in txt: d.text((x, folga), c, font=f, fill=cor); x += d.textlength(c, font=f) + track
    else:
        d.text((folga, folga), txt, font=f, fill=cor)
    if tema == 'escuro':   # sombra macia, para descolar da pintura
        a = im.split()[3].filter(ImageFilter.GaussianBlur(12)).point(lambda v: int(v * 0.55))
        base = Image.merge('RGBA', (Image.new('L', im.size, 0),) * 3 + (a,)); base.alpha_composite(im); im = base
    return im, folga + asc   # sprite e a linha de base dentro dele

import re
def achar(texto, w, desde=0):
    """Posição de `w` como palavra inteira em `texto` (o "e" não casa dentro de "eu"); -1 se não há."""
    m = re.compile(r'(?<!\w)' + re.escape(w.lower().rstrip(',.;:?!')) + r'(?!\w)').search(texto.lower(), max(desde, 0))
    return m.start() if m else -1

def tempo_da_palavra(k, txt, desde=0):
    """Quando a voz diz `txt` na linha k (proporcional aos caracteres), em segundos do vídeo."""
    l = linhas[k]; s = l['texto']
    i = max(achar(s, txt, desde), 0)
    return ATRASO + l['t0'] + (l['t1'] - l['t0']) * i / max(1, len(s)) - 0.2   # um pouco antes da voz: o olho chega junto

def tema_da(arr):
    return 'claro' if float((arr @ np.array([0.3, 0.59, 0.11], np.float32)).mean()) > 135 else 'escuro'

def facil(x): x = min(1.0, max(0.0, x)); return 1 - (1 - x) ** 3

# ---------- montagem ----------
imgs = [carregar(c) for c in cenas]
PIL_DE = {id(a): Image.fromarray(a.astype(np.uint8)) for a in imgs}   # a conversão é cara: uma vez só
temas = [tema_da(enquadrar(a, 1.0)) for a in imgs]
ANGULOS = [-14, 196, 8, 168, -24, 188]
campos = [campo_pincel(100 + 7 * i, ANGULOS[i % len(ANGULOS)]) for i in range(len(cenas))]
inicios = [c['t0'] for c in cenas] + [total + 99]
grao = (ruido((96, 192), seed=3) - 0.5) * 10   # textura fixa de tela
_r = np.random.default_rng(11)
grao_filme = (_r.standard_normal((H + 64, W + 64)).astype(np.float32)) * 5     # grão de filme, muda a cada quadro
_d = np.hypot((XX - W / 2) / (W * 0.62), (YY - H / 2) / (H * 0.6))
vinheta = np.clip(_d - 0.55, 0, 1) ** 1.6                                         # cantos escurecem
vaza = np.exp(-(((XX - W * 0.15) / (W * 0.55)) ** 2 + ((YY - H * 0.12) / (H * 0.32)) ** 2))   # vazamento de luz quente no alto

def overlay(quadro, t, q):
    """Película: vinheta que respira, vazamento de luz quente que pulsa devagar, poeira e grão."""
    v = vinheta * (0.55 + 0.05 * np.sin(2 * np.pi * 0.17 * t))
    quadro *= (1 - v)[..., None]
    luz = (0.07 + 0.05 * np.sin(2 * np.pi * 0.07 * t + 1) + 0.02 * np.sin(2 * np.pi * 0.31 * t)) * vaza
    quadro += (np.array([255, 170, 90], np.float32) - quadro) * luz[..., None] * 0.6   # screen aproximado
    rq = np.random.default_rng(1000 + q)
    for _ in range(rq.poisson(2.2)):   # poeira: pontinhos claros e escuros que piscam um quadro
        x, y, r = rq.integers(20, W - 20), rq.integers(20, H - 20), rq.uniform(1.0, 2.6)
        y0, y1, x0, x1 = y - 5, y + 6, x - 5, x + 6
        m = np.exp(-((XX[y0:y1, x0:x1] - x) ** 2 + (YY[y0:y1, x0:x1] - y) ** 2) / (r * r))[..., None] * rq.uniform(0.25, 0.6)
        cor = 235 if rq.random() < 0.6 else 25
        quadro[y0:y1, x0:x1] = quadro[y0:y1, x0:x1] * (1 - m) + cor * m
    ox, oy = rq.integers(0, 64), rq.integers(0, 64)
    return grao_filme[oy:oy + H, ox:ox + W]
cena_em = lambda t: max(k for k in range(len(cenas)) if inicios[k] <= t + 1e-6)

blocos = []
for b in roteiro.get('textos', []):
    itens = []
    for it in b['itens']:
        t = it.get('t') or tempo_da_palavra(it.get('linha', b['linha']), it['txt'])
        itens.append({**it, 't': t, 't_fixo': 't' in it})
    blocos.append({'itens': itens, 'ini': min(i['t'] for i in itens), 'linha': b['linha'], 'veu': b.get('veu')})   # `veu` no bloco: força própria
for j, b in enumerate(blocos):
    b['fim'] = blocos[j + 1]['ini'] - 0.1 if j + 1 < len(blocos) else total
    tema = temas[cena_em(b['ini'])]
    cursor = {}   # onde cada linha da voz já foi lida neste bloco: o item seguinte procura dali em diante
    for it in b['itens']:
        cor = CORES[tema][it.get('cor', 'BR' if it['estilo'] != 'caixa' else 'CREME')]
        kl = it.get('linha', b.get('linha'))
        track = 8 if it['estilo'] == 'caixa' else 0
        if it.get('chave'):
            while True:   # palavra-chave larga demais diminui até caber
                spr = sprite(it['txt'], it['estilo'], it['tam'], cor, tema, track)[0]
                if spr.width - 120 <= LARG_MAX * 0.92 or it['tam'] < 60: break
                it['tam'] = int(it['tam'] * 0.94)
            if kl is not None:
                p0 = achar(linhas[kl]['texto'], it['txt'].split()[0], cursor.get(kl, 0))
                if p0 >= 0:
                    if not it.get('t_fixo'): it['t'] = tempo_da_palavra(kl, it['txt'].split()[0], cursor.get(kl, 0))
                    cursor[kl] = p0 + len(it['txt'])
            it['pecas'] = [(spr, W / 2, it['t'])]
            continue
        # palavra por palavra: cada uma entra quando a voz a diz, no lugar que ocupa na linha
        f = fonte(it['estilo'], it['tam']); d0 = ImageDraw.Draw(Image.new('L', (1, 1)))
        larg = lambda x: sum(d0.textlength(c, font=f) for c in x) + track * len(x) if track else d0.textlength(x, font=f)
        palavras = it['txt'].split()
        while True:   # linha larga demais diminui até caber
            esp = larg(' '); total_l = sum(larg(w) for w in palavras) + esp * (len(palavras) - 1)
            if total_l <= LARG_MAX or it['tam'] < 24: break
            it['tam'] = int(it['tam'] * 0.95); f = fonte(it['estilo'], it['tam'])
        x = W / 2 - total_l / 2; k = it.get('linha', b.get('linha')); pos = 0; it['pecas'] = []
        texto_l = linhas[k]['texto'].lower() if k is not None else ''
        ini = achar(texto_l, palavras[0], cursor.get(k, 0)) if k is not None else -1
        for j, w in enumerate(palavras):
            if 't' in it and it['t'] is not None and it.get('t_fixo'):
                tw = it['t'] + 0.12 * j
            else:
                achou = achar(texto_l, w, max(ini, 0) + pos)
                tw = tempo_da_palavra(k, w, max(ini, 0) + pos) if achou >= 0 else it['t'] + 0.12 * j
                if achou >= 0: pos = achou - max(ini, 0) + len(w)
            lw = larg(w)
            it['pecas'].append((sprite(w, it['estilo'], it['tam'], cor, tema, track)[0], x + lw / 2, tw))
            x += lw + esp
        if k is not None and ini >= 0: cursor[k] = max(ini, 0) + pos
    b['tema'] = tema
    b['topo'] = min(it['y'] for it in b['itens']) - 90
    for it in b['itens']:
        meia = it['tam'] * 0.55
        if it['y'] - meia < SEG_Y0 or it['y'] + meia > SEG_Y1:
            print(f"aviso: '{it['txt']}' (y {it['y']}, {it['tam']} px) sai da área segura do Reels ({SEG_Y0}-{SEG_Y1})", file=sys.stderr)

# ordem de leitura: de cima para baixo, da esquerda para a direita; nenhuma palavra pode entrar antes da anterior
for b in blocos:
    seq = sorted(((it['y'], x, tw, spr) for it in b['itens'] for spr, x, tw in it['pecas']), key=lambda e: (e[0], e[1]))
    nomes = [(w['txt'] if w.get('chave') else None) for w in b['itens']]
    for (y0, x0, t0_, _), (y1, x1, t1_, _) in zip(seq, seq[1:]):
        if t1_ < t0_ - 0.01:
            print(f"aviso de ordem: bloco da linha {b.get('linha')}: palavra em y {y1} entra em {t1_:.2f}s, antes da anterior (y {y0}, {t0_:.2f}s)", file=sys.stderr)
if os.environ.get('SO_CHECAR'): sys.exit(0)

marca = None   # marca d'água: o L da Liturgia no canto de cima, à direita, dentro da área segura
if roteiro.get('marca'):
    lg = Image.open(RAIZ / roteiro['marca']).convert('RGBA'); lg = lg.resize((64, round(64 * lg.height / lg.width)), Image.LANCZOS)
    if temas[0] == 'claro': lg = Image.merge('RGBA', (*(Image.new('L', lg.size, 40),) * 3, lg.split()[3]))
    marca = lg
rotulo = None
if roteiro.get('rotulo'):
    r1, r2 = roteiro['rotulo']; tema0 = temas[0]
    rotulo = (sprite(r1, 'caixa', 24, CORES[tema0]['BR'], tema0, 5), sprite(r2, 'inter', 26, CORES[tema0]['CREME'], tema0))

def colar(fundo, spr, x, y, alfa):
    """Compõe um sprite RGBA (já transformado) no quadro float, com opacidade extra `alfa`."""
    if alfa <= 0.003: return
    a = np.asarray(spr, np.float32)
    x, y = int(round(x)), int(round(y)); h, w = a.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    s = a[y0 - y:y1 - y, x0 - x:x1 - x]; m = s[..., 3:4] / 255 * alfa
    fundo[y0:y1, x0:x1] = fundo[y0:y1, x0:x1] * (1 - m) + s[..., :3] * m

def desenhar_texto(quadro, t):
    # véu: degradê de baixo para cima, opaco onde está o texto; entra com o 1º item e sai com o bloco
    veu, b_veu = 0.0, None
    for b in blocos:
        v = min(facil((t - b['ini'] + 0.5) / 0.6), 1 - facil((t - b['fim']) / 0.5))
        if v > veu: veu, b_veu = v, b
    if veu > 0:   # cada bloco escurece só a partir de um pouco acima do seu texto; força por cena (`veu`)
        topo = b_veu['topo']; forca = b_veu['veu'] or cenas[cena_em(b_veu['ini'])].get('veu', 0.55)
        m = np.clip((YY[:, :1] - (topo - 100)) / 220, 0, 1); m = m * m * (3 - 2 * m) * forca * veu
        quadro[:] = quadro * (1 - m[..., None]) + VEU[b_veu['tema']] * m[..., None]
    for b in blocos:
        sai = facil((t - b['fim']) / 0.4)
        if sai >= 1 or t < b['ini'] - 0.01: continue
        for it in b['itens']:
            for spr0, cx, tp in it['pecas']:
                e = (t - tp) / (0.6 if it.get('chave') else 0.4)
                if e <= 0: continue
                e = facil(e); spr = spr0
                if it.get('chave'):   # palavra-chave: entra maior e desfocada, assenta
                    esc = 1.12 - 0.12 * e; borr = 14 * (1 - e) + 6 * sai
                    spr = spr.resize((int(spr.width * esc), int(spr.height * esc)), Image.BICUBIC)
                else:                 # as outras: sobem um pouco e saem do desfoque
                    borr = 7 * (1 - e) + 5 * sai
                if borr > 0.4: spr = spr.filter(ImageFilter.GaussianBlur(borr))
                sobe = (26 if it.get('chave') else 16) * (1 - e) - 10 * sai
                colar(quadro, spr, cx - spr.width / 2, it['y'] - spr.height / 2 + sobe, e * (1 - sai))
    if rotulo:
        a = facil((t - 0.6) / 0.8) * (1 - facil((t - (total - 0.6)) / 0.6))
        (s1, _), (s2, _) = rotulo
        colar(quadro, s1, 84 - 60, 250 - 60, a); colar(quadro, s2, 84 - 60, 286 - 60, a)
    if marca:
        colar(quadro, marca, SEG_X1 - marca.width + 10, 238, 0.5 * facil((t - 0.6) / 0.8))

arq_trilha = (Path(sys.argv[1]).parent / roteiro['trilha']) if roteiro.get('trilha') else RAIZ / 'scripts' / 'reels' / 'trilha-violino.mp3'
def lufs(arq):   # sonoridade integrada (EBU R128) de um arquivo
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])
# A trilha fica FOLGA dB abaixo da voz, qualquer que seja a música (o edit de Cristo Rei, com vol_trilha 0,28,
# ficou só 3 dB abaixo e o dono achou alto; os Reels diários ficam ~15 dB abaixo). `vol_trilha` no roteiro força um valor.
FOLGA = float(roteiro.get('folga_trilha', 15))
vol_trilha = roteiro.get('vol_trilha') or round(10 ** ((lufs(mp3) - FOLGA - lufs(arq_trilha)) / 20), 4)
print(f'trilha {arq_trilha.name}: volume {vol_trilha}', file=sys.stderr)
audio = ['-i', str(mp3), '-stream_loop', '-1', '-i', str(arq_trilha)]   # `trilha`: outra música; `folga_trilha` ou `vol_trilha`: nível
fc = (f'[2:a]atrim=0:{total},asetpts=PTS-STARTPTS,volume={vol_trilha},afade=t=in:st=0:d=3,afade=t=out:st={total - 3:.2f}:d=3[m];'
      f'[1:a]adelay={int(ATRASO * 1000)}|{int(ATRASO * 1000)},apad[v0];[v0][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11,alimiter=limit=0.95,atrim=0:{total}[a]')
ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
                      + audio + ['-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-t', f'{total}', '-movflags', '+faststart', saida], stdin=subprocess.PIPE)
for q in range(int(total * FPS)):
    t = q / FPS
    T_ATUAL = t
    i = cena_em(t)
    def esc(k):
        e = min(1.0, max(0.0, (t - inicios[k]) / TRANS))
        return 1.0 + ZOOM_POR_S * (t - inicios[k]) + (EMPURRAO * (1 - (1 - e) ** 3) if k else 0)
    alvo = cenas[i].get('alvo', (0.5, 0.5))
    if i > 0 and t - inicios[i] < TRANS:
        p = (t - inicios[i]) / TRANS
        p = p * p * (3 - 2 * p)
        # a nova entra com rastro de movimento que some quando assenta; a anterior acelera para dentro
        ei = esc(i); veloc = (1 - p) * 0.045
        quadro = borrado(imgs[i], [ei * (1 + veloc * k) for k in range(3)], alvo)
        ea = esc(i - 1) * (1 + 0.9 * p ** 1.3)
        anterior = borrado(imgs[i - 1], [ea * (1 + 0.03 * k * p) for k in range(3)], cenas[i - 1].get('alvo', (0.5, 0.5)))
        campo, fibras, direcao = campos[i]
        m, faixa = pincel(campo, p)
        desloc = faixa * (40 + 140 * fibras) * (1 - 0.5 * p)
        anterior, quadro = arrastar(anterior, desloc, direcao), arrastar(quadro, desloc * 0.6, direcao)
        m = m[..., None]
        quadro = anterior * (1 - m) + quadro * m
        brilho = (faixa * np.clip((fibras - 0.45) * 3, 0, 1) * 0.22)[..., None]
        quadro = quadro * (1 - brilho) + np.array([244, 236, 222], np.float32) * brilho
    else:
        quadro = enquadrar(imgs[i], esc(i), alvo)
        if i == 0 and t < 0.9: quadro *= t / 0.9   # abre do escuro
    quadro = np.ascontiguousarray(quadro)
    gf = overlay(quadro, t, q)
    desenhar_texto(quadro, t)
    quadro = np.clip(quadro + (grao + gf)[..., None], 0, 255)
    ff.stdin.write(quadro.astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
print('ok', saida, f'{total:.1f} s', len(cenas), 'cenas', 'temas', temas)
