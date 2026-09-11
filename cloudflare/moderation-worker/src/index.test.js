import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoFrameURLs, selectBestVehicleDetection } from "./index.js";

test("selectBestVehicleDetection accepts road vehicles above threshold", () => {
  const best = selectBestVehicleDetection([
    { label: "person", score: 0.99 },
    { label: "car", score: 0.81, box: { xmin: 1 } },
    { label: "truck", score: 0.63 },
  ], 0.55);
  assert.equal(best.label, "car");
  assert.equal(best.score, 0.81);
});

test("selectBestVehicleDetection rejects weak detections", () => {
  assert.equal(selectBestVehicleDetection([{ label: "car", score: 0.4 }], 0.55), null);
});

test("buildVideoFrameURLs uses the existing Stream thumbnail host", () => {
  const urls = buildVideoFrameURLs({
    duration_seconds: 10,
    variants: { thumbnail: "https://customer-demo.cloudflarestream.com/video/thumbnails/thumbnail.jpg" },
  }, "");
  assert.equal(urls.length, 5);
  assert.match(urls[0], /time=1\.00s/);
  assert.match(urls[4], /time=9\.00s/);
});
