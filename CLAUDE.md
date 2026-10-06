# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is npm. Angular 22, TypeScript 6, Vitest 5.

- `npm start` — dev server at http://localhost:4200 (`ng serve`)
- `npm run build` — production build (default configuration). Outputs to `dist/acampamento-site/` with `browser/` and `server/`.
- `npm run watch` — development build in watch mode
- `npm test` — unit tests via `ng test` (Vitest, jsdom, no browser). Watches for changes when run in a TTY; add `--watch=false` for a single run (`CI=1` also disables watch mode).
- Single test file: `npx ng test --watch=false --include src/app/app.spec.ts`
- Single test by name: `CI=1 npx ng test --watch=false --filter="should create the app"`
- `npm run serve:ssr:acampamento-site` — runs the built Express SSR server (`dist/.../server/server.mjs`). Requires `npm run build` first. Port from `PORT` env, default 4000.

There is no lint script. Prettier is installed (`.prettierrc`: printWidth 100, single quotes, angular parser for `*.html`); run it with `npx prettier --check .` / `--write`.

The README's `ng e2e` section is stale: no e2e builder is configured in `angular.json`.

## Architecture

This is a single-page, Portuguese-language (pt-BR) landing site for a youth camp (Acampamento Jovem). There are no routes: `src/app/app.routes.ts` exports an empty array and all content lives in one root component, `App`.

- **Content is hardcoded.** Lot prices and vacancy counts are in the `lotes` array in `src/app/app.ts`; page copy is in `src/app/app.html`. Editing the event's content means editing those two files. The "Inscrições em breve" and "Documento em breve" buttons are disabled placeholders.
- **Two entry points, one shared config.** `src/main.ts` bootstraps the browser app with `appConfig` (`app.config.ts`). `src/main.server.ts` bootstraps for server rendering with `config` from `app.config.server.ts`, which merges `appConfig` with `provideServerRendering`. Changes that should affect both go in `app.config.ts`.
- **Rendering is prerendered SSR.** `app.routes.server.ts` marks `**` as `RenderMode.Prerender`, so `ng build` emits static HTML for the route at build time. `src/server.ts` is the Express server used at runtime: it serves `dist/.../browser` statically (1y cache) and falls back to `AngularNodeAppEngine` for everything else. The angular.json build sets `outputMode: "server"` and `ssr.entry: src/server.ts`. Client hydration is enabled (`provideClientHydration`).
- **Locale and currency.** `pt-BR` is registered in `app.config.ts` and set as `LOCALE_ID`. Prices use the `currency: 'BRL'` pipe, so new money values should go through the same pipe rather than string formatting.
- **Styling.** Global design tokens are CSS custom properties on `:root` in `src/styles.scss` (`--azul-*`, `--dourado`, `--texto`, `--fundo`). Component styles are SCSS in `src/app/app.scss` using nesting. Use the tokens instead of new hex values.
- **Build budgets** (production, in `angular.json`): initial bundle warns at 500 kB and errors at 1 MB; each component style warns at 4 kB and errors at 8 kB.
- **Fonts** (Inter, Poppins) load from Google Fonts in `src/index.html`, so the page depends on the network for them.

## TypeScript

`tsconfig.json` enables `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, and `noImplicitReturns`, plus `strictInjectionParameters` and `strictInputAccessModifiers` for Angular. `tsconfig.app.json` covers `src/**/*.ts` minus specs; `tsconfig.spec.json` covers specs with `vitest/globals` types.

## Tests

One spec file exists: `src/app/app.spec.ts`. It checks that `App` creates and that the `h1` contains the hero title, so changing the hero heading will break the test.
