"""Reel do Evangelho com várias cenas (1080×1920): 4 a 5 pinturas da passagem passam no alto, cada uma com um
zoom bem lento, ligadas por uma dissolvência; embaixo, as frases do Evangelho em Michelangelus no ritmo da voz
(como em montar-reel.py); no fim, o convite: seguir o @liturgia_hoje e visitar liturgia.santadoutrina.com.

Uso:
  python3 scripts/reels/montar-reel-cenas.py AAAA-MM-DD saida.mp4 cena1.jpg[@fx,fy] cena2.jpg … [--trilha t.mp3] [--vol 0.07]

As cenas dividem o Evangelho em partes de duração parecida, sempre na troca de frase. @fx,fy (0 a 1) é o ponto para
onde o zoom caminha (padrão 0.5,0.4). Precisa da Michelangelus em ~/Library/Fonts (licença Microsoft: só no Mac),
de data/liturgia-audio/<dia>/evangelho.mp3|.json e do ffmpeg. Margens seguras do Reels: topo 250, base 380 (y ≤ 1540).
"""
import json, shutil, subprocess, sys, datetime as dt
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent
args = sys.argv[1:]
def opcao(nome, padrao):
    if nome in args: i = args.index(nome); v = args[i + 1]; del args[i:i + 2]; return v
    return padrao
TRILHA = opcao('--trilha', str(AQUI / 'trilha-violino.mp3'))
VOL = float(opcao('--vol', '0.07'))          # 0,07: o dono achou alto acima disso
DIA, SAIDA, cenas_arg = args[0], args[1], args[2:]
if len(cenas_arg) < 2: sys.exit('passe pelo menos 2 cenas')

W, H, ALT, PAINEL_Y = 1080, 1920, 1230, 1248
TRANS = 1.2          # dissolvência entre cenas (s)
ZOOM = 0.08          # quanto cada cena aproxima do começo ao fim (8%)
CTA = 4.8            # segundos do convite final depois da voz
MIC = '/Users/daniel/Library/Fonts/Michelangelus-Regular.ttf'; MICI = '/Users/daniel/Library/Fonts/Michelangelus-Italic.ttf'
mic = lambda t: ImageFont.truetype(MIC, t); mici = lambda t: ImageFont.truetype(MICI, t)
sans = lambda t, i=5: ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', t, index=i)
COR = (38, 31, 26); VERM = (190, 52, 45); BEGE = (226, 217, 205)

aud = json.load(open(RAIZ / f'data/liturgia-audio/{DIA}/evangelho.json'))
mp3 = RAIZ / f'data/liturgia-audio/{DIA}/evangelho.mp3'
dia_lit = json.load(open(RAIZ / f'data/liturgia/{DIA}.json'))
ref = next(l for l in dia_lit['missas'][0]['leituras'] if l['tipo'] == 'evangelho')['referencia']
d0 = dt.date.fromisoformat(DIA)
SEM = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
data_txt = f'{SEM[d0.weekday()]}, {d0.day} de {MES[d0.month - 1]}'

tmp = Path(f'/tmp/reel-cenas-{DIA}'); shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
def esp(d, xy, t, fo, cor, e):
    x, y = xy
    for c in t: d.text((x, y), c, font=fo, fill=cor); x += d.textlength(c, font=fo) + e

# ── Moldura fixa (a mesma do Reel de uma pintura, sem a pintura): degradês, marca, título, data, referência
mold = Image.new('RGBA', (W, H), (0, 0, 0, 0))
mold.paste(Image.new('RGBA', (W, H - ALT), BEGE + (255,)), (0, ALT))
g = Image.linear_gradient('L').resize((W, 640)).point(lambda v: min(255, int(v * 1.05)))
mold.paste(Image.new('RGBA', (W, 640), (14, 9, 6, 255)), (0, ALT - 640), g)
t = Image.linear_gradient('L').rotate(180).resize((W, 420)).point(lambda v: int(v * 0.55))
mold.paste(Image.new('RGBA', (W, 420), (14, 9, 6, 255)), (0, 0), t)
d = ImageDraw.Draw(mold)
logo = Image.open(AQUI / 'logo-L.png').convert('RGBA').resize((80, 79), Image.LANCZOS); mold.alpha_composite(logo, (84, 270))
esp(d, (178, 296), '@liturgia_hoje', sans(30, 2), (232, 224, 214), 2)
esp(d, (84, 950), 'LITURGIA DIÁRIA', sans(24), (236, 84, 76), 9)
d.text((445, 948), data_txt, font=sans(28, 2), fill=(240, 232, 222))
d.text((76, 980), 'Liturgia', font=mic(104), fill=(255, 255, 255)); w = d.textlength('Liturgia ', font=mic(104))
d.text((76 + w, 980), 'de hoje', font=mici(104), fill=(255, 255, 255))
bw = int(d.textlength(ref, font=sans(26, 2))) + 44
d.rectangle((74, 1128, 74 + bw, 1172), outline=(240, 232, 222), width=1); d.text((96, 1134), ref, font=sans(26, 2), fill=(240, 232, 222))
mold.save(tmp / 'moldura.png')

