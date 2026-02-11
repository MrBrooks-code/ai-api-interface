# Bedrock Chat

A secure, cross-platform desktop application for conversational AI powered by Amazon Bedrock. Built for organizations that require compliance-ready configuration for Amazon Bedrock — including AWS GovCloud support.

<p align="center">
  <img src="assets/image.png" alt="Bedrock Chat — welcome screen with sidebar and logon banner" />
</p>

## Overview

Bedrock Chat provides a native desktop interface to Amazon Bedrock's Converse API with real-time streaming, conversation persistence, file uploads, web search, and built-in tool use. It is designed for environments where browser-based AI tools are restricted or where tighter control of client is required.


## Features

- **Streaming chat** with response rendering via the Bedrock Converse API
- **Web Search and Website Reading** — the assistant can search DuckDuckGo and read webpage content in real time, with full SSRF protection
- **AWS SSO integration** with device authorization flow, account/role discovery, and token caching
- **Conversation persistence** in a local SQLite database with full-text search
- **File uploads** for images (PNG, JPEG, GIF, WebP) and documents (PDF, CSV, DOC/DOCX, XLS/XLSX, HTML, TXT, Markdown)
- **Rich markdown rendering** with syntax-highlighted code blocks, tables, blockquotes, task lists, and copy-to-clipboard
- **7 color themes** with instant switching, persistence, and custom theme configuration
- **Model selection** from available inference profiles or custom model IDs
- **GovCloud and commercial region support** across 12 AWS regions
- **Cross-platform packaging** for macOS (DMG) and Windows (NSIS installer)


## Architecture

<div align="center">
<pre>
```
+---------------------------------------------------------+
|                  Electron Main Process                   |
|                                                          |
|  credential-manager -- AWS credential resolution         |
|  sso-auth ------------ Device auth flow + token cache    |
|  bedrock-client ------ AWS SDK client instances          |
|  bedrock-stream ------ Converse API streaming            |
|  store --------------- SQLite via better-sqlite3         |
|  tool-executor ------- Safe tool execution               |
|  web-search ---------- DuckDuckGo + webpage reader       |
|  file-handler -------- Dialog + validated file reads     |
|  ipc-rate-limiter ---- Per-channel request throttling    |
|  admin-config -------- IT-managed configuration          |
|                                                          |
+------------ contextBridge (preload) ---------------------+
|                                                          |
|                 Renderer Process (React)                 |
|  Components, Zustand store, IPC client wrapper           |
|  contextIsolation: true | nodeIntegration: false         |
|  sandbox: true                                           |
+---------------------------------------------------------+
```
</pre>
</div>

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- AWS credentials configured via `~/.aws/config` profiles or IAM Identity Center (SSO)
- Access to Amazon Bedrock in your target region

### Install and Run

```bash
npm install
npm run dev
```

This starts the Vite dev server with Electron hot reload. The application will launch automatically.

### Connect to AWS

1. Click the connection status indicator at the bottom of the sidebar (or open Settings)
2. Choose **AWS Profile** to use a local profile, or **SSO Connection** to configure IAM Identity Center
3. For SSO, the wizard walks through: Start URL > Device auth (browser popup) > Account > Role > Region > Save
4. Select a Bedrock model from the dropdown (or enter a custom model ID)
5. Start chatting

## Built-in Tools

The assistant can invoke these tools automatically during conversation. Tool calls and results are displayed in a collapsible activity panel in the chat. 

**Web Search** — Searches DuckDuckGo for real-time information. Returns structured results with titles, URLs, and snippets. Configurable result count (1-10).

**Read Webpage** — Fetches and extracts text content from a URL. Strips scripts and styles for clean output. Protected against SSRF with URL validation blocking private IPs, localhost, and non-HTTP(S) schemes. Follows up to 3 redirects with each target validated.

**Calculator** — Evaluates mathematical expressions using a sandboxed parser (expr-eval). Supports arithmetic, exponentiation, and functions: `sqrt`, `pow`, `abs`, `ceil`, `floor`, `round`, `log`, `sin`, `cos`, `tan`, `min`, `max`, `PI`, `E`.

**Current Time** — Returns the current date and time in any IANA timezone (e.g., `America/New_York`, `Asia/Tokyo`). Defaults to UTC.

## Project Structure

```
src/
+-- main/                    # Electron main process
|   +-- index.ts             # App entry point and window creation
|   +-- ipc-handlers.ts      # IPC channel registration
|   +-- credential-manager.ts
|   +-- sso-auth.ts
|   +-- bedrock-client.ts
|   +-- bedrock-stream.ts
|   +-- store.ts             # SQLite database
|   +-- tool-executor.ts
|   +-- web-search.ts        # DuckDuckGo search + webpage reader
|   +-- file-handler.ts
|   +-- ipc-rate-limiter.ts  # Per-channel sliding-window rate limiter
|   +-- safe-open.ts         # URL-validated shell.openExternal wrapper
|   +-- admin-config.ts
+-- renderer/                # React UI
|   +-- components/          # ChatView, Sidebar, SettingsPanel, SsoWizard, etc.
|   +-- hooks/               # useChat, useAutoConnect, useConversations
|   +-- stores/              # Zustand state management
|   +-- lib/                 # IPC client wrapper
|   +-- styles.css           # Theme definitions + Tailwind
+-- preload/
|   +-- index.ts             # contextBridge API
+-- shared/
    +-- types.ts             # Shared TypeScript interfaces
    +-- ipc-channels.ts      # IPC channel constants
    +-- constants.ts         # Regions, model IDs, defaults

resources/
+-- admin-config.json        # Admin-managed configuration

compliance/
+-- SECURITY-REVIEW.md       # Full security audit against CMMC Level 2
+-- CMMC-MATRIX.md           # CMMC L2 shared responsibility matrix
+-- CODE-REVIEW.md           # Codebase review findings and fix tracking
```

