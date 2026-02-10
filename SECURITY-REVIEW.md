# Bedrock Chat — CMMC Compliance Security Review

**Application:** Bedrock Chat v1.0.0
**Type:** Electron desktop application (cross-platform)
**Purpose:** Chat interface for Amazon Bedrock LLM services
**Review Date:** 2026-02-09
**Scope:** Full source code review against CMMC Level 2 (NIST SP 800-171) controls

---

## Executive Summary

Bedrock Chat is an Electron-based desktop application that provides a chat interface to AWS Bedrock. The application follows a sound architectural pattern — credentials and sensitive operations are isolated in the main process, the renderer is locked down with `contextIsolation` and disabled `nodeIntegration`, and database access uses parameterized queries throughout.

However, the review identified **3 critical**, **4 high**, and **5 medium** severity findings that must be remediated before deployment in a CMMC-regulated environment. The most significant issues are: a code injection vector in the calculator tool, insufficient file permissions on cached SSO tokens, the Electron sandbox being disabled, and missing Content Security Policy headers.

### Risk Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | **ALL REMEDIATED** (2026-02-09) |
| High | 5 | **4 REMEDIATED** (2026-02-09) — 1 remaining: AC-F02 (session timeout) |
| Medium | 5 | Source maps in production, incomplete `.gitignore`, no IPC rate limiting, no audit logging, no code signing |
| Low | 2 | Hardcoded code block theme color, error messages may leak system info |

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
│                                                         │
├──────── contextBridge (preload/index.ts) ────────────────┤
│                                                         │
│                   Renderer Process (React)               │
│  Components, Zustand store, IPC client wrapper           │
│  contextIsolation: true | nodeIntegration: false         │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

- **Credentials** are resolved and stored exclusively in the main process. They are never sent to the renderer. The renderer sends raw key material *to* the main process via IPC for the "Manual Keys" flow, but credentials never flow in the reverse direction.
- **Chat messages** flow: Renderer → IPC → Main (Bedrock API) → stream events back to renderer via `webContents.send()`.
- **Persistence** uses a local SQLite database at `app.getPath('userData')/bedrock-chat.db`. All queries use parameterized statements.
- **SSO tokens** are cached to `~/.aws/sso/cache/` as JSON files (matches AWS CLI convention).

---

## Findings by CMMC Domain

### AC — Access Control

#### AC-F01: Electron Sandbox Disabled — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/index.ts:24`
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

#### AC-F02: No Session Timeout or Credential Expiration Enforcement — HIGH

**Location:** `src/main/credential-manager.ts:15-19`

```typescript
let resolvedCredentials: AwsCredentialIdentity | null = null;
let currentProfile: string | null = null;
let currentRegion: string | null = null;
```

**Impact:** Once credentials are loaded, they remain in memory indefinitely. There is no inactivity timeout, no maximum session duration, and no periodic re-validation. If a user walks away from an unlocked workstation, the application remains authenticated.

**CMMC Control:** AC.L2-3.1.10 — Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.
**CMMC Control:** AC.L2-3.1.11 — Terminate (automatically) a user session after a defined condition.

**Recommendation:**
1. Implement an inactivity timer that calls `disconnect()` after a configurable period (e.g., 15 minutes).
2. For SSO-derived credentials, check `expiration` timestamps and force re-authentication when they expire.
3. On disconnect, zeroize credential values before nullifying references (see SI-F01).

---

#### AC-F03: Unrestricted File Read via IPC — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/file-handler.ts`
**Remediated:** 2026-02-09

**Fix applied:** Added an `allowedPaths` Set in `file-handler.ts`. Paths are registered into the set when returned by `openFileDialog()`. The `readFile()` function now validates that the requested path exists in the allowed set before reading, throwing `"File access denied"` if not. This prevents a compromised renderer from requesting arbitrary file reads.

---

### AU — Audit and Accountability

#### AU-F01: No Audit Logging — MEDIUM

**Impact:** The application does not produce any audit trail of security-relevant events: credential connections, disconnections, SSO authentications, data wipes, file accesses, or configuration changes. In a CMMC environment, these events must be logged and available for review.

**CMMC Control:** AU.L2-3.3.1 — Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.
**CMMC Control:** AU.L2-3.3.2 — Ensure that the actions of individual system users can be uniquely traced to those users.

**Recommendation:** Implement structured audit logging (JSON lines to a local log file) for: connection/disconnection events, SSO auth attempts (success/failure), data wipe operations, settings changes, and file access. Include timestamps and relevant context. Consider integration with the OS event log (Windows Event Log / macOS Unified Logging) for centralized collection.

