# Third-party vehicle data

The generated files under `public/vehicle-catalog/` are derived from
[cardata.wiki](https://cardata.wiki/).

- Source: cardata.wiki CSV exports by manufacturer
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Changes: records are normalized and grouped into make, model, production-year generation, and trim hierarchies

Run `scripts/import_vehicle_catalog.py` to refresh the generated catalog.
