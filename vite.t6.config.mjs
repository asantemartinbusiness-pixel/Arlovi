/* Temporary verification server for the t6 platform workstream. Not part of the app. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  cacheDir: "node_modules/.vite-t6",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/applications$/, replacement: path.resolve(import.meta.dirname, "src/applications/t6_platform.ts") },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
    ],
  },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
