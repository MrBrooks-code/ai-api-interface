# Bedrock Chat — CMMC Compliance Security Review

**Application:** Bedrock Chat v1.0.0
**Type:** Electron desktop application (cross-platform)
**Purpose:** Chat interface for Amazon Bedrock LLM services
**Review Date:** 2026-02-10 (updated)
**Original Review:** 2026-02-09
**Scope:** Full source code review against CMMC Level 2 (NIST SP 800-171) controls

---

## Executive Summary

Bedrock Chat is an Electron-based desktop application that provides a chat interface to AWS Bedrock. The application follows a sound architectural pattern — credentials and sensitive operations are isolated in the main process, the renderer is locked down with `contextIsolation`, `sandbox`, and disabled `nodeIntegration`, and database access uses parameterized queries throughout.

Since the original review on 2026-02-09, all **critical** and **high** severity findings have been remediated. Additionally, three **medium** severity findings (source maps, `.gitignore`, and plaintext credential IPC) have been closed — the manual AWS key entry flow was removed entirely in favor of SSO-only authentication.

A comprehensive re-review on 2026-02-10 identified **4 new findings** (1 medium, 3 low) and confirmed closure of 4 previously open items. A further security review of the `web_search` and `read_webpage` tool additions on 2026-02-10 identified **4 additional findings** (1 critical, 1 high, 2 medium) related to SSRF and resource exhaustion — all remediated same-day.

### Risk Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 4 | **ALL REMEDIATED** (2026-02-09 / 2026-02-10) |
| High | 6 | **ALL REMEDIATED** (2026-02-09 / 2026-02-10) |
| Medium | 6 | **6 REMEDIATED** (2026-02-10) — 2 remaining: AU-F01, CM-F02 |
| Low | 1 | SI-F08 (accepted risk) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│                                                         │
│  credential-manager.ts ─── Holds AWS credentials        │
│  sso-auth.ts ──────────── SSO device auth + token cache │
│  bedrock-client.ts ────── AWS SDK client instances       │
│  bedrock-stream.ts ────── Converse API streaming         │
│  store.ts ─────────────── SQLite (better-sqlite3)       │
│  tool-executor.ts ─────── Built-in tool execution       │
│  file-handler.ts ──────── File dialog + read            │
│  ipc-handlers.ts ──────── IPC channel handlers          │
│  admin-config.ts ──────── IT-managed config loader      │
│                                                         │
├──────── contextBridge (preload/index.ts) ────────────────┤
│                                                         │
│                   Renderer Process (React)               │
│  Components, Zustand store, IPC client wrapper           │
│  contextIsolation: true | nodeIntegration: false         │
│  sandbox: true                                           │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

- **Credentials** are resolved and stored exclusively in the main process. They are never sent to the renderer. Authentication uses AWS CLI profiles or SSO only — no manual key entry.
- **Chat messages** flow: Renderer → IPC → Main (Bedrock API) → stream events back to renderer via `webContents.send()`.
- **Persistence** uses a local SQLite database at `app.getPath('userData')/bedrock-chat.db`. All queries use parameterized statements.
- **SSO tokens** are cached to `~/.aws/sso/cache/` as JSON files with `0o600` permissions (matches AWS CLI convention).
- **Session timeout** is enforced via a configurable timer (`sessionDurationMinutes` in `admin-config.json`, default 60 minutes). On expiry, credentials are zeroized and the renderer is notified.

---

## Findings by CMMC Domain

### AC — Access Control

#### AC-F01: Electron Sandbox Disabled — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/index.ts:32`
**Remediated:** 2026-02-09

```typescript
webPreferences: {
  preload: PRELOAD,
  contextIsolation: true,   // ✓ Good
  nodeIntegration: false,    // ✓ Good
  sandbox: true,             // ✓ FIXED — sandbox now enabled
}
```

**Fix applied:** Changed `sandbox: false` to `sandbox: true`. The preload script only uses `contextBridge` and `ipcRenderer` (both available in sandboxed mode), and all imports are resolved at build time by vite-plugin-electron. TypeScript compilation verified clean after change.

---

#### AC-F02: No Session Timeout or Credential Expiration Enforcement — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/credential-manager.ts`, `src/main/ipc-handlers.ts`, `resources/admin-config.json`
**Remediated:** 2026-02-10

**CMMC Control:** AC.L2-3.1.10 — Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.
**CMMC Control:** AC.L2-3.1.11 — Terminate (automatically) a user session after a defined condition.

**Fix applied:** Implemented configurable session duration via `admin-config.json`:

1. Added `sessionDurationMinutes` field to `AdminConfig` type (default: 60 minutes)
2. Added `startSessionTimer()` / `clearSessionTimer()` in `credential-manager.ts` — `setTimeout`-based timer that calls `disconnect()` (which zeroizes credentials) then notifies the renderer
3. Timer starts after successful connection in both `AWS_CONNECT_PROFILE` and `SSO_CONNECT_WITH_CONFIG` IPC handlers
4. Timer is cleared on manual disconnect, reconnection, or when it fires
5. Renderer listens via `AWS_SESSION_EXPIRED` IPC channel and resets `connectionStatus` to `{ connected: false }`
6. `sessionDurationMinutes` is validated as a positive finite number; invalid values fall back to 60

