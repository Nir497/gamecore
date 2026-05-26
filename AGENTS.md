# Repository Guidelines

## Project Structure & Module Organization

Gamecore is a TypeScript/Vite browser game engine for static GitHub Pages deployment. Core engine code lives in `src/engine/`, grouped by subsystem: `core/`, `input/`, `assets/`, `audio/`, `physics/`, `rendering/`, and `systems/`. The homepage is root `index.html` with styles in `src/home/`. Starter game pages live under `apps/blank-2d/` and `apps/blank-3d/`; add future games as `apps/<game-name>/`. Static thumbnails and public assets live in `public/assets/`. Tests live in `tests/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the Vite dev server for local playtesting.
- `npm run typecheck`: run TypeScript checks without emitting files.
- `npm run test`: run Vitest unit tests.
- `npm run build`: typecheck and build static output into `dist/`.
- `npm run preview`: preview the production build locally.

## Coding Style & Naming Conventions

Use TypeScript with strict types. Prefer small modules and explicit exported interfaces for public engine APIs. Use two-space indentation, semicolons, double quotes, and ASCII text unless a file already requires otherwise. Classes use `PascalCase` (`EntityPool`), functions and variables use `camelCase` (`createGame`), and directories use lowercase or kebab-case (`blank-2d`). Keep game-specific code inside its app folder; shared behavior belongs in `src/engine/`.

## Testing Guidelines

Vitest is the test framework, configured with `jsdom`. Add focused tests in `tests/*.test.ts` for engine behavior such as lifecycle, input state, collision, pooling, and scheduling. Run `npm run typecheck`, `npm run test`, and `npm run build` before completing changes. New shared engine behavior should include tests unless it is purely visual or template-only.

## Game-Building Instructions

Agents building games must read `engine.md` before adding or changing a game. It documents the local engine APIs, folder layout, asset rules, sound loading, Vite build wiring, homepage card wiring, and GitHub Pages constraints.

Create each game under `apps/<game-name>/` using lowercase kebab-case. Do not copy engine code into games; import from `src/engine/`. Put game-specific assets in `apps/<game-name>/assets/`; put homepage thumbnails in `public/assets/`. Add every new playable page to `vite.config.ts` and add/update its static card in root `index.html` so it appears in search and on GitHub Pages.

Games must run fully as static browser pages. Avoid backend dependencies, server routes, filesystem writes, or absolute paths that break under `https://nir497.github.io/gamecore/`.

## Commit & Pull Request Guidelines

Existing history uses short imperative commit messages, for example `Add searchable game homepage`. Keep commits focused and include only relevant files. Pull requests should describe the change, list verification commands run, link related issues when available, and include screenshots or screen recordings for visible UI/gameplay changes.

## Agent-Specific Instructions

At the end of each completed task, commit relevant changes and push to `origin/main` unless explicitly told not to. Do not commit generated `dist/`, `node_modules/`, or local metadata files. When changing games or homepage cards, verify the relevant page locally and run `npm run typecheck`, `npm run test`, and `npm run build`.
