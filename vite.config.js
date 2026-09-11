import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || `local-${Date.now()}`;

function stampServiceWorker() {
  return {
    name: "qazauto-service-worker-version",
    apply: "build",
    async closeBundle() {
      const serviceWorkerPath = resolve("dist", "sw.js");
      const source = await readFile(serviceWorkerPath, "utf8");
      await writeFile(
        serviceWorkerPath,
        source.replaceAll("__QAZAUTO_SW_BUILD_ID__", buildId),
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
});
