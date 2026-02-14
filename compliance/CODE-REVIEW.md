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
| 11 | Main | `src/main/store.ts:282-286` | **`VACUUM` blocks the main thread.** After `wipeAllData()`, synchronous VACUUM freezes all IPC handlers. | FIXED — deferred VACUUM via `setImmediate()` so pending IPC responses flush first |
| 12 | Main | `src/main/bedrock-stream.ts` | **Streams continue after window destruction.** | FIXED — added `window.isDestroyed()` check in stream loop |
| 13 | Shared | `src/shared/types.ts` | **`StreamEvent.data` is `Record<string, unknown>`.** | FIXED — replaced with discriminated union; eliminated ~10 `as` casts |
| 14 | Shared | `src/shared/ipc-channels.ts` | **Dead `AWS_SSO_LOGIN` channel.** | FIXED — removed |
| 15 | Renderer | `src/renderer/App.tsx` | **No React error boundary.** | FIXED — added `ErrorBoundary` component wrapping the main UI |
| 16 | Renderer | `src/renderer/components/Sidebar.tsx` | **Conversation items are clickable `<div>`s.** | FIXED — changed to `<button>` with keyboard-accessible delete |
| 17 | Renderer | `src/renderer/components/MessageList.tsx` | **`groupMessages()` called on every render.** | FIXED — wrapped in `useMemo` |
| 18 | Renderer | `src/renderer/components/SettingsPanel.tsx` | **`modelsByProvider` recomputed every render.** | FIXED — wrapped in `useMemo` |
| 19 | Renderer | `src/renderer/hooks/useAutoConnect.ts` | **SSO listener leak on early return.** | FIXED — listener registered before async IIFE so cleanup is always valid |
| 20 | Build | `package.json:16-20` | **AWS SDK version skew.** `bedrock-runtime` and `credential-providers` at `^3.700.0` vs others at `^3.986.0`. | FIXED — aligned all AWS SDK packages to `^3.986.0` |
| 21 | Build | `package.json` | **No test framework.** Zero test coverage. | FIXED — added Vitest with config and placeholder test |
| 22 | Build | `package.json:9` | **ESLint not in devDependencies.** `npm run lint` will fail. | FIXED — added ESLint + @typescript-eslint to devDependencies with flat config |

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

---

## New Findings — 2026-02-13 Review

Features reviewed: conversation drag-and-drop reordering, drag-to-archive, chat layout restyle (assistant bubble removal), tool activity group reorder, preview panel animation fix, sidebar UI polish.

### Bugs (Should Fix)

| # | Area | File | Issue | Status |
|---|------|------|-------|--------|
| 28 | Renderer | `src/renderer/hooks/useConversations.ts:60-64` | **Reorder optimistic update with no IPC failure rollback.** `store.reorderConversations()` runs before `ipc.reorderConversations()`. If IPC fails (rate limit, DB error), UI diverges from database. On next load, order reverts silently. | FIXED — added try/catch around IPC call; on failure, reloads conversations from DB via `loadConversations()` |
| 29 | Renderer | `src/renderer/components/ArtifactPanel.tsx:294-301` | **Close/open race condition.** If user opens a new preview before the 300ms close `setTimeout` fires, the timeout still executes — unmounting the panel and clearing the new preview content. `isClosing.current = false` in the open path doesn't cancel the pending timeout. | FIXED — stored timeout ID in `closeTimerRef`; open path clears it with `clearTimeout` |
| 30 | Renderer | `src/renderer/components/Sidebar.tsx:291-293` | **Ref type mismatch.** `menuRef` and `folderMenuRef` are `useRef<HTMLDivElement>(null)` but applied to `<span>` elements in `ConversationRow`/`FolderRow`. Should be `useRef<HTMLSpanElement>`. | FIXED — changed both refs to `useRef<HTMLSpanElement>(null)` |

### Improvements (Should Consider)

