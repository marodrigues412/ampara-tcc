import tempfile
import unittest
from pathlib import Path

import numpy as np

from treinar_isolation_forest import (
    MODEL_VERSION,
    TRAINING_SAMPLING_HZ,
    load_motion_features,
    max_jerk_g_per_second,
)


def app_jerk(samples_10hz):
    """Mesma conta de mobile/utils/motionWindowFeatures.js: |Δg| ÷ 0,1 s."""
    return max(abs(b - a) / 0.1 for a, b in zip(samples_10hz, samples_10hz[1:]))


class JerkTests(unittest.TestCase):
    def test_jerk_uses_the_10_hz_interval_like_the_app(self):
        self.assertEqual(TRAINING_SAMPLING_HZ, 10)
        window = np.array([[1.0, 1.0, 1.3, 0.9, 1.0]])
        self.assertAlmostEqual(float(max_jerk_g_per_second(window)[0]), 4.0)
        self.assertAlmostEqual(float(max_jerk_g_per_second(window)[0]), app_jerk(window[0].tolist()))

    def test_features_from_uci_layout_match_the_app_definition(self):
        rng = np.random.default_rng(42)
        with tempfile.TemporaryDirectory() as raiz:
            base = Path(raiz)
            for split in ("train", "test"):
                sinais = base / split / "Inertial Signals"
                sinais.mkdir(parents=True)
                eixos = {e: rng.normal(0, 0.2, (3, 128)) + (1.0 if e == "x" else 0.0) for e in "xyz"}
                for e, valores in eixos.items():
                    np.savetxt(sinais / f"total_acc_{e}_{split}.txt", valores)
                np.savetxt(base / split / f"y_{split}.txt", [1, 2, 4], fmt="%d")
                np.savetxt(base / split / f"subject_{split}.txt", [1, 1, 2], fmt="%d")
            features, _, _ = load_motion_features(base, "train")
            magnitude = np.sqrt(sum(np.loadtxt(base / "train" / "Inertial Signals" / f"total_acc_{e}_train.txt") ** 2 for e in "xyz"))
            for linha, janela in zip(features, magnitude[:, ::5]):
                self.assertAlmostEqual(linha[0], janela.mean())
                self.assertAlmostEqual(linha[2], janela.max())
                self.assertAlmostEqual(linha[3], app_jerk(janela.tolist()))

    def test_model_version_marks_the_fix(self):
        self.assertEqual(MODEL_VERSION, "uci-har-motion-if-v2")


if __name__ == "__main__":
    unittest.main()
