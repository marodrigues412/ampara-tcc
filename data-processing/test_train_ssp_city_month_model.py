import tempfile
import unittest
from pathlib import Path

import pandas as pd

from train_ssp_city_month_model import TARGET_GROUP, load_panel


GROUPS = [TARGET_GROUP, "roubo", "trânsito", "drogas e armas"]


class CityMonthPanelTests(unittest.TestCase):
    def setUp(self):
        self.rows = []
        for month in pd.date_range("2025-01-01", "2026-04-01", freq="MS"):
            for group in GROUPS:
                self.rows.append({
                    "ano_estatistica": month.year,
                    "mes_estatistica": month.month,
                    "municipio": "CIDADE A",
                    "grupo_provisorio": group,
                    "registros": 0 if group == "trânsito" else month.month,
                })

    def _load_rows(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "aggregate.csv"
            pd.DataFrame(rows).to_csv(path, index=False)
            return load_panel(path)

    def test_features_only_use_past_months(self):
        panel = self._load_rows(self.rows)
        april = panel[panel.mes_data == "2026-04-01"].iloc[0]
        self.assertEqual(april.defasagem_1, 3)
        self.assertEqual(april.media_3_meses_anteriores, 2)
        self.assertEqual(april.roubo_mes_anterior, 3)
        self.assertEqual(april.transito_mes_anterior, 0)

    def test_rejects_incomplete_zero_filled_grid(self):
        with self.assertRaisesRegex(ValueError, "Grade incompleta"):
            self._load_rows(self.rows[:-1])

    def test_rejects_duplicate_city_month_group(self):
        with self.assertRaisesRegex(ValueError, "duplicadas"):
            self._load_rows(self.rows + [self.rows[0]])

    def test_rejects_negative_counts(self):
        rows = [dict(row) for row in self.rows]
        rows[0]["registros"] = -1
        with self.assertRaisesRegex(ValueError, "inteiros não negativos"):
            self._load_rows(rows)

    def test_reads_markdown_table_export(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "aggregate.txt"
            headers = list(self.rows[0])
            lines = [
                "| " + " | ".join(headers) + " |",
                "| " + " | ".join("---" for _ in headers) + " |",
            ]
            lines.extend(
                "| " + " | ".join(str(row[column]) for column in headers) + " |"
                for row in self.rows
            )
            path.write_text("\n".join(lines), encoding="utf-8")
            panel = load_panel(path)
        self.assertEqual(len(panel), 16)
        self.assertEqual(panel.municipio.nunique(), 1)


if __name__ == "__main__":
    unittest.main()
