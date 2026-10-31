#!/usr/bin/env python3
"""
scripts/build-instagram-liturgia.py — card diário do @liturgia_hoje (1080×1350) e a legenda.

    python3 scripts/build-instagram-liturgia.py [AAAA-MM-DD] [+N]   # padrão: hoje +30

Saída (fora do git, vai no deploy): liturgiadiaria/instagram/AAAA-MM-DD.jpg e .json { legenda }.
A VPS publica às 6h com scripts/publicar-instagram.mjs (a API do Instagram busca a imagem pelo
endereço público). Nada escrito na hora: o trecho, a parte dele em itálico (fortes) e a pintura estão
em data/liturgia-trechos/. Fontes em scripts/fontes/: Instrument Serif e Inter (só no rótulo).
"""
import json, sys, datetime as dt
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data'
SAIDA = RAIZ / 'liturgiadiaria' / 'instagram'
FONTES = RAIZ / 'scripts' / 'fontes'
W, H, ALT = 1080, 1350, 760
CREME, TINTA, VERM, CINZA = (250, 247, 240), (28, 24, 20), (178, 34, 34), (120, 112, 102)
SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
HASHTAGS = '#liturgiadiaria #evangelhodehoje #liturgiadehoje #evangelhododia #palavradedeus #catolicos'

ler = lambda p: json.loads(Path(p).read_text())
fonte = lambda n, t: ImageFont.truetype(str(FONTES / n), t)
serifa = lambda t: fonte('InstrumentSerif-Regular.ttf', t)
italico = lambda t: fonte('InstrumentSerif-Italic.ttf', t)
ENTRELINHA = 1.04

def rotulo_fonte(t):
    f = fonte('Inter-Variable.ttf', t)
    f.set_variation_by_axes([600 if b'eight' in e['name'] else e['default'] for e in f.get_variation_axes()])
    return f

def palavras(texto):
    """'normal *forte*.' -> [(palavra, itálico?)]; a pontuação colada acompanha a palavra."""
    pals, it = [], False
    for bruta in texto.split():
        limpa = bruta.replace('*', ''); letras = False
        for c in bruta:
            if c == '*': it = not it
            elif c.isalnum() and it: letras = True
        pals.append((limpa, letras))
    return pals

def equilibrar(d, pals, t, largura):
    """O menor número de linhas, com as linhas mais parecidas entre si (sem palavra sozinha no fim)."""
    esp = d.textlength(' ', font=serifa(t)); ws = [d.textlength(p, font=italico(t) if i else serifa(t)) for p, i in pals]; n = len(pals)
    melhor = {n: (0, 0, None)}   # posição -> (linhas, custo, próxima quebra)
    for a in range(n - 1, -1, -1):
        cand = []
        for b in range(a + 1, n + 1):
            w = sum(ws[a:b]) + esp * (b - a - 1)
            if w > largura and b > a + 1: break
            cand.append((melhor[b][0] + 1, melhor[b][1] + (largura - w) ** 2, b))
        melhor[a] = min(cand)
    linhas, a = [], 0
    while a < n: linhas.append(pals[a:melhor[a][2]]); a = melhor[a][2]
    return linhas

def quebrar(d, pals, t, largura):
    # a frase forte começa em linha própria quando o que vem antes já é uma frase completa
    blocos, atual = [], []
    for k, (p, i) in enumerate(pals):
        if atual and i and not pals[k - 1][1] and pals[k - 1][0][-1] in '.!?': blocos.append(atual); atual = []
        atual.append((p, i))
    return [l for b in blocos + [atual] for l in equilibrar(d, b, t, largura)]

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
    m, topo, fundo = 90, ALT + 36, H - 122
    pals = palavras(texto)
    for tam in (84, 78, 72, 66, 60, 54, 48, 44):
        linhas = quebrar(d, pals, tam, W - 2 * m); passo = int(tam * ENTRELINHA)
        bloco = 64 + len(linhas) * passo + 68
        if bloco <= fundo - topo: break
    y = topo + (fundo - topo - bloco) // 2
    x, fr = m, rotulo_fonte(22)
    for c in rotulo.upper(): d.text((x, y + 2), c, font=fr, fill=VERM); x += d.textlength(c, font=fr) + 2.2
    y += 64
    esp = d.textlength(' ', font=serifa(tam))
    for n, lin in enumerate(linhas):
        x = m
        if n == 0:   # aspas penduradas: ficam fora da margem, e as linhas alinham
            f0 = italico(tam) if lin[0][1] else serifa(tam)
            d.text((m - d.textlength('“', font=f0), y), '“', font=f0, fill=TINTA)
        for k, (pal, it) in enumerate(lin):
            f = italico(tam) if it else serifa(tam)
            t = pal + ('”' if n == len(linhas) - 1 and k == len(lin) - 1 else '')
            d.text((x, y), t, font=f, fill=TINTA); x += d.textlength(t, font=f) + esp
        y += passo
    d.text((m, y + 30), ref, font=italico(34), fill=CINZA)
    d.line((m, H - 104, W - m, H - 104), fill=(222, 214, 200), width=2)
    d.text((m, H - 86), data_txt, font=italico(38), fill=VERM)
    s = '@liturgia_hoje'; sf = serifa(28)
    d.text((W - m - d.textlength(s, font=sf), H - 80), s, font=sf, fill=CINZA)
    im.save(arquivo, quality=92)

