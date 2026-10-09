import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:'.',
  testMatch:'ux-phase1.spec.mjs',
  timeout:45_000,
  expect:{timeout:10_000},
  reporter:[['list']],
  use:{
    ...devices['Desktop Chrome'],
    baseURL:'http://127.0.0.1:5174/Vertragsnavigator-Pages/',
    trace:'retain-on-failure'
  },
  webServer:{
    command:'npx vite --config vite.ux-test.config.js --host 127.0.0.1 --port 5174 --strictPort',
    url:'http://127.0.0.1:5174/Vertragsnavigator-Pages/',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
})
