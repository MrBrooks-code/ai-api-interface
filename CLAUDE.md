# CLAUDE.md — Project Instructions

## Project Overview

Bedrock Chat is an Electron desktop application for chatting with Amazon Bedrock foundation models. It uses a main/preload/renderer architecture with TypeScript throughout.

## Tech Stack

- **Runtime:** Electron (main + renderer processes)
- **Frontend:** React 18, Zustand, Tailwind CSS
- **Build:** Vite via electron-vite, electron-builder for packaging
- **Database:** better-sqlite3 (WAL mode, parameterized queries)
- **Backend SDK:** AWS SDK v3 (Bedrock Runtime, SSO, SSO-OIDC)

## Code Documentation Standards

All code must follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) for documentation:

- Every file must have a `@fileoverview` JSDoc at the top describing the module's purpose.
- Every exported symbol (function, class, interface, type, constant) must have a `/** JSDoc */` comment.
- Use `@param` and `@returns` tags only when the types alone aren't self-documenting.
- Internal/private helpers may use `//` line comments or `/** */` — use judgment.
- Focus on **why**, not **what**. Don't restate what the code obviously does.
- Do not add empty or redundant JSDoc (e.g., `/** Constructor. */` on a constructor).

## Architecture Conventions

- IPC follows a strict chain: `shared/ipc-channels.ts` → `main/ipc-handlers.ts` → `preload/index.ts` → `renderer/lib/ipc-client.ts`. New IPC channels must be added at all four layers.
- State lives in a single Zustand store (`renderer/stores/chat-store.ts`). Components read from the store; hooks orchestrate IPC calls and update the store.
- Admin/IT configuration is read from `resources/admin-config.json` (not user-editable in the UI). The main process reads it once on startup via `main/admin-config.ts`.

## Commands

- `npm run dev` — Start in development mode
- `npm run build` — Production build
- `npm run typecheck` — Run `tsc --noEmit`
- `npm run lint` — Run ESLint
- `npm run package` — Package with electron-builder

## Security Notes

- No manual AWS access key input — users authenticate via AWS CLI profiles or SSO only.
- Source maps are disabled in production builds.
- `.gitignore` excludes `.env`, `*.pem`, `*.key`, `credentials.json`, and similar secrets.
- The logon banner (CMMC AC.L2-3.1.9) is configured in `resources/admin-config.json`.