---

### CM — Configuration Management

#### CM-F01: Source Maps Enabled in Production — MEDIUM

**Location:** `tsconfig.json:17`

```json
"sourceMap": true
```

**Impact:** Source maps ship with production builds, allowing anyone with access to the application binary to reconstruct the original TypeScript source code. This reveals internal logic, API patterns, and implementation details.

**CMMC Control:** CM.L2-3.4.6 — Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.

**Recommendation:** Disable source maps for production builds. Either set `"sourceMap": false` or configure the Vite build to strip them. Source maps can remain enabled in development.

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

#### CM-F03: Incomplete `.gitignore` — MEDIUM

**Location:** `.gitignore`

**Current contents:**
```
node_modules/
dist/
dist-electron/
release/
*.log
.DS_Store
```

**Missing entries that could lead to accidental secret commits:**
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

**CMMC Control:** CM.L2-3.4.2 — Establish and enforce security configuration settings for information technology products employed in organizational systems.

---

### IA — Identification and Authentication

#### IA-F01: Credentials Accepted as Plaintext via IPC — MEDIUM

**Location:** `src/main/ipc-handlers.ts:66-78`

```typescript
ipcMain.handle(
  IPC.AWS_CONNECT_KEYS,
  async (_event, accessKeyId: string, secretAccessKey: string,
         region: string, sessionToken?: string) => {
    // ...
    await connectWithKeys(accessKeyId, secretAccessKey, region, sessionToken);
  }
);
```

**Impact:** When using the "Manual Keys" connection method, raw `accessKeyId` and `secretAccessKey` values transit from the renderer process to the main process via Electron IPC. While this is an in-process communication channel (not network-exposed), the credential values exist in the renderer's JavaScript heap, which is a less-trusted context.

**CMMC Control:** IA.L2-3.5.10 — Store and transmit only cryptographically-protected passwords.

**Recommendation:** Consider using the OS keychain (via a package like `safeStorage` from Electron or `keytar`) for credential storage, or encrypt credentials in the renderer before transmission. For CMMC environments, AWS SSO (IAM Identity Center) is the preferred authentication method as it avoids long-lived static keys entirely.

---

### MP — Media Protection

#### MP-F01: SQLite Database Unencrypted at Rest — MEDIUM

**Location:** `src/main/store.ts:9`

```typescript
const dbPath = path.join(app.getPath('userData'), 'bedrock-chat.db');
db = new Database(dbPath);
```

**Impact:** The SQLite database stores all conversation history, message content (which may contain CUI), and SSO configuration details in plaintext on disk. If the workstation is lost, stolen, or accessed by an unauthorized user, this data is fully readable.

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

**Updated cached file contents:**
```json
{
  "accessToken": "...",
  "expiresAt": "...",
  "region": "...",
  "startUrl": "..."
}
```

**Remaining recommendation:** Consider using Electron's `safeStorage` API to encrypt the access token before writing to disk for additional defense-in-depth.

---

#### SC-F03: No Explicit TLS Configuration — LOW

**Location:** `src/main/bedrock-client.ts:24-27`

```typescript
runtimeClient = new BedrockRuntimeClient({
  region,
  credentials,
});
```

**Impact:** The application relies on AWS SDK v3 defaults for TLS configuration. While the SDK defaults to TLS 1.2+, there is no explicit enforcement of minimum TLS version, no certificate pinning, and no custom CA bundle configuration for environments behind TLS-inspecting proxies.

**CMMC Control:** SC.L2-3.13.8 — Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.

**Mitigating Factor:** AWS SDK v3 enforces TLS 1.2+ by default. AWS service endpoints only accept TLS 1.2+. The risk here is theoretical.

**Recommendation:** For GovCloud deployments, explicitly configure the SDK with `tls: true` and consider adding a custom HTTPS agent that enforces TLS 1.3 where supported:
```typescript
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

const handler = new NodeHttpHandler({
  httpsAgent: new https.Agent({ minVersion: 'TLSv1.2' }),
});
```

---

### SI — System and Information Integrity

#### SI-F01: Code Injection via Calculator Tool — ~~CRITICAL~~ REMEDIATED ✅

**Location:** `src/main/tool-executor.ts`
**Remediated:** 2026-02-09

**Fix applied:** Removed the `Function()` constructor entirely. Replaced with the `expr-eval` library (`Parser.evaluate()`), which is a safe sandboxed expression parser that supports arithmetic, common math functions (sqrt, pow, abs, ceil, floor, round, log, sin, cos, tan, min, max), and nothing else — no prototype access, no global scope, no code execution.

