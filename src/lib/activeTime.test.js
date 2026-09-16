import assert from "node:assert/strict";
import test from "node:test";
import { startVisibleTimer } from "./activeTime.js";

function fakeDocument(initialVisibility = "visible") {
  const listeners = new Set();
  return {
    visibilityState: initialVisibility,
    addEventListener(_name, listener) { listeners.add(listener); },
    removeEventListener(_name, listener) { listeners.delete(listener); },
    setVisibility(value) {
      this.visibilityState = value;
      listeners.forEach((listener) => listener());
    },
  };
}

test("counts only time while the page is visible", () => {
  let currentTime = 0;
  const documentRef = fakeDocument();
  const timer = startVisibleTimer({ documentRef, now: () => currentTime });

  currentTime = 1200;
  documentRef.setVisibility("hidden");
  currentTime = 8200;
  documentRef.setVisibility("visible");
  currentTime = 9300;

  assert.equal(timer.stop(), 2300);
});

test("starts counting when a hidden page becomes visible", () => {
  let currentTime = 100;
  const documentRef = fakeDocument("hidden");
  const timer = startVisibleTimer({ documentRef, now: () => currentTime });

  currentTime = 5000;
  documentRef.setVisibility("visible");
  currentTime = 5750;

  assert.equal(timer.stop(), 750);
});
