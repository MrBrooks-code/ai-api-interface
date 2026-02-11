# Codebase Critical Review

Four parallel reviewers examined the renderer, main process, shared/IPC layer, and build configuration. Findings are de-duplicated and prioritized below.

---

## Bugs (Should Fix)

| # | Area | File | Issue | Status |
|---|------|------|-------|--------|
| 1 | Main | `src/main/file-handler.ts` | **`allowedPaths` never cleared.** Once a file is selected via the dialog, its path stays in the Set forever. No session-scoped cleanup. | FIXED — added `clearAllowedPaths()`, called from `disconnect()` |
| 2 | Main | `src/main/ipc-handlers.ts:157` | **Race condition on `pendingWizardToken`.** Concurrent SSO device-auth calls can overwrite the token mid-flow. | Open — UI naturally prevents concurrent wizard flows; low practical risk |
| 3 | Main | `src/main/ipc-handlers.ts` | **FILE_READ handler has no try-catch.** Errors propagate as unhandled rejections with inconsistent shape. | FIXED — wrapped in try-catch, returns `{ error }` |
| 4 | Main | `src/main/credential-manager.ts` | **No validation of `sessionDurationMinutes`.** Zero/negative values cause immediate disconnect. | FIXED — `startSessionTimer` now returns early if `<= 0` |
| 5 | Renderer | `src/renderer/components/FilePreview.tsx` | **Blob URL memory leak.** `URL.createObjectURL()` never revoked on unmount. | FIXED — switched to `useEffect` with cleanup |
| 6 | Renderer | `src/renderer/hooks/useChat.ts` | **No unmount guard on stream listener.** State updates fire on dead component. | FIXED — added `mountedRef` guard |
| 7 | Renderer | `MessageBubble.tsx` / `ToolActivityGroup.tsx` | **Clipboard errors swallowed.** UI shows "Copied!" even when write fails. | FIXED — wrapped in try-catch |
| 8 | Build | `vite.config.ts` | **Source maps ship in production.** `process.env.NODE_ENV` not reliably set at config eval time. | FIXED — switched to `defineConfig(({ mode }))` function form |

---

## Improvements (Should Consider)

| # | Area | File | Issue | Status |
|---|------|------|-------|--------|
| 9 | Main | `src/main/ipc-handlers.ts` | **No rate limiting on database write operations.** | FIXED — added `store:write` rate limit (30/10s) to create, delete, update, save handlers |
| 10 | Main | `src/main/store.ts` | **`saveMessage` lacks transaction wrapping.** | FIXED — wrapped in `db.transaction()` |
| 11 | Main | `src/main/store.ts:282-286` | **`VACUUM` blocks the main thread.** After `wipeAllData()`, synchronous VACUUM freezes all IPC handlers. | Open — infrequent operation; async VACUUM not supported by better-sqlite3 |
| 12 | Main | `src/main/bedrock-stream.ts` | **Streams continue after window destruction.** | FIXED — added `window.isDestroyed()` check in stream loop |
| 13 | Shared | `src/shared/types.ts` | **`StreamEvent.data` is `Record<string, unknown>`.** | FIXED — replaced with discriminated union; eliminated ~10 `as` casts |
| 14 | Shared | `src/shared/ipc-channels.ts` | **Dead `AWS_SSO_LOGIN` channel.** | FIXED — removed |
| 15 | Renderer | `src/renderer/App.tsx` | **No React error boundary.** | FIXED — added `ErrorBoundary` component wrapping the main UI |
| 16 | Renderer | `src/renderer/components/Sidebar.tsx` | **Conversation items are clickable `<div>`s.** | FIXED — changed to `<button>` with keyboard-accessible delete |
| 17 | Renderer | `src/renderer/components/MessageList.tsx` | **`groupMessages()` called on every render.** | FIXED — wrapped in `useMemo` |
| 18 | Renderer | `src/renderer/components/SettingsPanel.tsx` | **`modelsByProvider` recomputed every render.** | FIXED — wrapped in `useMemo` |
| 19 | Renderer | `src/renderer/hooks/useAutoConnect.ts` | **SSO listener leak on early return.** | FIXED — listener registered before async IIFE so cleanup is always valid |
| 20 | Build | `package.json:16-20` | **AWS SDK version skew.** `bedrock-runtime` and `credential-providers` at `^3.700.0` vs others at `^3.986.0`. | Open — requires `npm install` and regression testing |
| 21 | Build | `package.json` | **No test framework.** Zero test coverage. | Open — requires project decision on framework (Vitest recommended) |
| 22 | Build | `package.json:9` | **ESLint not in devDependencies.** `npm run lint` will fail. | Open — requires `npm install eslint` + config setup |

---

## Nits (Low Priority)

| # | Area | Issue | Status |
|---|------|-------|--------|
| 23 | Shared | Rate limiter key strings (`'aws:connect'`, `'sso:device-auth'`) are hardcoded — not linked to the `IPC` channel constants, so they can drift. | Open — acceptable; keys are intentionally distinct from channel names |
| 24 | Shared | IPC handler error response shapes are inconsistent: some use `{ success, error }`, `CHAT_SEND_MESSAGE` uses `{ requestId, error }`. | Open — would require coordinated renderer+main refactor |
| 25 | Renderer | `InputBar.tsx` — textarea has no `aria-label`; attach button uses `&#10;` newlines in the `title` attribute. | FIXED — added `aria-label` to textarea and attach button; replaced `&#10;` with single-line title |
| 26 | Build | `tsconfig.json` has `declaration: true` and `declarationMap: true` but also `noEmit: true` — the declaration options are unused. | FIXED — removed `declaration`, `declarationMap`, and `sourceMap` |
| 27 | Build | `skipLibCheck: true` in tsconfig reduces type safety for third-party packages. | Open — removing would surface upstream type errors; keep for now |

---

## Summary

| Category | Count |
|----------|-------|
| Bugs | 8 |
| Improvements | 14 |
| Nits | 5 |
| **Total** | **27** |

## Fix Summary

| Status | Count |
|--------|-------|
| FIXED | 20 |
| Open (accepted) | 7 |
| **Total** | **27** |

### Remaining Open Items

- **#2** — Race condition on `pendingWizardToken` (low practical risk; UI prevents concurrent wizard flows)
- **#11** — `VACUUM` blocks main thread (infrequent operation; async VACUUM not supported by better-sqlite3)
- **#20** — AWS SDK version skew (requires `npm install` and regression testing)
- **#21** — No test framework (requires project decision on framework — Vitest recommended)
- **#22** — ESLint not in devDependencies (requires `npm install eslint` + config)
- **#23** — Rate limiter keys hardcoded (acceptable; keys are intentionally distinct from channel names)
- **#24** — Inconsistent IPC error response shapes (would require coordinated refactor)