```typescript
import { Parser } from 'expr-eval';
const mathParser = new Parser();

// In calculator execute:
const result = mathParser.evaluate(expr);
```

The unsafe regex allowlist and `Function()` call have been completely removed. The AI model's expression syntax changed from `Math.sqrt(16)` to `sqrt(16)` — the tool description has been updated accordingly.

---

#### SI-F02: No Credential Zeroization on Disconnect — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/credential-manager.ts`
**Remediated:** 2026-02-09

**Fix applied:** The `disconnect()` function now overwrites `accessKeyId`, `secretAccessKey`, and `sessionToken` with empty strings on the credential object before nullifying the reference. A `Mutable<>` type cast is used to bypass the AWS SDK's `readonly` property modifiers for this security operation.

**Caveat (unchanged):** JavaScript string immutability means true zeroization is impossible in V8 — the original string values may persist in the heap until GC'd. For maximum security in a CUI environment, consider storing credentials in a native module with explicit memory management, or using Electron's `safeStorage`.

---

#### SI-F03: No File Size Limits on Upload — ~~HIGH~~ REMEDIATED ✅

**Location:** `src/main/file-handler.ts`
**Remediated:** 2026-02-09

**Fix applied:** Added `fs.statSync()` size check before reading. Files exceeding 50 MB are rejected with an error. The 50 MB limit is well above Bedrock's own per-document limits (~4.5 MB images, ~5 MB documents) while protecting against multi-GB reads that would crash the main process.

---

#### SI-F04: No IPC Rate Limiting — MEDIUM

**Location:** `src/main/ipc-handlers.ts` (all handlers)

**Impact:** All IPC handlers can be called at unlimited rate from the renderer. A compromised or malfunctioning renderer could spam AWS API calls (incurring costs and potential throttling), exhaust SQLite connections, or flood the file system with read operations.

**CMMC Control:** SI.L2-3.14.6 — Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.

**Recommendation:** Implement per-channel rate limiting, particularly on `CHAT_SEND_MESSAGE`, `TOOL_EXECUTE`, `FILE_READ`, and the AWS connection handlers.

---

## Positive Security Findings

The following security controls are correctly implemented:

| Control | Implementation | Location |
|---------|---------------|----------|
| Process isolation | `contextIsolation: true`, `nodeIntegration: false` | `src/main/index.ts:22-23` |
| IPC bridge pattern | `contextBridge.exposeInMainWorld()` with typed API | `src/preload/index.ts:129` |
| SQL injection prevention | All queries use parameterized statements (`?` placeholders) | `src/main/store.ts` (all queries) |
| Foreign key constraints | `PRAGMA foreign_keys = ON` with cascade deletes | `src/main/store.ts:12` |
| WAL mode | `PRAGMA journal_mode = WAL` for database integrity | `src/main/store.ts:11` |
| Credential isolation | AWS credentials stored only in main process, never sent to renderer | `src/main/credential-manager.ts` |
| SSO token isolation | `pendingWizardToken` held in main process module scope only | `src/main/ipc-handlers.ts:43` |
| Navigation lockdown | External URLs opened in default browser, in-app navigation blocked | `src/main/index.ts:29-41` |
| Window open handler | New windows denied, URLs redirected to external browser | `src/main/index.ts:29-32` |
| TypeScript strict mode | `"strict": true` enforces type safety throughout | `tsconfig.json:8` |
| ASAR packaging | Application code bundled in ASAR archive | `electron-builder.yml:11` |
| Document name sanitization | Special characters stripped before Bedrock API calls | `src/main/bedrock-stream.ts:23-30` |
| Markdown rendering | `react-markdown` v9 does not render raw HTML by default (no `rehype-raw`) | `src/renderer/components/MarkdownRenderer.tsx` |
| Stream abort support | Active streams can be cancelled via `AbortController` | `src/main/bedrock-stream.ts:16,107` |
| Token expiry validation | SSO tokens checked against expiration before use | `src/main/sso-auth.ts:100,141,157` |

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
| uuid | ^10.0.0 | Cryptographically random UUIDs. No concerns. |
| zustand | ^5.0.0 | Client-side state management. No security surface. |

**Recommendation:** Add `npm audit` to the CI pipeline and run it before each release. Pin exact dependency versions (remove `^` ranges) for production builds to prevent supply chain drift.

---

## Remediation Roadmap

### Immediate (Pre-Deployment Blockers)

