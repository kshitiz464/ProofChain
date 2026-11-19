import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: { port: 5173, proxy: { "/api": { target: "http://127.0.0.1:5000", changeOrigin: true } } },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to backend during development
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
