import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bind all interfaces: 'localhost' alone resolved IPv6-only on some Windows
  // machines, so http://127.0.0.1:5173 refused to connect. `true` also exposes
  // the dev server to the LAN (Vite prints the Network URL) for phone testing.
  server: { host: true, port: 5173 },
})
