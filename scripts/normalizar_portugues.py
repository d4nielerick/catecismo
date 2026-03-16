#!/usr/bin/env python3
"""
Normaliza ortografia PT-PT → PT-BR no indice_analitico.json.
Aplica substituições por palavra inteira, preservando capitalização.
"""

import re
import json
from pathlib import Path

# (PT-PT, PT-BR) — palavra inteira, case-insensitive
SUBSTITUICOES = [
    # -cção → -ção
    ("acção",       "ação"),
    ("acções",      "ações"),
    ("correcção",   "correção"),
    ("correcções",  "correções"),
    ("direcção",    "direção"),
    ("direcções",   "direções"),
    ("tracção",     "tração"),
    ("tracções",    "trações"),
    ("adopção",     "adoção"),
    ("adopções",    "adoções"),
    ("excepção",    "exceção"),
    ("excepções",   "exceções"),
    ("concepção",   "conceção"),
    ("concepções",  "conceções"),
    ("percepção",   "perceção"),
    ("percepções",  "perceções"),
    ("recepção",    "receção"),
    ("recepções",   "receções"),
    ("vocação",     "vocação"),   # já correto, só para garantir

    # bapt- → bat-
    ("baptismo",    "batismo"),
    ("baptismos",   "batismos"),
    ("baptismal",   "batismal"),
    ("baptismais",  "batismais"),
    ("baptizado",   "batizado"),
    ("baptizados",  "batizados"),
    ("baptizada",   "batizada"),
    ("baptizadas",  "batizadas"),
    ("baptizante",  "batizante"),
    ("baptizar",    "batizar"),
    ("baptização",  "batização"),
    ("baptizando",  "batizando"),

    # acto / facto / pacto (pacto já é BR) / exacto
    ("acto",        "ato"),
    ("actos",       "atos"),
    ("acta",        "ata"),
    ("actas",       "atas"),
    ("facto",       "fato"),
    ("factos",      "fatos"),
    ("exacto",      "exato"),
    ("exacta",      "exata"),
    ("exactamente", "exatamente"),
    ("inexacto",    "inexato"),

    # act- prefixo
    ("actual",      "atual"),
    ("actuais",     "atuais"),
    ("actualmente", "atualmente"),
    ("actualidade", "atualidade"),
    ("actualizar",  "atualizar"),
    ("actualização","atualização"),
    ("actor",       "ator"),
    ("actores",     "atores"),
    ("actriz",      "atriz"),
    ("activo",      "ativo"),
    ("activa",      "ativa"),
    ("activos",     "ativos"),
    ("activas",     "ativas"),
    ("actividade",  "atividade"),
    ("actividades", "atividades"),
    ("activar",     "ativar"),
    ("activação",   "ativação"),

    # outras grafias PT-PT comuns
    ("carácter",    "caráter"),
    ("caracteres",  "caracteres"),
]

# Compila regex de palavra inteira para cada par
_REGEXES = [
    (re.compile(r'\b' + re.escape(pt) + r'\b', re.IGNORECASE), br)
    for pt, br in SUBSTITUICOES
]


def _preservar_case(original: str, novo: str) -> str:
    """Preserva capitalização: Maiúscula → Maiúscula, MAIÚSCULA → MAIÚSCULA."""
    if original.isupper():
        return novo.upper()
    if original[0].isupper():
        return novo[0].upper() + novo[1:]
    return novo


def normalizar(texto: str) -> str:
    for regex, substituto in _REGEXES:
        def repor(m, sub=substituto):
            return _preservar_case(m.group(0), sub)
        texto = regex.sub(repor, texto)
    return texto


def processar_json(path: Path):
    with open(path, encoding="utf-8") as f:
        dados = json.load(f)

    alteracoes = 0
    for tema in dados:
        novo_nome = normalizar(tema["nome"])
        if novo_nome != tema["nome"]:
            print(f"  tema: {tema['nome']!r} → {novo_nome!r}")
            tema["nome"] = novo_nome
            alteracoes += 1
        for sub in tema.get("subtemas", []):
            novo_sub = normalizar(sub["nome"])
            if novo_sub != sub["nome"]:
                print(f"    subtema: {sub['nome']!r} → {novo_sub!r}")
                sub["nome"] = novo_sub
                alteracoes += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

    print(f"\n{alteracoes} substituições em {path}")


if __name__ == "__main__":
    path = Path("data/indice_analitico.json")
    print(f"Normalizando {path}…")
    processar_json(path)