**Files modified:** `src/shared/types.ts`, `resources/admin-config.json`, `src/shared/ipc-channels.ts`, `src/main/admin-config.ts`, `src/main/credential-manager.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`, `src/renderer/lib/ipc-client.ts`, `src/renderer/hooks/useAutoConnect.ts`

**Remaining consideration:** This is a maximum session duration timer, not an inactivity timer. For full AC.L2-3.1.10 compliance, an inactivity-based timer (triggered by lack of user input) may also be warranted. The OS-level screen lock is the primary control for inactivity in most CMMC environments.

---

#### AC-F03: Unrestricted File Read via IPC — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/file-handler.ts`
**Remediated:** 2026-02-09

**Fix applied:** Added an `allowedPaths` Set in `file-handler.ts`. Paths are registered into the set when returned by `openFileDialog()`. The `readFile()` function now validates that the requested path exists in the allowed set before reading, throwing `"File access denied"` if not. This prevents a compromised renderer from requesting arbitrary file reads.

---

#### AC-F04: No Electron Permission Request Handler — ~~LOW~~ REMEDIATED ✅

**Location:** `src/main/index.ts:37-39`
**Remediated:** 2026-02-10

**CMMC Control:** AC.L2-3.1.1 — Limit system access to authorized users, processes acting on behalf of authorized users, and devices.

**Fix applied:** Added a blanket deny-all `setPermissionRequestHandler` on `session.defaultSession` inside `createWindow()`. All Chromium permission requests (camera, microphone, geolocation, notifications, etc.) are now rejected. The application does not use any of these APIs, so there is no functional impact.

**Files modified:** `src/main/index.ts`

---

### AU — Audit and Accountability

#### AU-F01: No Audit Logging — MEDIUM

**Impact:** The application does not produce any audit trail of security-relevant events: credential connections, disconnections, SSO authentications, session timeouts, data wipes, file accesses, or configuration changes. In a CMMC environment, these events must be logged and available for review.

**CMMC Control:** AU.L2-3.3.1 — Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.
**CMMC Control:** AU.L2-3.3.2 — Ensure that the actions of individual system users can be uniquely traced to those users.

**Recommendation:** Implement structured audit logging (JSON lines to a local log file) for: connection/disconnection events, SSO auth attempts (success/failure), session timeout events, data wipe operations, settings changes, and file access. Include timestamps and relevant context. Consider integration with the OS event log (Windows Event Log / macOS Unified Logging) for centralized collection.

---

### CM — Configuration Management

#### CM-F01: Source Maps Enabled in Production — ~~MEDIUM~~ REMEDIATED ✅

**Location:** `vite.config.ts:18,35,58`
**Remediated:** 2026-02-10 (verified — was already fixed in Vite config)

```typescript
sourcemap: !isProduction,  // Disabled in production builds
```

**Fix confirmed:** The Vite config conditionally disables source maps for all three build targets (main, preload, renderer) when `NODE_ENV === 'production'`. The `tsconfig.json` still has `"sourceMap": true` but this is only used by `tsc --noEmit` for type checking and does not affect the Vite production build output.

---

#### CM-F02: No Code Signing Configuration — MEDIUM

**Location:** `electron-builder.yml`

**Impact:** The application is not configured for code signing on either macOS or Windows. Without code signing:
- Users see security warnings on installation
- The OS cannot verify the binary hasn't been tampered with
- Intune and other MDM systems may refuse to deploy unsigned packages
- macOS Gatekeeper will block execution entirely without notarization

**CMMC Control:** CM.L2-3.4.1 — Establish and maintain baseline configurations and inventories of organizational systems.
**CMMC Control:** SI.L2-3.14.1 — Identify, report, and correct system flaws in a timely manner.

**Recommendation:** Add code signing configuration:
```yaml
mac:
  identity: "Developer ID Application: Your Org"
  notarize:
    teamId: "XXXXXXXXXX"
win:
  certificateFile: path/to/certificate.pfx
  certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
```

---

#### CM-F03: Incomplete `.gitignore` — ~~MEDIUM~~ REMEDIATED ✅

**Location:** `.gitignore`
**Remediated:** 2026-02-10 (verified — was already updated)

**Current `.gitignore`** now includes comprehensive secret exclusion patterns:
```
.env
.env.*
*.pem
*.key
*.p12
*.pfx
*.cert
credentials.json
```

---

### IA — Identification and Authentication

#### IA-F01: Credentials Accepted as Plaintext via IPC — ~~MEDIUM~~ REMEDIATED ✅

**Remediated:** 2026-02-10 (verified — manual keys flow was removed from codebase)

The `AWS_CONNECT_KEYS` IPC channel and `connectWithKeys()` function have been completely removed. The application now supports only two authentication methods:
1. AWS CLI profiles (via `fromIni()` / `fromSSO()` credential providers)
2. Saved SSO configurations (via IAM Identity Center device authorization)

Both methods avoid raw credential transit through the renderer. This fully addresses IA.L2-3.5.10.

---

### MP — Media Protection

#### MP-F01: SQLite Database Unencrypted at Rest — MEDIUM

**Location:** `src/main/store.ts:17-18`

```typescript
const dbPath = path.join(app.getPath('userData'), 'bedrock-chat.db');
db = new Database(dbPath);
```

**Impact:** The SQLite database stores all conversation history, message content (which may contain CUI), SSO configuration details, and uploaded file content (base64-encoded) in plaintext on disk. If the workstation is lost, stolen, or accessed by an unauthorized user, this data is fully readable.

