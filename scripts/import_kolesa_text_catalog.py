"""Replace the vehicle catalog with a user-provided Kolesa make/model snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_OUTPUT = ROOT / "public" / "vehicle-catalog"
BRANDS_OUTPUT = ROOT / "src" / "data" / "brands.js"
MANIFEST_OUTPUT = ROOT / "src" / "data" / "vehicleCatalog.generated.js"

NUMBERED_SECTION_RE = re.compile(r"^(\d+)\.\s+(.+?)\s+\((\d+)\s+[^)]+\)$")
PLAIN_SECTION_RE = re.compile(r"^(.+?)\s+\((\d+)\)$")
NUMBERED_MODEL_RE = re.compile(r"^\s+\d+\)\s+(.+?)\s*$")
PLAIN_MODEL_RE = re.compile(r"^\s{2,}(\S.*?)\s*$")


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-zа-яё0-9]+", "", value.casefold())


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-")
    if slug:
        return slug
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:10]
    return f"brand-{digest}"


def strip_brand_prefix(brand: str, model: str) -> str:
    prefix = re.compile(rf"^{re.escape(brand)}(?:\s+|$)", re.IGNORECASE)
    cleaned = prefix.sub("", model, count=1).strip()
    return cleaned or model.strip()


def looks_like_brand_section(brand: str, raw_models: list[str]) -> bool:
    if not raw_models:
        return False
    prefix = re.compile(rf"^{re.escape(brand)}(?:\s+|$)", re.IGNORECASE)
    matching = sum(bool(prefix.match(model)) for model in raw_models)
    return matching / len(raw_models) >= 0.8


def parse_catalog(text: str) -> list[tuple[str, list[str]]]:
    sections: list[tuple[str, int, list[str], bool]] = []
    current: tuple[str, int, list[str], bool] | None = None

    for line in text.splitlines():
        numbered_section = NUMBERED_SECTION_RE.match(line)
        plain_section = PLAIN_SECTION_RE.match(line)
        if numbered_section:
            if current:
                sections.append(current)
            current = (
                numbered_section.group(2).strip(),
                int(numbered_section.group(3)),
                [],
                True,
            )
            continue
        if plain_section:
            if current:
                sections.append(current)
            current = (
                plain_section.group(1).strip(),
                int(plain_section.group(2)),
                [],
                False,
            )
            continue

        model_match = (
            NUMBERED_MODEL_RE.match(line)
            if current and current[3]
            else PLAIN_MODEL_RE.match(line)
        )
        if model_match and current:
            current[2].append(model_match.group(1).strip())

    if current:
        sections.append(current)

    catalog: list[tuple[str, list[str]]] = []
    for brand, declared_count, raw_models, has_brand_prefix in sections:
        if has_brand_prefix and not looks_like_brand_section(brand, raw_models):
            break
        if declared_count != len(raw_models):
            raise ValueError(
                f"{brand}: declared {declared_count} models, found {len(raw_models)}"
            )

        models: list[str] = []
        seen: set[str] = set()
        for raw_model in raw_models:
            model = (
                strip_brand_prefix(brand, raw_model)
                if has_brand_prefix
                else raw_model.strip()
            )
            if model not in seen:
                seen.add(model)
                models.append(model)
        catalog.append((brand, models))

    if not catalog:
        raise ValueError("No valid make/model sections found")
    return catalog


def write_catalog(catalog: list[tuple[str, list[str]]], source_name: str) -> None:
    PUBLIC_OUTPUT.mkdir(parents=True, exist_ok=True)
    for old_file in PUBLIC_OUTPUT.glob("*.json"):
        old_file.unlink()

    manifest: dict[str, dict[str, object]] = {}
    used_files: set[str] = set()
    total_models = 0

    for index, (brand, models) in enumerate(catalog, start=1):
        base_name = slugify(brand)
        file_name = f"{base_name}.json"
        if file_name in used_files:
            file_name = f"{base_name}-{index}.json"
        used_files.add(file_name)

        payload = {
            "brand": brand,
            "models": [{"name": model, "generations": []} for model in models],
            "source": source_name,
        }
        (PUBLIC_OUTPUT / file_name).write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        manifest[normalize_key(brand)] = {
            "brand": brand,
            "file": file_name,
            "models": len(models),
            "generations": 0,
            "trims": 0,
        }
        total_models += len(models)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    manifest_payload = {
        "generatedAt": generated_at,
        "source": source_name,
        "totals": {
            "brands": len(catalog),
            "models": total_models,
            "generations": 0,
            "trims": 0,
        },
        "brands": manifest,
    }
    (PUBLIC_OUTPUT / "manifest.json").write_text(
        json.dumps(manifest_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    MANIFEST_OUTPUT.write_text(
        "export const vehicleCatalogManifest = "
        + json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    brand_names = [brand for brand, _ in catalog]
    popular = [
        brand
        for brand in (
            "Toyota",
            "Hyundai",
            "Kia",
            "Chevrolet",
            "BMW",
            "Mercedes-Benz",
            "Volkswagen",
            "ВАЗ (Lada)",
        )
        if brand in brand_names
    ]
    BRANDS_OUTPUT.write_text(
        "export const brands = "
        + json.dumps(brand_names, ensure_ascii=False, indent=2)
        + ";\n\nexport const popularBrands = "
        + json.dumps(popular, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Generated {len(catalog)} brands and {total_models} models")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Path to kolesa_marki_modeli.txt")
    args = parser.parse_args()
    text = args.source.read_text(encoding="utf-8-sig")
    write_catalog(parse_catalog(text), args.source.name)


if __name__ == "__main__":
    main()
