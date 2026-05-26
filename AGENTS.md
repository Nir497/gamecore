# Repository Guidelines

## Project Structure & Module Organization

Gamecore is a TypeScript/Vite browser game engine for static GitHub Pages deployment. Core engine code lives in `src/engine/`, grouped by subsystem: `core/`, `input/`, `assets/`, `audio/`, `physics/`, `rendering/`, and `systems/`. The searchable game selection homepage lives in `src/home/` and root `index.html`. Starter game pages live under `apps/blank-2d/` and `apps/blank-3d/`; add future games as `apps/<game-name>/`. Static thumbnails and public assets live in `public/assets/`. Tests live in `tests/`.

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

## Commit & Pull Request Guidelines

Existing history uses short imperative commit messages, for example `Add searchable game homepage`. Keep commits focused and include only relevant files. Pull requests should describe the change, list verification commands run, link related issues when available, and include screenshots or screen recordings for visible UI/gameplay changes.

## Agent-Specific Instructions

At the end of each completed task, commit relevant changes and push to `origin/main` unless explicitly told not to. Do not commit generated `dist/`, `node_modules/`, or local metadata files.
