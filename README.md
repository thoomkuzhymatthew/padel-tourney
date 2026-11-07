# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```


## Tournament core (milestone 2)

Pure TypeScript lives in `src/lib/rotation.ts` and `src/lib/scoring.ts`, with shared types in `src/lib/types.ts`. Rotation takes the roster, stored round history, court count, target, and optional random source. It returns the next round without mutating history. Persist that round once when the database milestone is implemented.

`scoreMatch` validates Team A’s score and calculates Team B’s complement. `calculateLeaderboard` derives standings from results and each round’s sit-outs; removed players retain results, late joiners receive no retrospective compensation. Pending and explicitly forfeited matches have distinct states. Server authorization and persistence belong to milestone 3.

Run `npm install`, then `npm test` for the Section 6 scenarios, `npm run lint`, and `npm run build`. Use `npm run test:watch` while editing. Tests use seeded randomness for repeatable rotation checks, including 8 players over 7 rounds and 12 players over 11 rounds, every required sit-out roster size, score edits, roster changes, and leaderboard tie-breaks.

Environment files (`.env` and `.env.*`) are ignored. Configure local credentials yourself; do not commit secrets. Only Supabase’s publishable/anon key may be used in frontend configuration.
