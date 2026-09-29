#!/usr/bin/env python3
"""
scripts/video-liturgia.py — piloto: vídeo de uma leitura do dia a partir do áudio que já existe
(data/liturgia-audio/<dia>/<leitura>.mp3 + .json com o tempo de cada linha) e de uma pintura.

    python3 scripts/video-liturgia.py 2026-10-03 evangelho            # 1920×1080, a leitura inteira
    python3 scripts/video-liturgia.py 2026-10-03 evangelho --short    # 1080×1920, só o trecho do dia
    … --pintura assets/img/cards/emaus.webp   (padrão: a pintura do trecho do dia ou a do tempo)

Saída: video/<dia>-<leitura>[-short].mp4 (fora do git).

Como é feito, sem editor: a pintura vira o fundo (escurecida, com um zoom lento pelo ffmpeg) e o
texto é desenhado pelo Pillow, um quadro por linha lida — a linha atual em branco, as vizinhas
esmaecidas, como a tela "Ouvir" do site. O ffmpeg junta fundo + quadros de texto + áudio.
"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data'
SAIDA = RAIZ / 'video'
ROTULO = {'primeira-leitura': '1ª Leitura', 'segunda-leitura': '2ª Leitura', 'salmo': 'Salmo', 'evangelho': 'Evangelho'}
MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
VERMELHO = (203, 46, 46)


def fonte(nome, tam):
    """As fontes do site vêm em woff2; convertidas uma vez para ttf num cache local."""
    cache = SAIDA / '.fontes'
    cache.mkdir(parents=True, exist_ok=True)
    ttf = cache / f'{nome}.ttf'
    if not ttf.exists():
        from fontTools.ttLib import TTFont
        f = TTFont(RAIZ / 'assets' / 'fonts' / f'{nome}.woff2')
        f.flavor = None
        f.save(ttf)
    return ImageFont.truetype(str(ttf), tam)


def norm(t):
    return re.sub(r'[^a-z0-9 ]', '', unicodedata.normalize('NFD', t.lower()).encode('ascii', 'ignore').decode())


def pintura_padrao(dt):
    """A pintura escolhida para o trecho do dia, se houver; senão uma do tempo litúrgico."""
    trechos = DADOS / 'liturgia-trechos' / f'{dt}.json'
    if trechos.exists():
        imgs = json.loads(trechos.read_text()).get('imagens') or {}
        for v in imgs.values():
            p = RAIZ / 'assets' / 'img' / 'cards' / f'{v}.webp'
            if p.exists():
                return p
    dia = json.loads((DADOS / 'liturgia' / f'{dt}.json').read_text())
    acervo = json.loads((DADOS / 'cards-imagens.json').read_text())['imagens']
    for im in acervo:
        if dia['tempo'] in im.get('tempos', []):
            return RAIZ / 'assets' / 'img' / 'cards' / f"{im['id']}.webp"
    return RAIZ / 'assets' / 'img' / 'cards' / 'trigo-colina.webp'


def fundo(pintura, W, H, destino, vertical, espelhar=False, direita=False):
    """Pintura cobrindo o quadro, escurecida; no vertical, a pintura fica no alto e o texto embaixo."""
    im = Image.open(pintura).convert('RGB')
    if espelhar:   # quando a figura está à esquerda, embaixo do texto
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if direita and not vertical:
        # pintura mais estreita que o quadro (retrato, 4:3): encosta à direita, na altura toda, e o
        # lado esquerdo, onde fica o texto, é a própria pintura ampliada e bem desfocada
        Wz, Hz = round(W * 1.15), round(H * 1.15)
        e = Hz / im.height
        frente = im.resize((round(im.width * e), Hz), Image.LANCZOS)
        e2 = max(Wz / im.width, Hz / im.height)
        tela = im.resize((round(im.width * e2), round(im.height * e2)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        tela = tela.crop((0, 0, Wz, Hz))
        mask = Image.new('L', frente.size, 255)
        dm = ImageDraw.Draw(mask)
        for x in range(min(160, frente.width)):
            dm.line([(x, 0), (x, Hz)], fill=int(255 * x / 160))
        tela.paste(frente, (Wz - frente.width, 0), mask)
        im = tela
    esc = max(W / im.width, H / im.height) * 1.15      # sobra para o zoom lento
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    x, y = (im.width - W * 1.15) / 2, (im.height - H * 1.15) / 2
    im = im.crop((round(x), round(y), round(x + W * 1.15), round(y + H * 1.15)))
    im = im.filter(ImageFilter.GaussianBlur(3))
    escuro = Image.new('RGB', im.size, (12, 10, 8))
    im = Image.blend(im, escuro, 0.55 if not vertical else 0.45)
    # degradê: mais escuro onde o texto fica (esquerda no horizontal, embaixo no vertical)
    g = Image.new('L', im.size)
    d = ImageDraw.Draw(g)
    for k in range(im.width if not vertical else im.height):
        a = int(170 * max(0, 1 - k / ((im.width if not vertical else im.height) * 0.75))) if not vertical \
            else int(200 * max(0, (k / im.height - 0.3) / 0.7))
        (d.line([(k, 0), (k, im.height)], fill=a) if not vertical else d.line([(0, k), (im.width, k)], fill=a))
    im = Image.composite(Image.new('RGB', im.size, (10, 8, 6)), im, g)
    im.save(destino)


def quebrar(draw, texto, f, largura):
    linhas, atual = [], ''
    for p in texto.split():
        t = f'{atual} {p}'.strip()
        if draw.textlength(t, font=f) > largura and atual:
            linhas.append(atual)
            atual = p
        else:
            atual = t
    linhas = linhas + ([atual] if atual else [])
    # sem palavra órfã: se a última linha ficou com uma palavra só, desce a última da anterior
    while len(linhas) > 1 and len(linhas[-1].split()) == 1 and len(linhas[-2].split()) > 2:
        *resto, ult = linhas[-2].split()
        linhas[-2], linhas[-1] = ' '.join(resto), f'{ult} {linhas[-1]}'
        if draw.textlength(linhas[-1], font=f) > largura:
            break
    return linhas


def quadros_texto(linhas, cab, W, H, pasta, vertical):
    """Letra no estilo do Apple Music: texto grande em negrito, a linha atual acesa, as outras
    apagadas e cada vez mais desfocadas conforme se afastam; na troca de linha o texto rola
    suave (8 quadros com easing). Devolve [(png, duração)] para o concat."""
    corpo = fonte('inria-serif-700', 64 if not vertical else 70)
    f_cab = fonte('inria-serif-400-italic', 34 if not vertical else 42)
    f_rot = fonte('inria-serif-700', 24 if not vertical else 32)
    f_site = fonte('inria-serif-400', 24 if not vertical else 30)
    m = 140 if not vertical else 90
    larg = (W * 0.62) if not vertical else (W - 2 * m)
    ancora = H * 0.40 if not vertical else H * 0.50     # onde fica o topo da linha atual
    lh = corpo.size * 1.22
    gap = corpo.size * 0.55
    rascunho = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    blocos = [quebrar(rascunho, l['texto'], corpo, larg) for l in linhas]
    topo, y = [], 0.0
    for bl in blocos:
        topo.append(y)
        y += len(bl) * lh + gap
    # camada fixa: rótulo, data e site
    fixo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(fixo)
    d.text((m, 80 if not vertical else 120), cab['rotulo'].upper(), font=f_rot, fill=(*VERMELHO, 255))
    for j, t in enumerate(quebrar(d, cab['sub'], f_cab, W - 2 * m)[:2]):
        d.text((m, (116 if not vertical else 162) + j * f_cab.size * 1.25), t, font=f_cab, fill=(242, 234, 216, 220))
    d.text((m, H - 76), 'liturgia.santadoutrina.com', font=f_site, fill=(242, 234, 216, 160))
    # cada bloco desenhado uma vez em 5 níveis de desfoque
    cache = {}
    def bloco(k, nivel):
        if (k, nivel) not in cache:
            bl = blocos[k]
            pad = 40
            im = Image.new('RGBA', (int(larg) + 2 * pad, int(len(bl) * lh) + 2 * pad), (0, 0, 0, 0))
            dd = ImageDraw.Draw(im)
            alfa = 255 if nivel == 0 else max(60, 120 - 12 * nivel)
            for j, t in enumerate(bl):
                dd.text((pad, pad + j * lh), t, font=corpo, fill=(255, 255, 255, alfa))
            if nivel:
                im = im.filter(ImageFilter.GaussianBlur(1.6 + 2.2 * nivel))
            cache[(k, nivel)] = im
        return cache[(k, nivel)]
    def quadro(atual, rolagem):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for k in range(max(0, atual - 3), min(len(blocos), atual + 7)):
            yk = ancora + topo[k] - rolagem
            if yk > H or yk + len(blocos[k]) * lh < 0:
                continue
            im.alpha_composite(bloco(k, min(4, abs(k - atual))), (m - 40, int(yk) - 40))
        # o texto some sob o cabeçalho e perto do rodapé
        mascara = Image.new('L', (W, H), 255)
        md = ImageDraw.Draw(mascara)
        for yy in range(H):
            a = 255
            if yy < 260: a = int(255 * max(0, (yy - 180) / 80))
            elif yy > H - 150: a = int(255 * max(0, (H - 110 - yy) / 40))
            md.line([(0, yy), (W, yy)], fill=a)
        im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', (W, H), 0), mascara))
        return Image.alpha_composite(im, fixo)
    saida, n = [], 0
    def grava(im, dur):
        nonlocal n
        arq = pasta / f't{n:05d}.png'
        im.save(arq)
        saida.append((arq, dur))
        n += 1
    PASSOS, QD = 8, 1 / 30
    for i in range(len(linhas)):
        ini = 0 if i == 0 else linhas[i]['t0']
        fim = linhas[i + 1]['t0'] if i + 1 < len(linhas) else None
        dur_total = (fim - ini) if fim is not None else None
        if i > 0:
            for p in range(1, PASSOS + 1):
                e = 1 - (1 - p / PASSOS) ** 3
                grava(quadro(i, topo[i - 1] + (topo[i] - topo[i - 1]) * e), QD)
        resto = (dur_total - (PASSOS * QD if i > 0 else 0)) if dur_total is not None else 3600
        grava(quadro(i, topo[i]), max(0.04, resto))
    return saida


def brilho_da_voz(mp3, ini, dur, W, H, pasta, vertical, fps=15, niveis=24):
    """Um halo quente vindo da borda esquerda (de baixo, no vertical) que respira com o volume
    da voz: envelope RMS suavizado, quantizado em poucos níveis, cada nível um PNG. Devolve
    [(png, duração)] para um segundo concat."""
    import numpy as np
    sr = 8000
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{ini:.3f}', '-t', f'{dur:.3f}', '-i', str(mp3),
                          '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
    passo = sr // fps
    n = int(dur * fps) + 1
    rms = np.array([np.sqrt(np.mean(x[k * passo:(k + 1) * passo] ** 2)) if k * passo < len(x) else 0 for k in range(n)])
    rms = rms / (np.percentile(rms, 95) or 1)
    env, v = [], 0.0
    for r in np.clip(rms, 0, 1):                   # sobe rápido, desce devagar: suave
        v = v + (r - v) * (0.35 if r > v else 0.08)
        env.append(v)
    # o halo: gradiente radial âmbar centrado fora da tela
    cx, cy = (-W * 0.08, H * 0.55) if not vertical else (W * 0.5, H * 1.08)
    raio = H * 0.75 if not vertical else W * 0.9
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / raio
    base = np.clip(1 - d, 0, 1) ** 2.2
    arqs = {}
    for q in range(niveis):
        a = (0.10 + 0.55 * q / (niveis - 1)) * base
        im = np.zeros((H, W, 4), np.uint8)
        im[..., 0], im[..., 1], im[..., 2] = 255, 196, 120
        im[..., 3] = (a * 255).astype(np.uint8)
        arq = pasta / f'b{q:02d}.png'
        Image.fromarray(im, 'RGBA').save(arq)
        arqs[q] = arq
    saida = []
    for v in env:
        q = int(round(min(1, v) * (niveis - 1)))
        if saida and saida[-1][0] == arqs[q]:
            saida[-1] = (arqs[q], saida[-1][1] + 1 / fps)
        else:
            saida.append((arqs[q], 1 / fps))
    return saida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dia')
    ap.add_argument('leitura', choices=list(ROTULO))
    ap.add_argument('--short', action='store_true')
    ap.add_argument('--pintura')
    ap.add_argument('--direita', action='store_true', help='pintura estreita encostada à direita, esquerda desfocada')
    ap.add_argument('--espelhar', action='store_true', help='espelha a pintura (figura principal para a direita)')
    ap.add_argument('--trilha', help='música de fundo (domínio público), bem baixa sob a voz')
    a = ap.parse_args()

    base = DADOS / 'liturgia-audio' / a.dia / a.leitura
    if not base.with_suffix('.json').exists():
        sys.exit(f'sem áudio: {base}.json')
    audio = json.loads(base.with_suffix('.json').read_text())
    linhas = audio['linhas']
    dia = json.loads((DADOS / 'liturgia' / f'{a.dia}.json').read_text())
    a_, m_, d_ = map(int, a.dia.split('-'))
    cab = {'rotulo': f"{ROTULO[a.leitura]} · {audio['referencia']}", 'sub': f"{d_} de {MES[m_ - 1]} de {a_} · {dia['celebracao']}"}

    ini, fim = 0.0, audio['duracao']
    if a.short:
        # o trecho do dia: as linhas que contêm as palavras do trecho escolhido, com uma de contexto
        trechos = DADOS / 'liturgia-trechos' / f'{a.dia}.json'
        alvo = ''
        if trechos.exists():
            t = json.loads(trechos.read_text())['trechos']
            alvo = next((v for k, v in t.items() if k.startswith(audio['referencia'].split(' (')[0])), '')
        palavras = norm(alvo).split()
        pegas = [k for k, l in enumerate(linhas) if palavras and sum(w in norm(l['texto']).split() for w in palavras) >= max(2, len(norm(l['texto']).split()) * 0.5)]
        if not pegas:
            pegas = [len(linhas) - 3, len(linhas) - 2]
        k0, k1 = max(0, min(pegas) - 1), min(len(linhas) - 1, max(pegas))
        # um Short com menos de ~20 s não dá contexto: puxa as linhas de antes até lá
        while k0 > 0 and linhas[k1]['t1'] - linhas[k0]['t0'] < 20:
            k0 -= 1
        linhas = linhas[k0:k1 + 1]
        ini, fim = max(0, linhas[0]['t0'] - 0.3), linhas[-1]['t1'] + 1.2
        linhas = [{**l, 't0': l['t0'] - ini, 't1': l['t1'] - ini} for l in linhas]

    W, H = (1080, 1920) if a.short else (1920, 1080)
    dur = fim - ini
    pintura = Path(a.pintura) if a.pintura else pintura_padrao(a.dia)
    SAIDA.mkdir(exist_ok=True)
    nome = SAIDA / f"{a.dia}-{a.leitura}{'-short' if a.short else ''}.mp4"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        fundo(pintura, W, H, tmp / 'fundo.png', a.short, a.espelhar, a.direita)
        quadros = quadros_texto(linhas, cab, W, H, tmp, a.short)
        # lista do concat: cada quadro fica até a próxima linha começar
        lista = [f"file '{q}'\nduration {t:.3f}" for q, t in quadros]
        lista.append(f"file '{quadros[-1][0]}'")
        (tmp / 'lista.txt').write_text('\n'.join(lista))
        halo = brilho_da_voz(base.with_suffix('.mp3'), ini, dur, W, H, tmp, a.short)
        (tmp / 'halo.txt').write_text('\n'.join([f"file '{q}'\nduration {t:.4f}" for q, t in halo] + [f"file '{halo[-1][0]}'"]))
        fps = 30
        n = int(dur * fps) + fps
        zoom = f"zoompan=z='1+0.12*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps}"
        cmd = ['ffmpeg', '-loglevel', 'error', '-y',
               '-loop', '1', '-i', str(tmp / 'fundo.png'),
               '-f', 'concat', '-safe', '0', '-i', str(tmp / 'lista.txt'),
               '-ss', f'{ini:.3f}', '-t', f'{dur:.3f}', '-i', str(base.with_suffix('.mp3')),
               '-f', 'concat', '-safe', '0', '-i', str(tmp / 'halo.txt'),
               *(['-stream_loop', '-1', '-i', a.trilha] if a.trilha else []),
               '-filter_complex', f"[0:v]{zoom},format=yuv420p[bg0];[3:v]fps={fps},format=rgba[halo];[bg0][halo]overlay=0:0:shortest=1[bg];[1:v]fps={fps},format=rgba[tx];[bg][tx]overlay=0:0:shortest=1,fade=in:0:15,fade=out:st={dur - 0.6:.2f}:d=0.6[v]"
               + (f";[4:a]volume=0.28,afade=in:d=2,afade=out:st={dur - 2.5:.2f}:d=2.5[m];[2:a][m]amix=inputs=2:duration=first:normalize=0[a]" if a.trilha else ''),
               '-map', '[v]', '-map', '[a]' if a.trilha else '2:a', '-t', f'{dur:.3f}',
               '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(nome)]
        subprocess.run(cmd, check=True)
    print(f'{nome.relative_to(RAIZ)}  ({dur:.1f}s, {W}×{H}, pintura {pintura.name})')


if __name__ == '__main__':
    main()