# ── Frases do Evangelho no painel (mesmo desenho de montar-reel.py: a atual, e a próxima esmaecida)
LS = -2.4; LH = 94; X0, W0, Y0 = 98, 884, 1288
def largura(d, t, f): return sum(d.textlength(c, font=f) for c in t) + LS * (len(t) - 1)
def quebra(d, t, f):
    ls = []; l = ''
    for p in t.split():
        x = (l + ' ' + p).strip()
        if largura(d, x, f) <= W0: l = x
        else: ls.append(l); l = p
    return ls + [l]
abre = True; textos = []
for l in aud['linhas']:
    s = ''
    for ch in l['texto']:
        if ch == '"': s += '“' if abre else '”'; abre = not abre
        else: s += ch
    textos.append(s)
dd = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
for i, tx in enumerate(textos):
    for tam in (80, 72, 66, 60, 54):
        f = ImageFont.truetype(MIC, tam); ls = quebra(dd, tx, f); lh = int(LH * tam / 80)
        if len(ls) * lh <= 252: break
    im = Image.new('RGBA', (W, H - PAINEL_Y), (0, 0, 0, 0)); d = ImageDraw.Draw(im); y = Y0 - PAINEL_Y
    for l in ls:
        x = X0 + (W0 - largura(d, l, f)) / 2
        for c in l: d.text((x, y), c, font=f, fill=COR + (255,)); x += d.textlength(c, font=f) + LS
        y += lh
    fim = y
    if i + 1 < len(textos):
        prox = textos[i + 1]; LIMITE = 1600; lp = None
        for tp in (50, 46, 42):
            fp = ImageFont.truetype(MIC, tp); lhp = int(tp * 1.2); cand = quebra(dd, prox, fp)
            while cand and fim + PAINEL_Y + 30 + len(cand) * lhp > LIMITE: cand = cand[:-1]
            if cand and len(cand) == len(quebra(dd, prox, fp)): lp = cand; break
        if lp is None:
            fp = ImageFont.truetype(MIC, 42); lhp = int(42 * 1.2); cand = quebra(dd, prox, fp)
            n = max(1, (LIMITE - (fim + PAINEL_Y + 30)) // lhp); lp = cand[:n]
            if len(cand) > n: lp[-1] = lp[-1].rstrip(',.;: ') + '…'
        if lp:
            yp = fim + 30
            for l in lp:
                x = X0 + (W0 - largura(d, l, fp)) / 2
                for c in l: d.text((x, yp), c, font=fp, fill=COR + (255,)); x += d.textlength(c, font=fp) + LS
                yp += lhp
            a = im.split()[3]; box = (0, fim + 10, W, H - PAINEL_Y)
            a.paste(a.crop(box).point(lambda v: int(v * 0.34)), box); im.putalpha(a)
    im.save(tmp / f'linha-{i:02d}.png')

# ── Convite final no painel
cta = Image.new('RGBA', (W, H - PAINEL_Y), (0, 0, 0, 0)); d = ImageDraw.Draw(cta)
def centro(t, f, y, cor):
    d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=cor)
centro('Siga o @liturgia_hoje', mic(76), 1290 - PAINEL_Y, COR + (255,))
centro('e leia as leituras de cada dia em', mici(48), 1392 - PAINEL_Y, COR + (255,))
centro('liturgia.santadoutrina.com', sans(40, 2), 1462 - PAINEL_Y, VERM + (255,))
cta.save(tmp / 'cta.png')

