import test from "node:test";
import assert from "node:assert/strict";
import { formatLocalPhone, getLocalPhoneDigits, normalizeKazakhstanPhone } from "./phone.js";

test("accepts ten local Kazakhstan digits", () => {
  assert.equal(getLocalPhoneDigits("7029693963"), "7029693963");
  assert.equal(normalizeKazakhstanPhone("7029693963"), "+77029693963");
});

test("accepts full numbers beginning with 7 or 8", () => {
  assert.equal(getLocalPhoneDigits("77029693963"), "7029693963");
  assert.equal(getLocalPhoneDigits("87029693963"), "7029693963");
  assert.equal(normalizeKazakhstanPhone("+7 702 969 39 63"), "+77029693963");
});

test("keeps the visible local format", () => {
  assert.equal(formatLocalPhone("77029693963"), "702 969 39 63");
  assert.equal(normalizeKazakhstanPhone("702969396"), "");
});