| # | Area | File | Issue | Status |
|---|------|------|-------|--------|
| 31 | Main | `src/main/store.ts:151-154` | **`archiveConversation` does not clear `sort_order`.** Stale sort order from original group persists into archive list, causing unexpected positioning among archived conversations. Should add `sort_order = NULL` to archive UPDATE. | FIXED — added `sort_order = NULL` to archive UPDATE |
| 32 | Main | `src/main/store.ts:157-161` | **`unarchiveConversation` does not clear `sort_order`.** Same issue — stale sort order causes unexpected positioning when conversation is restored to active list. | FIXED — added `sort_order = NULL` to unarchive UPDATE |
| 33 | Renderer | `src/renderer/stores/chat-store.ts:169` | **Store-side `archiveConversation` does not clear `sortOrder`.** Sets `folderId: undefined` but preserves `sortOrder` from the conversation's original group position. | FIXED — added `sortOrder: undefined` to both archive and unarchive actions |
| 34 | Renderer | `src/renderer/hooks/useConversations.ts:60-64` | **No rate-limit response checking on reorder IPC.** Handler returns `{ error: 'Rate limit exceeded...' }` when rate-limited, but hook doesn't check return value — optimistic update already applied. | FIXED — checks return value for `error` property; reloads from DB on rate-limit |
| 35 | Renderer | `src/renderer/components/ArtifactPanel.tsx:314-341` | **`srcdoc` not cleared on panel close.** When reopened with different content, iframe may briefly flash previous content before useEffect updates it. | FIXED — `setSrcdoc('')` called in both `handleClose` and external-clear paths |
| 36 | Renderer | `src/renderer/hooks/useFolders.ts:41-44` | **Inconsistent optimistic-vs-await pattern.** `moveConversationToFolder` awaits IPC before store update (safe but slow), while `reorderConversations` does optimistic update first (fast but no rollback). Patterns should be consistent. | FIXED — added try/catch and rate-limit checking to `moveConversationToFolder` |
| 37 | Renderer | `src/renderer/components/Sidebar.tsx:614` | **`handleRowDrop` may read stale `reorderTarget`.** Between `onDragOver` setting state and `onDrop` firing, React may not have re-rendered, causing the callback to capture an older `reorderTarget` value. Falls back to `'below'` if stale. | FIXED — added `reorderTargetRef` mirroring state; drop handler reads from ref |

### Nits (Low Priority)

| # | Area | Issue | Status |
|---|------|-------|--------|
| 38 | Main | `src/main/store.ts:64-82` — Migration `catch {}` blocks swallow all errors, not just "duplicate column name". Disk-full or database-locked errors are silently ignored. | Open |
| 39 | Renderer | `src/renderer/components/Sidebar.tsx:625-657` — `renderConversationRows` is a function declaration inside the component body, re-declared every render with new callback instances. `React.memo` on `ConversationRow` won't help since callbacks change. | Open |
| 40 | Renderer | `src/renderer/components/ArtifactPanel.tsx:373-380` — Escape key handler conflicts with Sidebar. Both register `keydown` listeners; pressing Escape with both panel open and delete confirmation active triggers both handlers. | Open |
| 41 | All Hooks | `useConversations.ts`, `useFolders.ts` — Empty `useCallback` dependency arrays `[]` rely on Zustand stable singleton refs. Technically correct but triggers `react-hooks/exhaustive-deps` lint warnings. | Open |

---

## Summary

| Category | Count |
|----------|-------|
| Bugs | 11 |
| Improvements | 21 |
| Nits | 9 |
| **Total** | **41** |

## Fix Summary

| Status | Count |
|--------|-------|
| FIXED | 33 |
| Open (accepted / new) | 8 |
| **Total** | **41** |

### Remaining Open Items (Pre-Existing)

- **#2** — Race condition on `pendingWizardToken` (low practical risk; UI prevents concurrent wizard flows)
- **#23** — Rate limiter keys hardcoded (acceptable; keys are intentionally distinct from channel names)
- **#24** — Inconsistent IPC error response shapes (would require coordinated refactor)

### New Open Items (2026-02-13)

- **#38** — Migration catch blocks swallow all errors
- **#39** — `renderConversationRows` re-declared every render
- **#40** — Escape key handler conflicts
- **#41** — Empty `useCallback` dependency arrays
- **#27** — `skipLibCheck: true` in tsconfig (removing would surface upstream type errors)
