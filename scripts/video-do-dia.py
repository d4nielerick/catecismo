#!/usr/bin/env python3
"""
scripts/video-do-dia.py — o vídeo único do dia para o YouTube: todas as leituras em sequência
(1ª leitura, salmo, 2ª leitura se houver, Evangelho), encerramento com o logo sobre a pintura do
Evangelho, capa 1280×720 e descrição com capítulos; opcionalmente já agenda no canal.

    python3 scripts/video-do-dia.py 2026-09-30 --pintura video/pinturas/arado-flow-3.jpeg \\
        --frase "Segue-me" --tema "A mão no arado" [--espelhar-leituras] [--espelhar-evangelho] \\
        [--pintura-leituras p] [--resumo "…"] [--enviar]

--frase vai entre aspas na capa: tem de ser palavra LITERAL do Evangelho do dia (o script confere).
--enviar agenda para as 5h (Brasília) do próprio dia, com a capa (scripts/youtube.mjs).
Sem --enviar, só gera: video/<dia>-leituras.mp4, <dia>-capa.jpg, <dia>-descricao.txt e
envio-leituras.mp4 (720p leve, para mandar e aprovar).
"""
import argparse, json, re, subprocess, sys, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
DADOS, SAIDA = RAIZ / 'data', RAIZ / 'video'
TRILHA = RAIZ / 'assets' / 'audio' / 'fundo-leitura.mp3'
LOGO = RAIZ / 'assets' / 'img' / 'liturgia-icone-512.png'
ORDEM = ['primeira-leitura', 'salmo', 'segunda-leitura', 'evangelho']
ROTULO = {'primeira-leitura': 'Primeira Leitura', 'salmo': 'Salmo Responsorial', 'segunda-leitura': 'Segunda Leitura', 'evangelho': 'Evangelho'}
SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
EVANGELISTA = {'Mt': 'Mateus', 'Mc': 'Marcos', 'Lc': 'Lucas', 'Jo': 'João'}
BRANCO, CREME, VERMELHO = (255, 255, 255), (242, 234, 216), (203, 46, 46)

sys.path.insert(0, str(RAIZ / 'scripts'))
import importlib.util
_spec = importlib.util.spec_from_file_location('vl', RAIZ / 'scripts' / 'video-liturgia.py')
vl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vl)
fonte = vl.fonte


def norm(t):
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s-]', '', unicodedata.normalize('NFC', t.lower()))).strip()


def logo(lado, raio):
    im = Image.open(LOGO).convert('RGBA').resize((lado, lado), Image.LANCZOS)
    m = Image.new('L', (lado, lado))
    ImageDraw.Draw(m).rounded_rectangle((0, 0, lado - 1, lado - 1), radius=raio, fill=255)
    im.putalpha(Image.composite(im.getchannel('A'), m, m))
    return im


def encerramento(pintura, destino):
    W, H = 1920, 1080
    tmp = SAIDA / '.fim-fundo.png'
    vl.fundo(pintura, W, H, tmp, False)
    im = Image.open(tmp).convert('RGB').crop((0, 0, W, H)).filter(ImageFilter.GaussianBlur(10))
    im = Image.blend(im, Image.new('RGB', im.size, (10, 8, 6)), 0.45).convert('RGBA')
    im.alpha_composite(logo(150, 34), ((W - 150) // 2, 250))
    d = ImageDraw.Draw(im)
    for y, t, f, cor in [(440, 'Liturgia Diária', fonte('inria-serif-700', 96), BRANCO),
                         (570, 'as leituras da Missa de cada dia', fonte('inria-serif-400-italic', 48), CREME),
                         (690, 'liturgia.santadoutrina.com', fonte('inria-serif-400', 40), VERMELHO)]:
        d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=cor)
    im.convert('RGB').save(destino)
    tmp.unlink()


def capa(pintura, espelhar, frase, linhas_info, destino):
    """Frase do Evangelho grande à esquerda (quebra em até 2 linhas), com a aspa vermelha."""
    W, H = 1280, 720
    im = Image.open(pintura).convert('RGB')
    if espelhar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    esc = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H)).convert('RGBA')
    g = Image.new('L', (W, H))
    dg = ImageDraw.Draw(g)
    for x in range(W):
        dg.line([(x, 0), (x, H)], fill=int(235 * max(0, 1 - x / (W * 0.62))))
    im = Image.composite(Image.new('RGBA', (W, H), (12, 9, 6, 255)), im, g)
    d = ImageDraw.Draw(im)
    d.text((64, 62), 'EVANGELHO DO DIA', font=fonte('inria-serif-700', 36), fill=(225, 60, 55))
    d.text((52, 70), '“', font=fonte('inria-serif-400-italic', 240), fill=VERMELHO)
    for tam in (120, 108, 96, 86, 76):
        f = fonte('inria-serif-700', tam)
        ls = vl.quebrar(d, frase, f, W * 0.52)
        if len(ls) == 1 or (len(ls) == 2 and tam <= 100):
            break
    if len(ls) > 2:
        sys.exit(f'a frase "{frase}" não cabe em duas linhas na capa: use um trecho mais curto')
    y = 200
    for t in ls:
        d.text((64, y), t, font=f, fill=BRANCO)
        y += tam * 0.9
    fi = fonte('inria-serif-400-italic', 42)
    y += 58
    for t in linhas_info:
        d.text((66, y), t, font=fi, fill=CREME)
        y += 54
    im.alpha_composite(logo(96, 22), (64, H - 146))
    d.text((182, H - 124), 'Liturgia Diária', font=fonte('inria-serif-700', 40), fill=BRANCO)
    d.text((182, H - 78), 'liturgia.santadoutrina.com', font=fonte('inria-serif-400', 28), fill=CREME)
    im.convert('RGB').save(destino, quality=92)


