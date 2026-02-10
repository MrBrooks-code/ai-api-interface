# CMMC Level 2 Shared Responsibility Matrix — Bedrock Chat

**Application:** Bedrock Chat v1.0.0
**Date:** 2026-02-10
**Scope:** All 14 CMMC Level 2 (NIST SP 800-171) domains
**Companion Document:** [`SECURITY-REVIEW.MD`](./SECURITY-REVIEW.MD)

---

## How to Read This Matrix

| Column | Description |
|--------|-------------|
| **Control** | CMMC Level 2 control ID and abbreviated requirement |
| **Responsibility** | **Application** = implemented in code; **Organization** = deploying org must implement; **Shared** = both contribute; **N/A** = not applicable to desktop software |
| **Implementation / Evidence** | Specific files, line numbers, and implementation details |

---

## AC — Access Control

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **AC.L2-3.1.1** Limit system access to authorized users | Application | Electron sandbox (`sandbox: true`), `contextIsolation: true`, `nodeIntegration: false` — `src/main/index.ts:29-33`. IPC bridge is the only renderer→main channel — `src/preload/index.ts:141`. Deny-all `setPermissionRequestHandler` rejects all Chromium permission requests — `src/main/index.ts:37-39`. AC-F04 remediated. |
| **AC.L2-3.1.2** Limit system access to authorized transactions/functions | Application | All IPC uses `ipcMain.handle()` (request/response only, no fire-and-forget `ipcMain.on`) — `src/main/ipc-handlers.ts`. File reads restricted to dialog-selected paths via `allowedPaths` set — `src/main/file-handler.ts:13,73`. |
| **AC.L2-3.1.3** Control the flow of CUI | Shared | **App:** Credentials held exclusively in main process, never sent to renderer — `src/main/credential-manager.ts:22`. Conversations stored locally in SQLite — `src/main/store.ts:17`. **Org:** Network egress controls (firewall to `*.amazonaws.com` only), DLP policies for CUI classification. |
| **AC.L2-3.1.10** Session lock after inactivity | Shared | **App:** Configurable maximum session duration timer — `src/main/credential-manager.ts:204-219`, default 60 min via `resources/admin-config.json:7`. On expiry, credentials are zeroized and renderer notified via `AWS_SESSION_EXPIRED`. **Org:** OS-level screen lock (GPO/MDM) for true inactivity detection. |
| **AC.L2-3.1.11** Terminate sessions after defined conditions | Application | Session timer calls `disconnect()` → zeroizes credentials → notifies renderer — `src/main/credential-manager.ts:180-197,204-211`. Timer duration configurable by IT via `admin-config.json`. |
| **AC.L2-3.1.12** Monitor/control remote access | Organization | Desktop application; remote access to the workstation is an organizational control (VPN, RDP policies). |
| **AC.L2-3.1.17** Protect wireless access using authentication/encryption | Organization | Workstation network configuration; not applicable to application code. |
| **AC.L2-3.1.20** Verify/control connections to external systems | Application | Navigation lockdown: external URLs opened in default browser via `safeOpenExternal()` — `src/main/index.ts:38-50`, `src/main/safe-open.ts:18-31`. Window open handler denies new windows — `src/main/index.ts:38-41`. SSRF protection on `readWebpage()` via `validateUrl()` — `src/main/web-search.ts:200-248`. |

---

