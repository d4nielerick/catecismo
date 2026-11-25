"""Áudio final do Evangelho ilustrado de 29/11: voz com reverb de igreja (leve) e delay nos gritos
("Cuidado!", "Vigiai," e o "Vigiai!" final), trilha por baixo e troca do áudio no completo.mp4 sem renderizar de novo.

  python3 mixa.py [trilha.mp3] [--folga 12] [--saida final.mp4] [--inicio 39]

Rodar dentro da pasta do dia. A trilha padrão é a do roteiro.json; --folga = dB da trilha abaixo da voz (padrão 15).
"""
import json, re, subprocess, sys
import numpy as np

args = sys.argv[1:]
def opcao(nome, padrao):
    if nome in args: i = args.index(nome); v = args[i + 1]; del args[i:i + 2]; return v
    return padrao
FOLGA = float(opcao('--folga', '15'))
SAIDA = opcao('--saida', 'final.mp4')
INICIO = opcao('--inicio', '0')   # segundo da trilha em que o vídeo começa
rot = json.load(open('roteiro.json'))
TRILHA = args[0] if args else rot['trilha']
SR, ATRASO, TOTAL = 48000, 0.5, 52.1
GRITOS = [(7.32, 8.45), (25.62, 26.32), (42.54, 43.7)]   # tempo na narração (Whisper, narracao/brian.json)

def ler(arq):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', arq, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

def conv(x, ir):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x) + len(ir) - 1]

def passa_banda(x, lo, hi):   # filtro simples no domínio da frequência
    n = len(x); f = np.fft.rfftfreq(n, 1 / SR); X = np.fft.rfft(x)
    X *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4) / np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(X, n)

voz = ler('narracao/brian.mp3')
rng = np.random.default_rng(7)
# resposta de impulso: ruído com decaimento exponencial (RT60 ~2,4 s), pré-delay 25 ms, agudos amortecidos
t = np.arange(int(2.8 * SR)) / SR
ir = rng.standard_normal(len(t)) * np.exp(-6.9 * t / 1.3)
ir = passa_banda(ir, 200, 5000); ir = np.concatenate([np.zeros(int(0.025 * SR)), ir]); ir /= np.sqrt((ir ** 2).sum())
cauda = 4 * SR
seco = np.concatenate([voz, np.zeros(cauda)])
molhado = np.pad(conv(voz, ir), (0, cauda))[:len(seco)]
mix = seco + 0.035 * molhado / (np.abs(molhado).max() + 1e-9) * np.abs(voz).max()

# delay nos gritos: 4 repetições a cada 330 ms, cada uma mais baixa e mais abafada, com reverb maior
for a, b in GRITOS:
    i0, i1 = int(a * SR), int(b * SR)
    trecho = voz[i0:i1] * np.hanning(i1 - i0) ** 0.15
    for k, g in enumerate([0.16, 0.06], 1):
        eco = passa_banda(trecho, 350, 2800 - 900 * k) * g
        p = i0 + int(k * 0.33 * SR)
        mix[p:p + len(eco)] += eco
    rv = conv(trecho, ir) * 0.05
    mix[i0:i0 + len(rv)] += rv[:len(mix) - i0] if i0 + len(rv) > len(mix) else rv

mix *= 0.95 / np.abs(mix).max()
mix.astype(np.float32).tofile('tmp/voz-fx.f32')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'tmp/voz-fx.f32', 'narracao/brian-fx.wav'], check=True)

def lufs(arq):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', arq, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])
vol = round(10 ** ((lufs('narracao/brian-fx.wav') - FOLGA - lufs(TRILHA)) / 20), 4)
print('trilha', TRILHA, 'volume', vol, f'({FOLGA} dB abaixo da voz)')
d = int(ATRASO * 1000)
fc = (f'[2:a]atrim=0:{TOTAL},asetpts=PTS-STARTPTS,volume={vol},afade=t=in:st=0:d=2,afade=t=out:st={TOTAL - 3:.2f}:d=3[m];'
      f'[1:a]adelay={d}|{d},apad[v0];[v0][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11,'
      f'alimiter=limit=0.95,atrim=0:{TOTAL}[a]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'completo.mp4', '-i', 'narracao/brian-fx.wav', '-stream_loop', '-1', '-ss', INICIO, '-i', TRILHA,
                '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', str(TOTAL),
                '-movflags', '+faststart', SAIDA], check=True)
print('ok', SAIDA)
