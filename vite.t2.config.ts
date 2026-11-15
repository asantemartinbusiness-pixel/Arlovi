import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* Temporary verification server for the intelligence workstream, so browser
 * checks are not blocked by another workstream's in-flight module. */
export default defineConfig({
  plugins: [react()],
  cacheDir: "node_modules/.vite-t2",
  resolve: {
    alias: [
      { find: /^@\/applications$/, replacement: path.resolve(__dirname, "src/applications/t2_entry.ts") },
      { find: /^@\//, replacement: `${path.resolve(__dirname, "src")}/` },
    ],
  },
  server: { host: "127.0.0.1", port: 5191, strictPort: true },
});