## AU — Audit and Accountability

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **AU.L2-3.3.1** Create/retain audit logs | Shared | **App:** Rate limiter tracks request timestamps per channel — `src/main/ipc-rate-limiter.ts:8,23-36`. Error events logged to console in IPC handlers. **Org:** Full audit logging not yet implemented (AU-F01, medium). Organization must provide SIEM integration and log retention policies. |
| **AU.L2-3.3.2** Ensure individual accountability | Organization | Application authenticates via AWS SSO identity. Audit trail of who performed which actions requires organizational logging infrastructure. |
| **AU.L2-3.3.3** Review/update audit events | Organization | Organizational policy — log review cadence, SIEM rules. |
| **AU.L2-3.3.4** Alert on audit process failure | Organization | Organizational SIEM configuration. |
| **AU.L2-3.3.5** Correlate audit review/analysis/reporting | Organization | Organizational SIEM and SOC processes. |
| **AU.L2-3.3.6** Audit record reduction/report generation | Organization | Organizational tooling. |
| **AU.L2-3.3.7** Provide system clocks synchronized to authoritative source | Organization | Workstation NTP configuration; application uses `Date.now()` for timestamps — `src/main/store.ts:94`, `src/main/ipc-rate-limiter.ts:23`. |
| **AU.L2-3.3.8** Protect audit information | Organization | Organizational log storage and access controls. |
| **AU.L2-3.3.9** Limit audit log management to authorized individuals | Organization | Organizational access control policy. |

---

## AT — Awareness and Training

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **AT.L2-3.2.1** Ensure awareness of security risks | Shared | **App:** Logon banner displayed on startup (CMMC AC.L2-3.1.9) — configured via `resources/admin-config.json:2-6`, loaded by `src/main/admin-config.ts:37-73`. IT can customize banner message to include security reminders. **Org:** Security awareness training program. |
| **AT.L2-3.2.2** Ensure training for roles with security responsibilities | Organization | Organizational training program. |
| **AT.L2-3.2.3** Provide insider threat awareness | Organization | Organizational training program. |

---

## CM — Configuration Management

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **CM.L2-3.4.1** Establish/maintain baseline configurations | Application | `admin-config.json` provides IT-managed baseline — `resources/admin-config.json`, loaded once on startup by `src/main/admin-config.ts:37-73`. ASAR packaging bundles application code — `electron-builder.yml:11`. Source maps disabled in production — `vite.config.ts:18,35,58`. |
| **CM.L2-3.4.2** Establish/enforce security configuration settings | Application | Strict Electron web preferences enforced in code — `src/main/index.ts:29-33`. CSP meta tag — `src/renderer/index.html:6-14`. Secret exclusion patterns in `.gitignore:9-16`. |
| **CM.L2-3.4.3** Track/control/prevent/correct changes | Organization | Git version control is used for source code. Change management process is organizational. |
| **CM.L2-3.4.4** Analyze security impact of changes | Shared | **App:** `SECURITY-REVIEW.MD` documents findings and remediations with each code change. **Org:** Change advisory board / security review process. |
| **CM.L2-3.4.5** Define/document/approve physical/logical access restrictions | Organization | Organizational access control policy for development and deployment environments. |
| **CM.L2-3.4.6** Employ least functionality | Application | Only necessary IPC channels are exposed — `src/shared/ipc-channels.ts`. Sandbox enabled, `nodeIntegration: false` — `src/main/index.ts:32-33`. `object-src 'none'` in CSP — `src/renderer/index.html:13`. Code signing not yet configured (CM-F02, medium). |
| **CM.L2-3.4.7** Restrict/disable/prevent nonessential programs | Shared | **App:** No auto-update mechanism; updates controlled by MDM. No unnecessary Electron features (WebRTC, etc.). **Org:** Endpoint hardening via MDM policies. |
| **CM.L2-3.4.8** Apply deny-by-exception (blocklist) policy | Application | CSP defaults to `'self'` for all resource types — `src/renderer/index.html:7`. `validateUrl()` blocklist denies private IP ranges — `src/main/web-search.ts:185-192`. `safeOpenExternal()` allowlist permits only HTTP(S) — `src/main/safe-open.ts:11`. |
| **CM.L2-3.4.9** Control user-installed software | Organization | MDM/endpoint management policy. |

---

