export function createDefaultFilters() {
  return {
    category: "cars",
    city: "",
    brand: "",
    model: "",
    radius: "50",
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
      (!filters.body || listing.body === filters.body) &&
      (!filters.condition || listing.condition === filters.condition) &&
      (!filters.hasPhoto || listing.hasPhoto) &&
      (!filters.cleared || listing.cleared) &&
      (!filters.damaged || listing.damaged) &&
      (!filters.canFinance || listing.canFinance) &&
      (!filters.yearFrom || listing.year >= Number(filters.yearFrom)) &&
      (!filters.yearTo || listing.year <= Number(filters.yearTo)) &&
      (!filters.priceFrom || listing.price >= Number(filters.priceFrom)) &&
      (!filters.priceTo || listing.price <= Number(filters.priceTo))
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
