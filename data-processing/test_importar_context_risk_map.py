import unittest
from pathlib import Path

import pandas as pd

from importar_context_risk_map import COLUNAS, preparar_linhas

CSV = Path(__file__).resolve().parents[1] / "data" / "processed" / "context_risk_map.csv"


def celula(**mudancas):
    base = {
        "municipio": "S.PAULO", "bairro": "SE", "dia_semana": "sexta", "periodo": "noite",
        "registros_com_peso": 7, "registros_ddm": "<5 (suprimido)", "total_ponderado": 30,
        "escore_contexto": 0.05, "nivel_contexto": "medio",
        "percentil_33": 0.048, "percentil_66": 0.092,
    }
    base.update(mudancas)
    return base


class PrepararLinhasTest(unittest.TestCase):
    def test_converte_na_ordem_da_tabela(self):
        linhas = preparar_linhas(pd.DataFrame([celula()]))
        self.assertEqual(len(linhas[0]), len(COLUNAS))
        self.assertEqual(linhas[0][:4], ("S.PAULO", "SE", "sexta", "noite"))
        self.assertEqual(linhas[0][5], "<5 (suprimido)")

    def test_recusa_celula_pequena_e_valores_invalidos(self):
        for mudanca in (
            {"registros_com_peso": 4},
            {"periodo": "hora incerta"},
            {"dia_semana": "terça"},
            {"nivel_contexto": "moderado"},
        ):
            with self.subTest(mudanca=mudanca), self.assertRaises(ValueError):
                preparar_linhas(pd.DataFrame([celula(**mudanca)]))

    def test_recusa_celula_repetida_e_mapa_vazio(self):
        with self.assertRaises(ValueError):
            preparar_linhas(pd.DataFrame([celula(), celula()]))
        with self.assertRaises(ValueError):
            preparar_linhas(pd.DataFrame(columns=COLUNAS))

    @unittest.skipUnless(CSV.exists(), "mapa ainda não gerado")
    def test_mapa_gerado_e_importavel(self):
        linhas = preparar_linhas(pd.read_csv(CSV, dtype={"registros_ddm": str}))
        self.assertEqual(len(linhas), 3405)


if __name__ == "__main__":
    unittest.main()
