import unittest

from risk_fusion import MATRIZ_FUSAO, classificar_risco, nivel_por_cortes


class RiskFusionTests(unittest.TestCase):
    def test_matches_all_nine_advisor_matrix_cells(self):
        expected = {
            ("baixo", "baixo"): "baixo",
            ("baixo", "medio"): "baixo",
            ("baixo", "alto"): "moderado",
            ("medio", "baixo"): "baixo",
            ("medio", "medio"): "moderado",
            ("medio", "alto"): "alto",
            ("alto", "baixo"): "moderado",
            ("alto", "medio"): "alto",
            ("alto", "alto"): "alto",
        }
        self.assertEqual(MATRIZ_FUSAO, expected)

    def test_context_uses_supplied_percentile_cuts(self):
        self.assertEqual(nivel_por_cortes(0.19, 0.2, 0.7), "baixo")
        self.assertEqual(nivel_por_cortes(0.2, 0.2, 0.7), "medio")
        self.assertEqual(nivel_por_cortes(0.7, 0.2, 0.7), "medio")
        self.assertEqual(nivel_por_cortes(0.71, 0.2, 0.7), "alto")

    def test_body_uses_professor_thresholds_and_fusion(self):
        self.assertEqual(classificar_risco(0.5, 0.2, 0.2, 0.7), "baixo")
        self.assertEqual(classificar_risco(0.5, 0.5, 0.2, 0.7), "moderado")
        self.assertEqual(classificar_risco(0.5, 0.8, 0.2, 0.7), "alto")

    def test_missing_layer_stays_unavailable(self):
        self.assertIsNone(classificar_risco(None, 0.9, 0.2, 0.7))
        self.assertIsNone(classificar_risco(0.9, None, 0.2, 0.7))

    def test_rejects_out_of_range_or_invalid_cuts(self):
        with self.assertRaises(ValueError):
            nivel_por_cortes(1.1, 0.2, 0.7)
        with self.assertRaises(ValueError):
            nivel_por_cortes(0.5, 0.8, 0.2)


if __name__ == "__main__":
    unittest.main()