## IA — Identification and Authentication

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **IA.L2-3.5.1** Identify/authenticate system users | Application | Authentication via AWS SSO (IAM Identity Center) device authorization flow — `src/main/sso-auth.ts:124-227,271-387`. AWS CLI profiles supported — `src/main/credential-manager.ts:79-105`. No anonymous access. |
| **IA.L2-3.5.2** Authenticate devices | Organization | Device certificates / MDM enrollment; not applicable to application code. |
| **IA.L2-3.5.3** Use multi-factor authentication | Shared | **App:** SSO device auth flow supports MFA via identity provider — `src/main/sso-auth.ts:168-169` (browser-based auth). **Org:** MFA policy must be enforced in the AWS IAM Identity Center configuration. |
| **IA.L2-3.5.7** Enforce password complexity | Organization | Password policy enforced by the AWS IAM Identity Center or corporate IdP, not by this application. |
| **IA.L2-3.5.8** Prohibit password reuse | Organization | Enforced by IdP, not by this application. |
| **IA.L2-3.5.10** Store/transmit only cryptographically-protected passwords | Application | No manual AWS key entry — SSO-only authentication (IA-F01, remediated). Credentials held in memory only, never serialized to renderer — `src/main/credential-manager.ts:22`. SSO tokens cached with `0o600` permissions — `src/main/sso-auth.ts:206`. Credential zeroization on disconnect — `src/main/credential-manager.ts:182-196`. |
| **IA.L2-3.5.11** Obscure feedback of authentication information | Application | SSO device auth displays a user code (not a password) — `src/main/sso-auth.ts:163-166`. No credential fields in the UI. |

---

## IR — Incident Response

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **IR.L2-3.6.1** Establish incident-handling capability | Organization | Organizational IR plan and team. |
| **IR.L2-3.6.2** Track/document/report incidents | Shared | **App:** Error events surfaced to renderer for user visibility — `src/main/bedrock-stream.ts:213-220`. Rate limiting detects anomalous request patterns — `src/main/ipc-rate-limiter.ts:18-37`. **Org:** IR procedures, ticketing, reporting. |
| **IR.L2-3.6.3** Test incident response capability | Organization | Organizational IR exercises. |

---

## MA — Maintenance

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **MA.L2-3.7.1** Perform maintenance | Shared | **App:** Dependencies managed via `package.json` with `npm audit` recommended. No auto-update mechanism — updates deployed via MDM. **Org:** Patch management cadence, MDM deployment pipeline. |
| **MA.L2-3.7.2** Provide controls for maintenance tools | Organization | Development workstation access controls. |
| **MA.L2-3.7.5** Require MFA for non-local maintenance | Organization | Remote maintenance of workstations is an organizational control. |
| **MA.L2-3.7.6** Supervise maintenance activities | Organization | Organizational policy for supervised maintenance. |

---

## MP — Media Protection

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **MP.L2-3.8.1** Protect (i.e., control physical access to) CUI on media | Organization | Physical security of workstation endpoints. |
| **MP.L2-3.8.2** Limit CUI access on media to authorized users | Shared | **App:** File access restricted to dialog-selected paths — `src/main/file-handler.ts:13,73`. Database stored in user-specific `userData` directory — `src/main/store.ts:17`. **Org:** Workstation access controls, user account management. |
| **MP.L2-3.8.3** Sanitize/destroy media containing CUI | Shared | **App:** `wipeAllData()` deletes all conversations, messages, and SSO configs with `PRAGMA secure_delete = ON` (zeros freed pages) and a final `VACUUM` (rebuilds database file) — `src/main/store.ts:21,281-286`. SI-F06 remediated. **Org:** Full-disk secure wipe procedures for workstation decommissioning. |
| **MP.L2-3.8.5** Control access to media with CUI | Organization | Physical media access controls, removable media policies. |
| **MP.L2-3.8.6** Implement cryptographic mechanisms to protect CUI on digital media | Shared | **App:** Binary content serialized as base64 for SQLite storage — `src/main/store.ts:118-124`. Database unencrypted at rest (MP-F01, medium — depends on FDE). **Org:** BitLocker/FileVault full-disk encryption mandatory. |
| **MP.L2-3.8.9** Protect confidentiality of backup CUI at storage | Organization | Backup encryption policies for workstation backup solutions. |