**CMMC Control:** MP.L2-3.8.9 — Protect the confidentiality of backup CUI at storage locations.

**Mitigating Factor:** Full-disk encryption (BitLocker on Windows, FileVault on macOS) is typically enforced in CMMC environments and would protect data at rest at the volume level. This is a defense-in-depth concern.

**Recommendation:** If conversations may contain CUI, consider using SQLCipher (an encrypted SQLite variant compatible with `better-sqlite3`) for application-level encryption. At minimum, document the dependency on full-disk encryption in the deployment guide.

---

### SC — System and Communications Protection

#### SC-F01: Missing Content Security Policy — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/renderer/index.html`
**Remediated:** 2026-02-09

**Fix applied:** Added a strict CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
           img-src 'self' data:; connect-src 'self'; font-src 'self';
           object-src 'none'; base-uri 'self'" />
```

This blocks external scripts, external connections, object/embed tags, and restricts all resource loading to same-origin. `'unsafe-inline'` is required for Tailwind's runtime style injection — this can be tightened further if a build-time CSS extraction step is added.

---

#### SC-F02: SSO Token Cache — Insufficient File Permissions — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/sso-auth.ts` — both `performSsoLogin()` and `performSsoDeviceAuth()`
**Remediated:** 2026-02-09

**Fixes applied:**
1. Cache directory created with `mode: 0o700` (owner-only access)
2. Cache files written with `mode: 0o600` (owner read/write only)
3. Removed `clientId`, `clientSecret`, and `registrationExpiresAt` from persisted cache data — OIDC client is re-registered on each auth flow

**Remaining recommendation:** Consider using Electron's `safeStorage` API to encrypt the access token before writing to disk for additional defense-in-depth.

---

#### SC-F03: No Explicit TLS Configuration — ~~LOW~~ REMEDIATED ✅

**Location:** `src/main/bedrock-client.ts:17-20`, `src/main/sso-auth.ts:27-30`
**Remediated:** 2026-02-10

**CMMC Control:** SC.L2-3.13.8 — Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.

**Fix applied:** Created a shared `NodeHttpHandler` with an `https.Agent` that enforces `minVersion: 'TLSv1.2'` and passed it via `requestHandler` to all five AWS SDK client instantiations:
- `BedrockRuntimeClient` — `src/main/bedrock-client.ts:42`
- `BedrockClient` — `src/main/bedrock-client.ts:61`
- `SSOOIDCClient` (×2) — `src/main/sso-auth.ts:138,302`
- `SSOClient` (×3) — `src/main/sso-auth.ts:406,435,464`

This guarantees TLS 1.2 as the floor regardless of the Node.js or OS default, providing defense-in-depth on top of the AWS SDK's own TLS 1.2 default.

**Files modified:** `src/main/bedrock-client.ts`, `src/main/sso-auth.ts`

---

#### SC-F04: Unvalidated URLs Passed to `shell.openExternal()` — ~~MEDIUM~~ REMEDIATED ✅

**Locations:** `src/main/index.ts`, `src/main/sso-auth.ts`
**Remediated:** 2026-02-10

**Fix applied:** Created `src/main/safe-open.ts` with a `safeOpenExternal()` function that parses URLs and validates the scheme against an allowlist (`https:` and `http:` only). Malformed or non-HTTP(S) URLs are silently blocked and logged. All four `shell.openExternal()` call sites (2 in `index.ts`, 2 in `sso-auth.ts`) now use `safeOpenExternal()` instead.

**Files modified:** `src/main/safe-open.ts` (new), `src/main/index.ts`, `src/main/sso-auth.ts`

---

#### SC-F05: CSP Missing `blob:` in `img-src` Directive — ~~LOW~~ REMEDIATED ✅

**Location:** `src/renderer/index.html:10`
**Remediated:** 2026-02-10

**CMMC Control:** SC.L2-3.13.1 — Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.

**Fix applied:** Added `blob:` to the CSP `img-src` directive so `FilePreview.tsx` blob URLs created via `URL.createObjectURL()` are permitted. The directive is now `img-src 'self' data: blob:`.

**Files modified:** `src/renderer/index.html`

---

#### SC-F06: SSRF — No URL Validation in `readWebpage()` — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/web-search.ts:200-248,258-260`
**Remediated:** 2026-02-10

**CMMC Control:** SC.L2-3.13.1 — Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.

**Impact:** The `readWebpage()` function accepted arbitrary URLs with no validation, allowing a model-driven tool call to fetch internal resources: AWS instance metadata (`http://169.254.169.254/`), loopback services (`http://localhost:8080/`), private network hosts (`http://10.x.x.x/`), or non-HTTP schemes (`file:///etc/passwd`). This is a classic Server-Side Request Forgery (SSRF) vulnerability.

**Fix applied:** Added `validateUrl()` function that blocks:
- **Private/internal IPv4 ranges:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16` (AWS metadata), `0.0.0.0/32`
- **Non-HTTP(S) schemes:** Only `http:` and `https:` are allowed; `file:`, `ftp:`, `data:`, etc. are blocked
- **Localhost hostnames:** `localhost`, `*.local`, `[::1]`
- **IPv6 private ranges:** `fe80::` (link-local), `fc00::`/`fd00::` (unique local)

Validation is applied at the top of `readWebpage()` before any network call is made.

**Files modified:** `src/main/web-search.ts`

---

#### SC-F07: Redirect Targets Not Validated Against SSRF Blocklist — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/web-search.ts:309-317`
**Remediated:** 2026-02-10

