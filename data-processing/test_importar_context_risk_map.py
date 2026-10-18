import unittest
from pathlib import Path

import pandas as pd

from importar_context_risk_map import (
    COLUNAS_BAIRRO,
    COLUNAS_CIDADE,
    preparar_linhas,
    preparar_linhas_cidade,
)

PROCESSADOS = Path(__file__).resolve().parents[1] / "data" / "processed"
CSV = PROCESSADOS / "context_risk_map.csv"
CSV_CIDADE = PROCESSADOS / "context_risk_map_cidade.csv"


def celula(**mudancas):
    base = {
        "municipio": "S.PAULO", "bairro": "SE", "periodo": "noite",
        "registros_com_peso": 7, "registros_periodo_informado": 4, "registros_periodo_derivado": 3,
        "registros_ddm": "<5 (suprimido)", "total_ponderado": 30,
        "escore_contexto": 0.05, "nivel_contexto": "medio",
        "percentil_33": 0.048, "percentil_66": 0.092,
    }
    base.update(mudancas)
    return base


def cidade(**mudancas):
    base = {k: v for k, v in celula().items() if k != "bairro"}
    base.update({"municipio": "S.CAETANO DO SUL", "bairros_com_registro": 3, "total_medio_por_bairro": 10.0})
    base.update(mudancas)
    return base


class PrepararLinhasTest(unittest.TestCase):
    def test_converte_na_ordem_da_tabela(self):
        linhas = preparar_linhas(pd.DataFrame([celula()]))
        self.assertEqual(len(linhas[0]), len(COLUNAS_BAIRRO))
        self.assertEqual(linhas[0][:3], ("S.PAULO", "SE", "noite"))
        self.assertEqual(linhas[0][6], "<5 (suprimido)")
        reserva = preparar_linhas_cidade(pd.DataFrame([cidade()]))
        self.assertEqual(len(reserva[0]), len(COLUNAS_CIDADE))
        self.assertEqual(reserva[0][:2], ("S.CAETANO DO SUL", "noite"))

    def test_recusa_celula_pequena_e_valores_invalidos(self):
        for mudanca in (
            {"registros_com_peso": 4, "registros_periodo_derivado": 0},
            {"periodo": "hora incerta"},
            {"nivel_contexto": "moderado"},
            {"registros_periodo_derivado": 2},
        ):
            with self.subTest(mudanca=mudanca), self.assertRaises(ValueError):
                preparar_linhas(pd.DataFrame([celula(**mudanca)]))

    def test_recusa_repetidas_vazio_e_reserva_sem_bairro(self):
        with self.assertRaises(ValueError):
            preparar_linhas(pd.DataFrame([celula(), celula()]))
        with self.assertRaises(ValueError):
            preparar_linhas(pd.DataFrame(columns=COLUNAS_BAIRRO))
        with self.assertRaises(ValueError):
            preparar_linhas_cidade(pd.DataFrame([cidade(), cidade()]))
        with self.assertRaises(ValueError):
            preparar_linhas_cidade(pd.DataFrame([cidade(bairros_com_registro=0)]))

    @unittest.skipUnless(CSV.exists() and CSV_CIDADE.exists(), "mapa ainda não gerado")
    def test_mapa_gerado_e_importavel(self):
        bairros = preparar_linhas(pd.read_csv(CSV, dtype={"registros_ddm": str}))
        cidades = preparar_linhas_cidade(pd.read_csv(CSV_CIDADE, dtype={"registros_ddm": str}))
        self.assertGreater(len(bairros), 0)
        self.assertGreater(len(cidades), 0)


if __name__ == "__main__":
    unittest.main()
