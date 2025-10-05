import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
  build: {
    outDir: "frontend",
  },
});