**CMMC Control:** SC.L2-3.13.1 — Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.

**Impact:** Even with URL validation at the entry point, `fetchUrl()` followed HTTP redirects (3xx responses) without re-validating the redirect target URL. An attacker could host a page at a public URL that 302-redirects to an internal address, bypassing the initial SSRF check.

**Fix applied:** Added `validateUrl()` check on the resolved redirect URL inside `fetchUrl()` before following the redirect. Additionally, reduced `MAX_REDIRECTS` from 5 to 3 to shrink the redirect-chain attack surface.

**Files modified:** `src/main/web-search.ts`

---

### SI — System and Information Integrity

#### SI-F01: Code Injection via Calculator Tool — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/tool-executor.ts`
**Remediated:** 2026-02-09

**Fix applied:** Removed the `Function()` constructor entirely. Replaced with the `expr-eval` library (`Parser.evaluate()`), which is a safe sandboxed expression parser that supports arithmetic, common math functions (sqrt, pow, abs, ceil, floor, round, log, sin, cos, tan, min, max), and nothing else — no prototype access, no global scope, no code execution.

---

#### SI-F02: No Credential Zeroization on Disconnect — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/credential-manager.ts`
**Remediated:** 2026-02-09

**Fix applied:** The `disconnect()` function now overwrites `accessKeyId`, `secretAccessKey`, and `sessionToken` with empty strings on the credential object before nullifying the reference. A type cast is used to bypass the AWS SDK's `readonly` property modifiers for this security operation.

**Caveat (unchanged):** JavaScript string immutability means true zeroization is impossible in V8 — the original string values may persist in the heap until GC'd. For maximum security in a CUI environment, consider storing credentials in a native module with explicit memory management, or using Electron's `safeStorage`.

---

#### SI-F03: No File Size Limits on Upload — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/file-handler.ts`
**Remediated:** 2026-02-09

**Fix applied:** Added `fs.statSync()` size check before reading. Files exceeding 50 MB are rejected with an error. The 50 MB limit is well above Bedrock's own per-document limits (~4.5 MB images, ~5 MB documents) while protecting against multi-GB reads that would crash the main process.

---

#### SI-F04: No IPC Rate Limiting — ~~MEDIUM~~ REMEDIATED ✅

**Location:** `src/main/ipc-handlers.ts`
**Remediated:** 2026-02-10

**Fix applied:** Created `src/main/ipc-rate-limiter.ts` with a sliding-window `checkRateLimit()` function that tracks request timestamps per logical channel. Rate limit checks added to the six most expensive IPC handlers:

| Handler | Limit | Window | Rationale |
|---------|-------|--------|-----------|
| `CHAT_SEND_MESSAGE` | 10 | 10 s | Most expensive — invokes Bedrock streaming |
| `TOOL_EXECUTE` | 20 | 10 s | Runs arbitrary tool logic |
| `FILE_READ` | 30 | 10 s | Filesystem access |
| `AWS_CONNECT_PROFILE` | 3 | 30 s | Triggers full auth flow |
| `SSO_CONNECT_WITH_CONFIG` | 3 | 30 s | Triggers full auth flow |
| `SSO_START_DEVICE_AUTH` | 3 | 30 s | Triggers OIDC device flow |

Exceeded requests return a structured error result matching each handler's existing error format. Normal usage at reasonable pace is unaffected.

**Files modified:** `src/main/ipc-rate-limiter.ts` (new), `src/main/ipc-handlers.ts`

---

#### SI-F05: SSO Tokens in Memory Not Zeroized on Disconnect — ~~LOW~~ REMEDIATED ✅

**Locations:** `src/main/sso-auth.ts:253-263`, `src/main/ipc-handlers.ts:57-62`
**Remediated:** 2026-02-10

**CMMC Control:** SI.L2-3.14.3 — Monitor system security alerts and advisories and take action in response.

**Fix applied:**
1. Added `clearTokenCache()` in `sso-auth.ts` — iterates `tokenCache`, overwrites each `accessToken` with `''`, then clears the Map. Called from `credential-manager.ts:disconnect()`.
2. Added `clearPendingWizardToken()` in `ipc-handlers.ts` — overwrites `pendingWizardToken.accessToken` with `''`, then nulls the reference. Called from: `SSO_DELETE_CONFIG` handler on active-config deletion, and both `startSessionTimer` expiry callbacks.

Both functions follow the same best-effort zeroization pattern used for AWS credentials (SI-F02).

**Files modified:** `src/main/sso-auth.ts`, `src/main/credential-manager.ts`, `src/main/ipc-handlers.ts`

---

#### SI-F06: Non-Secure Database Deletion in `wipeAllData` — ~~LOW~~ REMEDIATED ✅

**Location:** `src/main/store.ts:21`, `src/main/store.ts:281-286`
**Remediated:** 2026-02-10

**CMMC Control:** MP.L2-3.8.3 — Sanitize or destroy information system media containing CUI before disposal or release for reuse.

**Fix applied:**
1. Added `PRAGMA secure_delete = ON` at database init time (`src/main/store.ts:21`) — SQLite now zeros the content of freed pages on every `DELETE` operation, not just wipes.
2. Added `VACUUM` at the end of `wipeAllData()` (`src/main/store.ts:286`) — rebuilds the entire database file, eliminating any residual free-list pages.

