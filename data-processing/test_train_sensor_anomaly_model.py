import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from train_sensor_anomaly_model import (  # noqa: E402
    FEATURES,
    load_windows,
    split_participants,
    train_and_evaluate,
)


def sample_windows(participants=10):
    rows = []
    for person in range(participants):
        for session in range(2):
            for sample in range(8):
                abnormal = sample >= 6
                values = [70, 0.1, 0.3, 0.1, 0.6, 0.4, 0.0]
                if abnormal:
                    values = [145, 2.5, 3.0, 1.2, 6.0, 4.0, 2.0]
                rows.append({
                    **dict(zip(FEATURES, values)),
                    "participante_id": f"p{person}",
                    "sessao_id": f"s{session}",
                    "condicao": "anomalia_controlada" if abnormal else "normal",
                    "exposicao_segundos": 10,
                })
    return pd.DataFrame(rows)


class SensorAnomalyModelTests(unittest.TestCase):
    def test_split_keeps_participants_disjoint(self):
        fit, calibration, test = split_participants(sample_windows(), 0.2, 42)
        fit_people = set(fit.participante_id)
        calibration_people = set(calibration.participante_id)
        test_people = set(test.participante_id)
        self.assertFalse(fit_people & calibration_people)
        self.assertFalse(fit_people & test_people)
        self.assertFalse(calibration_people & test_people)

    def test_trains_on_normal_windows_and_tests_controlled_events(self):
        metrics, _ = train_and_evaluate(sample_windows(), seed=42)
        self.assertEqual(metrics["janelas_teste"], 32)
        self.assertIsNotNone(metrics["recall_eventos_controlados"])
        self.assertIsNotNone(metrics["f1_eventos_controlados"])
        self.assertIsNotNone(metrics["janelas_normais_anomalas_por_hora_monitorada"])
        self.assertIn("limites", metrics)

    def test_rejects_insufficient_participants(self):
        with self.assertRaisesRegex(ValueError, "pelo menos 6 participantes"):
            split_data = sample_windows(5)
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "features.csv"
                split_data.to_csv(path, index=False)
                load_windows(path)

    def test_missing_sensor_feature_is_excluded_not_imputed(self):
        frame = sample_windows()
        frame.loc[0, "speedMps"] = np.nan
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "features.csv"
            frame.to_csv(path, index=False)
            loaded, excluded = load_windows(path)
        self.assertEqual(excluded, 1)
        self.assertTrue(np.isfinite(loaded[FEATURES].to_numpy(dtype=float)).all())

    def test_nonpositive_exposure_is_excluded(self):
        frame = sample_windows()
        frame.loc[0, "exposicao_segundos"] = 0
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "features.csv"
            frame.to_csv(path, index=False)
            loaded, excluded = load_windows(path)
        self.assertEqual(excluded, 1)
        self.assertTrue((loaded.exposicao_segundos > 0).all())


if __name__ == "__main__":
    unittest.main()
