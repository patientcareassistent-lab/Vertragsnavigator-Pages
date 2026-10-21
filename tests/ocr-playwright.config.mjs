import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:".",
  testMatch:"ocr-browser-smoke.spec.mjs",
  timeout:180_000,
  reporter:[["list"]],
  use:{
    ...devices["Desktop Chrome"],
    baseURL:"http://127.0.0.1:5174/Vertragsnavigator-Pages/",
    trace:"retain-on-failure"
  },
  webServer:{
    cwd:process.cwd(),
    command:"npx vite --config vite.config.js --host 127.0.0.1 --port 5174 --strictPort",
    url:"http://127.0.0.1:5174/Vertragsnavigator-Pages/ocr-smoke.html",
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