def main():
    args = sys.argv[1:]
    de = dt.date.fromisoformat(args[0]) if args and args[0][:1].isdigit() else dt.date.today()
    n = int(next((a[1:] for a in args if a.startswith('+')), '30'))
    catalogo, frases = ler(DADOS / 'cards-imagens.json'), ler(DADOS / 'santos-frases.json')
    SAIDA.mkdir(exist_ok=True); feitos, faltam, rodizio = 0, [], []
    for i in range(n):
        d = de + dt.timedelta(i); data = d.isoformat()
        try: dia, tr = ler(DADOS / 'liturgia' / f'{data}.json'), ler(DADOS / 'liturgia-trechos' / f'{data}.json')
        except FileNotFoundError: faltam.append(data); continue
        ev = next(l for l in dia['missas'][0]['leituras'] if l['tipo'] == 'evangelho')['referencia']
        texto = tr['trechos'].get(ev)
        if not texto: faltam.append(data); continue
        if not (tr.get('imagens') or {}).get(ev) and not (frases['frases'].get(dia['celebracao']) or {}).get('imagem'): rodizio.append(data)
        texto = texto[0].upper() + texto[1:]
        texto += '' if texto[-1] in '.!?' else '.'
        forte = (tr.get('fortes') or {}).get(ev, '')
        marcado = re.sub(re.escape(forte), lambda c: f'*{c.group(0)}*', texto, count=1, flags=re.I) if forte else texto
        domingo = d.weekday() == 6
        festa = not dia.get('complemento') and not dia['celebracao'].startswith(tuple(SEMANA)) and 'Domingo' not in dia['celebracao']
        # o card é sempre do Evangelho: a celebração, se houver, fica só na linha da referência
        rotulo = 'Evangelho do domingo' if domingo else 'Evangelho de hoje'
        ref = f"{ev} · {dia['celebracao']}" if (domingo or festa) and len(ev + dia['celebracao']) < 52 else ev
        data_txt = f'{SEMANA[d.weekday()]}, {d.day} de {MESES[d.month - 1]}'
        card(SAIDA / f'{data}.jpg', pintura(dia, data, tr, ev, catalogo, frases), rotulo, marcado, ref, data_txt)
        # a legenda só junta o que já está nos dados do dia (sem texto inventado)
        resumo = DADOS / 'liturgia-resumos' / f'{data}.json'
        partes = [f'“{texto}” ({ev})', dia['celebracao']]
        if resumo.exists():
            r = ler(resumo).get('resumo') or ler(resumo).get('texto')
            if r: partes.append(f'Hoje, {r[0].lower()}{r[1:]}')
        partes += ['📖 Leituras completas, áudio e o Evangelho comentado pelos Padres da Igreja: link na bio', HASHTAGS]
        (SAIDA / f'{data}.json').write_text(json.dumps({'data': data, 'legenda': '\n\n'.join(partes)}, ensure_ascii=False, indent=2) + '\n')
        feitos += 1
    print(f'instagram: {feitos} cards em liturgiadiaria/instagram/' + (f' · sem trecho/dados: {", ".join(faltam)}' if faltam else ''))
    if rodizio: print(f'  ATENÇÃO: {len(rodizio)} dias sem pintura escolhida (saem no rodízio, sem relação com o Evangelho): {", ".join(rodizio)}')

if __name__ == '__main__':
    main()
