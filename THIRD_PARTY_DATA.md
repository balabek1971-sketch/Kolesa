# Vehicle catalog snapshot

The generated files under `public/vehicle-catalog/` are built from the
`kolesa_marki_modeli (1).txt` snapshot supplied by the project owner.

- Snapshot date: 2026-07-21
- Imported catalog: 224 makes and 3,343 unique models
- Imported data: make and model names only
- Excluded data: listings, prices, seller details, descriptions, and media
- Cleanup: six exact duplicate model rows were removed

Run `scripts/import_kolesa_text_catalog.py <path-to-snapshot>` to replace the
generated catalog.
