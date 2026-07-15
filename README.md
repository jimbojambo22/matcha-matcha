# Matcha! Matcha!

A push-your-luck card-matching game for 1–6 players. Guess whether the next
card will **Match** or **No Match**, grow your pot, steep it for later, and
bank your points before a Matcha-Matcha wipes you out.

Built with React + Vite as an installable PWA. Single-player and local
pass-and-play.

## Project layout

| Path | What it is |
| --- | --- |
| `src/game/` | **The rules.** Pure game engine — no UI, no DOM, plain serializable state. `engine.test.js` is the executable rulebook. |
| `src/ui/` | React components (setup, game screen, cards, modals, rulebook). |
| `src/assets/` | Card art (suit SVGs + card back). |
| `legacy/` | The original vanilla-JS version, kept as a playable reference. |
| `scripts/generate-icons.mjs` | Regenerates PWA icons from the leaf art. |

The engine is deliberately isolated so it can later power online multiplayer
and an AI opponent: drive it with `createGame(options)` and
`applyAction(state, action)`; both return `{ state, events }`.

**Rule changes must update three places together:** `src/game/engine.js`,
`src/game/engine.test.js`, and the in-app rulebook
(`src/ui/RulebookModal.jsx`).

## Commands

```sh
npm install      # once
npm run dev      # dev server
npm test         # run the rules test suite
npm run build    # production build to dist/
npm run icons    # regenerate PWA icons
```

## Deploying

Pushing to `main` runs `.github/workflows/pages.yml`: tests, build, and
deploy of `dist/` to GitHub Pages at `/matcha-matcha/`.