---

## PE — Physical Protection

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **PE.L2-3.10.1** Limit physical access | Organization | N/A — desktop software. Physical access to workstations is an organizational facility security control. |
| **PE.L2-3.10.3** Escort visitors | Organization | N/A — facility security. |
| **PE.L2-3.10.4** Maintain audit logs of physical access | Organization | N/A — facility security. |
| **PE.L2-3.10.5** Control physical access devices | Organization | N/A — facility security. |
| **PE.L2-3.10.6** Enforce safeguarding measures for CUI at alternate work sites | Organization | N/A — telework policy. |

---

## PS — Personnel Security

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **PS.L2-3.9.1** Screen individuals prior to access | Organization | N/A — desktop software. HR background check and clearance processes. |
| **PS.L2-3.9.2** Protect CUI during personnel actions (terminations/transfers) | Shared | **App:** `disconnect()` zeroizes credentials in memory — `src/main/credential-manager.ts:180-197`. `wipeAllData()` available for data removal — `src/main/store.ts:276-280`. **Org:** Account deprovisioning, workstation collection, IAM Identity Center user removal. |

---

## RA — Risk Assessment

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **RA.L2-3.11.1** Periodically assess risk | Shared | **App:** `SECURITY-REVIEW.MD` documents all findings with CMMC control mapping, severity ratings, and remediation status. Updated with each feature addition. **Org:** Organizational risk assessment program, POA&M management. |
| **RA.L2-3.11.2** Scan for vulnerabilities periodically and when new vulnerabilities are identified | Shared | **App:** `npm audit` recommended for dependency scanning. TypeScript strict mode catches type-safety issues — `tsconfig.json:8`. **Org:** Vulnerability scanning tools, scan cadence policy. |
| **RA.L2-3.11.3** Remediate vulnerabilities in accordance with assessments | Shared | **App:** Remediation log in `SECURITY-REVIEW.MD` tracks all fixes with dates, findings, and files modified. 4 critical, 6 high findings remediated. **Org:** POA&M tracking and milestone enforcement. |

---

## CA — Security Assessment

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **CA.L2-3.12.1** Periodically assess security controls | Shared | **App:** `SECURITY-REVIEW.MD` is the application-level assessment. This `CMMC-MATRIX.md` maps controls to evidence. **Org:** Third-party assessment (C3PAO) for CMMC certification. |
| **CA.L2-3.12.2** Develop/implement plans of action to correct deficiencies | Shared | **App:** Remediation Roadmap in `SECURITY-REVIEW.MD` with prioritized items. **Org:** Organizational POA&M. |
| **CA.L2-3.12.3** Monitor security controls on an ongoing basis | Shared | **App:** Rate limiting monitors request patterns — `src/main/ipc-rate-limiter.ts`. Input validation at IPC boundaries — `src/main/tool-executor.ts:78-80,107-109`. Token expiry validation — `src/main/sso-auth.ts:107,254,278`. **Org:** Continuous monitoring program, SIEM. |
| **CA.L2-3.12.4** Develop/update system security plan | Shared | **App:** Architecture documented in `SECURITY-REVIEW.MD` (Architecture Overview section). Control mapping in this document. **Org:** Formal SSP document, boundary definition, data flow diagrams. |

---

