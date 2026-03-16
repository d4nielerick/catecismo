#!/usr/bin/env python3
"""
Scrape do índice analítico de catecismo.net
Gera: data/indice_analitico.json

Estrutura:
[
  {
    "id": 1,
    "nome": "Abandono",
    "subtemas": [
      { "id": 1, "nome": "Abandono à providência", "paragrafos": [305, 322, 2115] },
      ...
    ]
  },
  ...
]

Suporta retomada: se o JSON já existir, pula subtemas já processados.
"""

import re
import json
import time
import urllib.request
import urllib.error
import sys
from html import unescape
from pathlib import Path

BASE = "https://catecismo.net"
OUT_PATH = Path("data/indice_analitico.json")
DELAY = 0.1       # segundos entre requests
MAX_RETRIES = 4   # tentativas por request


def request_with_retry(url, method="GET", retries=MAX_RETRIES):
    headers = {"User-Agent": "Mozilla/5.0"}
    if method == "POST":
        headers["X-Requested-With"] = "XMLHttpRequest"

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=b"" if method == "POST" else None,
                headers=headers,
                method=method,
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError) as e:
            wait = attempt * 3
            print(f"    [retry {attempt}/{retries}] {e} — aguardando {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"Falhou após {retries} tentativas: {url}")


def parse_letra(letra):
    """Retorna dict tema_id → {id, nome, subtemas:[]} a partir de uma letra."""
    html = request_with_retry(
        f"{BASE}/indice-analitico/filtro-pela-inicial/{letra}", method="POST"
    )
    links = re.findall(
        r'href="/indice-analitico/tema=(\d+)/subtema=(\d+)"[^>]*><label[^>]*>(.*?)</label>',
        html,
    )
    temas_map = {}
    for tema_id, subtema_id, label in links:
        tema_id = int(tema_id)
        subtema_id = int(subtema_id)
        nome = unescape(re.sub(r"<[^>]+>", "", label)).strip()

        if subtema_id == 0:
            if tema_id not in temas_map:
                temas_map[tema_id] = {"id": tema_id, "nome": nome, "subtemas": []}
        else:
            if tema_id not in temas_map:
                temas_map[tema_id] = {"id": tema_id, "nome": f"(tema {tema_id})", "subtemas": []}
            temas_map[tema_id]["subtemas"].append(
                {"id": subtema_id, "nome": nome, "paragrafos": None}  # None = ainda não processado
            )
    return temas_map


def fetch_paragrafos(tema_id, subtema_id):
    html = request_with_retry(f"{BASE}/indice-analitico/tema={tema_id}/subtema={subtema_id}")
    nums = re.findall(r"show_int\('[^']*',\s*'[^']*',\s*'[^']*',\s*'(\d+)'\)", html)
    return [int(n) for n in nums]


def load_existing():
    """Carrega JSON existente e monta índice de subtemas já processados."""
    if not OUT_PATH.exists():
        return {}, set()
    with open(OUT_PATH, encoding="utf-8") as f:
        data = json.load(f)
    temas = {t["id"]: t for t in data}
    done = set()
    for t in data:
        for s in t["subtemas"]:
            if s["paragrafos"] is not None:
                done.add((t["id"], s["id"]))
    return temas, done


def save(temas_dict):
    data = list(temas_dict.values())
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def scrape(letras):
    temas_dict, done = load_existing()
    print(f"Retomando: {len(done)} subtemas já processados")

    for letra in letras:
        print(f"\n=== Letra {letra} ===")
        try:
            temas_map = parse_letra(letra)
        except RuntimeError as e:
            print(f"  ERRO ao buscar letra {letra}: {e}")
            continue

        print(f"  {len(temas_map)} temas")

        for tema in temas_map.values():
            # Mescla com dados existentes
            if tema["id"] not in temas_dict:
                temas_dict[tema["id"]] = tema
            else:
                # Garante que novos subtemas sejam adicionados
                ids_existentes = {s["id"] for s in temas_dict[tema["id"]]["subtemas"]}
                for s in tema["subtemas"]:
                    if s["id"] not in ids_existentes:
                        temas_dict[tema["id"]]["subtemas"].append(s)

            print(f"  Tema {tema['id']}: {tema['nome']}")
            alterou = False
            for sub in temas_dict[tema["id"]]["subtemas"]:
                if (tema["id"], sub["id"]) in done:
                    continue  # já processado
                try:
                    paragrafos = fetch_paragrafos(tema["id"], sub["id"])
                    sub["paragrafos"] = paragrafos
                    done.add((tema["id"], sub["id"]))
                    print(f"    [{sub['id']}] {sub['nome']} → §§ {paragrafos}")
                    alterou = True
                    time.sleep(DELAY)
                except RuntimeError as e:
                    print(f"    ERRO subtema {sub['id']}: {e}")
                    sub["paragrafos"] = []

            if alterou:
                save(temas_dict)  # salva após cada tema

        save(temas_dict)

    return temas_dict


if __name__ == "__main__":
    letras = sys.argv[1:] if len(sys.argv) > 1 else list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    print(f"Letras: {letras}")

    temas_dict = scrape(letras)

    total_subtemas = sum(len(t["subtemas"]) for t in temas_dict.values())
    total_refs = sum(
        len(s["paragrafos"]) for t in temas_dict.values()
        for s in t["subtemas"] if s["paragrafos"]
    )
    print(f"\nFinalizado — Temas: {len(temas_dict)} | Subtemas: {total_subtemas} | Refs §§: {total_refs}")
    print(f"Salvo em {OUT_PATH} ({OUT_PATH.stat().st_size // 1024}KB)")
