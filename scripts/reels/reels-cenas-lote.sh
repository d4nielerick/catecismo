#!/bin/bash
# Renderiza os Reels de cenas (4–5 pinturas por Evangelho) e as capas dos dias listados em escolhas.json
# que ainda não existem na pasta de saída. Pastas de trabalho (fora do git):
#   CENAS  (padrão instagram-posts/reels-cenas): escolhas.json { "AAAA-MM-DD": ["1a","2b",…] } e flow/cena-<dia>-<n><a|b>.jpg
#   O      (padrão $CENAS/lote): cenas-<dia>.mp4 e capas/<dia>.jpg
# Uso: scripts/reels/reels-cenas-lote.sh            (depois: scripts/reels/reels-cenas-subir.sh AAAA-MM-DD …)
cd "$(dirname "$0")/../.."
CENAS=${CENAS:-instagram-posts/reels-cenas}; O=${O:-$CENAS/lote}
mkdir -p "$O/capas"
for d in $(python3 -c "import json;print(' '.join(json.load(open('$CENAS/escolhas.json'))))"); do
  [ -f "$O/cenas-$d.mp4" ] && [ -f "$O/capas/$d.jpg" ] && continue
  imgs=$(python3 -c "import json;print(' '.join('$CENAS/flow/cena-$d-'+s+'.jpg' for s in json.load(open('$CENAS/escolhas.json'))['$d']))")
  python3 scripts/reels/montar-reel-cenas.py "$d" "$O/cenas-$d.mp4" $imgs 2>&1 | tail -1
  python3 scripts/reels/capa-reel.py "$O/cenas-$d.mp4" "$d" "$O/capas/$d.jpg" >/dev/null 2>&1 || echo "$d sem capa"
done
