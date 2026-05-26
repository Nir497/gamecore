# Gamecore

Gamecore is a static-site browser game engine scaffold for games hosted on GitHub Pages. It is built with TypeScript and Vite, uses Canvas 2D for arcade games, and uses Three.js for 3D or first-person game projects.

## Commands

```sh
npm install
npm run dev
npm run build
npm run test
```

## Project Layout

```text
src/engine/          shared engine package
apps/blank-2d/      starter page for Canvas 2D games
apps/blank-3d/      starter page for Three.js games
tests/              core engine tests
```

Each game should live under `apps/<game-name>/` with its own `index.html` and `src/main.ts`. Add each new game page to `vite.config.ts` under `build.rollupOptions.input`.

## Engine Capabilities

- Scene and entity lifecycle.
- Canvas 2D rendering.
- Three.js scene wrapper.
- Keyboard, mouse, and pointer-lock input foundation.
- Asset loading for images, audio, JSON, and text.
- Audio playback manager.
- Rectangle/circle collision helpers.
- Spatial hash grid for collision and AI queries.
- Entity pool and bot scheduler for games with dozens of bots.

## GitHub Pages

The production build is static. Run:

```sh
npm run build
```

The `dist/` folder can be deployed to GitHub Pages. Vite is configured with `base: "./"` so game pages can run from repository subpaths.