# ── Tempos: as cenas dividem o Evangelho em partes de duração parecida, na troca de frase
dur = aud['duracao']; fala_fim = dur + 0.6; total = dur + CTA
ini = [l['t0'] for l in aud['linhas']]
N = len(cenas_arg)
cortes = [0.0]
for k in range(1, N):
    alvo = dur * k / N
    cortes.append(min((t for t in ini if t > cortes[-1] + 2), key=lambda t: abs(t - alvo), default=alvo))
cortes.append(total)

cmd = ['ffmpeg', '-y', '-loglevel', 'error']
fc = []
for k, c in enumerate(cenas_arg):
    arq, _, foco = c.partition('@')
    fx, fy = (float(v) for v in foco.split(',')) if foco else (0.5, 0.4)
    ini_k = 0 if k == 0 else cortes[k] - TRANS / 2
    fim_k = total if k == N - 1 else cortes[k + 1] + TRANS / 2
    dk = fim_k - ini_k; frames = int(round(dk * 30))
    cmd += ['-i', arq]
    # amplia 4× antes do zoompan: sem isso o zoom lento "treme" de pixel em pixel
    fc.append(f"[{k}:v]scale={W*4}:{ALT*4}:force_original_aspect_ratio=increase,crop={W*4}:{ALT*4},setsar=1,"
              f"zoompan=z='1+{ZOOM}*on/{frames}':x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*{fy}':d={frames}:s={W}x{ALT}:fps=30,"
              f"trim=duration={dk:.3f},setpts=PTS-STARTPTS,format=yuv420p[c{k}]")
acc = 'c0'; L = cortes[1] + TRANS / 2
for k in range(1, N):
    fc.append(f"[{acc}][c{k}]xfade=transition=fade:duration={TRANS}:offset={cortes[k] - TRANS / 2:.3f}[x{k}]")
    acc = f'x{k}'
fc.append(f"[{acc}]pad={W}:{H}:0:0:color=0x{BEGE[0]:02x}{BEGE[1]:02x}{BEGE[2]:02x},format=rgba[fundo]")
n_in = N
cmd += ['-loop', '1', '-framerate', '30', '-t', f'{total:.3f}', '-i', str(tmp / 'moldura.png')]; im_mold = n_in; n_in += 1
fc.append(f'[fundo][{im_mold}:v]overlay=0:0[b0]')
atual = 'b0'
for i, t0 in enumerate(ini):
    t1 = (ini[i + 1] + 0.25) if i + 1 < len(ini) else fala_fim
    cmd += ['-loop', '1', '-framerate', '30', '-t', f'{t1 - t0:.3f}', '-i', str(tmp / f'linha-{i:02d}.png')]
    fc.append(f'[{n_in}:v]format=rgba,fade=t=in:st=0:d=0.22:alpha=1,fade=t=out:st={max(0, t1 - t0 - 0.22):.3f}:d=0.22:alpha=1,setpts=PTS+{t0:.3f}/TB[l{i}]')
    fc.append(f'[{atual}][l{i}]overlay=0:{PAINEL_Y}:eof_action=pass[b{i + 1}]'); atual = f'b{i + 1}'; n_in += 1
cmd += ['-loop', '1', '-framerate', '30', '-t', f'{total - fala_fim:.3f}', '-i', str(tmp / 'cta.png')]
fc.append(f'[{n_in}:v]format=rgba,fade=t=in:st=0:d=0.5:alpha=1,setpts=PTS+{fala_fim:.3f}/TB[cta]')
fc.append(f'[{atual}][cta]overlay=0:{PAINEL_Y}:eof_action=pass,format=yuv420p[v]'); n_in += 1
cmd += ['-i', str(mp3), '-stream_loop', '-1', '-i', TRILHA]
fc += [f'[{n_in + 1}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={VOL},afade=t=in:st=0:d=3,afade=t=out:st={total - 4:.2f}:d=4[m]',
       f'[{n_in}:a]adelay=500|500,apad[v0]',
       '[v0][m]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[a]']
cmd += ['-filter_complex', ';'.join(fc), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', '30',
        '-c:a', 'aac', '-b:a', '160k', '-t', f'{total:.3f}', '-movflags', '+faststart', SAIDA]
subprocess.run(cmd, check=True)
print('ok', DIA, f'{total:.1f}s', 'cortes', [round(c, 1) for c in cortes])
