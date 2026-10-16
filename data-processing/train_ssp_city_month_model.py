#!/usr/bin/env python3
"""Run an exploratory, aggregate-only monthly crime-count forecast.

The model estimates the next month's provisional interpersonal-violence count
per municipality. It is a research experiment, not an individual risk score or
a safety guarantee. Input must be a complete municipality-month-category grid.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import pandas as pd


REQUIRED = {
    "ano_estatistica", "mes_estatistica", "municipio", "grupo_provisorio", "registros",
}
TARGET_GROUP = "violência interpessoal"
TEST_YEAR = 2026


def load_panel(path: Path) -> pd.DataFrame:
    text = path.read_text(encoding="utf-8-sig")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines and lines[0].startswith("|"):
        lines = [
            line for line in lines
            if not all(part.strip().strip(":-").strip() == "" for part in line.strip("|").split("|"))
        ]
        text = "\n".join(line.strip("|") for line in lines)
        data = pd.read_csv(io.StringIO(text), sep="|")
        data.columns = data.columns.str.strip()
        data = data.loc[:, ~data.columns.str.match(r"^Unnamed")]
    else:
        data = pd.read_csv(io.StringIO(text), sep=None, engine="python")
    missing = REQUIRED - set(data.columns)
    if missing:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(missing))}")

    data = data[list(REQUIRED)].copy()
    data["ano_estatistica"] = pd.to_numeric(data["ano_estatistica"], errors="raise").astype(int)
    data["mes_estatistica"] = pd.to_numeric(data["mes_estatistica"], errors="raise").astype(int)
    data["registros"] = pd.to_numeric(data["registros"], errors="raise")
    for column in ("municipio", "grupo_provisorio"):
        data[column] = data[column].astype("string").str.strip()
    if data[["municipio", "grupo_provisorio"]].isna().any().any() or data["registros"].isna().any():
        raise ValueError("Município, grupo e contagem não podem estar vazios")
    if not data["mes_estatistica"].between(1, 12).all():
        raise ValueError("Mês estatístico precisa estar entre 1 e 12")
    if (data["registros"] < 0).any() or (data["registros"] % 1 != 0).any():
        raise ValueError("As contagens precisam ser inteiros não negativos")
    keys = ["ano_estatistica", "mes_estatistica", "municipio", "grupo_provisorio"]
    if data.duplicated(keys).any():
        raise ValueError("Há linhas duplicadas para município, mês e grupo")

    data["mes_data"] = pd.to_datetime(dict(year=data.ano_estatistica, month=data.mes_estatistica, day=1))
    municipalities = sorted(data.municipio.unique())
    groups = sorted(data.grupo_provisorio.unique())
    months = pd.date_range(data.mes_data.min(), data.mes_data.max(), freq="MS")
    expected = len(municipalities) * len(groups) * len(months)
    if len(data) != expected:
        raise ValueError(
            f"Grade incompleta: {len(data)} linhas; esperadas {expected} "
            f"({len(municipalities)} municípios x {len(months)} meses x {len(groups)} grupos). "
            "Inclua explicitamente as contagens zero antes de treinar."
        )
    if TARGET_GROUP not in groups:
        raise ValueError(f"Grupo-alvo ausente: {TARGET_GROUP}")

    panel = data.pivot(
        index=["municipio", "mes_data"], columns="grupo_provisorio", values="registros"
    ).reset_index()
    panel.columns.name = None
    panel["mes_calendario"] = panel.mes_data.dt.month.astype(int)
    panel = panel.sort_values(["municipio", "mes_data"]).reset_index(drop=True)
    by_city = panel.groupby("municipio", sort=False)
    panel["alvo"] = panel[TARGET_GROUP].astype(float)
    panel["defasagem_1"] = by_city["alvo"].shift(1)
    panel["media_3_meses_anteriores"] = by_city["alvo"].transform(
        lambda values: values.shift(1).rolling(3, min_periods=3).mean()
    )
    for group, feature in (
        ("roubo", "roubo_mes_anterior"),
        ("trânsito", "transito_mes_anterior"),
        ("drogas e armas", "drogas_armas_mes_anterior"),
    ):
        if group in panel:
            panel[feature] = panel.groupby("municipio", sort=False)[group].shift(1)
        else:
            panel[feature] = 0.0
    panel["ano"] = panel.mes_data.dt.year
    return panel


def mae(actual: pd.Series, predicted: pd.Series) -> float:
    return float((actual - predicted).abs().mean())


def rmse(actual: pd.Series, predicted: pd.Series) -> float:
    return float(((actual - predicted) ** 2).mean() ** 0.5)


def run_experiment(panel: pd.DataFrame, test_year: int = TEST_YEAR) -> dict[str, object]:
    from sklearn.compose import ColumnTransformer
    from sklearn.linear_model import PoissonRegressor
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    features = [
        "municipio", "mes_calendario", "defasagem_1", "media_3_meses_anteriores",
        "roubo_mes_anterior", "transito_mes_anterior", "drogas_armas_mes_anterior",
    ]
    usable = panel.dropna(subset=features + ["alvo"]).copy()
    train = usable[usable.ano < test_year]
    test = usable[usable.ano == test_year]
    if train.empty or test.empty:
        raise ValueError(f"São necessários dados anteriores e dados de teste em {test_year}")
    if (train.alvo < 0).any() or (test.alvo < 0).any():
        raise ValueError("Poisson requer contagens não negativas")

    categorical = ["municipio", "mes_calendario"]
    numeric = [feature for feature in features if feature not in categorical]
    transform = ColumnTransformer([
        ("categorias", OneHotEncoder(handle_unknown="ignore"), categorical),
        ("contagens", StandardScaler(), numeric),
    ])
    estimator = make_pipeline(transform, PoissonRegressor(alpha=1.0, max_iter=1000))
    estimator.fit(train[features], train.alvo)
    actual = test.alvo
    model_prediction = pd.Series(estimator.predict(test[features]), index=test.index).clip(lower=0)

    history = panel[panel.ano < test_year]
    monthly_mean = history.groupby(["municipio", "mes_calendario"]).alvo.mean()
    previous_year = panel.set_index(["municipio", "mes_data"])["alvo"]
    prior_year_dates = test.mes_data - pd.DateOffset(years=1)
    seasonal = pd.Series(
        [previous_year.get((city, date), float("nan")) for city, date in zip(test.municipio, prior_year_dates)],
        index=test.index,
    )

    predictions = {
        "modelo_poisson": model_prediction,
        "persistencia_mes_anterior": test.defasagem_1,
        "mesmo_mes_ano_anterior": seasonal,
        "media_historica_mes_calendario": pd.Series(
            [monthly_mean.get((city, month), float("nan")) for city, month in zip(test.municipio, test.mes_calendario)],
            index=test.index,
        ),
    }
    metrics = {}
    for name, prediction in predictions.items():
        valid = prediction.notna()
        metrics[name] = {
            "mae_contagens": round(mae(actual[valid], prediction[valid]), 3),
            "rmse_contagens": round(rmse(actual[valid], prediction[valid]), 3),
            "observacoes": int(valid.sum()),
        }
    return {
        "objetivo": "prever contagens mensais agregadas do grupo provisório violência interpessoal",
        "ano_teste": test_year,
        "municipios": int(panel.municipio.nunique()),
        "meses_teste": int(test.mes_data.nunique()),
        "linhas_treino": int(len(train)),
        "metricas": metrics,
        "limites": [
            "Experimento exploratório; o grupo-alvo é uma classificação provisória da base SSP.",
            "Contagem municipal mensal não é risco individual nem substitui taxa populacional.",
            "Não usar para decisões de segurança em tempo real ou como garantia de proteção.",
            "Treinamento usa somente agregados; coordenadas, endereços e dados de saúde ficam fora.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="CSV agregado município/mês/grupo")
    parser.add_argument("--test-year", type=int, default=TEST_YEAR)
    args = parser.parse_args()
    print(json.dumps(run_experiment(load_panel(args.input), args.test_year), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
