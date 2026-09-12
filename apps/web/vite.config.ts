import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Horizon is self-hosted: the dev server must be reachable from other
    // machines. Vite rejects unknown Host headers by default, which blocks the
    // Tailscale name the README points at.
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Nitro turns the build into a standalone Node server for self-hosting.
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
})
