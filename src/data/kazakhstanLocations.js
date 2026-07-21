import rawLocations from "./kazakhstan-regions-cities.txt?raw";

const locationCollator = new Intl.Collator("ru-KZ", {
  numeric: true,
  sensitivity: "base",
});

function parseLocations(source) {
  const regions = [];
  let currentRegion = null;

  source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex >= 0) {
        const name = line.slice(0, separatorIndex).trim();
        const firstCity = line.slice(separatorIndex + 1).trim();
        currentRegion = { name, cities: firstCity ? [firstCity] : [] };
        regions.push(currentRegion);
        return;
      }

      currentRegion?.cities.push(line);
    });

  return regions.map((region) => ({
    ...region,
    cities: [...new Set(region.cities)].sort(locationCollator.compare),
  }));
}

export const kazakhstanRegions = parseLocations(rawLocations);

export const kazakhstanCities = [...new Set(
  kazakhstanRegions.flatMap((region) => region.cities),
)].sort(locationCollator.compare);
