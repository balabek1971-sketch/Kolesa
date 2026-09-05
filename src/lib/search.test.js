import test from "node:test";
import assert from "node:assert/strict";
import { filterListings, modelMatchesFilter } from "./search.js";

test("BMW series includes its numeric model variants", () => {
  for (const model of ["518", "520", "523", "524", "530d", "550"]) {
    assert.equal(modelMatchesFilter("BMW", "5 серия", model), true, model);
  }

  assert.equal(modelMatchesFilter("BMW", "5 серия", "430"), false);
  assert.equal(modelMatchesFilter("BMW", "5 серия", "X5"), false);
  assert.equal(modelMatchesFilter("BMW", "518", "520"), false);
});

test("qualified BMW series names stay specific", () => {
  assert.equal(modelMatchesFilter("BMW", "2 серия Active Tourer", "2-Series Active Tourer"), true);
  assert.equal(modelMatchesFilter("BMW", "2 серия Active Tourer", "218"), false);
});

test("Mercedes classes include their versions without matching adjacent families", () => {
  assert.equal(modelMatchesFilter("Mercedes-Benz", "E-Класс", "E 200"), true);
  assert.equal(modelMatchesFilter("Mercedes-Benz", "E-Класс", "E 63 AMG"), true);
  assert.equal(modelMatchesFilter("Mercedes-Benz", "E-Класс", "EQE"), false);
  assert.equal(modelMatchesFilter("Mercedes-Benz", "E-Класс", "C 200"), false);
});

test("regular model names ignore harmless formatting differences", () => {
  assert.equal(modelMatchesFilter("Toyota", "Land Cruiser Prado", "land-cruiser prado"), true);
});

test("listing filter applies family matching", () => {
  const listings = [
    { id: "bmw-518", category: "cars", brand: "BMW", model: "518", availability: "in_stock" },
    { id: "bmw-430", category: "cars", brand: "BMW", model: "430", availability: "in_stock" },
  ];
  const filters = {
    category: "cars",
    brand: "BMW",
    model: "5 серия",
    availability: "in_stock",
  };

  assert.deepEqual(filterListings(listings, filters).map(({ id }) => id), ["bmw-518"]);
});
