import { vehicleCatalogManifest } from "../data/vehicleCatalog.generated.js";

const catalogCache = new Map();

const brandAliases = {
  ds: "dsautomobiles",
  kgmobility: "ssangyong",
  lucid: "lucidmotors",
  mercedesmaybach: "maybach",
  ram: "ramtrucks",
  renaultsamsung: "samsung",
  "вазlada": "lada",
};

function normalizeBrand(value) {
  return value.toLocaleLowerCase("ru-KZ").replace(/[^a-zа-яё0-9]+/g, "");
}

function getManifestEntry(brand) {
  const key = normalizeBrand(brand);
  return vehicleCatalogManifest[brandAliases[key] || key];
}

export async function loadVehicleCatalog(brand) {
  const entry = getManifestEntry(brand);
  if (!entry) return { brand, models: [] };

  if (!catalogCache.has(entry.file)) {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const request = fetch(`${baseUrl}vehicle-catalog/${entry.file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Vehicle catalog request failed: ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        catalogCache.delete(entry.file);
        throw error;
      });
    catalogCache.set(entry.file, request);
  }

  return catalogCache.get(entry.file);
}
