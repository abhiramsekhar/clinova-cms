from django.core.management.base import BaseCommand

from cms_backendapp.models import LabTestCatalog


DEMO_RANGE_UPDATES = {
    "test-03": {"HbA1c": {"criticalMin": 2}},
    "test-04": {
        "Total Cholesterol": {"criticalMin": 0},
        "Triglycerides": {"criticalMin": 0},
        "HDL": {"criticalMin": 10, "criticalMax": 100},
        "LDL": {"criticalMin": 0},
    },
    "test-05": {
        "T3": {"criticalMin": 30, "criticalMax": 350},
        "T4": {"criticalMin": 1, "criticalMax": 25},
    },
    "test-06": {
        "Total Bilirubin": {"criticalMin": 0},
        "SGOT (AST)": {"criticalMin": 0},
        "SGPT (ALT)": {"criticalMin": 0},
        "Alkaline Phosphatase": {"criticalMin": 0, "criticalMax": 1000},
    },
    "test-07": {
        "Blood Urea": {"criticalMin": 1},
        "Serum Creatinine": {"criticalMin": 0.1},
        "Uric Acid": {"criticalMin": 1, "criticalMax": 20},
    },
    "test-08": {
        "pH": {"criticalMin": 2, "criticalMax": 12},
        "Protein": {"referenceText": "Negative"},
        "Glucose": {"referenceText": "Negative"},
        "RBC": {"criticalMin": 0, "criticalMax": 50},
        "WBC": {"criticalMin": 0, "criticalMax": 100},
    },
    "test-09": {"ESR (Westergren)": {"criticalMin": 0}},
    "test-12": {"CRP": {"criticalMin": 0}},
    "test-10": {
        "Blood Group": {"referenceText": "A, B, AB, or O"},
        "Rh Factor": {"referenceText": "Positive or negative"},
    },
}
DEMO_CATALOG_IDS = [f"test-{number:02d}" for number in range(1, 13)]


class Command(BaseCommand):
    help = "Fill missing ranges on demo lab catalog tests with illustrative values."

    def handle(self, *args, **options):
        updated_tests = 0
        for test_id in DEMO_CATALOG_IDS:
            catalog = LabTestCatalog.objects.filter(pk=test_id).first()
            if catalog is None:
                self.stdout.write(self.style.WARNING(f"Skipped missing demo test {test_id}."))
                continue

            parameters = catalog.parameters if isinstance(catalog.parameters, list) else []
            changed = False
            for parameter in parameters:
                if not isinstance(parameter, dict):
                    continue
                updates = DEMO_RANGE_UPDATES.get(test_id, {}).get(parameter.get("name"), {})

                for field, value in updates.items():
                    if parameter.get(field) is None:
                        parameter[field] = value
                        changed = True
                has_range = any(
                    parameter.get(field) is not None
                    for field in ("refMin", "refMax", "criticalMin", "criticalMax", "referenceText")
                )
                if has_range and parameter.get("rangeSource") != "ILLUSTRATIVE_DEMO":
                    parameter["rangeSource"] = "ILLUSTRATIVE_DEMO"
                    changed = True

            if changed:
                catalog.parameters = parameters
                catalog.save(update_fields=["parameters"])
                updated_tests += 1

        self.stdout.write(self.style.SUCCESS(
            f"Updated illustrative ranges on {updated_tests} demo catalog test(s)."
        ))
