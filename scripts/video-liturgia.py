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


def fundo(pintura, W, H, destino, vertical):
    """Pintura cobrindo o quadro, escurecida; no vertical, a pintura fica no alto e o texto embaixo."""
    im = Image.open(pintura).convert('RGB')
    esc = max(W / im.width, H / im.height) * 1.15      # sobra para o zoom lento
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    x, y = (im.width - W * 1.15) / 2, (im.height - H * 1.15) / 2
    im = im.crop((round(x), round(y), round(x + W * 1.15), round(y + H * 1.15)))
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
    return linhas + ([atual] if atual else [])


def quadros_texto(linhas, cab, W, H, pasta, vertical):
    """Um PNG transparente por linha lida: a atual acesa, até 2 antes e 3 depois esmaecidas."""
    corpo = fonte('inria-serif-400', 54 if not vertical else 62)
    f_cab = fonte('inria-serif-400-italic', 40 if not vertical else 46)
    f_rot = fonte('inria-serif-700', 26 if not vertical else 34)
    f_site = fonte('inria-serif-400', 26 if not vertical else 30)
    m = 140 if not vertical else 90
    larg = (W * 0.58) if not vertical else (W - 2 * m)
    base_y = H * 0.52 if not vertical else H * 0.66
    arquivos = []
    for i in range(len(linhas)):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # cabeçalho
        d.text((m, 90 if not vertical else 120), cab['rotulo'].upper(), font=f_rot, fill=(*VERMELHO, 255))
        # data e celebração: quebram em até 2 linhas na largura do texto (nomes longos de santos)
        sub = quebrar(d, cab['sub'], f_cab, W - 2 * m)[:2]
        for j, t in enumerate(sub):
            d.text((m, (130 if not vertical else 165) + j * f_cab.size * 1.25), t, font=f_cab, fill=(242, 234, 216, 230))
        d.text((m, H - 80), 'liturgia.santadoutrina.com', font=f_site, fill=(242, 234, 216, 170))
        # a janela de linhas em volta da atual, com a atual no centro vertical
        blocos = []
        for k in range(i - 2, i + 4):
            if 0 <= k < len(linhas):
                blocos.append((k, quebrar(d, linhas[k]['texto'], corpo, larg)))
        lh = corpo.size * 1.35
        altura_atual = len(dict(blocos)[i]) * lh
        y = base_y - altura_atual / 2 - sum(len(b) * lh + lh * 0.35 for k, b in blocos if k < i)
        for k, bl in blocos:
            alfa = 255 if k == i else (95 if k < i else 125)
            for t in bl:
                if 60 < y < H - 140:
                    d.text((m, y), t, font=corpo, fill=(255, 255, 255, alfa) if k == i else (242, 234, 216, alfa))
                y += lh
            y += lh * 0.35
        arq = pasta / f't{i:04d}.png'
        im.save(arq)
        arquivos.append(arq)
    return arquivos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dia')
    ap.add_argument('leitura', choices=list(ROTULO))
    ap.add_argument('--short', action='store_true')
    ap.add_argument('--pintura')
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
        fundo(pintura, W, H, tmp / 'fundo.png', a.short)
        quadros = quadros_texto(linhas, cab, W, H, tmp, a.short)
        # lista do concat: cada quadro fica até a próxima linha começar
        lista = []
        for k, q in enumerate(quadros):
            t0 = 0 if k == 0 else linhas[k]['t0']
            t1 = linhas[k + 1]['t0'] if k + 1 < len(linhas) else dur
            lista.append(f"file '{q}'\nduration {max(0.04, t1 - t0):.3f}")
        lista.append(f"file '{quadros[-1]}'")
        (tmp / 'lista.txt').write_text('\n'.join(lista))
        fps = 30
        n = int(dur * fps) + fps
        zoom = f"zoompan=z='1+0.12*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps}"
        cmd = ['ffmpeg', '-loglevel', 'error', '-y',
               '-loop', '1', '-i', str(tmp / 'fundo.png'),
               '-f', 'concat', '-safe', '0', '-i', str(tmp / 'lista.txt'),
               '-ss', f'{ini:.3f}', '-t', f'{dur:.3f}', '-i', str(base.with_suffix('.mp3')),
               '-filter_complex', f"[0:v]{zoom},format=yuv420p[bg];[1:v]fps={fps},format=rgba[tx];[bg][tx]overlay=0:0:shortest=1,fade=in:0:15,fade=out:st={dur - 0.6:.2f}:d=0.6[v]",
               '-map', '[v]', '-map', '2:a', '-t', f'{dur:.3f}',
               '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(nome)]
        subprocess.run(cmd, check=True)
    print(f'{nome.relative_to(RAIZ)}  ({dur:.1f}s, {W}×{H}, pintura {pintura.name})')


if __name__ == '__main__':
    main()
