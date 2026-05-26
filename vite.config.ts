import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        "blank-2d": resolve(__dirname, "apps/blank-2d/index.html"),
        "blank-3d": resolve(__dirname, "apps/blank-3d/index.html")
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
