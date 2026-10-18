#!/usr/bin/env python3
"""Testa public.risk_level_report no Supabase sem deixar rastro.

Tudo roda numa transação desfeita no fim: cria duas usuárias temporárias, grava
avaliações, chama a função como cada uma (papel authenticated) e como anon.

Uso: python data-processing/testar_risk_level_report.py
"""
import json
import uuid

import psycopg2

from importar_ssp_supabase import PROJECT_ROOT, database_config, load_dotenv

V3 = "contexto-ssp+corpo-3camadas-v2.0:uci-har-motion-if-v2"


def como(cur, papel, usuaria=None):
    cur.execute("reset role")
    claims = json.dumps({"sub": str(usuaria), "role": papel}) if usuaria else json.dumps({"role": papel})
    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
    cur.execute(f"set local role {papel}")


def main():
    load_dotenv(PROJECT_ROOT / ".env")
    config = database_config()
    conn = psycopg2.connect(**config) if isinstance(config, dict) else psycopg2.connect(config)
    falhas = []
    try:
        cur = conn.cursor()
        a, b = uuid.uuid4(), uuid.uuid4()
        for u in (a, b):
            cur.execute("insert into auth.users (id, aud, role, email) values (%s, 'authenticated', 'authenticated', %s)", (str(u), f"teste-{u}@exemplo.invalid"))
        linhas = [
            # usuária A: 23/10 às 14h em São Paulo (17h UTC)
            (a, "2026-10-23T17:00:00Z", "alto", "so_celular", V3),
            (a, "2026-10-23T17:00:30Z", "alto", "so_celular", V3),
            (a, "2026-10-23T17:01:00Z", None, "so_celular", V3),
            # 02h UTC do dia 24 = 23h do dia 23 em São Paulo
            (a, "2026-10-24T02:10:00Z", "baixo", "completo", V3),
            # avaliação da fusão antiga: tem que ficar de fora
            (a, "2026-10-23T17:02:00Z", "alto", None, "bpm-context-motion-v0.2"),
            # usuária B: não pode aparecer para A
            (b, "2026-10-23T17:00:00Z", "moderado", "completo", V3),
        ]
        for u, quando, nivel, modo, versao in linhas:
            cur.execute(
                "insert into public.risk_assessments (user_id, measured_at, bpm, experimental_risk_level, sensor_mode, model_version, source) values (%s, %s, null, %s, %s, %s, 'teste')",
                (str(u), quando, nivel, modo, versao),
            )

        como(cur, "authenticated", a)
        cur.execute("select dia::text, hora, nivel, modo_sensores, avaliacoes from public.risk_level_report('2026-10-01', '2026-11-01')")
        resultado = cur.fetchall()
        esperado = [
            ("2026-10-23", 14, "alto", "so_celular", 2),
            ("2026-10-23", 14, "sem_nivel", "so_celular", 1),
            ("2026-10-23", 23, "baixo", "completo", 1),
        ]
        if resultado != esperado:
            falhas.append(f"usuária A: {resultado} != {esperado}")

        como(cur, "authenticated", b)
        cur.execute("select nivel, avaliacoes from public.risk_level_report('2026-10-01', '2026-11-01')")
        if cur.fetchall() != [("moderado", 1)]:
            falhas.append("usuária B viu linhas que não são dela")

        como(cur, "anon")
        try:
            cur.execute("savepoint antes_anon")
            cur.execute("select * from public.risk_level_report('2026-10-01')")
            falhas.append("anon conseguiu executar a função")
        except psycopg2.errors.InsufficientPrivilege:
            cur.execute("rollback to savepoint antes_anon")
    finally:
        conn.rollback()
        conn.close()

    if falhas:
        raise SystemExit("FALHOU:\n- " + "\n- ".join(falhas))
    print("risk_level_report OK: fuso de São Paulo, só a própria usuária, sem a fusão antiga, sem acesso anon (nada gravado)")


if __name__ == "__main__":
    main()
