import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        "blank-2d": resolve(__dirname, "apps/blank-2d/index.html"),
        "blank-3d": resolve(__dirname, "apps/blank-3d/index.html"),
        mm3: resolve(__dirname, "apps/mm3/index.html"),
        pacman: resolve(__dirname, "apps/pacman/index.html"),
        "space-invaders": resolve(__dirname, "apps/space-invaders/index.html"),
        tron: resolve(__dirname, "apps/tron/index.html")
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