| # | Finding | Severity | Effort | Status |
|---|---------|----------|--------|--------|
| 1 | SI-F01 | Critical | 1-2 hours | ✅ **REMEDIATED** — Replaced `Function()` with `expr-eval` safe parser |
| 2 | SC-F02 | Critical | 1 hour | ✅ **REMEDIATED** — File permissions set to `0o600`/`0o700`, `clientSecret` removed from cache |
| 3 | AC-F01 | Critical | 15 min | ✅ **REMEDIATED** — `sandbox: true` enabled |
| 4 | SC-F01 | High | 30 min | ✅ **REMEDIATED** — Strict CSP meta tag added to `index.html` |
| 5 | AC-F03 | High | 1-2 hours | ✅ **REMEDIATED** — `readFile()` restricted to dialog-selected paths via `allowedPaths` set |

### Short-Term (Next Sprint)

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| 6 | AC-F02 | High | 2-3 hours | ⬜ Add session inactivity timeout and credential expiry checks |
| 7 | SI-F02 | High | 30 min | ✅ **REMEDIATED** — Credential values overwritten before reference cleared |
| 8 | SI-F03 | High | 30 min | ✅ **REMEDIATED** — 50 MB file size limit enforced |
| 9 | AU-F01 | Medium | 4-6 hours | ⬜ Implement structured audit logging |
| 10 | SI-F04 | Medium | 2-3 hours | ⬜ Add IPC rate limiting |

### Medium-Term (Before Production)

| # | Finding | Severity | Effort | Action |
|---|---------|----------|--------|--------|
| 11 | CM-F01 | Medium | 15 min | Disable source maps in production builds |
| 12 | CM-F02 | Medium | 2-4 hours | Configure code signing for macOS and Windows |
| 13 | CM-F03 | Medium | 15 min | Update `.gitignore` with secret file patterns |
| 14 | IA-F01 | Medium | 2-3 hours | Evaluate OS keychain for credential storage |
| 15 | MP-F01 | Medium | 4-8 hours | Evaluate SQLCipher for database encryption (if CUI stored) |

---

## CMMC Control Mapping Summary

| CMMC Domain | Controls Assessed | Findings | Status |
|-------------|-------------------|----------|--------|
| AC — Access Control | AC.L2-3.1.1, 3.1.2, 3.1.3, 3.1.10, 3.1.11 | 3 findings (2 remediated) | Partial — AC-F01 + AC-F03 fixed, AC-F02 open |
| AU — Audit & Accountability | AU.L2-3.3.1, 3.3.2 | 1 finding | Not Implemented |
| CM — Configuration Management | CM.L2-3.4.1, 3.4.2, 3.4.6 | 3 findings | Partial |
| IA — Identification & Auth | IA.L2-3.5.10 | 1 finding | Partial |
| MP — Media Protection | MP.L2-3.8.9 | 1 finding | Depends on FDE |
| SC — System & Comms Protection | SC.L2-3.13.1, 3.13.8, 3.13.16 | 3 findings (2 remediated) | Partial — SC-F01 + SC-F02 fixed, SC-F03 (low) open |
| SI — System & Info Integrity | SI.L2-3.14.1, 3.14.2, 3.14.3, 3.14.6 | 4 findings (3 remediated) | Partial — SI-F01 + SI-F02 + SI-F03 fixed, SI-F04 open |

---

## Deployment Considerations for Government Contractor Environments

1. **Full-Disk Encryption** — Mandate BitLocker (Windows) or FileVault (macOS) on all endpoints. The SQLite database and SSO token cache contain sensitive data.

2. **AWS GovCloud** — For CUI workloads, the application should connect to AWS GovCloud (US) regions only. The `constants.ts` file already includes GovCloud region constants (`us-gov-west-1`, `us-gov-east-1`). Consider restricting the region selector to GovCloud-only in CMMC deployments.

3. **Network Segmentation** — The application only makes outbound HTTPS connections to AWS service endpoints. No inbound connections are accepted. Firewall rules should allow only `*.amazonaws.com` and `*.aws` destinations.

4. **MDM Deployment (Intune)** — Code signing (CM-F02) is a prerequisite for Intune deployment. The NSIS installer for Windows and PKG for macOS should be signed before upload.

5. **Auto-Update** — No auto-update mechanism is currently implemented. For CMMC, updates should be pushed through the MDM solution rather than self-updating, allowing IT to validate each release.

6. **Incident Response** — The lack of audit logging (AU-F01) must be addressed before deployment. Logs should be forwarded to the organization's SIEM for monitoring.

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