## SC — System and Communications Protection

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **SC.L2-3.13.1** Monitor/control/protect communications at boundaries | Application | Electron sandbox isolates renderer — `src/main/index.ts:33`. CSP restricts all resources to `'self'` with `img-src 'self' data: blob:` — `src/renderer/index.html:6-14`. Navigation lockdown blocks in-app external navigation — `src/main/index.ts:42-55`. SSRF protection via `validateUrl()` blocks private IPs, non-HTTP schemes, localhost — `src/main/web-search.ts:200-248`. Redirect validation — `src/main/web-search.ts:310-317`. All SC findings remediated. |
| **SC.L2-3.13.2** Employ architectural designs/development techniques to improve security | Application | Process isolation (main/preload/renderer) with typed IPC bridge — `src/preload/index.ts:141`. Zustand single store pattern — `src/renderer/stores/chat-store.ts`. Parameterized SQL throughout — `src/main/store.ts`. Sandboxed expression evaluation — `src/main/tool-executor.ts:8,12`. |
| **SC.L2-3.13.4** Prevent unauthorized/unintended information transfer | Application | `contextBridge` is the sole renderer→main pathway — `src/preload/index.ts:141`. Credentials never cross the IPC boundary — `src/main/credential-manager.ts:22`. `object-src 'none'` blocks plugins — `src/renderer/index.html:13`. |
| **SC.L2-3.13.6** Deny network communication by exception (default-deny) | Application | CSP `connect-src 'self'` blocks all outbound renderer connections — `src/renderer/index.html:11`. Main process only connects to `*.amazonaws.com` (SDK) and `html.duckduckgo.com` (search). URL validation enforces HTTP(S)-only — `src/main/web-search.ts:208-211`, `src/main/safe-open.ts:11,26`. |
| **SC.L2-3.13.8** Implement cryptographic mechanisms for CUI in transit | Application | All AWS SDK clients (`BedrockRuntimeClient`, `BedrockClient`, `SSOOIDCClient`, `SSOClient`) configured with `NodeHttpHandler` enforcing `minVersion: 'TLSv1.2'` — `src/main/bedrock-client.ts:17-20,42,61`, `src/main/sso-auth.ts:27-30,138,302,406,435,464`. DuckDuckGo search uses HTTPS — `src/main/web-search.ts:49`. `safeOpenExternal()` allows only HTTPS/HTTP — `src/main/safe-open.ts:11`. SC-F03 remediated. |
| **SC.L2-3.13.10** Establish/manage cryptographic keys | Organization | AWS manages KMS keys for Bedrock service encryption. Application does not manage its own cryptographic keys. SSO token protection relies on file permissions — `src/main/sso-auth.ts:193,206`. |
| **SC.L2-3.13.11** Employ FIPS-validated cryptography | Organization | Dependent on AWS SDK's FIPS endpoint configuration. GovCloud regions provide FIPS-validated endpoints. Application should be configured for `*.amazonaws.com` FIPS endpoints in CUI environments. |
| **SC.L2-3.13.15** Protect authenticity of communications sessions | Application | IPC uses Electron's built-in `ipcMain.handle()`/`ipcRenderer.invoke()` with typed channel names — `src/shared/ipc-channels.ts`. SSO device auth uses OIDC standard protocol — `src/main/sso-auth.ts:124-227`. Stream requests tracked by UUID — `src/main/bedrock-stream.ts:22-23,124`. |
| **SC.L2-3.13.16** Protect CUI at rest | Shared | **App:** SQLite database at `userData/bedrock-chat.db` — `src/main/store.ts:17`. Unencrypted at rest (MP-F01). SSO tokens cached with `0o600` permissions — `src/main/sso-auth.ts:206`. **Org:** Full-disk encryption (BitLocker/FileVault) mandatory. |

---

## SI — System and Information Integrity

