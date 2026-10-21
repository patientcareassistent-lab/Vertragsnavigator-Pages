import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
  testDir:'.',
  testMatch:'ocr-review-ui.spec.mjs',
  timeout:60_000,
  reporter:[['list']],
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:5174/Vertragsnavigator-Pages/',trace:'retain-on-failure'},
  webServer:{
    cwd:process.cwd(),
    command:'npx vite --config vite.ocr-review-test.config.js --host 127.0.0.1 --port 5174 --strictPort',
    url:'http://127.0.0.1:5174/Vertragsnavigator-Pages/ocr-review-smoke.html',
    reuseExistingServer:!process.env.CI,timeout:120_000
  }
})
