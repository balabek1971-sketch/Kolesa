"""Build a lazy-loaded vehicle catalog from the CC BY 4.0 cardata.wiki CSV exports."""

from __future__ import annotations

import csv
import io
import json
import re
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_OUTPUT = ROOT / "public" / "vehicle-catalog"
JS_OUTPUT = ROOT / "src" / "data" / "vehicleCatalog.generated.js"
SOURCE_HOME = "https://cardata.wiki/"
SOURCE_DOWNLOAD = "https://cardata.wiki/api/download/make/{slug}"
USER_AGENT = "QazAuto-Catalog-Importer/1.0"


class MakeLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.current_href = ""
        self.current_text: list[str] = []
        self.makes: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        attributes = dict(attrs)
        self.current_href = attributes.get("href") or ""
        self.current_text = []

    def handle_data(self, data: str) -> None:
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or not self.current_href:
            return
        text = " ".join("".join(self.current_text).split())
        match = re.fullmatch(r"/([a-z0-9-]+)", self.current_href)
        label_match = re.fullmatch(r"(.+?)(\d+)\s+models?$", text, re.IGNORECASE)
        if match and label_match:
            self.makes.append((label_match.group(1).strip(), match.group(1)))
        self.current_href = ""
        self.current_text = []


def fetch_text(url: str, attempts: int = 3) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read().decode("utf-8-sig")
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Unable to fetch {url}")


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-zа-яё0-9]+", "", value.casefold())


def natural_key(value: str) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def clean_model(brand: str, model: str) -> str:
    result = " ".join(model.split())
    prefix = re.compile(rf"^{re.escape(brand)}[\s_-]+", re.IGNORECASE)
    result = prefix.sub("", result, count=1).strip()
    return result


def split_model_generation(model: str) -> tuple[str, str]:
    match = re.fullmatch(r"(.+?)\s+\(([A-Za-z0-9/-]{1,14})\)", model)
    if not match:
        return model, ""
    return match.group(1).strip(), match.group(2).strip()


def generation_name(code: str, year_from: str, year_to: str) -> str:
    if year_from and year_to and year_from == year_to:
        years = year_from
    elif year_from and year_to:
        years = f"{year_from}–{year_to}"
    elif year_from:
        years = f"{year_from}–н.в."
    elif year_to:
        years = f"до {year_to}"
    else:
        years = ""
    return " · ".join(part for part in (code, years) if part) or "Поколение не указано"


def build_catalog(brand: str, csv_text: str) -> dict[str, object]:
    models: dict[str, dict[tuple[str, str, str], set[str]]] = defaultdict(lambda: defaultdict(set))
    reader = csv.DictReader(io.StringIO(csv_text))

    for row in reader:
        model, generation_code = split_model_generation(clean_model(brand, row.get("model", "")))
        trim = " ".join((row.get("variant") or "").split())
        year_from = (row.get("yearFrom") or "").strip()
        year_to = (row.get("yearTo") or "").strip()
        if not model:
            continue
        models[model][(generation_code, year_from, year_to)].add(trim or "Комплектация не указана")

    model_items = []
    for model, generations in sorted(models.items(), key=lambda item: natural_key(item[0])):
        generation_items = []
        for (generation_code, year_from, year_to), trims in generations.items():
            generation_items.append(
                {
                    "id": f"{generation_code or 'generation'}-{year_from or 'unknown'}-{year_to or 'current'}",
                    "name": generation_name(generation_code, year_from, year_to),
                    "from": int(year_from) if year_from.isdigit() else None,
                    "to": int(year_to) if year_to.isdigit() else None,
                    "trims": sorted(trims, key=natural_key),
                }
            )
        generation_items.sort(
            key=lambda item: (
                item["from"] or 0,
                item["to"] or 9999,
                item["name"],
            ),
            reverse=True,
        )
        model_items.append({"name": model, "generations": generation_items})

    return {
        "brand": brand,
        "models": model_items,
        "source": "cardata.wiki",
        "license": "CC BY 4.0",
    }


def main() -> None:
    PUBLIC_OUTPUT.mkdir(parents=True, exist_ok=True)
    parser = MakeLinkParser()
    parser.feed(fetch_text(SOURCE_HOME))
    makes = list(dict.fromkeys(parser.makes))
    if len(makes) < 100:
        raise RuntimeError(f"Expected at least 100 makes, found {len(makes)}")

    manifest: dict[str, dict[str, object]] = {}
    totals = {"brands": 0, "models": 0, "generations": 0, "trims": 0}

    for index, (brand, slug) in enumerate(makes, start=1):
        catalog = build_catalog(brand, fetch_text(SOURCE_DOWNLOAD.format(slug=slug)))
        models = catalog["models"]
        if not models:
            continue

        path = PUBLIC_OUTPUT / f"{slug}.json"
        path.write_text(
            json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        generation_count = sum(len(model["generations"]) for model in models)
        trim_count = sum(
            len(generation["trims"])
            for model in models
            for generation in model["generations"]
        )
        manifest[normalize_key(brand)] = {
            "brand": brand,
            "file": f"{slug}.json",
            "models": len(models),
            "generations": generation_count,
            "trims": trim_count,
        }
        totals["brands"] += 1
        totals["models"] += len(models)
        totals["generations"] += generation_count
        totals["trims"] += trim_count
        print(f"[{index}/{len(makes)}] {brand}: {len(models)} models")

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    payload = {
        "generatedAt": generated_at,
        "source": "https://cardata.wiki/",
        "license": "CC BY 4.0",
        "totals": totals,
        "brands": manifest,
    }
    (PUBLIC_OUTPUT / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    JS_OUTPUT.write_text(
        "export const vehicleCatalogManifest = "
        + json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(json.dumps(totals, ensure_ascii=False))


if __name__ == "__main__":
    main()
