#!/usr/bin/env python3
"""
scripts/build-instagram-liturgia.py — card diário do @liturgia_hoje (1080×1350) e a legenda.

    python3 scripts/build-instagram-liturgia.py [AAAA-MM-DD] [+N]   # padrão: hoje +30

Saída (fora do git, vai no deploy): liturgiadiaria/instagram/AAAA-MM-DD.jpg e .json { legenda }.
A VPS publica às 6h com scripts/publicar-instagram.mjs (a API do Instagram busca a imagem pelo
endereço público). Nada escrito na hora: o trecho é o do Evangelho em data/liturgia-trechos/ e a
pintura segue a mesma escolha do card de compartilhar (compartilhar.mjs › escolherFotos).
Precisa das fontes do macOS (Times New Roman/Georgia), por isso roda no Mac, junto com a janela.
"""
import json, sys, datetime as dt
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data'
SAIDA = RAIZ / 'liturgiadiaria' / 'instagram'
FONTES = Path('/System/Library/Fonts/Supplemental')
W, H, ALT = 1080, 1350, 760
CREME, TINTA, VERM, CINZA = (250, 247, 240), (28, 24, 20), (178, 34, 34), (120, 112, 102)
SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
HASHTAGS = '#liturgiadiaria #evangelhodehoje #liturgiadehoje #evangelhododia #palavradedeus #catolicos'

ler = lambda p: json.loads(Path(p).read_text())
fonte = lambda n, t: ImageFont.truetype(str(FONTES / n), t)

def quebrar(d, texto, f, largura):
    linhas, linha = [], ''
    for p in texto.split():
        x = f'{linha} {p}'.strip()
        if d.textlength(x, font=f) <= largura: linha = x
        else: linhas.append(linha); linha = p
    return linhas + [linha]

def pintura(dia, data, trechos, ref, catalogo, frases):
    """A escolhida para o Evangelho; senão a do santo do dia; senão a 1ª de escolherFotos."""
    pref = (trechos.get('imagens') or {}).get(ref) or (frases['frases'].get(dia['celebracao']) or {}).get('imagem')
    lista = catalogo['imagens']
    if pref and any(im['id'] == pref for im in lista): return pref
    nota = lambda im: (2 if dia['tempo'] in im['tempos'] else 0) + (1 if dia['cor'] in im['cores'] else 0)
    do_dia = sorted([im for im in lista if nota(im) > 0], key=nota, reverse=True)
    melhores = [im for im in do_dia if nota(im) == nota(do_dia[0])] if do_dia else [im for im in lista if 'todos' in im['tempos']]
    k = (dt.date.fromisoformat(data) - dt.date(1970, 1, 1)).days % len(melhores)
    return melhores[k]['id']

def card(arquivo, imagem, rotulo, texto, ref, data_txt):
    im = Image.new('RGB', (W, H), CREME); d = ImageDraw.Draw(im)
    p = Image.open(RAIZ / 'assets/img/cards' / f'{imagem}.webp').convert('RGB')
    p = p.crop((int(p.width * .06), int(p.height * .04), int(p.width * .94), int(p.height * .96)))   # borda da foto da tela
    r = max(W / p.width, ALT / p.height); p = p.resize((int(p.width * r) + 1, int(p.height * r) + 1), Image.LANCZOS)
    x = (p.width - W) // 2; y = int((p.height - ALT) * .3); im.paste(p.crop((x, y, x + W, y + ALT)), (0, 0))
    m, topo, fundo = 90, ALT + 10, H - 130
    for tam in (92, 84, 76, 68, 60, 54, 48, 42):
        f = fonte('Times New Roman Italic.ttf', tam); linhas = quebrar(d, f'“{texto}”', f, W - 2 * m)
        bloco = 40 + len(linhas) * int(tam * 1.2) + 60
        if bloco <= fundo - topo: break
    y = topo + (fundo - topo - bloco) // 2
    d.text((m, y), rotulo.upper(), font=fonte('Georgia.ttf', 26), fill=VERM); y += 40
    for l in linhas: d.text((m, y), l, font=f, fill=TINTA); y += int(tam * 1.2)
    d.text((m, y + 20), ref, font=fonte('Georgia Italic.ttf', 30), fill=CINZA)
    d.line((m, H - 110, W - m, H - 110), fill=(222, 214, 200), width=2)
    d.text((m, H - 88), data_txt, font=fonte('Times New Roman Italic.ttf', 36), fill=VERM)
    s = '@liturgia_hoje · liturgia.santadoutrina.com'; sf = fonte('Georgia.ttf', 24)
    d.text((W - m - d.textlength(s, font=sf), H - 80), s, font=sf, fill=CINZA)
    im.save(arquivo, quality=90)

def main():
    args = sys.argv[1:]
    de = dt.date.fromisoformat(args[0]) if args and args[0][:1].isdigit() else dt.date.today()
    n = int(next((a[1:] for a in args if a.startswith('+')), '30'))
    catalogo, frases = ler(DADOS / 'cards-imagens.json'), ler(DADOS / 'santos-frases.json')
    SAIDA.mkdir(exist_ok=True); feitos, faltam = 0, []
    for i in range(n):
        d = de + dt.timedelta(i); data = d.isoformat()
        try: dia, tr = ler(DADOS / 'liturgia' / f'{data}.json'), ler(DADOS / 'liturgia-trechos' / f'{data}.json')
        except FileNotFoundError: faltam.append(data); continue
        ev = next(l for l in dia['missas'][0]['leituras'] if l['tipo'] == 'evangelho')['referencia']
        texto = tr['trechos'].get(ev)
        if not texto: faltam.append(data); continue
        texto = texto[0].upper() + texto[1:]
        texto += '' if texto[-1] in '.!?' else '.'
        domingo = d.weekday() == 6
        festa = not dia.get('complemento') and not dia['celebracao'].startswith(tuple(SEMANA)) and 'Domingo' not in dia['celebracao']
        rotulo = dia['celebracao'] if festa else ('Evangelho do domingo' if domingo else 'Evangelho de hoje')
        if len(rotulo) > 46: rotulo = 'Evangelho de hoje'
        ref = f"{ev} · {dia['celebracao']}" if (domingo or festa) and len(ev + dia['celebracao']) < 52 else ev
        data_txt = f'{SEMANA[d.weekday()]}, {d.day} de {MESES[d.month - 1]}'
        card(SAIDA / f'{data}.jpg', pintura(dia, data, tr, ev, catalogo, frases), rotulo, texto, ref, data_txt)
        # a legenda só junta o que já está nos dados do dia (sem texto inventado)
        resumo = DADOS / 'liturgia-resumos' / f'{data}.json'
        partes = [f'“{texto}” ({ev})', dia['celebracao']]
        if resumo.exists():
            r = ler(resumo).get('resumo') or ler(resumo).get('texto')
            if r: partes.append(f'Hoje, {r[0].lower()}{r[1:]}')
        partes += ['📖 Leituras completas, áudio e o Evangelho comentado pelos Padres da Igreja: link na bio (liturgia.santadoutrina.com)', HASHTAGS]
        (SAIDA / f'{data}.json').write_text(json.dumps({'data': data, 'legenda': '\n\n'.join(partes)}, ensure_ascii=False, indent=2) + '\n')
        feitos += 1
    print(f'instagram: {feitos} cards em liturgiadiaria/instagram/' + (f' · sem trecho/dados: {", ".join(faltam)}' if faltam else ''))

main()