Together these ensure deleted conversation content (which may contain CUI) is not recoverable from the database file after deletion.

**Files modified:** `src/main/store.ts`

---

#### SI-F07: No Response Body Size Limit in `fetchUrl()` — ~~MEDIUM~~ REMEDIATED ✅

**Location:** `src/main/web-search.ts:329-337`
**Remediated:** 2026-02-10

**CMMC Control:** SI.L2-3.14.1 — Identify, report, and correct system flaws in a timely manner.

**Impact:** The `fetchUrl()` function collected response data without any size limit. A malicious or misconfigured server could stream an arbitrarily large response, consuming all available memory and crashing the Electron main process (denial of service).

**Fix applied:** Added a `MAX_RESPONSE_BYTES` constant (5 MB) and a cumulative byte counter in the `res.on('data')` handler. When the limit is exceeded, the request is destroyed with an error message. The 5 MB limit is generous for HTML pages while protecting against unbounded memory consumption.

**Files modified:** `src/main/web-search.ts`

---

#### SI-F08: Search Queries Sent to Third-Party Service (DuckDuckGo) — LOW (Accepted Risk)

**Location:** `src/main/web-search.ts:44-76`

**CMMC Control:** SI.L2-3.14.6 — Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.

**Impact:** The `web_search` tool sends user-entered search queries (which may contain CUI context) to DuckDuckGo's public HTML endpoint over HTTPS. While the query content is encrypted in transit, it is processed by a third-party service outside the organization's control boundary.

**Mitigating Factors:**
- Search queries are triggered by the LLM model as tool calls, not directly by user input — the model generates queries based on conversation context
- DuckDuckGo does not log search queries or build user profiles (per their privacy policy)
- The connection uses HTTPS, protecting query confidentiality in transit

**Recommendation:** Document this data flow in the application's System Security Plan (SSP). Organizations handling CUI should evaluate whether model-generated search queries could contain sensitive information and consider disabling the `web_search` tool via admin configuration if the risk is unacceptable.

---

## Positive Security Findings

The following security controls are correctly implemented:

