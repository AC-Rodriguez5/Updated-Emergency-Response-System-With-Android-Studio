import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', workers:1, timeout:90_000, retries:0,
  use:{baseURL:'http://127.0.0.1:3002',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],...(process.env.CI?{}:{channel:'msedge'})}}],
  webServer:[
    {command:'node --import tsx scripts/preview.ts',cwd:'../backend',url:'http://127.0.0.1:5055/health',timeout:300_000,reuseExistingServer:!process.env.CI},
    {command:'npm run dev -- --port 3002',url:'http://127.0.0.1:3002',reuseExistingServer:false,env:{VITE_API_URL:'http://127.0.0.1:5055/api',VITE_SOCKET_URL:'http://127.0.0.1:5055'}}
  ]
});


