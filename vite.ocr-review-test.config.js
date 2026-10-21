import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
export default defineConfig({
  base:'/Vertragsnavigator-Pages/',
  plugins:[react()],
  optimizeDeps:{noDiscovery:true,include:[]},
  resolve:{alias:[{
    find:/^(?:\.\.\/|\.\/)lib\/contractUpload\.js$/,
    replacement:fileURLToPath(new URL('./tests/mocks/contractUploadOcr.js',import.meta.url))
  }]},
  server:{host:'127.0.0.1',port:5174,strictPort:true}
})
