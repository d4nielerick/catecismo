#!/usr/bin/env python3
"""
textura-pintura.py — tira o ar "liso de IA" de uma pintura gerada: pinceladas direcionais, trama de tela
(canvas), granulação e um leve amaciamento. O resultado é uma cópia com cara de óleo sobre tela.

    python3 scripts/textura-pintura.py video/pinturas/X.jpeg video/pinturas/X-tela.jpg [--forca 1.0]

Camadas (todas somadas à imagem, nenhuma a redesenha):
  1. amacia o excesso de microdetalhe digital (filtro que preserva bordas, misturado)
  2. pinceladas: ruído alongado ao longo das bordas da própria pintura (tensor de estrutura),
     em duas escalas; viram relevo e uma pequena variação de tom por pincelada
  3. tela: trama de fios com irregularidade, vista com luz rasante
  4. granulação fina, pretos levemente levantados, vinheta e um pouco menos de saturação
"""
import argparse
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('entrada')
ap.add_argument('saida')
ap.add_argument('--forca', type=float, default=1.0, help='multiplica todas as texturas (0.5 = metade, 1.5 = mais)')
ap.add_argument('--semente', type=int, default=7)
a = ap.parse_args()
rng = np.random.default_rng(a.semente)
F = a.forca

img8 = cv2.imread(a.entrada)
h, w = img8.shape[:2]
esc = w / 1920                                   # tudo é medido em "pixels de uma imagem de 1920"
img = img8.astype(np.float32) / 255

# 1) amacia o microdetalhe liso demais
suave = cv2.edgePreservingFilter(img8, flags=1, sigma_s=30 * esc, sigma_r=0.22).astype(np.float32) / 255
suave = cv2.GaussianBlur(suave, (0, 0), 0.7 * esc)
img = 0.45 * img + 0.55 * suave

# 2) pinceladas ao longo das bordas
gray = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
g = cv2.GaussianBlur(gray, (0, 0), 2.0 * esc)
gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
sig = 7 * esc
jxx = cv2.GaussianBlur(gx * gx, (0, 0), sig)
jyy = cv2.GaussianBlur(gy * gy, (0, 0), sig)
jxy = cv2.GaussianBlur(gx * gy, (0, 0), sig)
coer = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (jxx + jyy + 1e-9)     # 0 = sem direção (céu liso), 1 = borda nítida
# em regiões sem direção as pinceladas correm quase na horizontal, como num céu pintado; nas bordas, seguem a borda
d2 = np.arctan2(2 * jxy, jxx - jyy) + np.pi                                 # ângulo duplicado, ao longo da borda
wc = np.clip(coer * 1.6, 0, 1)
vx = wc * np.cos(d2) + (1 - wc) * np.cos(2 * 0.12)
vy = wc * np.sin(d2) + (1 - wc) * np.sin(2 * 0.12)
theta = 0.5 * np.arctan2(vy, vx)
energia = jxx + jyy
peso_pincel = 0.35 + 0.65 * np.clip(energia / (np.percentile(energia, 85) + 1e-9), 0, 1)   # o céu tem menos relevo
NB = 14
bins = np.clip(((theta % np.pi) / np.pi * NB).astype(np.int32), 0, NB - 1)

def pinceladas(escala, comprimento):
    """Ruído filtrado em linha, na direção de cada pixel; `escala` < 1 engrossa a pincelada."""
    sw, sh = max(8, int(w * escala)), max(8, int(h * escala))
    ruido = cv2.resize(rng.standard_normal((sh, sw)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    L = int(comprimento * esc) | 1
    pilha = []
    for k in range(NB):
        ang = k * np.pi / NB
        ker = np.zeros((L, L), np.float32)
        c = L // 2
        dx, dy = np.cos(ang) * c, np.sin(ang) * c
        cv2.line(ker, (int(round(c - dx)), int(round(c - dy))), (int(round(c + dx)), int(round(c + dy))), 1.0, 1, cv2.LINE_AA)
        ker /= ker.sum()
        pilha.append(cv2.filter2D(ruido, -1, ker, borderType=cv2.BORDER_REFLECT))
    r = np.take_along_axis(np.stack(pilha, 0), bins[None], axis=0)[0]
    return (r - r.mean()) / (r.std() + 1e-6)

relevo = 0.65 * pinceladas(0.5, 41) + 0.5 * pinceladas(1.0, 21)
relevo = cv2.GaussianBlur(relevo, (0, 0), 1.0 * esc) * cv2.GaussianBlur(peso_pincel, (0, 0), 6 * esc)
rx = cv2.Sobel(relevo, cv2.CV_32F, 1, 0, ksize=3)
ry = cv2.Sobel(relevo, cv2.CV_32F, 0, 1, ksize=3)
luz = (-rx * 0.7 - ry * 0.7)                                  # luz vinda do alto à esquerda
luz /= (np.abs(luz).max() + 1e-6)
img = img * (1 + (0.55 * luz + 0.025 * relevo)[..., None] * 0.30 * F)

# 3) trama da tela, com fios irregulares e luz rasante
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
per = 5.2 * esc
warp = lambda: cv2.resize(rng.standard_normal((max(4, h // 160), max(4, w // 160))).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
u = (xx + warp() * 1.6 * esc) / per * 2 * np.pi
v = (yy + warp() * 1.6 * esc) / per * 2 * np.pi
fio_x = rng.standard_normal(int(w / per) + 3).astype(np.float32)   # cada fio com seu brilho
fio_y = rng.standard_normal(int(h / per) + 3).astype(np.float32)
var = 0.05 * (fio_x[np.clip((xx / per).astype(int), 0, len(fio_x) - 1)] + fio_y[np.clip((yy / per).astype(int), 0, len(fio_y) - 1)])
trama = 0.6 * np.cos(u) * np.cos(v) + 0.25 * (np.cos(u) + np.cos(v)) + var
trama = cv2.GaussianBlur(trama, (0, 0), 0.5 * esc)
img = img * (1 + 0.075 * F * trama[..., None])

# 4) granulação, pretos levantados, vinheta e cor um pouco mais calma
img += rng.standard_normal((h, w, 1)).astype(np.float32) * 0.010 * F
img = img * 0.965 + 0.022                                      # preto nunca é preto numa tela
hsv = cv2.cvtColor(np.clip(img, 0, 1), cv2.COLOR_BGR2HSV)
hsv[..., 1] *= 0.94
img = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
img *= (1 - 0.10 * np.clip(d - 0.55, 0, None) ** 1.5)[..., None]
cv2.imwrite(a.saida, (np.clip(img, 0, 1) * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
print('ok', a.saida, f'{w}x{h}')
