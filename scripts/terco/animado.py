"""Terço animado (horizontal 1920×1080, 30 fps): pintura com zoom lento e dissolvência entre cenas, abertura de cena
em tela cheia, painel que desliza, texto que acende junto com a voz, terço desenhado com a conta atual brilhando e
raios da Divina Misericórdia pulsando. Guia (Grok leo) + coro nas respostas (coro.py).

  python3 animado.py teste      # ~45 s: abertura + 1ª dezena com 3 contas -> teste-animado.mp4
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from tts_grok import gerar
from coro import coro
import misericordia as M

W, H, FPS, SR = 1920, 1080, 30, 48000
VOL_CORO = float(os.environ.get('VOL_CORO', '0.62'))   # pico da resposta (dueto); a voz que puxa fica em 0,68
PW = 1000                      # largura da pintura com o painel aberto
PAPEL = (252, 250, 247); TINTA = (26, 22, 18); APAGADO = (196, 188, 178); SUAVE = (110, 100, 92); VERM = (203, 46, 46)
F = M.F
fonte = lambda nome, t: ImageFont.truetype(F + nome, t)
sans = lambda t, i=5: ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', t, index=i)
ease = lambda x: 0.5 - 0.5 * math.cos(math.pi * min(1, max(0, x)))

# ── pinturas ────────────────────────────────────────────────────────────────
class Pintura:
    def __init__(self, arq, foco, raios=False):
        o = Image.open(arq).convert('RGB')
        lado = 2300 if o.width >= o.height else 1500
        o = o.resize((lado, round(o.height * lado / o.width)), Image.LANCZOS)
        self.im = o; self.arr = np.asarray(o).astype(np.float32); self.foco = foco
        cob = max(W / o.width, H / o.height)
        bg = o.resize((round(o.width * cob), round(o.height * cob)))
        x0 = (bg.width - W) // 2; y0 = int((bg.height - H) * foco[1])
        self.fundo = Image.eval(bg.crop((x0, y0, x0 + W, y0 + H)).filter(ImageFilter.GaussianBlur(40)), lambda v: int(v * 0.35))
        self.raios = None
        if raios:   # cone que sai do coração e desce; peso maior no que já é claro ou vermelho
            h, w = self.arr.shape[:2]; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
            cx, cy = 0.535 * w, 0.305 * h
            dx, dy = xx - cx, yy - cy; ang = np.degrees(np.arctan2(dx, np.maximum(dy, 1)))
            dist = np.sqrt(dx ** 2 + dy ** 2) / h
            cone = np.clip((34 - np.abs(ang + 3)) / 10, 0, 1) * (dy > 0) * np.clip(1 - dist / 0.62, 0, 1)
            a = self.arr; lum = a.mean(2) / 255; verm = np.clip((a[..., 0] - a[..., 2]) / 120, 0, 1)
            self.raios = (cone * np.clip(lum ** 1.5 + verm * 0.6, 0, 1)).astype(np.float32)
            self.dist = dist.astype(np.float32)

    def fonte_em(self, t):
        if self.raios is None: return self.im
        # brilho que pulsa e uma onda de luz que desce pelos raios
        onda = 0.5 + 0.5 * np.sin(self.dist * 26 - t * 2.2)
        g = self.raios * (0.22 + 0.10 * math.sin(t * 1.3) + 0.18 * onda)
        out = self.arr + g[..., None] * (255 - self.arr) * 0.9
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

    def recorte(self, img, w, h, zoom, alvo_x):
        """Cobre w×h com a pintura (zoom ≥ 1), com o foco da pintura na coordenada alvo_x da área."""
        s = max(w / img.width, h / img.height) * zoom
        cw, ch = w / s, h / s
        fx, fy = self.foco[0] * img.width, self.foco[1] * img.height
        x0 = min(max(0, fx - alvo_x / s), img.width - cw); y0 = min(max(0, fy - ch / 2), img.height - ch)
        return img.resize((w, h), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))

    def cheio(self, t, zoom):   # fundo desfocado + pintura inteira na altura
        img = self.fonte_em(t); quadro = self.fundo.copy()
        s = H / img.height * zoom; w = round(img.width * s)
        if w >= W: quadro.paste(self.recorte(img, W, H, zoom, W / 2), (0, 0)); return quadro
        p = img.resize((w, round(img.height * s)), Image.LANCZOS)
        y0 = (p.height - H) // 2
        borda = np.minimum(np.arange(w), np.arange(w)[::-1]).astype(np.float32) / 90
        m = Image.fromarray((np.clip(borda, 0, 1) ** 1.5 * 255).astype(np.uint8)[None].repeat(H, 0))
        quadro.paste(p.crop((0, y0, w, y0 + H)), ((W - w) // 2, 0), m); return quadro

    def painel(self, t, zoom):
        img = self.fonte_em(t); quadro = Image.new('RGB', (W, H), PAPEL)
        quadro.paste(self.recorte(img, PW, H, zoom, PW / 2), (0, 0)); return quadro

# ── terço desenhado ─────────────────────────────────────────────────────────
ORDEM = ['cruz', 'p0', 'p1', 'p2'] + [f'g{k}_{n}' for k in range(5) for n in range(11)] + ['fim']
def posicoes(cx, cy, r):
    pos = {}; gap = 14
    for s in range(55):
        th = math.radians(90 + gap + s * (360 - 2 * gap) / 54)
        pos[f'g{s // 11}_{s % 11}'] = (cx + r * math.cos(th), cy + r * math.sin(th))
    my = cy + r
    pos['p0'] = (cx, my + 26); pos['p1'] = (cx, my + 46); pos['p2'] = (cx, my + 62); pos['cruz'] = (cx, my + 92)
    return pos, (cx, my + 6)

def desenha_terco(img, atual, t, cx=170, cy=820, r=100, acesa=True):
    d = ImageDraw.Draw(img); pos, med = posicoes(cx, cy, r)
    ia = ORDEM.index(atual) if atual in ORDEM else -1
    pts = [pos[f'g{s // 11}_{s % 11}'] for s in range(55)]
    d.line([med] + pts + [med], fill=(215, 205, 195), width=1)
    d.line([med, pos['p0'], pos['p1'], pos['p2'], (cx, pos['cruz'][1] - 14)], fill=(215, 205, 195), width=1)
    brilho = Image.new('L', img.size, 0); db = ImageDraw.Draw(brilho)
    for i, k in enumerate(ORDEM[:-1]):
        x, y = pos[k]; grande = k == 'p0' or k.endswith('_0')
        rr = 7.5 if grande else 4.8
        feito, agora = i < ia, i == ia and acesa
        if k == 'cruz':
            cor = VERM if (feito or agora) else (185, 175, 165)
            d.line((x, y - 16, x, y + 16), fill=cor, width=3); d.line((x - 10, y - 7, x + 10, y - 7), fill=cor, width=3)
        else:
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=VERM if (feito or agora) else PAPEL,
                      outline=VERM if (feito or agora) else (190, 180, 170), width=2)
        if agora and acesa:
            R = rr + 9 + 3 * math.sin(t * 4)
            db.ellipse((x - R, y - R, x + R, y + R), fill=int(150 + 40 * math.sin(t * 4)))
    d.polygon([(med[0], med[1] - 7), (med[0] + 6, med[1]), (med[0], med[1] + 7), (med[0] - 6, med[1])], fill=(150, 130, 110))
    brilho = brilho.filter(ImageFilter.GaussianBlur(7))
    camada = Image.new('RGB', img.size, (240, 90, 80))
    return Image.composite(camada, img, brilho.point(lambda v: v * 0.55)).copy() if ia >= 0 and acesa else img

# ── texto que acende com a voz ──────────────────────────────────────────────
def tempos_palavras(partes):
    """partes: [(texto, inicio, duracao, coro)] -> [(palavra, t0, t1, coro)]"""
    out = []
    for texto, ini, dur, c in partes:
        ps = texto.split(); pesos = [len(p) + 2 for p in ps]; tot = sum(pesos); acc = 0
        for p, w in zip(ps, pesos):
            out.append((p, ini + dur * acc / tot, ini + dur * (acc + w) / tot, c)); acc += w
    return out

def desenha_texto(d, palavras, t, X, Y, L, tam, italico=False):
    f = fonte('inria-serif-400-italic.ttf' if italico else 'inria-serif-400.ttf', tam)
    fb = fonte('inria-serif-700.ttf', tam)
    x, y, lh = X, Y, int(tam * 1.42); esp = d.textlength(' ', font=f)
    for p, t0, t1, c in palavras:
        ff = fb if c else f; w = d.textlength(p, font=ff)
        if x + w > X + L: x = X; y += lh
        k = min(1, max(0, (t - t0) / 0.15))
        base = (VERM if c else TINTA)
        cor = tuple(int(APAGADO[i] + (base[i] - APAGADO[i]) * k) for i in range(3))
        d.text((x, y), p, font=ff, fill=cor); x += w + esp
    return y + lh

def espacado(d, xy, t, f, cor, e):
    x, y = xy
    for c in t: d.text((x, y), c, font=f, fill=cor); x += d.textlength(c, font=f) + e

# ── áudio ───────────────────────────────────────────────────────────────────
def ler(arq, canais=2):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', arq, '-ac', str(canais), '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, canais).astype(np.float64)

# ── roteiro do teste ────────────────────────────────────────────────────────
def eventos_teste():
    EP_GUIA = ('Eterno Pai, eu vos ofereço o Corpo e o Sangue, a Alma e a Divindade de vosso diletíssimo Filho, '
               'Nosso Senhor Jesus Cristo,')
    EP_CORO = 'em expiação dos nossos pecados e dos do mundo inteiro.'
    return [
        dict(cena=0, modo='cheio', titulo=('LITURGIA DIÁRIA', 'Terço da Misericórdia'), partes=[], pausa=2.6),
        dict(cena=0, modo='painel', cab=('Orações iniciais', None), rotulo='Ó Sangue e Água', conta='cruz',
             partes=[(M.SANGUE, gerar(M.SANGUE, 0), False)], pausa=1.4),
        dict(cena=1, modo='cheio', titulo=('PRIMEIRA DEZENA', 'A Agonia no Horto'),
             partes=[('Primeira dezena. Contemplamos a agonia de Jesus no Horto das Oliveiras.',
                      gerar('Primeira dezena. Contemplamos a agonia de Jesus no Horto das Oliveiras.', 0), False)], pausa=1.2),
        dict(cena=1, modo='painel', cab=('Primeira dezena', 'A Agonia no Horto'), rotulo='Eterno Pai', conta='g0_0',
             partes=[(EP_GUIA, gerar(EP_GUIA, 0), False), (EP_CORO, coro(EP_CORO, 0), True)], pausa=0.6),
    ] + [dict(cena=1, modo='painel', cab=('Primeira dezena', 'A Agonia no Horto'), rotulo='Pela sua dolorosa Paixão', conta=f'g0_{n}',
              partes=[('Pela sua dolorosa Paixão,', gerar('Pela sua dolorosa Paixão,', n - 1), False),
                      ('tende misericórdia de nós e do mundo inteiro.', coro('tende misericórdia de nós e do mundo inteiro.', (n - 1) % 2), True)],
              pausa=0.5) for n in (1, 2, 3)]

PINTURAS = {0: ('img-dol/0-misericordia.jpg', (.5, .32), True), 1: ('img-dol/1-horto.jpg', (.5, .45), False),
            2: ('img-dol/2-flagelacao.jpg', (.5, .4), False), 3: ('img-dol/3-coroacao.jpg', (.45, .4), False),
            4: ('img-dol/4-cruz.jpg', (.55, .35), False), 5: ('img-dol/5-crucifixao.jpg', (.5, .3), False),
            6: ('img-dol/0-misericordia.jpg', (.5, .32), True)}

def eventos_completo():
    EP_G = ('Eterno Pai, eu vos ofereço o Corpo e o Sangue, a Alma e a Divindade de vosso diletíssimo Filho, Nosso Senhor Jesus Cristo,')
    EP_C = 'em expiação dos nossos pecados e dos do mundo inteiro.'
    PX_G, PX_C = 'Pela sua dolorosa Paixão,', 'tende misericórdia de nós e do mundo inteiro.'
    DS_G, DS_C = 'Deus Santo, Deus Forte, Deus Imortal,', 'tende piedade de nós e do mundo inteiro.'
    g = lambda txt, v=0: (txt, gerar(txt, v), False)
    ini = ('Orações iniciais', None)
    evs = [dict(cena=0, modo='cheio', titulo=('LITURGIA DIÁRIA', 'Terço da Misericórdia'), partes=[], pausa=3.0, capitulo=True),
           dict(cena=0, modo='painel', cab=ini, rotulo='Sinal da Cruz', conta='cruz', partes=[g(M.SINAL)], pausa=1.0),
           dict(cena=0, modo='painel', cab=ini, rotulo='Oração inicial', conta='cruz', partes=[g(M.EXPIRASTES)], pausa=1.2),
           dict(cena=0, modo='painel', cab=ini, rotulo='Evangelho', conta='cruz', italico=True, ref=M.LADO[1],
                partes=[('“' + M.LADO[0] + '”', gerar(M.LADO[0], 0), False)], pausa=1.3)]
    evs += [dict(cena=0, modo='painel', cab=ini, rotulo=f'Ó Sangue e Água · {n + 1} de 3', conta='cruz', partes=[g(M.SANGUE, n)],
                 pausa=0.6 if n < 2 else 1.0) for n in range(3)]
    evs += [dict(cena=0, modo='painel', cab=ini, rotulo='Pai-Nosso', conta='p0', partes=[g(M.PAI)], pausa=1.0),
            dict(cena=0, modo='painel', cab=ini, rotulo='Ave-Maria', conta='p1', partes=[g(M.AVE)], pausa=1.0),
            dict(cena=0, modo='painel', cab=ini, rotulo='Creio', conta='p2', partes=[g(M.CREIO)], pausa=1.4)]
    for k, (curto, anuncio, ev, ref) in enumerate(M.DEZENAS):
        cab = (f'{M.ORD[k]} dezena', curto); an = f'{M.ORD[k]} dezena. Contemplamos {anuncio}.'
        evs += [dict(cena=k + 1, modo='cheio', titulo=(f'{M.ORD[k].upper()} DEZENA', curto), partes=[g(an)], pausa=1.2, capitulo=True),
                dict(cena=k + 1, modo='painel', cab=cab, rotulo='Evangelho', conta=f'g{k}_0', acesa=False, italico=True, ref=ref,
                     partes=[('“' + ev + '”', gerar(ev.replace('“', '').replace('”', ''), 0), False)], pausa=1.3),
                dict(cena=k + 1, modo='painel', cab=cab, rotulo='Eterno Pai', conta=f'g{k}_0',
                     partes=[g(EP_G, k % 2), (EP_C, coro(EP_C, k % 2), True)], pausa=0.7)]
        evs += [dict(cena=k + 1, modo='painel', cab=cab, rotulo='Pela sua dolorosa Paixão', conta=f'g{k}_{n}',
                     partes=[g(PX_G, (k * 10 + n) % 4), (PX_C, coro(PX_C, (k * 10 + n) % 2), True)], pausa=0.5 if n < 10 else 1.0)
                for n in range(1, 11)]
    fim = ('Encerramento', None)
    evs += [dict(cena=6, modo='cheio', titulo=('ENCERRAMENTO', 'Deus Santo, Deus Forte'), partes=[], pausa=2.6, capitulo=True)]
    evs += [dict(cena=6, modo='painel', cab=fim, rotulo=f'Deus Santo · {n + 1} de 3', conta='fim', acesa=False,
                 partes=[g(DS_G, n), (DS_C, coro(DS_C, n % 2), True)], pausa=0.7) for n in range(3)]
    evs += [dict(cena=6, modo='painel', cab=fim, rotulo='Oração final', conta='fim', acesa=False, partes=[g(M.FINAL)], pausa=1.3)]
    evs += [dict(cena=6, modo='painel', cab=fim, rotulo='Jesus, eu confio em vós', conta='fim', acesa=False,
                 partes=[(M.CONFIO, coro(M.CONFIO, n % 2), True)], pausa=0.6) for n in range(3)]
    evs += [dict(cena=6, modo='painel', cab=fim, rotulo='Sinal da Cruz', conta='fim', acesa=False, partes=[g(M.SINAL)], pausa=1.2),
            dict(cena=6, modo='cheio', titulo=('TODO DIA, ÀS 15H E ÀS 3H, AO VIVO', 'Curta e inscreva-se'), cta=True,
                 partes=[g('Se este terço te ajudou, curta o vídeo e inscreva-se no canal. Todos os dias, às três da tarde e às três da manhã, '
                           'rezamos juntos o Terço da Misericórdia, ao vivo. Jesus, eu confio em vós.')], pausa=3.5)]
    return evs

def montar(evs, saida):
    # linha do tempo
    t = 0.0; audio = []
    for e in evs:
        e['t0'] = t; partes = []
        for i, (txt, wav, c) in enumerate(e['partes']):
            a = ler(wav); dur = len(a) / SR; a = a / (np.abs(a).max() + 1e-9) * (VOL_CORO if c else 0.68)
            audio.append((t, a)); falada = dur - (0.9 if c else 0)
            partes.append((txt, t, falada, c)); t += falada + (0.25 if i + 1 < len(e['partes']) else 0)
        e['palavras'] = tempos_palavras(partes); t += e['pausa']; e['t1'] = t
    total = t + 1.5
    cenas = {}
    for e in evs: cenas.setdefault(e['cena'], e['t0'])
    pint = {k: Pintura(*v) for k, v in PINTURAS.items()}
    # áudio: vozes + trilha
    n = int(total * SR); mix = np.zeros((n, 2))
    for t0, a in audio:
        i = int(t0 * SR); m = min(len(a), n - i); mix[i:i + m] += a[:m]
    mix *= 0.9 / np.abs(mix).max()
    os.makedirs('tmp', exist_ok=True); mix.astype(np.float32).tofile('tmp/anim-voz.f32')
    trilha = '/Users/daniel/catecismo/instagram-posts/reel-teste/trilha-violino.mp3'

    if os.environ.get('SO_AUDIO'):   # troca só o áudio do vídeo já renderizado
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', saida, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', 'tmp/anim-voz.f32',
                        '-stream_loop', '-1', '-i', trilha, '-filter_complex', f'[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[v];[2:a]atrim=0:{total},volume=0.05,'
                        f'afade=t=in:d=3,afade=t=out:st={total - 3}:d=3[m];[v][m]amix=inputs=2:duration=first:normalize=0[a]',
                        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', f'{total:.2f}', '-movflags', '+faststart',
                        saida.replace('.mp4', '-audio.mp4')], check=True)
        os.replace(saida.replace('.mp4', '-audio.mp4'), saida); print('áudio trocado', saida); return
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', 'tmp/anim-voz.f32', '-stream_loop', '-1', '-i', trilha,
                           '-filter_complex', f'[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[v];[2:a]atrim=0:{total},volume=0.05,afade=t=in:d=3,'
                           f'afade=t=out:st={total - 3}:d=3[m];[v][m]amix=inputs=2:duration=first:normalize=0[a]',
                           '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '160k', '-t', f'{total:.2f}', '-movflags', '+faststart', '-f', 'mp4', saida + '.parcial'], stdin=subprocess.PIPE)
    cabF = fonte('inria-serif-700.ttf', 50); subF = fonte('inria-serif-400-italic.ttf', 30)
    for fr in range(int(total * FPS)):
        t = fr / FPS
        i = max(k for k, e in enumerate(evs) if e['t0'] <= t + 1e-6); e = evs[i]; ant = evs[i - 1] if i else None
        zoom = lambda c: 1.0 + 0.07 * min(1, (t - cenas[c]) / 60)
        # painel: 0 = tela cheia, 1 = aberto; transição de 0,9 s no começo do evento
        def aberto(ev): return 1.0 if ev['modo'] == 'painel' else 0.0
        p = aberto(e) if not ant or aberto(ant) == aberto(e) else aberto(ant) + (aberto(e) - aberto(ant)) * ease((t - e['t0']) / 0.9)
        def camada(c):
            pt = pint[c]
            if p <= 0: return pt.cheio(t, zoom(c))
            if p >= 1: return pt.painel(t, zoom(c))
            return Image.blend(pt.cheio(t, zoom(c)), pt.painel(t, zoom(c)), p)
        quadro = camada(e['cena'])
        if ant and ant['cena'] != e['cena'] and t - e['t0'] < 1.2:   # dissolvência entre pinturas
            quadro = Image.blend(camada(ant['cena']), quadro, ease((t - e['t0']) / 1.2))
        d = ImageDraw.Draw(quadro)
        # título em tela cheia
        tit = e.get('titulo') if e['modo'] == 'cheio' else (ant.get('titulo') if ant and ant['modo'] == 'cheio' and p < 1 else None)
        if tit and p < 1:
            a = (1 - p) * ease((t - (e if e['modo'] == 'cheio' else ant)['t0'] - 0.4) / 1.0)
            sombra = Image.new('L', (W, H), 0); ImageDraw.Draw(sombra).rectangle((0, 700, W, H), fill=int(170 * a))
            quadro = Image.composite(Image.new('RGB', (W, H), (8, 6, 5)), quadro, sombra.filter(ImageFilter.GaussianBlur(90)))
            camT = Image.new('RGBA', (W, H)); dt = ImageDraw.Draw(camT)
            ecta = e.get('cta') and e['modo'] == 'cheio'; sobe = 150 if ecta else 0
            f1 = sans(24); w1 = sum(dt.textlength(c, font=f1) + 6 for c in tit[0]) - 6
            espacado(dt, ((W - w1) / 2, 860 - sobe), tit[0], f1, (240, 200, 160, int(255 * a)), 6)
            f2 = fonte('inria-serif-400-italic.ttf', 92); w2 = dt.textlength(tit[1], font=f2)
            dt.text(((W - w2) / 2, 900 - sobe), tit[1], font=f2, fill=(255, 248, 238, int(255 * a)))
            if ecta:   # botão "Inscrever-se" com sininho, entra 1,5 s depois e pulsa de leve
                b = a * ease((t - e['t0'] - 1.5) / 0.6); esc = 1 + 0.035 * math.sin(max(0, t - e['t0'] - 2.1) * 3.2)
                fb = sans(round(34 * esc), 5); txt = 'Inscrever-se'; tw = dt.textlength(txt, font=fb)
                bw, bh = tw + 150 * esc, 76 * esc; x0, y0 = (W - bw) / 2, 935 - bh / 2
                dt.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), bh / 2, fill=(204, 0, 0, int(255 * b)))
                dt.text((x0 + 44 * esc, 935), txt, font=fb, fill=(255, 255, 255, int(255 * b)), anchor='lm')
                cx, cy, r = x0 + bw - 52 * esc, 935, 15 * esc   # sininho
                dt.chord((cx - r, cy - r * 1.3, cx + r, cy + r * 0.7), 180, 360, fill=(255, 255, 255, int(255 * b)))
                dt.rectangle((cx - r, cy - r * 0.3, cx + r, cy + r * 0.45), fill=(255, 255, 255, int(255 * b)))
                dt.polygon([(cx - r * 1.35, cy + r * 0.7), (cx + r * 1.35, cy + r * 0.7), (cx + r, cy + r * 0.3), (cx - r, cy + r * 0.3)], fill=(255, 255, 255, int(255 * b)))
                dt.ellipse((cx - r * 0.3, cy + r * 0.75, cx + r * 0.3, cy + r * 1.25), fill=(255, 255, 255, int(255 * b)))
            quadro.paste(camT, (0, 0), camT); d = ImageDraw.Draw(quadro)
        # painel de texto
        if p > 0:
            ev = e if e['modo'] == 'painel' else ant
            pa = Image.new('RGB', (W - PW, H), PAPEL); dp = ImageDraw.Draw(pa); X, L = 90, W - PW - 180
            espacado(dp, (X, 96), 'TERÇO DA MISERICÓRDIA', sans(20), VERM, 5)
            c1, c2 = ev['cab']
            if c2: dp.text((X, 140), c1, font=subF, fill=SUAVE); dp.text((X, 182), c2, font=cabF, fill=TINTA)
            else: dp.text((X, 170), c1, font=cabF, fill=TINTA)
            dp.line((X, 272, X + 70, 272), fill=VERM, width=2)
            fade = ease((t - ev['t0']) / 0.35) if ev is e else 1
            corR = tuple(int(PAPEL[k] + (SUAVE[k] - PAPEL[k]) * fade) for k in range(3))
            espacado(dp, (X, 305), ev['rotulo'].upper(), sans(19), corR, 4)
            # bolinhas: 10 nas dezenas, 3 nas orações repetidas três vezes (rótulo "· N de 3")
            if 'contas' not in ev:
                c = ev.get('conta', '')
                if c.startswith('g'): ev['contas'] = (10, int(c.split('_')[1]))
                elif ' de 3' in ev['rotulo']: ev['contas'] = (3, int(ev['rotulo'].split('·')[1].split()[0]))
                else: ev['contas'] = None
            if 'tam' not in ev:
                alt = lambda z: desenha_texto(ImageDraw.Draw(Image.new('RGB', (10, 10))), ev['palavras'], -1, X, 350, L, z, ev.get('italico', False))
                limite = 870 if ev['contas'] else 990
                ev['tam'] = next(z for z in (40, 36, 34, 32, 30, 28, 26) if alt(z) + (34 if ev.get('ref') else 0) <= limite or z == 26)
            tam = ev['tam']
            camTx = Image.new('RGB', pa.size, PAPEL); dtx = ImageDraw.Draw(camTx)
            yfim = desenha_texto(dtx, ev['palavras'], t, X, 350, L, tam, ev.get('italico', False))
            if ev.get('ref'): dtx.text((X, yfim + 4), ev['ref'], font=sans(22, 2), fill=SUAVE)
            mask = Image.new('L', pa.size, 0); ImageDraw.Draw(mask).rectangle((0, 340, pa.width, 1000), fill=int(255 * fade))
            pa = Image.composite(camTx, pa, mask)
            if ev['contas']:
                n, acesas = ev['contas']; cx, cy, r, g = X + 11, 930, 11, 34
                brilha = ev.get('acesa', True) and acesas > 0
                if brilha:   # a conta da oração atual brilha
                    luz = Image.new('L', pa.size, 0); x = cx + (acesas - 1) * g; R = 22 + 3 * math.sin(t * 4)
                    ImageDraw.Draw(luz).ellipse((x - R, cy - R, x + R, cy + R), fill=int(150 + 40 * math.sin(t * 4)))
                    pa = Image.composite(Image.new('RGB', pa.size, (240, 90, 80)), pa, luz.filter(ImageFilter.GaussianBlur(7)).point(lambda v: v * 0.55))
                dp = ImageDraw.Draw(pa)
                for i in range(n):
                    on = i < acesas; x = cx + i * g
                    dp.ellipse((x - r, cy - r, x + r, cy + r), fill=VERM if on else None, outline=VERM if on else (200, 190, 180), width=2)
            dp = ImageDraw.Draw(pa)
            wtxt = 'Liturgia Diária  ·  liturgia.santadoutrina.com'
            dp.text((pa.width - 90 - dp.textlength(wtxt, font=sans(18, 2)), 1030), wtxt, font=sans(18, 2), fill=(160, 150, 140))
            xp = round(W - (W - PW) * ease(p) if p < 1 else PW)
            if xp < W:
                sombra = Image.new('L', (W, H), 0); ImageDraw.Draw(sombra).rectangle((xp - 30, 0, xp, H), fill=60)
                quadro = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), quadro, sombra.filter(ImageFilter.GaussianBlur(20)))
                quadro.paste(pa.crop((0, 0, W - xp, H)), (xp, 0))
        # fim: escurece
        if t > total - 1.2: quadro = Image.eval(quadro, lambda v, a=(total - t) / 1.2: int(v * a))
        ff.stdin.write(quadro.tobytes())
    ff.stdin.close()
    if ff.wait() != 0: raise SystemExit('ffmpeg falhou')
    os.replace(saida + '.parcial', saida)   # só troca o vídeo pronto quando terminou
    mm = lambda x: f'{int(x // 60)}:{int(x % 60):02d}'
    caps = [(mm(e['t0']), e['titulo'][1]) for e in evs if e['modo'] == 'cheio' and e.get('capitulo')]
    json.dump({'total': total, 'capitulos': caps}, open(saida.replace('.mp4', '-capitulos.json'), 'w'), ensure_ascii=False)
    print('ok', saida, f'{total:.1f} s', caps)

if __name__ == '__main__':
    if sys.argv[1] == 'teste': montar(eventos_teste(), 'teste-animado.mp4')
    if sys.argv[1] == 'completo': montar(eventos_completo(), 'terco-misericordia.mp4')
