"""Respostas do terço em dueto (Ara e Castor, do Grok). coro(texto) -> caminho do wav estéreo 48 kHz (cache em vozg/coro-<hash>.wav)."""
import hashlib, os, subprocess
import numpy as np
from tts_grok import gerar
VOZES = ['ara', 'castor']; ATRASOS = [0, 0.07]; GANHOS = [1, 0.9]
SR = 48000

def ler(arq):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', arq, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

def esticar(arq, fator):   # fator > 1 encurta
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', arq, '-af', f'atempo={fator:.4f}', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

def conv(x, ir):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x) + len(ir) - 1]

def coro(texto, var=0):
    """Dueto que responde (Ara e Castor): a mesma frase, a 2ª voz 70 ms depois, cada uma num lado do estéreo, reverb leve.
    Sem esticar a fala: cada voz no próprio ritmo (esticar deixava o som metálico)."""
    h = hashlib.sha1(f'dueto2|{texto}|{var}|{",".join(VOZES)}'.encode()).hexdigest()[:12]; saida = f'vozg/coro-{h}.wav'
    if os.path.exists(saida): return saida
    xs = [ler(gerar(texto, var, v)) for v in VOZES]
    n = int((max(len(x) for x in xs) / SR + max(ATRASOS) + 1.2) * SR); L = np.zeros(n); R = np.zeros(n)
    for k, (x, a, g) in enumerate(zip(xs, ATRASOS, GANHOS)):
        x = x / np.abs(x).max() * g; p0 = int(a * SR); pan = k / (len(xs) - 1) - 0.5
        L[p0:p0 + len(x)] += x * np.sqrt((1 - pan) / 2); R[p0:p0 + len(x)] += x * np.sqrt((1 + pan) / 2)
    t = np.arange(int(1.4 * SR)) / SR
    for canal, seed in ((L, 1), (R, 2)):
        ir = np.random.default_rng(seed).standard_normal(len(t)) * np.exp(-6.9 * t / 1.2); ir /= np.sqrt((ir ** 2).sum())
        mol = conv(canal, ir)[:n]; canal += 0.06 * mol / (np.abs(mol).max() + 1e-9) * np.abs(canal).max()
    est = np.stack([L, R], 1); est *= 0.9 / np.abs(est).max()
    ult = np.nonzero(np.abs(est).max(1) > 0.01)[0][-1]; est = est[:ult + int(0.9 * SR)]
    tmp = saida + '.f32'; est.astype(np.float32).tofile(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', tmp, saida], check=True); os.remove(tmp)
    return saida

if __name__ == '__main__':
    import sys; print(coro(sys.argv[1]))
