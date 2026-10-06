import unittest
from datetime import time

from derive_ssp_period import resolve_ssp_period


class ResolveSspPeriodTests(unittest.TestCase):
    def test_period_boundaries_from_hour(self):
        expected = {
            "00:00:00": "madrugada",
            "05:59:00": "madrugada",
            "06:00:00": "manhã",
            "11:59:00": "manhã",
            "12:00:00": "tarde",
            "17:59:00": "tarde",
            "18:00:00": "noite",
            "23:59:00": "noite",
        }
        for occurrence_time, period in expected.items():
            with self.subTest(occurrence_time=occurrence_time):
                self.assertEqual(
                    resolve_ssp_period("", occurrence_time),
                    (period, "derivado_da_hora"),
                )

    def test_normalizes_source_labels_and_accents(self):
        self.assertEqual(resolve_ssp_period("Pela manhã", None), ("manhã", "informado"))
        self.assertEqual(resolve_ssp_period("Pela manh��", None), ("manhã", "informado"))

    def test_uncertain_or_unrecognized_labels_are_not_overridden(self):
        self.assertEqual(resolve_ssp_period("Em hora incerta", "14:00:00"), (None, "hora_incerta"))
        self.assertEqual(resolve_ssp_period("rótulo novo", "14:00:00"), (None, "rotulo_nao_reconhecido"))

    def test_missing_or_invalid_hour_stays_unknown(self):
        for occurrence_time in (None, "", "24:10:00", "meio-dia"):
            with self.subTest(occurrence_time=occurrence_time):
                self.assertEqual(resolve_ssp_period(None, occurrence_time), (None, "desconhecido"))

    def test_nan_period_is_treated_as_missing(self):
        self.assertEqual(resolve_ssp_period(float("nan"), "12:00:00"), ("tarde", "derivado_da_hora"))

    def test_time_objects_are_supported(self):
        self.assertEqual(resolve_ssp_period(None, time(12, 0)), ("tarde", "derivado_da_hora"))


if __name__ == "__main__":
    unittest.main()
