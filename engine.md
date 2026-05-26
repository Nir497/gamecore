# Building Games With Gamecore

This file is for future agents adding games to this repository. Gamecore is a static TypeScript/Vite engine for GitHub Pages. Games must run fully in the browser and must not require a backend.

## Where Games Go

Create each game in its own folder:

```text
apps/<game-name>/
  index.html
  src/main.ts
  assets/
```

Use lowercase kebab-case names, for example `apps/pong/` or `apps/space-invaders/`. Keep game-specific code, maps, images, and sounds inside that game folder unless the asset is shared by multiple games.

Shared engine code lives in `src/engine/`. Do not copy engine files into a game folder. Import from the local engine package instead:

```ts
import { createGame, Scene, Entity } from "../../../src/engine";
```

Adjust the relative path if the game folder depth changes.

## Basic 2D Game Wiring

For Canvas games, follow `apps/blank-2d/src/main.ts`.

1. Add a `<canvas id="game">` in the game `index.html`.
2. Create a `Scene` subclass.
3. Call `createGame({ canvas, width, height, background, pixelArt })`.
4. `await game.setScene(new YourScene())`.
5. Call `game.start()`.

Use `Scene.update(dt)` for gameplay state and `Scene.render2D(ctx)` for drawing. Use `Entity` and components when objects need reusable behavior.

## Basic 3D Game Wiring

For 3D games, follow `apps/blank-3d/src/main.ts`.

Use `ThreeScene` for Three.js setup:

```ts
import { InputManager, ThreeScene } from "../../../src/engine";
```

Create the renderer with the game canvas, add meshes/lights to `world.scene`, update positions in a `requestAnimationFrame` loop, and call `world.render()`.

## Assets And Sounds

Small game-specific assets should live under `apps/<game-name>/assets/`. Homepage card images live under `public/assets/` because they are loaded from the root site.

Use browser-safe formats:

- Images: `png`, `jpg`, `webp`, `svg`
- Audio: `mp3`, `ogg`, `wav`
- Data: `json`

For 2D engine-managed loading, use `game.assets.image(...)`, `game.assets.audio(...)`, `game.assets.json(...)`, and `game.audio.play(...)`. Remember that browser audio usually cannot autoplay until the user interacts with the page.

## Adding A Game To The Build

Add the game page to `vite.config.ts`:

```ts
input: {
  home: resolve(__dirname, "index.html"),
  "my-game": resolve(__dirname, "apps/my-game/index.html")
}
```

Run `npm run build` and confirm the page appears under `dist/apps/<game-name>/`.

## Adding A Homepage Card

Cards are currently static HTML in root `index.html`. Add a new `<a class="game-card">` inside `#game-grid`, set `href` to the game folder, set `data-game-name`, add the thumbnail image, title, description, and status badge.

Example:

```html
<a class="game-card" href="./apps/my-game/" data-game-name="My Game" aria-label="Play My Game">
  <img src="./assets/placeholders/my-game.svg" alt="" loading="lazy" />
  <span class="game-info">
    <span class="game-title">My Game</span>
    <span class="game-description">Short description.</span>
  </span>
  <span class="status status-ready">Ready</span>
</a>
```

## Testing And Verification

Before finishing a game change, run:

```sh
npm run typecheck
npm run test
npm run build
```

Also start `npm run dev` and manually open the new game page. Verify keyboard/mouse controls, canvas sizing, asset paths, and that links work from the homepage.

## GitHub Pages Rules

Use relative paths like `./assets/...` and `./apps/<game-name>/`. Do not depend on server routes, databases, or filesystem writes. Anything needed at runtime must be committed as static files or loaded from a public external URL.
