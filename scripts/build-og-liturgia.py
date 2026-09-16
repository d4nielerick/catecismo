"""
scripts/build-og-liturgia.py — imagem de compartilhamento (1200x630) de cada dia da Liturgia Diária.

    data/liturgia/AAAA-MM-DD.json  -->  liturgiadiaria/og/AAAA-MM-DD.jpg
                                   -->  liturgiadiaria/og/liturgia.jpg (página de hoje)

É a imagem que aparece no WhatsApp e nas redes quando alguém compartilha o link do dia: data,
celebração, tempo, Evangelho e a fita na cor litúrgica, no mesmo desenho da página. Gerada (não vai
para o git): rode antes do deploy, junto com scripts/build-paginas-liturgia.mjs.
Pula o que já existe; use --tudo para refazer. Requer Pillow e as fontes do macOS.
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'data' / 'liturgia'
SAIDA = RAIZ / 'liturgiadiaria' / 'og'
FAIXA = RAIZ / 'assets' / 'img' / 'liturgia-faixa.webp'
FONTES = Path('/System/Library/Fonts/Supplemental')

L, A = 1200, 630
FUNDO = (252, 250, 247)
TINTA = (0, 0, 0)
SUAVE = (125, 120, 114)
VERMELHO = (203, 46, 46)
# as mesmas cores da fita da página (liturgiadiaria.css)
COR_FITA = {'roxo': (91, 45, 134), 'verde': (31, 110, 61), 'vermelho': (184, 40, 42),
            'rosa': (214, 125, 158), 'preto': (38, 36, 34), 'branco': (245, 238, 220)}
COR_PONTO = {'roxo': (124, 58, 237), 'branco': (184, 151, 46), 'verde': (21, 128, 61),
             'vermelho': (220, 38, 38), 'rosa': (219, 39, 119), 'preto': (68, 64, 60)}
DOURADO = (184, 151, 46)

MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
         'setembro', 'outubro', 'novembro', 'dezembro']
SEMANA = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

X0 = 250          # início do texto (depois da faixa)
LARGURA_TEXTO = 1200 - X0 - 150


def fonte(nome, tamanho, indice=0):
    return ImageFont.truetype(str(nome), tamanho, index=indice)


def quebrar(desenho, texto, f, largura, max_linhas):
    linhas, atual = [], ''
    for palavra in texto.split():
        teste = f'{atual} {palavra}'.strip()
        if desenho.textlength(teste, font=f) <= largura or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    linhas.append(atual)
    if len(linhas) > max_linhas:
        linhas = linhas[:max_linhas]
        while desenho.textlength(linhas[-1] + '…', font=f) > largura:
            linhas[-1] = linhas[-1].rsplit(' ', 1)[0]
        linhas[-1] += '…'
    return linhas


def espacado(desenho, xy, texto, f, cor, espaco):
    x, y = xy
    for ch in texto:
        desenho.text((x, y), ch, font=f, fill=cor)
        x += desenho.textlength(ch, font=f) + espaco


def fita(desenho, cor):
    x, larg, alt, entalhe = 1040, 46, 118, 22
    preenchimento = COR_FITA.get(cor, COR_FITA['verde'])
    contorno = DOURADO if cor == 'branco' else None
    pontos = [(x, 0), (x + larg, 0), (x + larg, alt), (x + larg / 2, alt - entalhe), (x, alt)]
    desenho.polygon(pontos, fill=preenchimento, outline=contorno)
    costura = DOURADO if cor == 'branco' else tuple(min(255, c + 90) for c in preenchimento)
    for a, b in [((x + 6, 0), (x + 6, alt - 12)), ((x + larg - 6, 0), (x + larg - 6, alt - 12))]:
        for y in range(0, int(b[1]), 9):
            desenho.line([(a[0], y), (a[0], min(y + 5, b[1]))], fill=costura, width=1)


def base(faixa):
    img = Image.new('RGB', (L, A), FUNDO)
    img.paste(faixa, (80, 0))
    return img


def carregar_faixa():
    tile = Image.open(FAIXA).convert('RGB')
    largura = 110
    escala = largura / tile.width
    tile = tile.resize((largura, round(tile.height * escala)), Image.LANCZOS)
    coluna = Image.new('RGB', (largura, A), (27, 26, 24))
    y = 0
    while y < A:
        coluna.paste(tile, (0, y))
        y += tile.height
    return coluna


def desenhar(dt, dia, faixa):
    img = base(faixa)
    d = ImageDraw.Draw(img)
    titulo = fonte(FONTES / 'Times New Roman Italic.ttf', 92)
    data_f = fonte(FONTES / 'Georgia.ttf', 32)
    selo = fonte('/System/Library/Fonts/Helvetica.ttc', 21, 1)
    celebra = fonte(FONTES / 'Times New Roman Italic.ttf', 60)
    rodape = fonte(FONTES / 'Georgia.ttf', 28)
    site = fonte(FONTES / 'Georgia Italic.ttf', 24)

    fita(d, dia.get('cor') if dia else 'verde')
    d.text((X0, 58), 'Liturgia Diária', font=titulo, fill=TINTA)

    if dia is None:
        d.text((X0, 205), 'Leituras da missa de cada dia', font=data_f, fill=SUAVE)
        linhas = ['Primeira leitura, salmo e Evangelho,', 'com o calendário da Igreja']
        for i, linha in enumerate(linhas):
            d.text((X0, 300 + i * 70), linha, font=celebra, fill=TINTA)
    else:
        y_, m_, d_ = map(int, dt.split('-'))
        quando = date(y_, m_, d_)
        d.text((X0, 205), f'{SEMANA[quando.weekday()]}, {d_} de {MESES[m_ - 1]} de {y_}', font=data_f, fill=SUAVE)
        cor = COR_PONTO.get(dia.get('cor'), SUAVE)
        d.ellipse([X0, 272, X0 + 14, 286], fill=cor)
        espacado(d, (X0 + 30, 267), (dia.get('tempo') or '').upper(), selo, SUAVE, 3)
        linhas = quebrar(d, dia.get('celebracao') or '', celebra, LARGURA_TEXTO, 2)
        for i, linha in enumerate(linhas):
            d.text((X0, 318 + i * 72), linha, font=celebra, fill=TINTA)
        evangelho = next((l for l in dia['missas'][0]['leituras'] if l['tipo'] == 'evangelho' and not l.get('alternativa')), None)
        if evangelho and evangelho.get('referencia'):
            d.rectangle([X0, 520, X0 + 36, 522], fill=VERMELHO)
            d.text((X0 + 52, 503), f'Evangelho · {evangelho["referencia"]}', font=rodape, fill=TINTA)

    d.text((L - 60, A - 48), 'santadoutrina.cloud', font=site, fill=SUAVE, anchor='ra')
    return img


def gerar(args):
    dt, refazer = args
    destino = SAIDA / f'{dt}.jpg'
    if destino.exists() and not refazer:
        return 0
    dia = json.loads((DADOS / f'{dt}.json').read_text()) if dt != 'liturgia' else None
    desenhar(dt, dia, carregar_faixa()).save(destino, 'JPEG', quality=84, optimize=True, progressive=True)
    return 1


if __name__ == '__main__':
    refazer = '--tudo' in sys.argv
    SAIDA.mkdir(parents=True, exist_ok=True)
    datas = sorted(p.stem for p in DADOS.glob('[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json'))
    with ProcessPoolExecutor() as pool:
        feitas = sum(pool.map(gerar, [(dt, refazer) for dt in ['liturgia', *datas]], chunksize=16))
    total = sum(p.stat().st_size for p in SAIDA.glob('*.jpg'))
    print(f'liturgiadiaria/og: {feitas} imagens geradas, {len(datas) + 1} no total ({total // 1024 // 1024}MB)')
