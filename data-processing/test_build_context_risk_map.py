import unittest

import pandas as pd

from build_context_risk_map import normalize_period, prepare_context_map


class ContextRiskMapTests(unittest.TestCase):
    def test_period_normalization_does_not_guess_missing_or_uncertain_time(self):
        self.assertEqual(normalize_period("PELA MANHÃ"), "manha")
        self.assertEqual(normalize_period("A NOITE"), "noite")
        self.assertIsNone(normalize_period("EM HORA INCERTA"))
        self.assertIsNone(normalize_period(None))

    def test_aggregates_by_city_neighborhood_weekday_and_reported_period(self):
        rows = [{
            "ano_estatistica": 2025,
            "data_ocorrencia": "15/09/2025",
            "periodo": "A noite",
            "subtipo_local": "Via Pública",
            "bairro": "Centro",
            "delegacia": "DDM BARUERI",
            "cidade": "BARUERI",
            "logradouro": "Rua de teste",
            "rubrica": "Roubo (art. 157)",
            "natureza_apurada": "ROUBO - OUTROS",
        } for _ in range(5)]
        result = prepare_context_map(pd.DataFrame(rows))
        self.assertEqual(len(result), 1)
        row = result.iloc[0]
        self.assertEqual(row.municipio, "BARUERI")
        self.assertEqual(row.bairro, "CENTRO")
        self.assertEqual(row.dia_semana, "segunda")
        self.assertEqual(row.periodo, "noite")
        self.assertEqual(row.registros_com_peso, 5)
        self.assertEqual(row.total_ponderado, 15)
        self.assertEqual(row.registros_ddm, 5)
        self.assertEqual(row.escore_contexto, 1)

    def test_unreported_period_and_unweighted_threat_are_not_scored(self):
        rows = [{
            "ano_estatistica": 2025,
            "data_ocorrencia": "15/09/2025",
            "periodo": "",
            "subtipo_local": "Via Pública",
            "bairro": "Centro",
            "delegacia": "1 DP",
            "cidade": "BARUERI",
            "logradouro": "Rua de teste",
            "rubrica": "Ameaça (art. 147)",
            "natureza_apurada": "AMEACA",
        } for _ in range(5)]
        self.assertTrue(prepare_context_map(pd.DataFrame(rows)).empty)

    def test_suppresses_cells_below_five_and_protected_records(self):
        base = {
            "ano_estatistica": 2025,
            "data_ocorrencia": "15/09/2025",
            "periodo": "A noite",
            "subtipo_local": "Via Pública",
            "bairro": "Centro",
            "delegacia": "1 DP",
            "cidade": "BARUERI",
            "logradouro": "Rua de teste",
            "rubrica": "Roubo (art. 157)",
            "natureza_apurada": "ROUBO - OUTROS",
        }
        four = prepare_context_map(pd.DataFrame([base.copy() for _ in range(4)]))
        protected = base | {"logradouro": "VEDAÇÃO DA DIVULGAÇÃO"}
        hidden = prepare_context_map(pd.DataFrame([protected.copy() for _ in range(5)]))
        self.assertTrue(four.empty)
        self.assertTrue(hidden.empty)


if __name__ == "__main__":
    unittest.main()
