import unittest

from backfill_ssp_city import validate_state


class ValidateBackfillStateTests(unittest.TestCase):
    def setUp(self):
        self.month = (2026, 1)
        self.expected = {self.month: 1295}
        self.state = {
            self.month: {
                "total_rows": 34357,
                "city_rows": 0,
                "marked_rows": 34357,
            }
        }

    def test_accepts_matching_month_with_city_absent(self):
        validate_state(self.expected, self.state)

    def test_rejects_month_with_existing_city_rows(self):
        self.state[self.month]["city_rows"] = 1
        with self.assertRaisesRegex(RuntimeError, "Já existem registros da cidade"):
            validate_state(self.expected, self.state)

    def test_rejects_import_control_count_mismatch(self):
        self.state[self.month]["marked_rows"] -= 1
        with self.assertRaisesRegex(RuntimeError, "Contagem do controle diverge"):
            validate_state(self.expected, self.state)

    def test_rejects_source_month_missing_from_database(self):
        with self.assertRaisesRegex(RuntimeError, "Faltam meses da fonte"):
            validate_state(self.expected, {})


if __name__ == "__main__":
    unittest.main()
