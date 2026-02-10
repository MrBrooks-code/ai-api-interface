# Bedrock Chat

A secure, cross-platform desktop application for conversational AI powered by Amazon Bedrock. Built for organizations that require credential isolation, SSO integration, and compliance-ready configuration — including AWS GovCloud support.

## Overview

Bedrock Chat provides a native desktop interface to Amazon Bedrock's Converse API with real-time streaming, conversation persistence, file uploads, and built-in tool use. It is designed for environments where browser-based AI tools are restricted or where tighter control over credential handling and data residency is required.

The application follows a strict security architecture: AWS credentials are resolved and held exclusively in the Electron main process and never cross into the renderer. The renderer runs fully sandboxed with context isolation enabled, communicating only through a typed IPC bridge.

![Bedrock Chat — main interface with admin banner and conversation sidebar](assets/image.png)

## Features

- **Streaming chat** with token-by-token response rendering via the Bedrock Converse API
- **AWS SSO integration** with device authorization flow, account/role discovery, and token caching
- **AWS Profile support** for `~/.aws/config` and `~/.aws/credentials` (both SSO and static profiles)
- **Conversation persistence** in a local SQLite database with full CRUD
- **File uploads** for images (PNG, JPEG, GIF, WebP) and documents (PDF, CSV, DOC/DOCX, XLS/XLSX, HTML, TXT, Markdown)
- **Built-in tools** — calculator (safe math expression parser) and timezone-aware clock
- **7 color themes** with instant switching and persistence
- **Admin-configurable logon banner** for compliance messaging (CMMC AC.L2-3.1.9)
- **Model selection** from available inference profiles or custom model IDs
- **GovCloud and commercial region support** across 12 AWS regions
- **Cross-platform packaging** for macOS (DMG) and Windows (NSIS installer)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│                                                          │
│  credential-manager ── AWS credential resolution         │
│  sso-auth ──────────── Device auth flow + token cache    │
│  bedrock-client ────── AWS SDK client instances          │
│  bedrock-stream ────── Converse API streaming            │
│  store ─────────────── SQLite via better-sqlite3         │
│  tool-executor ─────── Safe tool execution               │
│  file-handler ──────── Dialog + validated file reads     │
│  admin-config ──────── IT-managed banner configuration   │
│                                                          │
├──────────── contextBridge (preload) ─────────────────────┤
│                                                          │
│                  Renderer Process (React)                │
│  Components, Zustand store, IPC client wrapper           │
│  contextIsolation: true │ nodeIntegration: false         │
│  sandbox: true                                           │
└──────────────────────────────────────────────────────────┘
```

Credentials flow **inward only** — the renderer sends connection requests to the main process, which resolves and stores credentials internally. Credentials never flow back to the renderer. Chat messages are streamed from Bedrock through the main process to the renderer via `webContents.send()`.

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

1. Click the connection status indicator at the bottom of the sidebar (or open Settings > Connection)
2. Choose **AWS Profile** to use a local profile, or **SSO Connection** to configure IAM Identity Center
3. For SSO, the wizard walks through: Start URL > Device auth > Account > Role > Region > Save
4. Select a Bedrock model from the dropdown (or enter a custom model ID)
5. Start chatting

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry point and window creation
│   ├── ipc-handlers.ts      # IPC channel registration
│   ├── credential-manager.ts
│   ├── sso-auth.ts
│   ├── bedrock-client.ts
│   ├── bedrock-stream.ts
│   ├── store.ts             # SQLite database
│   ├── tool-executor.ts
│   ├── file-handler.ts
│   └── admin-config.ts
├── renderer/                # React UI
│   ├── components/          # ChatView, Sidebar, SettingsPanel, SsoWizard, etc.
│   ├── hooks/               # useChat, useSettings, useConversations
│   ├── stores/              # Zustand state management
│   ├── lib/                 # IPC client wrapper, message builder
│   └── styles.css           # Theme definitions + Tailwind
├── preload/
│   └── index.ts             # contextBridge API
└── shared/
    ├── types.ts             # Shared TypeScript interfaces
    ├── ipc-channels.ts      # IPC channel constants
    └── constants.ts         # Regions, model IDs, defaults

resources/
└── admin-config.json        # Admin-managed logon banner
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Electron 33 |
| UI | React 18, Tailwind CSS 3.4 |
| State management | Zustand 5 |
| Build tooling | Vite 6, TypeScript 5.7 |
| Database | better-sqlite3 (SQLite with WAL mode) |
| AWS SDK | @aws-sdk v3 (Bedrock, SSO, SSO-OIDC, credential providers) |
| Markdown | react-markdown 9, remark-gfm, rehype-highlight |
| Math parser | expr-eval (sandboxed expression evaluator) |
| Packaging | electron-builder 25 |

## Themes

Seven built-in themes are available under Settings > General > Appearance:

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

The default model is automatically selected based on region — GovCloud uses `us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0`, commercial uses the `us.` prefix equivalent.

## Admin Configuration

IT administrators can customize the logon banner displayed on the empty-chat screen by editing `resources/admin-config.json`:

```json
{
  "loginBanner": {
    "title": "Organization AI Assistant",
    "message": "This system is for authorized use only. All activity is monitored."
  }
}
```

This file is bundled into the packaged application via `extraResources` and can be replaced post-install or deployed alongside the binary via MDM (Intune, Jamf, etc.). If the file is missing or malformed, the application falls back to default text. Multi-line messages are supported.

## Built-in Tools

The AI assistant can invoke these tools automatically during conversation:

**Calculator** — Evaluates mathematical expressions using a sandboxed parser (expr-eval). Supports arithmetic, exponentiation, and functions: `sqrt`, `pow`, `abs`, `ceil`, `floor`, `round`, `log`, `sin`, `cos`, `tan`, `min`, `max`, `PI`, `E`.

**Current Time** — Returns the current date and time in any IANA timezone (e.g., `America/New_York`, `Asia/Tokyo`). Defaults to UTC.

## Security

The application has undergone a security review against CMMC Level 2 (NIST SP 800-171) controls. Key security properties:

| Property | Implementation |
|----------|---------------|
| Process isolation | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| IPC bridge | Typed `contextBridge.exposeInMainWorld()` with enumerated methods |
| SQL injection prevention | All queries use parameterized statements |
| Content Security Policy | Strict CSP restricting all resource loading to same-origin |
| Credential isolation | AWS credentials never leave the main process |
| File access control | File reads restricted to paths returned by the open dialog |
| File size limits | 50 MB maximum enforced before read |
| Safe math evaluation | `expr-eval` replaces `Function()` constructor entirely |
| SSO token permissions | Cache files written with `0o600`, directories with `0o700` |
| Credential cleanup | Credential values overwritten on disconnect before reference clearing |
| Navigation lockdown | External URLs opened in system browser; in-app navigation blocked |
| ASAR packaging | Application code bundled in encrypted archive |
| Source maps | Disabled in production builds |

See `SECURITY-REVIEW.MD` for the full audit, findings, and remediation log.

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

The "Wipe All Data" option in Settings > General permanently deletes all conversations, messages, and saved SSO configurations from the local database.
