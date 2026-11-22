#!/bin/bash
# Sobe para a VPS os Reels de cenas e as capas dos dias pedidos, confere o md5 de cada vídeo e se a legenda
# do dia (liturgiadiaria/instagram/<dia>.json) já está lá. O publicador solta o Reel às 6h de Brasília.
# Uso: scripts/reels/reels-cenas-subir.sh AAAA-MM-DD …   (O = pasta do lote, como em reels-cenas-lote.sh)
cd "$(dirname "$0")/../.."
CENAS=${CENAS:-instagram-posts/reels-cenas}; O=${O:-$CENAS/lote}
R=/opt/mediaserver/catecismo/liturgiadiaria/instagram/reels
for d in "$@"; do
  [ -f "$O/cenas-$d.mp4" ] && [ -f "$O/capas/$d.jpg" ] || { echo "$d: falta arquivo local"; continue; }
  scp -q "$O/cenas-$d.mp4" "vps:$R/$d.mp4" && scp -q "$O/capas/$d.jpg" "vps:$R/capas/$d.jpg" || { echo "$d: falhou o envio"; continue; }
  remoto=$(ssh vps "chmod 644 $R/$d.mp4 $R/capas/$d.jpg; md5sum < $R/$d.mp4 | cut -c1-32; test -f $R/../$d.json && echo leg || echo SEM-LEGENDA")
  [ "$(echo "$remoto" | head -1)" = "$(md5 -q "$O/cenas-$d.mp4")" ] && echo "$d ok $(echo "$remoto" | tail -1)" || echo "$d: md5 diferente"
done
