# Vehicle catalog snapshot

The generated files under `public/vehicle-catalog/` are built from the
`kolesa_marki_modeli.txt` snapshot supplied by the project owner.

- Snapshot date: 2026-07-20
- Imported data: make and model names only
- Excluded data: listings, prices, seller details, descriptions, and media
- Cleanup: 20 city sections appended to the source file were detected and ignored

Run `scripts/import_kolesa_text_catalog.py <path-to-snapshot>` to replace the
generated catalog.