| Control | Responsibility | Implementation / Evidence |
|---------|---------------|--------------------------|
| **SI.L2-3.14.1** Identify, report, and correct system flaws | Shared | **App:** `SECURITY-REVIEW.MD` identifies and tracks all flaws. Remediation log documents every fix. TypeScript strict mode — `tsconfig.json:8`. `npm audit` recommended for dependencies. **Org:** Patch management program, vulnerability disclosure process. |
| **SI.L2-3.14.2** Provide protection from malicious code | Application | Sandboxed expression evaluation (`expr-eval`, no `eval()`/`Function()`) — `src/main/tool-executor.ts:8,12`. CSP blocks external scripts — `src/renderer/index.html:8`. React auto-escaping prevents XSS. No `dangerouslySetInnerHTML`. `react-markdown` v9 does not render raw HTML. Parameterized SQL prevents injection — `src/main/store.ts` (all queries). Input validation on tool executors — `src/main/tool-executor.ts:78-80,107-109`. |
| **SI.L2-3.14.3** Monitor security alerts and advisories | Shared | **App:** SSO token expiry validation — `src/main/sso-auth.ts:107,254,278`. SSO tokens zeroized on disconnect via `clearTokenCache()` and `clearPendingWizardToken()` — `src/main/sso-auth.ts:253-263`, `src/main/ipc-handlers.ts:57-62`. Rate limiting detects request flooding — `src/main/ipc-rate-limiter.ts:18-37`. **Org:** CVE monitoring for Electron, AWS SDK, and all dependencies. Subscribe to Electron security advisories. |
| **SI.L2-3.14.4** Update malicious code protection mechanisms | Organization | Endpoint AV/EDR updates managed by MDM. Application updates deployed through organizational channels (no auto-update). |
| **SI.L2-3.14.5** Perform periodic scans and real-time scans of files from external sources | Shared | **App:** Uploaded files validated for size (50 MB max) — `src/main/file-handler.ts:65,81`. File type restricted by extension — `src/main/file-handler.ts:16-35`. Response body size limited to 5 MB — `src/main/web-search.ts:178,329-337`. **Org:** Endpoint AV real-time scanning. |
| **SI.L2-3.14.6** Monitor systems including inbound/outbound communications | Shared | **App:** Rate limiter tracks all high-value IPC operations — `src/main/ipc-rate-limiter.ts`. SSRF protection monitors outbound URL targets — `src/main/web-search.ts:200-248`. Console warnings for blocked URLs — `src/main/safe-open.ts:23,27`. **Org:** Network monitoring, SIEM integration. |
| **SI.L2-3.14.7** Identify unauthorized use of organizational systems | Shared | **App:** Authentication required before any Bedrock API access — `src/main/bedrock-client.ts:27-29`. Session timeout forces re-authentication — `src/main/credential-manager.ts:204-211`. **Org:** User activity monitoring, anomaly detection. |

---

## Summary

| Domain | Application Controls | Organizational Controls | Shared Controls |
|--------|---------------------|------------------------|-----------------|
| **AC** — Access Control | 5 | 2 | 1 |
| **AU** — Audit & Accountability | 0 | 8 | 1 |
| **AT** — Awareness & Training | 0 | 2 | 1 |
| **CM** — Configuration Management | 5 | 2 | 2 |
| **IA** — Identification & Authentication | 4 | 3 | 1 |
| **IR** — Incident Response | 0 | 2 | 1 |
| **MA** — Maintenance | 0 | 3 | 1 |
| **MP** — Media Protection | 0 | 2 | 4 |
| **PE** — Physical Protection | 0 | 5 | 0 |
| **PS** — Personnel Security | 0 | 1 | 1 |
| **RA** — Risk Assessment | 0 | 0 | 3 |
| **CA** — Security Assessment | 0 | 0 | 4 |
| **SC** — System & Comms Protection | 6 | 2 | 2 |
| **SI** — System & Information Integrity | 1 | 1 | 5 |
| **Totals** | **21** | **33** | **27** |

---

## Key Findings

1. **Application implements 21 controls directly** — primarily in Access Control, Configuration Management, Identification & Authentication, and System & Communications Protection.
2. **33 controls are purely organizational** — Physical Protection, Personnel Security, and Audit & Accountability require organizational infrastructure beyond the application's scope.
3. **27 controls are shared** — the application provides technical mechanisms, but the organization must configure, monitor, and enforce policies around them.
4. **Open items affecting compliance:** AU-F01 (audit logging, medium), CM-F02 (code signing, medium), and 1 accepted-risk finding (SI-F08, low) documented in `SECURITY-REVIEW.MD`.
