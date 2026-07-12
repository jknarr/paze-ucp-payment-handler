import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/browser.ts",
      formats: ["es"],
      fileName: () => "paze-handler.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  server: {
    cors: true,
  },
});