def mmss(s):
    s = int(s)
    return f'{s // 60}:{s % 60:02d}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dia')
    ap.add_argument('--pintura', required=True, help='pintura do Evangelho (fundo, encerramento e capa)')
    ap.add_argument('--pintura-leituras', help='pintura das outras leituras (padrão: a do trecho do dia)')
    ap.add_argument('--espelhar-leituras', action='store_true')
    ap.add_argument('--espelhar-evangelho', action='store_true')
    ap.add_argument('--direita-leituras', action='store_true', help='pintura das leituras encostada à direita (retratos)')
    ap.add_argument('--frase', required=True, help='frase literal do Evangelho para a capa')
    ap.add_argument('--tema', required=True, help='subtítulo curto da capa, ex.: "A mão no arado"')
    ap.add_argument('--resumo', default='', help='frase de resumo do Evangelho para a descrição')
    ap.add_argument('--enviar', action='store_true', help='agenda no YouTube para as 5h do dia')
    ap.add_argument('--refazer', action='store_true', help='refaz os vídeos de cada leitura mesmo se já existirem')
    a = ap.parse_args()

    dt = a.dia
    pasta_audio = DADOS / 'liturgia-audio' / dt
    leituras = [l for l in ORDEM if (pasta_audio / f'{l}.json').exists()]
    if 'evangelho' not in leituras:
        sys.exit(f'sem áudio do Evangelho em {pasta_audio}')
    ev_audio = json.loads((pasta_audio / 'evangelho.json').read_text())
    texto_ev = norm(' '.join(l['texto'] for l in ev_audio['linhas']))
    if norm(a.frase) not in texto_ev:
        sys.exit(f'a frase "{a.frase}" não está literalmente no Evangelho do dia')

    # 1) um vídeo por leitura (reaproveita os que já existem)
    durs = []
    for l in leituras:
        mp4 = SAIDA / f'{dt}-{l}.mp4'
        if a.refazer or not mp4.exists():
            cmd = [sys.executable, str(RAIZ / 'scripts' / 'video-liturgia.py'), dt, l, '--trilha', str(TRILHA)]
            if l == 'evangelho':
                cmd += ['--pintura', a.pintura] + (['--espelhar'] if a.espelhar_evangelho else [])
            else:
                cmd += (['--pintura', a.pintura_leituras] if a.pintura_leituras else []) + (['--espelhar'] if a.espelhar_leituras else []) + (['--direita'] if a.direita_leituras else [])
            subprocess.run(cmd, check=True)
        durs.append(float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp4)],
                                         capture_output=True, text=True, check=True).stdout))

    # 2) encerramento + junção
    fim = SAIDA / f'{dt}-fim.png'
    encerramento(Path(a.pintura), fim)
    final = SAIDA / f'{dt}-leituras.mp4'
    n = len(leituras)
    entradas = sum([['-i', str(SAIDA / f'{dt}-{l}.mp4')] for l in leituras], [])
    fmt = 'aformat=sample_rates=44100:channel_layouts=stereo'
    filtro = ''.join(f'[{k}:a]{fmt}[a{k}];' for k in range(n))
    filtro += f'[{n}:v]fps=30,scale=1920:1080,format=yuv420p,fade=in:0:20,fade=out:st=5:d=1[fv];'
    filtro += f'[{n + 1}:a]volume=0.5,afade=in:d=1,afade=out:st=4.5:d=1.5,{fmt}[fa];'
    filtro += ''.join(f'[{k}:v][a{k}]' for k in range(n)) + f'[fv][fa]concat=n={n + 1}:v=1:a=1[v][a]'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *entradas, '-loop', '1', '-t', '6', '-i', str(fim),
                    '-ss', '5', '-t', '6', '-i', str(TRILHA), '-filter_complex', filtro, '-map', '[v]', '-map', '[a]',
                    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(final)], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(final), '-vf', 'scale=1280:-2', '-c:v', 'libx264',
                    '-crf', '28', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', str(SAIDA / 'envio-leituras.mp4')], check=True)

    # 3) capa e descrição
    dia = json.loads((DADOS / 'liturgia' / f'{dt}.json').read_text())
    import datetime
    d0 = datetime.date.fromisoformat(dt)
    data_curta = f'{d0.day} de {MES[d0.month - 1]}'
    ref_ev = ev_audio['referencia']
    capa(Path(a.pintura), a.espelhar_evangelho, a.frase,
         [f'{ref_ev} · {a.tema}', f'{data_curta} · {dia["celebracao"]}'], SAIDA / f'{dt}-capa.jpg')

    refs = {l: json.loads((pasta_audio / f'{l}.json').read_text())['referencia'] for l in leituras}
    trechos_arq = DADOS / 'liturgia-trechos' / f'{dt}.json'
    trechos = json.loads(trechos_arq.read_text())['trechos'] if trechos_arq.exists() else {}
    trecho = lambda ref: next((v for k, v in trechos.items() if k.split(' (')[0] == ref.split(' (')[0]), '')
    ev_nome = EVANGELISTA.get(ref_ev.split()[0], '')
    lista = ', '.join(f'{ROTULO[l]} ({refs[l].split(" (")[0]})' for l in leituras if l != 'evangelho')
    t, cap = 0.0, []
    for l, du in zip(leituras, durs):
        extra = f': "{trecho(refs[l])}"' if l == 'salmo' and trecho(refs[l]) else ''
        cap.append(f'{mmss(t)} {ROTULO[l]} — {refs[l].split(" (")[0]}{extra}')
        t += du
    cap.append(f'{mmss(t)} Liturgia Diária · liturgia.santadoutrina.com')
    celebr = dia['celebracao']
    citacao = (trecho(ref_ev) or a.frase).rstrip()
    citacao += '' if citacao[-1] in '.!?' else '.'
    desc = f"""Liturgia Diária de {SEMANA[d0.weekday()]}, {data_curta} de {d0.year} — {celebr}. Ouça as leituras da Missa de hoje na íntegra: {lista} e o Evangelho de Jesus Cristo segundo São {ev_nome} ({ref_ev}).

"{citacao}"{(' ' + a.resumo) if a.resumo else ''}

📖 Leia as leituras de hoje, o comentário do Evangelho pelos Padres da Igreja e o Catecismo:
https://liturgia.santadoutrina.com/{dt}/

⏱️ Capítulos
{chr(10).join(cap)}

🔔 Inscreva-se e ative o sininho para receber a Liturgia Diária todas as manhãs, às 5h.

Textos litúrgicos: CNBB. Leitura em voz sintetizada. Pinturas geradas para a Liturgia Diária. Música: trilha da Liturgia Diária.

#LiturgiaDiária #EvangelhoDoDia #LiturgiaDeHoje #PalavraDeDeus #Católico
"""
    (SAIDA / f'{dt}-descricao.txt').write_text(desc)
    curto = re.sub(r',.*', '', celebr) if len(celebr) > 40 else celebr
    titulo = f'Evangelho do Dia {d0.day:02d}/{d0.month:02d} | Liturgia Diária de Hoje · {curto} | {ref_ev}'
    (SAIDA / f'{dt}-titulo.txt').write_text(titulo)
    print(f'{final.relative_to(RAIZ)}  ({t + 6:.0f}s)\n{titulo}')

    if a.enviar:
        subprocess.run(['node', str(RAIZ / 'scripts' / 'youtube.mjs'), 'envia', str(final), '--titulo', titulo,
                        '--descricao-arquivo', str(SAIDA / f'{dt}-descricao.txt'),
                        '--publicar-em', f'{dt}T05:00:00-03:00', '--capa', str(SAIDA / f'{dt}-capa.jpg')], check=True)


if __name__ == '__main__':
    main()
