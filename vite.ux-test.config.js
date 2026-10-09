/* Test-server-only config: production continues using vite.config.js unchanged. */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base:'/Vertragsnavigator-Pages/',
  plugins:[react()],
  resolve:{
    alias:[{
      find:/^(?:\.\.\/|\.\/)(?:lib\/)?supabase\.js$/,
      replacement:fileURLToPath(new URL('./tests/mocks/supabase.js',import.meta.url))
    }]
  },
  server:{host:'127.0.0.1',port:5174,strictPort:true}
})
