import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = nombre del repo en GitHub. La web queda en <usuario>.github.io/pigiot/
export default defineConfig({
  base: '/pigiot/',
  plugins: [react()],
})
