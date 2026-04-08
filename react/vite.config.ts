import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In production, set VITE_PUBLIC_URL to your deployed origin (e.g. https://atbbs.app)
// so that client-metadata.json is generated with the right client_id / redirect_uri.
// In dev, the BrowserOAuthClient falls back to loopback metadata automatically.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: "127.0.0.1" },
});