| Control | Implementation | Location |
|---------|---------------|----------|
| Process isolation | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` | `src/main/index.ts:30-32` |
| IPC bridge pattern | `contextBridge.exposeInMainWorld()` with typed API | `src/preload/index.ts:141` |
| IPC request/response only | All handlers use `ipcMain.handle()`, no `ipcMain.on()` | `src/main/ipc-handlers.ts` |
| SQL injection prevention | All queries use parameterized statements (`?` placeholders) | `src/main/store.ts` (all queries) |
| Foreign key constraints | `PRAGMA foreign_keys = ON` with cascade deletes | `src/main/store.ts:20` |
| WAL mode | `PRAGMA journal_mode = WAL` for database integrity | `src/main/store.ts:19` |
| Secure delete | `PRAGMA secure_delete = ON` zeros freed pages; `VACUUM` after wipe | `src/main/store.ts:21,286` |
| Credential isolation | AWS credentials stored only in main process, never sent to renderer | `src/main/credential-manager.ts` |
| Credential zeroization | `disconnect()` overwrites credential strings before clearing references | `src/main/credential-manager.ts:182-196` |
| Session timeout | Configurable auto-disconnect with credential zeroization | `src/main/credential-manager.ts:204-219` |
| SSO-only authentication | No manual AWS access key input; SSO or CLI profile only | IPC channels (no `AWS_CONNECT_KEYS`) |
| SSO token isolation | `pendingWizardToken` held in main process module scope only | `src/main/ipc-handlers.ts:55` |
| SSO token zeroization | `clearTokenCache()` and `clearPendingWizardToken()` overwrite tokens on disconnect | `src/main/sso-auth.ts:253-263`, `src/main/ipc-handlers.ts:57-62` |
| SSO token file permissions | Cache files `0o600`, directories `0o700` | `src/main/sso-auth.ts:193,206` |
| Permission deny-all | `setPermissionRequestHandler` rejects all Chromium permission requests | `src/main/index.ts:37-39` |
| Navigation lockdown | External URLs opened in default browser, in-app navigation blocked | `src/main/index.ts:42-55` |
| Window open handler | New windows denied, URLs redirected to external browser | `src/main/index.ts:37-40` |
| Content Security Policy | Strict CSP meta tag: `script-src 'self'`, `img-src 'self' data: blob:`, `object-src 'none'` | `src/renderer/index.html:6-14` |
| File access restriction | `readFile()` restricted to dialog-selected paths via `allowedPaths` set | `src/main/file-handler.ts:13,73` |
| File size limit | 50 MB maximum enforced before reading | `src/main/file-handler.ts:65,81` |
| Safe expression evaluation | `expr-eval` sandboxed parser, no `eval()`/`Function()` | `src/main/tool-executor.ts:8,12` |
| XSS prevention | No `dangerouslySetInnerHTML`, no `innerHTML`, React auto-escaping | All renderer components |
| Safe markdown rendering | `react-markdown` v9 does not render raw HTML (no `rehype-raw`) | `src/renderer/components/MarkdownRenderer.tsx` |
| Source maps disabled in prod | `sourcemap: !isProduction` in Vite config | `vite.config.ts:18,35,58` |
| TypeScript strict mode | `"strict": true` enforces type safety throughout | `tsconfig.json:8` |
| ASAR packaging | Application code bundled in ASAR archive | `electron-builder.yml:11` |
| SSRF protection | `validateUrl()` blocks private IPs, non-HTTP(S) schemes, localhost | `src/main/web-search.ts:200-248` |
| Redirect validation | Redirect targets re-validated against SSRF blocklist | `src/main/web-search.ts:310-317` |
| Response size limit | 5 MB max response body prevents memory exhaustion | `src/main/web-search.ts:178,329-337` |
| Tool input validation | `web_search` and `read_webpage` validate input types before execution | `src/main/tool-executor.ts:78-80,107-109` |
| Redirect limit | Maximum 3 redirects to limit redirect-chain attacks | `src/main/web-search.ts:176` |
| Document name sanitization | Special characters stripped before Bedrock API calls | `src/main/bedrock-stream.ts:30-37` |
| Stream abort support | Active streams can be cancelled via `AbortController` | `src/main/bedrock-stream.ts:23,125` |
| TLS 1.2+ enforcement | All AWS SDK clients use `NodeHttpHandler` with `minVersion: 'TLSv1.2'` | `src/main/bedrock-client.ts:17-20`, `src/main/sso-auth.ts:27-30` |
| Token expiry validation | SSO tokens checked against expiration before use | `src/main/sso-auth.ts:107,254,278` |
| Secret file exclusion | `.gitignore` covers `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json` | `.gitignore:9-16` |

---

## Dependency Assessment

| Package | Version | Risk Assessment |
|---------|---------|-----------------|
| electron | ^33.2.0 | Current major release. Monitor Electron security advisories. |
| @aws-sdk/* | ^3.700-3.986 | Current AWS SDK v3. Well-maintained, frequent security patches. |
| better-sqlite3 | ^11.7.0 | Native module. Trusted maintainer. No known CVEs. |
| react | ^18.3.1 | Current. Auto-escapes JSX output (XSS safe by default). |
| react-markdown | ^9.0.1 | Does NOT render raw HTML without `rehype-raw` plugin (safe). |
| rehype-highlight | ^7.0.1 | Code syntax highlighting. Low risk. |
| remark-gfm | ^4.0.0 | GitHub-flavored markdown tables/checkboxes. Low risk. |
| expr-eval | ^2.0.2 | Sandboxed math parser. No prototype/global access. |
| uuid | ^10.0.0 | Cryptographically random UUIDs. No concerns. |
| zustand | ^5.0.0 | Client-side state management. No security surface. |

**Recommendation:** Add `npm audit` to the CI pipeline and run it before each release. Pin exact dependency versions (remove `^` ranges) for production builds to prevent supply chain drift.

---

## Remediation Roadmap

### Completed (Pre-Deployment Blockers — All Clear)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | SI-F01 | Critical | ✅ **REMEDIATED** — Replaced `Function()` with `expr-eval` safe parser |
| 2 | SC-F02 | Critical | ✅ **REMEDIATED** — File permissions set to `0o600`/`0o700`, `clientSecret` removed from cache |
| 3 | AC-F01 | Critical | ✅ **REMEDIATED** — `sandbox: true` enabled |
| 4 | SC-F01 | High | ✅ **REMEDIATED** — Strict CSP meta tag added to `index.html` |
| 5 | AC-F03 | High | ✅ **REMEDIATED** — `readFile()` restricted to dialog-selected paths via `allowedPaths` set |
| 6 | AC-F02 | High | ✅ **REMEDIATED** — Configurable session timeout with credential zeroization |
| 7 | SI-F02 | High | ✅ **REMEDIATED** — Credential values overwritten before reference cleared |
| 8 | SI-F03 | High | ✅ **REMEDIATED** — 50 MB file size limit enforced |
| 9 | CM-F01 | Medium | ✅ **REMEDIATED** — Source maps disabled in production via Vite config |
| 10 | CM-F03 | Medium | ✅ **REMEDIATED** — `.gitignore` updated with secret file patterns |
| 11 | IA-F01 | Medium | ✅ **REMEDIATED** — Manual key entry removed; SSO-only authentication |
| 12 | SC-F06 | Critical | ✅ **REMEDIATED** — `validateUrl()` blocks private IPs, non-HTTP(S) schemes, localhost |
| 13 | SC-F07 | High | ✅ **REMEDIATED** — Redirect targets validated against SSRF blocklist |
| 14 | SI-F07 | Medium | ✅ **REMEDIATED** — 5 MB response body size limit in `fetchUrl()` |

### Short-Term (Next Sprint)

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| 15 | SC-F04 | Medium | 1 hour | ✅ **REMEDIATED** — `safeOpenExternal()` validates URL schemes (HTTP/S only) |
| 16 | AU-F01 | Medium | 4-6 hours | ⬜ Implement structured audit logging |
| 17 | SI-F04 | Medium | 2-3 hours | ✅ **REMEDIATED** — Sliding-window rate limiter on 6 IPC handlers |

### Medium-Term (Before Production)

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| 18 | CM-F02 | Medium | 2-4 hours | ⬜ Configure code signing for macOS and Windows |
| 19 | MP-F01 | Medium | 4-8 hours | ⬜ Evaluate SQLCipher for database encryption (if CUI stored) |
| 20 | SI-F06 | Low | 30 min | ✅ **REMEDIATED** — `PRAGMA secure_delete = ON` at init + `VACUUM` after wipe |
| 21 | SI-F05 | Low | 30 min | ✅ **REMEDIATED** — `clearTokenCache()` + `clearPendingWizardToken()` on disconnect |
| 22 | SC-F05 | Low | 15 min | ✅ **REMEDIATED** — Added `blob:` to CSP `img-src` directive |
| 23 | AC-F04 | Low | 15 min | ✅ **REMEDIATED** — Deny-all `setPermissionRequestHandler` on default session |
| 24 | SC-F03 | Low | 30 min | ✅ **REMEDIATED** — `NodeHttpHandler` with `minVersion: 'TLSv1.2'` on all SDK clients |
| 25 | SI-F08 | Low | — | Accepted Risk — Document third-party data flow in SSP |

---

## CMMC Control Mapping Summary

| CMMC Domain | Controls Assessed | Findings | Status |
|-------------|-------------------|----------|--------|
| AC — Access Control | AC.L2-3.1.1, 3.1.2, 3.1.3, 3.1.10, 3.1.11 | 4 findings (4 remediated) | **Complete** — all findings closed |
| AU — Audit & Accountability | AU.L2-3.3.1, 3.3.2 | 1 finding | Not Implemented |
| CM — Configuration Management | CM.L2-3.4.1, 3.4.2, 3.4.6 | 3 findings (2 remediated) | Partial — CM-F02 (code signing) open |
| IA — Identification & Auth | IA.L2-3.5.10 | 1 finding (1 remediated) | **Complete** — Manual keys removed |
| MP — Media Protection | MP.L2-3.8.3, 3.8.9 | 2 findings | Partial — depends on FDE + secure delete |
| SC — System & Comms Protection | SC.L2-3.13.1, 3.13.8, 3.13.16 | 7 findings (7 remediated) | **Complete** — all findings closed |
| SI — System & Info Integrity | SI.L2-3.14.1, 3.14.2, 3.14.3, 3.14.6 | 8 findings (7 remediated) | **Substantially complete** — SI-F08 (accepted risk) only |

---

## Deployment Considerations for Government Contractor Environments

1. **Full-Disk Encryption** — Mandate BitLocker (Windows) or FileVault (macOS) on all endpoints. The SQLite database and SSO token cache contain sensitive data.

2. **AWS GovCloud** — For CUI workloads, the application should connect to AWS GovCloud (US) regions only. The `constants.ts` file defaults to `us-gov-west-1`. Consider restricting the region selector to GovCloud-only in CMMC deployments via admin-config.

3. **Session Duration** — The default 60-minute session timeout is configurable via `admin-config.json`. IT administrators should set this based on organizational policy (NIST recommends 15 minutes for inactivity, 8 hours for maximum session). The current implementation is a maximum session timer; combine with OS-level screen lock for inactivity protection.

4. **Network Segmentation** — The application only makes outbound HTTPS connections to AWS service endpoints. No inbound connections are accepted. Firewall rules should allow only `*.amazonaws.com` and `*.aws` destinations.

5. **MDM Deployment (Intune)** — Code signing (CM-F02) is a prerequisite for Intune deployment. The NSIS installer for Windows and PKG for macOS should be signed before upload.

6. **Auto-Update** — No auto-update mechanism is currently implemented. For CMMC, updates should be pushed through the MDM solution rather than self-updating, allowing IT to validate each release.

7. **Incident Response** — The lack of audit logging (AU-F01) must be addressed before deployment. Logs should be forwarded to the organization's SIEM for monitoring.

---

## Remediation Log

| Date | Finding | Severity | Change | Files Modified |
|------|---------|----------|--------|----------------|
| 2026-02-09 | SI-F01 | Critical → Remediated | Replaced `Function()` constructor with `expr-eval` safe math parser. Removed regex allowlist and `Function()` call entirely. | `src/main/tool-executor.ts`, `package.json` |
| 2026-02-09 | SC-F02 | Critical → Remediated | Set `mode: 0o700` on cache directories, `mode: 0o600` on cache files. Removed `clientId`, `clientSecret`, and `registrationExpiresAt` from persisted SSO token cache. | `src/main/sso-auth.ts` |
| 2026-02-09 | AC-F01 | Critical → Remediated | Changed `sandbox: false` to `sandbox: true` in BrowserWindow webPreferences. | `src/main/index.ts` |
| 2026-02-09 | SC-F01 | High → Remediated | Added strict Content Security Policy meta tag restricting all resource loading to same-origin. | `src/renderer/index.html` |
| 2026-02-09 | SI-F02 | High → Remediated | Credential values overwritten with empty strings before reference nullification in `disconnect()`. | `src/main/credential-manager.ts` |
| 2026-02-09 | SI-F03 | High → Remediated | Added 50 MB file size limit via `fs.statSync()` check before reading. | `src/main/file-handler.ts` |
| 2026-02-09 | AC-F03 | High → Remediated | File reads restricted to paths returned by `openFileDialog()` via `allowedPaths` set. | `src/main/file-handler.ts` |
| 2026-02-10 | AC-F02 | High → Remediated | Configurable session timeout (`sessionDurationMinutes` in admin-config.json, default 60 min). Timer starts after connection, calls `disconnect()` (zeroizes credentials) on expiry, notifies renderer via `AWS_SESSION_EXPIRED` IPC channel. | `src/shared/types.ts`, `resources/admin-config.json`, `src/shared/ipc-channels.ts`, `src/main/admin-config.ts`, `src/main/credential-manager.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`, `src/renderer/lib/ipc-client.ts`, `src/renderer/hooks/useAutoConnect.ts` |
| 2026-02-10 | CM-F01 | Medium → Remediated | Verified source maps are disabled in production builds via `sourcemap: !isProduction` in Vite config (all three build targets). | `vite.config.ts` (no change needed — already correct) |
| 2026-02-10 | CM-F03 | Medium → Remediated | Verified `.gitignore` includes comprehensive secret patterns (`.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`). | `.gitignore` (no change needed — already correct) |
| 2026-02-10 | IA-F01 | Medium → Remediated | Confirmed manual AWS key entry flow (`AWS_CONNECT_KEYS`, `connectWithKeys`) has been removed from codebase. SSO-only authentication enforced. | N/A (already removed) |
| 2026-02-10 | SC-F04 | Medium → Remediated | Created `safeOpenExternal()` in `src/main/safe-open.ts` — validates URL scheme (HTTP/S only) before `shell.openExternal()`. Replaced all 4 call sites (2 in `index.ts`, 2 in `sso-auth.ts`). | `src/main/safe-open.ts` (new), `src/main/index.ts`, `src/main/sso-auth.ts` |
| 2026-02-10 | SI-F04 | Medium → Remediated | Created sliding-window rate limiter (`src/main/ipc-rate-limiter.ts`). Added `checkRateLimit()` checks to 6 IPC handlers: `CHAT_SEND_MESSAGE` (10/10s), `TOOL_EXECUTE` (20/10s), `FILE_READ` (30/10s), `AWS_CONNECT_PROFILE` (3/30s), `SSO_CONNECT_WITH_CONFIG` (3/30s), `SSO_START_DEVICE_AUTH` (3/30s). | `src/main/ipc-rate-limiter.ts` (new), `src/main/ipc-handlers.ts` |
| 2026-02-10 | SC-F05 | — | NEW finding: CSP `img-src` missing `blob:` directive needed by `FilePreview.tsx`. | — |
| 2026-02-10 | SI-F05 | — | NEW finding: SSO token caches (`tokenCache`, `pendingWizardToken`) not cleared on disconnect. | — |
| 2026-02-10 | SI-F06 | — | NEW finding: `wipeAllData()` uses `DELETE FROM` without secure deletion. | — |
| 2026-02-10 | AC-F04 | — | NEW finding: No `setPermissionRequestHandler` configured on Electron session. | — |
| 2026-02-10 | SC-F06 | Critical → Remediated | Added `validateUrl()` function blocking private IPs (10/172.16/192.168/127/169.254), non-HTTP(S) schemes, localhost hostnames, and IPv6 private ranges. Applied at `readWebpage()` entry point. | `src/main/web-search.ts` |
| 2026-02-10 | SC-F07 | High → Remediated | Added `validateUrl()` check on redirect targets inside `fetchUrl()` before following redirects. Reduced `MAX_REDIRECTS` from 5 to 3. | `src/main/web-search.ts` |
| 2026-02-10 | SI-F07 | Medium → Remediated | Added 5 MB (`MAX_RESPONSE_BYTES`) cumulative size limit in `fetchUrl()` data handler. Request destroyed if limit exceeded. | `src/main/web-search.ts` |
| 2026-02-10 | SI-F08 | — | NEW finding (Accepted Risk): Search queries sent to DuckDuckGo third-party service. Documented for SSP. | — |
| 2026-02-10 | — | — | Added runtime input validation for `web_search` (query) and `read_webpage` (url) tool executors. Non-string or empty inputs now return error results. | `src/main/tool-executor.ts` |
| 2026-02-10 | SC-F03 | Low → Remediated | Added `NodeHttpHandler` with `https.Agent({ minVersion: 'TLSv1.2' })` to all AWS SDK clients (BedrockRuntimeClient, BedrockClient, SSOOIDCClient ×2, SSOClient ×3). | `src/main/bedrock-client.ts`, `src/main/sso-auth.ts` |
| 2026-02-10 | SI-F05 | Low → Remediated | Added `clearTokenCache()` in `sso-auth.ts` (overwrites + clears `tokenCache` Map) called from `disconnect()`. Added `clearPendingWizardToken()` in `ipc-handlers.ts` (overwrites + nulls `pendingWizardToken`) called on disconnect and session expiry. | `src/main/sso-auth.ts`, `src/main/credential-manager.ts`, `src/main/ipc-handlers.ts` |
| 2026-02-10 | SI-F06 | Low → Remediated | Added `PRAGMA secure_delete = ON` at database init (zeros freed pages on every DELETE). Added `VACUUM` at end of `wipeAllData()` to rebuild the database file and eliminate free-list residue. | `src/main/store.ts` |
| 2026-02-10 | AC-F04 | Low → Remediated | Added `session.defaultSession.setPermissionRequestHandler()` that denies all Chromium permission requests (camera, mic, geolocation, notifications, etc.) in `createWindow()`. | `src/main/index.ts` |
| 2026-02-10 | SC-F05 | Low → Remediated | Added `blob:` to CSP `img-src` directive for `FilePreview.tsx` blob URL support. | `src/renderer/index.html` |
