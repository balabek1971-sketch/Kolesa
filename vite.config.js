import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || `local-${Date.now()}`;

export default defineConfig({
  define: {
    __QAZAUTO_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react()],
});
