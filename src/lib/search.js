export function createDefaultFilters() {
  return {
    category: "cars",
    city: "",
    brand: "",
    model: "",
    generation: "",
    trim: "",
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

export function filterListings(listings, filters) {
  return listings.filter((listing) => {
    const categoryMatch =
      filters.category === "dealer" ? true : !filters.category || listing.category === filters.category;

    return (
      categoryMatch &&
      (!filters.city || listing.city === filters.city) &&
      (!filters.brand || listing.brand === filters.brand) &&
      (!filters.model || listing.model === filters.model) &&
      (!filters.generation || listing.generation === filters.generation) &&
      (!filters.trim || listing.trim === filters.trim) &&
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
