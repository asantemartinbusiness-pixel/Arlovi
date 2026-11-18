import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        // Fixture chunks load in the background for every application; name
        // them apart from screen chunks so demand-loading checks stay exact.
        chunkFileNames: (chunk) => chunk.facadeModuleId?.includes("/src/domain/seeds/")
          ? "assets/seed-[name]-[hash].js"
          : "assets/[name]-[hash].js",
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.ts"],
  },
});