## Themes

Seven built-in themes are available under Settings > Appearance:

| Name | Style |
|------|-------|
| Midnight | Dark — soft pastels (Catppuccin Mocha) |
| Cloud | Light — soft pastels (Catppuccin Latte) |
| Arctic | Dark — cool blues (Nord) |
| Twilight | Dark — vibrant neon (Tokyo Night) |
| Dusk | Dark — muted roses (Rose Pine) |
| Ember | Dark — warm earth tones (Gruvbox) |
| Daylight | Light — classic warm (Solarized Light) |

Theme selection persists across sessions.

## Supported Regions

**GovCloud:** `us-gov-west-1` (default), `us-gov-east-1`

**Commercial:** `us-east-1`, `us-east-2`, `us-west-2`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-central-1`, `ap-southeast-1`, `ap-southeast-2`, `ap-northeast-1`

The default model is Claude Sonnet 4.5 

## Admin Configuration

IT administrators can customize the application by editing `resources/admin-config.json`:

```json
{
  "loginBanner": {
    "title": "Organization AI Assistant",
    "message": "This system is for authorized use only. All activity is monitored.",
    "titlebar": "Organization AI"
  },
  "sessionDurationMinutes": 60
}
```

| Field | Description |
|-------|-------------|
| `loginBanner.title` | Heading shown on the empty-chat screen |
| `loginBanner.message` | Body text shown below the title (supports multi-line) |
| `loginBanner.titlebar` | Text displayed in the application title bar |
| `sessionDurationMinutes` | Auto-disconnect timeout in minutes (default: 60). Credentials are zeroized on expiry. |

This file is bundled into the packaged application via `extraResources` and can be replaced post-install or deployed alongside the binary via MDM (Intune, Jamf, etc.). If the file is missing or malformed, the application falls back to defaults.

## Security

The application has undergone a comprehensive security review against CMMC Level 2 (NIST SP 800-171) controls. 

| Property | Implementation |
|----------|---------------|
| Process isolation | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| IPC bridge | Typed `contextBridge.exposeInMainWorld()` with enumerated methods |
| IPC rate limiting | Per-channel sliding-window throttling on all expensive handlers |
| SQL injection prevention | All queries use parameterized statements |
| Content Security Policy | Strict CSP restricting all resource loading to same-origin |
| Credential isolation | AWS credentials never leave the main process |
| Credential zeroization | Values overwritten on disconnect and session expiry |
| Session timeout | Configurable auto-disconnect with credential cleanup |
| TLS enforcement | All AWS SDK clients enforce TLS 1.2+ minimum |
| SSRF protection | URL validation blocks private IPs, localhost, and non-HTTP(S) schemes |
| File access control | File reads restricted to paths returned by the open dialog |
| File size limits | 50 MB maximum enforced before read |
| Safe math evaluation | `expr-eval` sandboxed parser (no `eval` or `Function`) |
| SSO token permissions | Cache files `0o600`, directories `0o700` |
| Permission hardening | Least-privilege Electron permission handlers (`openExternal` only) |
| Navigation lockdown | External URLs opened in system browser; in-app navigation blocked |
| Secure delete | `PRAGMA secure_delete = ON`; `VACUUM` after data wipe |
| Error recovery | React error boundary prevents full-app crashes |
| Source maps | Disabled in production builds |

See [`compliance/SECURITY-REVIEW.md`](compliance/SECURITY-REVIEW.md) for the full audit, findings, and remediation log. See [`compliance/CMMC-MATRIX.md`](compliance/CMMC-MATRIX.md) for the CMMC Level 2 shared responsibility matrix.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Electron hot reload |
| `npm run build` | Type-check and build all targets |
| `npm run typecheck` | Run TypeScript compiler (no emit) |
| `npm run lint` | Run ESLint across `src/` |
| `npm run package:mac` | Build and package for macOS (DMG + ZIP) |
| `npm run package:win` | Build and package for Windows (NSIS installer) |

## Building for Distribution

```bash
# macOS
npm run package:mac
# Output: release/Bedrock Chat-1.0.0-{arch}.dmg

# Windows
npm run package:win
# Output: release/Bedrock Chat-1.0.0-setup.exe
```

For production deployments, configure code signing in `electron-builder.yml`:

```yaml
mac:
  identity: "Developer ID Application: Your Org"
  notarize:
    teamId: "XXXXXXXXXX"
win:
  certificateFile: path/to/certificate.pfx
  certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
```

## Data Storage

All local data is stored in the Electron user data directory:

- **Database:** `{userData}/bedrock-chat.db` — conversations, messages, SSO configs, settings
- **SSO tokens:** `~/.aws/sso/cache/` — cached SSO access tokens (AWS CLI compatible)

The database uses WAL mode for integrity and `PRAGMA secure_delete = ON` to zero freed pages. The "Wipe All Data" option in Settings permanently deletes all conversations, messages, and saved SSO configurations, followed by a `VACUUM` to eliminate residual data.
