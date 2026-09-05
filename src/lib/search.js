export function createDefaultFilters() {
  return {
    category: "cars",
    city: "",
    brand: "",
    model: "",
    body: "",
    condition: "",
    hasPhoto: false,
    hasHistory: false,
    cleared: false,
    damaged: false,
    canFinance: false,
    yearFrom: "",
    yearTo: "",
    priceFrom: "",
    priceTo: "",
    mileageTo: "",
    originCountry: "",
    engineType: "",
    gearbox: "",
    steering: "",
    drivetrain: "",
    availability: "in_stock",
    engineVolumeFrom: "",
    engineVolumeTo: "",
    colorName: "",
    dealerOnly: false,
    metallic: false,
    keyword: "",
    downPaymentFrom: "",
    downPaymentTo: "",
    monthlyPaymentFrom: "",
    monthlyPaymentTo: ""
  };
}

function normalizeModel(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLocaleLowerCase("ru-KZ")
    .replace(/\u0451/g, "\u0435")
    .replace(/\u0441\u0435\u0440\u0438\u044f/g, "series")
    .replace(/\u043a\u043b\u0430\u0441\u0441/g, "class")
    .replace(/[^a-z\u0430-\u044f0-9]+/g, "");
}

export function modelMatchesFilter(brand, selectedModel, listingModel) {
  if (!selectedModel) return true;

  const selected = normalizeModel(selectedModel);
  const candidate = normalizeModel(listingModel);
  if (!selected || selected === candidate) return true;

  const numberedSeries = selected.match(/^([1-9])series(.*)$/);
  if (numberedSeries) {
    const [, series, qualifier] = numberedSeries;
    if (qualifier) return false;
    return new RegExp(`^${series}\\d{2}[a-z]*$`).test(candidate);
  }

  const letterClass = selected.match(/^([a-z]{1,3})class$/);
  if (letterClass) {
    return new RegExp(`^${letterClass[1]}\\d`).test(candidate);
  }

  return false;
}

export function filterListings(listings, filters) {
  return listings.filter((listing) => {
    const categoryMatch =
      filters.category === "dealer" ? true : !filters.category || listing.category === filters.category;

    return (
      categoryMatch &&
      (!filters.city || listing.city === filters.city) &&
      (!filters.brand || listing.brand === filters.brand) &&
      modelMatchesFilter(filters.brand || listing.brand, filters.model, listing.model) &&
      (!filters.body || listing.body === filters.body) &&
      (!filters.condition || listing.condition === filters.condition) &&
      (!filters.originCountry || listing.originCountry === filters.originCountry) &&
      (!filters.engineType || listing.engineType === filters.engineType) &&
      (!filters.gearbox || listing.gearbox === filters.gearbox) &&
      (!filters.steering || listing.steering === filters.steering) &&
      (!filters.drivetrain || listing.drivetrain === filters.drivetrain) &&
      (!filters.availability || listing.availability === filters.availability) &&
      (!filters.engineVolumeFrom || listing.engineVolume >= Number(filters.engineVolumeFrom)) &&
      (!filters.engineVolumeTo || listing.engineVolume <= Number(filters.engineVolumeTo)) &&
      (!filters.colorName || listing.colorName === filters.colorName) &&
      (!filters.dealerOnly || listing.isDealer) &&
      (!filters.metallic || listing.metallic) &&
      (!filters.keyword ||
        `${listing.title} ${listing.brand} ${listing.model}`.toLocaleLowerCase("ru-KZ")
          .includes(filters.keyword.toLocaleLowerCase("ru-KZ").trim())) &&
      (!filters.hasPhoto || listing.hasPhoto) &&
      (!filters.cleared || listing.cleared) &&
      (!filters.damaged || listing.damaged) &&
      (!filters.canFinance || listing.canFinance) &&
      (!filters.yearFrom || listing.year >= Number(filters.yearFrom)) &&
      (!filters.yearTo || listing.year <= Number(filters.yearTo)) &&
      (!filters.priceFrom || listing.price >= Number(filters.priceFrom)) &&
      (!filters.priceTo || listing.price <= Number(filters.priceTo)) &&
      (!filters.mileageTo || listing.mileage <= Number(filters.mileageTo))
    );
  });
}

export function sortListings(listings, sort) {
  return [...listings].sort((a, b) => {
    if (sort === "priceAsc") return a.price - b.price;
    if (sort === "priceDesc") return b.price - a.price;
    if (sort === "yearDesc") return b.year - a.year;
    return b.score - a.score;
  });
}
