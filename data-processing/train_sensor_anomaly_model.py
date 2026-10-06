#!/usr/bin/env python3
"""Train an offline, normal-only Isolation Forest for sensor-window research.

Input is an explicitly consented research CSV, never an app/database export by
default. The script reports only aggregate metrics and does not persist a model
unless an output path is explicitly supplied.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import GroupShuffleSplit


FEATURES = [
    "heartRateBpm",
    "heartRateZScore",
    "movementMeanMps2",
    "movementVariabilityMps2",
    "movementPeakMps2",
    "speedMps",
    "speedDeltaMps",
]
GROUP_COLUMNS = ["participante_id", "sessao_id"]
LABEL_COLUMN = "condicao"
EXPOSURE_COLUMN = "exposicao_segundos"
VALID_LABELS = {"normal", "anomalia_controlada"}


def load_windows(path: Path) -> tuple[pd.DataFrame, int]:
    data = pd.read_csv(path)
    required = set(FEATURES + GROUP_COLUMNS + [LABEL_COLUMN, EXPOSURE_COLUMN])
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"Colunas ausentes: {', '.join(sorted(missing))}")

    data = data[FEATURES + GROUP_COLUMNS + [LABEL_COLUMN, EXPOSURE_COLUMN]].copy()
    for column in FEATURES + [EXPOSURE_COLUMN]:
        data[column] = pd.to_numeric(data[column], errors="coerce")
    for column in GROUP_COLUMNS + [LABEL_COLUMN]:
        data[column] = data[column].astype("string").str.strip()

    invalid_group = data[GROUP_COLUMNS].isna().any(axis=1) | data[GROUP_COLUMNS].eq("").any(axis=1)
    invalid_label = ~data[LABEL_COLUMN].isin(VALID_LABELS)
    invalid_features = ~np.isfinite(data[FEATURES].to_numpy(dtype=float)).all(axis=1)
    invalid_exposure = (
        ~np.isfinite(data[EXPOSURE_COLUMN].to_numpy(dtype=float))
        | data[EXPOSURE_COLUMN].le(0).to_numpy()
    )
    invalid = invalid_group | invalid_label | invalid_features | invalid_exposure
    excluded = int(invalid.sum())
    data = data.loc[~invalid].reset_index(drop=True)
    if data.empty:
        raise ValueError("Nenhuma janela completa e válida para análise")
    if data["participante_id"].nunique() < 6:
        raise ValueError("São necessários pelo menos 6 participantes pseudonimizados para separar treino, calibração e teste")
    if not (data[LABEL_COLUMN] == "normal").any():
        raise ValueError("A base precisa conter janelas rotuladas como normais")
    return data, excluded


def split_participants(data: pd.DataFrame, test_size: float, seed: int):
    """Hold out participants in every split to avoid window-level leakage."""
    first = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    train_cal_idx, test_idx = next(first.split(data, groups=data.participante_id))
    train_cal = data.iloc[train_cal_idx].reset_index(drop=True)
    test = data.iloc[test_idx].reset_index(drop=True)

    second = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed + 1)
    fit_idx, calibration_idx = next(
        second.split(train_cal, groups=train_cal.participante_id)
    )
    fit = train_cal.iloc[fit_idx].reset_index(drop=True)
    calibration = train_cal.iloc[calibration_idx].reset_index(drop=True)
    fit_people = set(fit.participante_id)
    calibration_people = set(calibration.participante_id)
    test_people = set(test.participante_id)
    if fit_people & calibration_people or fit_people & test_people or calibration_people & test_people:
        raise AssertionError("Participantes vazaram entre treino, calibração e teste")
    if not (fit[LABEL_COLUMN] == "normal").any():
        raise ValueError("A divisão deixou o conjunto de treino sem janelas normais")
    if not (calibration[LABEL_COLUMN] == "normal").any():
        raise ValueError("A divisão deixou a calibração sem janelas normais")
    return fit, calibration, test


def train_and_evaluate(
    data: pd.DataFrame,
    *,
    test_size: float = 0.2,
    threshold_quantile: float = 0.95,
    seed: int = 42,
) -> tuple[dict[str, object], IsolationForest]:
    if not 0.1 <= test_size < 0.5:
        raise ValueError("test_size deve estar entre 0.1 e 0.5")
    if not 0.5 < threshold_quantile < 1:
        raise ValueError("threshold_quantile deve estar entre 0.5 e 1")

    fit, calibration, test = split_participants(data, test_size, seed)
    normal_fit = fit.loc[fit[LABEL_COLUMN] == "normal", FEATURES]
    normal_calibration = calibration.loc[calibration[LABEL_COLUMN] == "normal", FEATURES]
    model = IsolationForest(
        n_estimators=300,
        contamination="auto",
        random_state=seed,
        n_jobs=1,
    )
    model.fit(normal_fit)

    # Larger values mean more anomalous. This is a threshold calibrated on
    # separate participants, not a probability or a personalized risk score.
    calibration_scores = -model.decision_function(normal_calibration)
    threshold = float(np.quantile(calibration_scores, threshold_quantile))
    test_scores = -model.decision_function(test[FEATURES])
    predicted = test_scores > threshold
    actual = test[LABEL_COLUMN].eq("anomalia_controlada").to_numpy()
    has_normal_test = bool((~actual).any())
    has_controlled_test = bool(actual.any())
    tn, fp, fn, tp = confusion_matrix(actual, predicted, labels=[False, True]).ravel()
    normal_exposure_hours = float(
        test.loc[test[LABEL_COLUMN] == "normal", EXPOSURE_COLUMN].sum() / 3600
    )

    metrics: dict[str, object] = {
        "janelas_teste": int(len(test)),
        "participantes_teste": int(test.participante_id.nunique()),
        "limiar_anomalia": threshold,
        "quantil_calibracao_normal": threshold_quantile,
        "falsos_positivos_em_normais": (
            round(float(fp / (tn + fp)), 4) if has_normal_test and tn + fp else None
        ),
        "janelas_normais_anomalas_por_hora_monitorada": (
            round(float(fp / normal_exposure_hours), 4)
            if has_normal_test and normal_exposure_hours > 0 else None
        ),
        "recall_eventos_controlados": (
            round(float(recall_score(actual, predicted, zero_division=0)), 4)
            if has_controlled_test else None
        ),
        "f1_eventos_controlados": (
            round(float(f1_score(actual, predicted, zero_division=0)), 4)
            if has_controlled_test else None
        ),
        "precisao_eventos_controlados": (
            round(float(precision_score(actual, predicted, zero_division=0)), 4)
            if has_controlled_test else None
        ),
        "matriz_confusao_teste": {"verdadeiro_negativo": int(tn), "falso_positivo": int(fp),
                                  "falso_negativo": int(fn), "verdadeiro_positivo": int(tp)},
        "limites": [
            "Isolation Forest foi ajustado exclusivamente com janelas normais do conjunto de treino.",
            "Participantes distintos foram mantidos entre treino, calibração e teste.",
            "O escore representa anomalia em relação à rotina observada, não probabilidade de agressão nem risco clínico.",
            "A saída não está calibrada para a matriz de fusão e não deve acionar alertas de segurança.",
            "Resultados só são interpretáveis para sinais, aparelhos e protocolo de coleta representados na amostra.",
            "A taxa é de janelas normais sinalizadas por hora; não equivale a episódios de alerta sem regra temporal de agrupamento.",
            "O cálculo por hora pressupõe que exposicao_segundos representa tempo monitorado exclusivo, sem sobreposição.",
        ],
    }
    if not has_controlled_test:
        metrics["limites"].append(
            "O teste não contém eventos controlados; recall e precisão não podem ser estimados."
        )
    return metrics, model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="CSV local de janelas autorizadas")
    parser.add_argument("--output-model", type=Path, help="Opcional: artefato do modelo treinado")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--threshold-quantile", type=float, default=0.95)
    args = parser.parse_args()

    data, excluded = load_windows(args.input)
    result, model = train_and_evaluate(
        data, threshold_quantile=args.threshold_quantile, seed=args.seed
    )
    result["janelas_validas"] = int(len(data))
    result["janelas_excluidas_por_dado_incompleto_ou_rotulo_invalido"] = excluded
    result["participantes"] = int(data.participante_id.nunique())
    if args.output_model:
        import joblib

        args.output_model.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, args.output_model)
        result["artefato_local"] = str(args.output_model)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
