import unittest
from datetime import time

import pandas as pd

from build_context_risk_map import (
    aggregate_context_cells,
    combine_cells,
    finalize_city_fallback,
    finalize_context_map,
    map_period,
    prepare_context_map,
)


def record(**changes):
    base = {
        "ano_estatistica": 2025,
        "periodo": "A noite",
        "hora_ocorrencia": None,
        "subtipo_local": "Via Pública",
        "bairro": "Centro",
        "delegacia": "1 DP",
        "cidade": "BARUERI",
        "logradouro": "Rua de teste",
        "rubrica": "Roubo (art. 157)",
        "natureza_apurada": "ROUBO - OUTROS",
    }
    base.update(changes)
    return base


def frame(*groups):
    return pd.DataFrame([row for count, row in groups for _ in range(count)])


class PeriodTests(unittest.TestCase):
    def test_reported_label_wins_and_keeps_provenance(self):
        self.assertEqual(map_period("PELA MANHÃ", time(22, 0)), ("manha", "informado"))
        self.assertEqual(map_period("A NOITE", None), ("noite", "informado"))

    def test_empty_label_is_derived_from_exact_hour(self):
        self.assertEqual(map_period("", time(9, 30)), ("manha", "derivado_da_hora"))
        self.assertEqual(map_period(float("nan"), time(5, 59)), ("madrugada", "derivado_da_hora"))
        self.assertEqual(map_period(None, "18:00:00"), ("noite", "derivado_da_hora"))

    def test_uncertain_and_missing_hours_are_still_discarded(self):
        self.assertEqual(map_period("EM HORA INCERTA", time(14, 0)), (None, "hora_incerta"))
        self.assertEqual(map_period("", "NULL"), (None, "desconhecido"))
        self.assertEqual(map_period("", float("nan")), (None, "desconhecido"))


class NeighborhoodMapTests(unittest.TestCase):
    def test_aggregates_by_city_neighborhood_and_period_without_weekday(self):
        result = prepare_context_map(frame(
            (3, record(delegacia="DDM BARUERI")),
            (2, record(periodo="", hora_ocorrencia=time(20, 0), delegacia="DDM BARUERI")),
        ))
        self.assertEqual(len(result), 1)
        row = result.iloc[0]
        self.assertNotIn("dia_semana", result.columns)
        self.assertEqual((row.municipio, row.bairro, row.periodo), ("BARUERI", "CENTRO", "noite"))
        self.assertEqual(row.registros_com_peso, 5)
        self.assertEqual(row.registros_periodo_informado, 3)
        self.assertEqual(row.registros_periodo_derivado, 2)
        self.assertEqual(row.total_ponderado, 15)
        self.assertEqual(row.registros_ddm, 5)
        self.assertEqual(row.escore_contexto, 1)

    def test_derived_period_makes_a_cell_publishable(self):
        only_reported = prepare_context_map(frame(
            (4, record()),
            (3, record(periodo="", hora_ocorrencia=None)),
        ))
        with_hour = prepare_context_map(frame(
            (4, record()),
            (3, record(periodo="", hora_ocorrencia=time(19, 0))),
        ))
        self.assertTrue(only_reported.empty)
        self.assertEqual(int(with_hour.iloc[0].registros_com_peso), 7)

    def test_uncertain_hour_and_unweighted_threat_are_not_scored(self):
        self.assertTrue(prepare_context_map(frame((5, record(periodo="Em hora incerta", hora_ocorrencia=time(14, 0))))).empty)
        self.assertTrue(prepare_context_map(frame((5, record(rubrica="Ameaça (art. 147)", natureza_apurada="AMEACA")))).empty)

    def test_suppresses_cells_below_five_and_protected_records(self):
        self.assertTrue(prepare_context_map(frame((4, record()))).empty)
        self.assertTrue(prepare_context_map(frame((5, record(logradouro="VEDAÇÃO DA DIVULGAÇÃO")))).empty)
        with self.assertRaises(ValueError):
            prepare_context_map(frame((5, record())), minimum_cell_records=4)

    def test_partial_sheets_are_summed_before_suppression(self):
        first = aggregate_context_cells(frame((3, record())))
        second = aggregate_context_cells(frame((2, record(periodo="", hora_ocorrencia=time(21, 0)))))
        result = finalize_context_map(combine_cells([first, second]))
        self.assertEqual(int(result.iloc[0].registros_com_peso), 5)


class CityFallbackTests(unittest.TestCase):
    def build(self, *groups):
        cells = aggregate_context_cells(frame(*groups))
        neighborhoods = finalize_context_map(cells)
        return neighborhoods, finalize_city_fallback(cells, neighborhoods)

    def test_typical_neighborhood_uses_the_neighborhood_scale(self):
        # Barueri tem um bairro publicável (10 roubos = 30 pontos); São Caetano tem três
        # bairros com 2 roubos cada (nenhum publicável) mais 2 sem bairro.
        neighborhoods, city = self.build(
            (10, record()),
            (2, record(cidade="S.CAETANO DO SUL", bairro="Maua")),
            (2, record(cidade="S.CAETANO DO SUL", bairro="Centro")),
            (2, record(cidade="S.CAETANO DO SUL", bairro="Fundacao")),
            (2, record(cidade="S.CAETANO DO SUL", bairro="")),
        )
        self.assertEqual(neighborhoods.municipio.tolist(), ["BARUERI"])
        scs = city[city.municipio == "S.CAETANO DO SUL"].iloc[0]
        self.assertEqual(scs.periodo, "noite")
        self.assertEqual(scs.registros_com_peso, 8)
        self.assertEqual(scs.total_ponderado, 24)
        self.assertEqual(scs.bairros_com_registro, 3)
        self.assertEqual(scs.total_medio_por_bairro, 8)
        self.assertAlmostEqual(scs.escore_contexto, 8 / 30)
        self.assertEqual(scs.percentil_33, neighborhoods.percentil_33.iloc[0])

    def test_city_cell_also_needs_five_records(self):
        _, city = self.build((10, record()), (4, record(cidade="S.CAETANO DO SUL", bairro="Maua")))
        self.assertEqual(city.municipio.tolist(), ["BARUERI"])

    def test_no_neighborhood_map_means_no_fallback(self):
        _, city = self.build((4, record()))
        self.assertTrue(city.empty)


if __name__ == "__main__":
    unittest.main()
